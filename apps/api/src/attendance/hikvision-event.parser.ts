/**
 * Parse Hikvision HttpHostNotification / alert payloads into punch fields.
 * Supports JSON (EventNotificationAlert / AccessControllerEvent), XML,
 * and multipart/form-data (JSON part + binary JPEG capture).
 */

const AUTH_OK_MINORS = new Set([1, 38, 39, 75, 76]);

export type ParsedHikPunch = {
  employeeExternalId: string;
  direction: 'IN' | 'OUT' | 'AUTO';
  occurredAt: string;
  serialNo?: string;
  photoBase64?: string;
  raw: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function mapDirection(item: Record<string, unknown>): 'IN' | 'OUT' | 'AUTO' {
  const status = String(item.attendanceStatus || item.type || '').toLowerCase();
  if (status.includes('checkin') || status === '1' || status === 'in') return 'IN';
  if (status.includes('checkout') || status === '2' || status === 'out') return 'OUT';
  return 'AUTO';
}

function employeeNo(item: Record<string, unknown>): string {
  const raw =
    item.employeeNoString ?? item.employeeNo ?? item.cardNo ?? item.employeeNoString;
  return String(raw ?? '').trim();
}

function extractEvent(data: Record<string, unknown>): Record<string, unknown> | null {
  const direct = asRecord(data.AccessControllerEvent);
  if (direct) return direct;
  const alert = asRecord(data.EventNotificationAlert);
  if (alert) {
    const nested = asRecord(alert.AccessControllerEvent);
    if (nested) return nested;
    return alert;
  }
  // Some firmwares POST the AccessControllerEvent at the root.
  if (employeeNo(data)) return data;
  return null;
}

function punchFromEvent(
  event: Record<string, unknown>,
  envelope: Record<string, unknown>,
): ParsedHikPunch | null {
  const eid = employeeNo(event);
  if (!eid) return null;

  const minor = Number(event.subEventType ?? event.minor ?? 0) || 0;
  const major = Number(event.majorEventType ?? event.major ?? 0) || 0;
  if (major === 5 && minor && !AUTH_OK_MINORS.has(minor)) {
    if (!event.name && !event.attendanceStatus) return null;
  }

  const time =
    String(event.time || event.dateTime || envelope.dateTime || '').trim() ||
    new Date().toISOString();

  return {
    employeeExternalId: eid.replace(/\D/g, '') || eid,
    direction: mapDirection(event),
    occurredAt: time.includes('T') ? time : time.replace(' ', 'T'),
    serialNo: event.serialNo != null ? String(event.serialNo) : undefined,
    raw: { ...event, alert: envelope },
  };
}

function parseJsonPayload(text: string): ParsedHikPunch[] {
  const out: ParsedHikPunch[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;

  const tryObj = (obj: unknown) => {
    const rec = asRecord(obj);
    if (!rec) return;
    const event = extractEvent(rec);
    if (!event) return;
    const punch = punchFromEvent(event, rec);
    if (punch) out.push(punch);
  };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) tryObj(item);
    } else {
      tryObj(parsed);
      // Also scan nested EventNotificationAlertList
      const list = asRecord(parsed)?.EventNotificationAlertList;
      const arr = asRecord(list)?.EventNotificationAlert;
      if (Array.isArray(arr)) for (const item of arr) tryObj(item);
      else if (arr) tryObj(arr);
    }
  } catch {
    // Multipart / concatenated JSON objects
    const re = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    for (const m of trimmed.match(re) || []) {
      try {
        tryObj(JSON.parse(m));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

function xmlText(xml: string, tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
    const m = xml.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

function parseXmlPayload(text: string): ParsedHikPunch[] {
  const eid =
    xmlText(text, ['employeeNoString', 'employeeNo', 'cardNo']) || '';
  if (!eid) return [];
  const time =
    xmlText(text, ['dateTime', 'time', 'localTime']) || new Date().toISOString();
  const status = xmlText(text, ['attendanceStatus', 'type']).toLowerCase();
  let direction: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
  if (status.includes('checkin') || status === '1' || status === 'in') direction = 'IN';
  if (status.includes('checkout') || status === '2' || status === 'out')
    direction = 'OUT';
  return [
    {
      employeeExternalId: eid.replace(/\D/g, '') || eid,
      direction,
      occurredAt: time.includes('T') ? time : time.replace(' ', 'T'),
      raw: { xml: text.slice(0, 2000) },
    },
  ];
}

function boundaryFromContentType(contentType?: string): string | null {
  const m = String(contentType || '').match(/boundary=("?)([^";\s]+)\1/i);
  return m?.[2] || null;
}

function extractJpegFromBuffer(buf: Buffer): Buffer | null {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
  if (start < 0) return null;
  const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (end > start) return buf.subarray(start, end + 2);
  if (buf.length - start >= 2500) return buf.subarray(start);
  return null;
}

/**
 * Split multipart body into punches + optional capture JPEG (base64).
 * Hikvision typically sends JSON AccessControllerEvent + image/jpeg parts.
 */
export function parseMultipartHikvisionBody(
  body: Buffer,
  contentType?: string,
): ParsedHikPunch[] {
  const boundary = boundaryFromContentType(contentType);
  let parts: Buffer[] = [];
  if (boundary) {
    const sep = Buffer.from(`--${boundary}`);
    const chunks: Buffer[] = [];
    let start = body.indexOf(sep);
    while (start >= 0) {
      const next = body.indexOf(sep, start + sep.length);
      const chunk =
        next >= 0 ? body.subarray(start + sep.length, next) : body.subarray(start + sep.length);
      // strip leading CRLF and trailing CRLF
      let p = chunk;
      if (p.length >= 2 && p[0] === 0x0d && p[1] === 0x0a) p = p.subarray(2);
      if (p.length >= 2 && p[p.length - 2] === 0x0d && p[p.length - 1] === 0x0a) {
        p = p.subarray(0, p.length - 2);
      }
      if (p.length >= 2 && p[0] === 0x2d && p[1] === 0x2d) {
        // closing boundary
        break;
      }
      if (p.length) chunks.push(p);
      start = next;
    }
    parts = chunks;
  } else {
    parts = [body];
  }

  const punches: ParsedHikPunch[] = [];
  let jpegB64: string | undefined;

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    const headerBuf = headerEnd >= 0 ? part.subarray(0, headerEnd) : Buffer.alloc(0);
    const content = headerEnd >= 0 ? part.subarray(headerEnd + 4) : part;
    const headers = headerBuf.toString('utf8').toLowerCase();

    const jpeg = extractJpegFromBuffer(content);
    if (jpeg && jpeg.length > 500) {
      if (
        headers.includes('image/jpeg') ||
        headers.includes('content-type: image') ||
        jpeg.length >= 2500
      ) {
        jpegB64 = jpeg.toString('base64');
        continue;
      }
    }

    const text = content.toString('utf8');
    if (text.includes('{') || text.includes('<')) {
      const found = text.trimStart().startsWith('<')
        ? parseXmlPayload(text)
        : parseJsonPayload(text);
      punches.push(...found);
    }
  }

  if (jpegB64 && punches.length) {
    for (const p of punches) {
      if (!p.photoBase64) p.photoBase64 = jpegB64;
    }
  } else if (!punches.length && jpegB64) {
    return [];
  }

  if (!punches.length) {
    const text = body.toString('utf8');
    if (text.includes('{')) return parseJsonPayload(text);
  }
  return punches;
}

export function parseHikvisionEventBody(
  body: string | Buffer | Record<string, unknown> | null | undefined,
  contentType?: string,
): ParsedHikPunch[] {
  if (body == null) return [];
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    return parseJsonPayload(JSON.stringify(body));
  }
  const ct = (contentType || '').toLowerCase();
  if (Buffer.isBuffer(body) && (ct.includes('multipart') || body.includes(Buffer.from('--')))) {
    return parseMultipartHikvisionBody(body, contentType);
  }
  const text =
    typeof body === 'string'
      ? body
      : Buffer.isBuffer(body)
        ? body.toString('utf8')
        : String(body);
  if (ct.includes('xml') || text.trimStart().startsWith('<?xml') || text.includes('<Event')) {
    const xml = parseXmlPayload(text);
    if (xml.length) return xml;
  }
  // Binary JPEG may sit after JSON in a non-multipart body.
  if (Buffer.isBuffer(body)) {
    const jpeg = extractJpegFromBuffer(body);
    const punches = parseJsonPayload(text);
    if (jpeg && jpeg.length > 500 && punches.length) {
      const b64 = jpeg.toString('base64');
      for (const p of punches) if (!p.photoBase64) p.photoBase64 = b64;
    }
    if (punches.length) return punches;
  }
  return parseJsonPayload(text);
}

export type HikPushHostConfig = {
  pushToken: string;
  protocolType: 'HTTPS' | 'HTTP';
  addressingFormatType: 'hostname' | 'ipaddress';
  hostName: string;
  portNo: number;
  urlPath: string;
  httpAuthenticationMethod: 'none';
  fullNotifyUrl: string;
  ipAddress?: string;
};

export function buildHikPushHostConfig(
  apiBaseUrl: string,
  pushToken: string,
): HikPushHostConfig {
  const base = apiBaseUrl.replace(/\/$/, '');
  let hostName = 'localhost';
  let portNo = 443;
  let isHttps = true;
  try {
    const u = new URL(base);
    hostName = u.hostname;
    isHttps = u.protocol === 'https:';
    portNo = u.port ? Number(u.port) : isHttps ? 443 : 80;
  } catch {
    hostName = base.replace(/^https?:\/\//, '').split('/')[0] || 'localhost';
    isHttps = /^https:/i.test(base);
  }
  const urlPath = `/api/attendance/hikvision/events/${pushToken}`;
  const loopback =
    hostName === 'localhost' ||
    hostName === '127.0.0.1' ||
    hostName === '[::1]' ||
    hostName === '::1';
  return {
    pushToken,
    // Local/dev API is HTTP; Hikvision cannot use HTTPS+localhost from the terminal.
    protocolType: isHttps && !loopback ? 'HTTPS' : 'HTTP',
    addressingFormatType: 'hostname',
    hostName,
    portNo,
    urlPath,
    httpAuthenticationMethod: 'none',
    fullNotifyUrl: `${isHttps && !loopback ? 'https' : 'http'}://${hostName}${
      (isHttps && !loopback && portNo === 443) ||
      (!isHttps && portNo === 80) ||
      (loopback && !isHttps && portNo === 80)
        ? ''
        : `:${portNo}`
    }${urlPath}`,
  };
}
