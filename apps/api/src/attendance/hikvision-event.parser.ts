/**
 * Parse Hikvision HttpHostNotification / alert payloads into punch fields.
 * Supports JSON (EventNotificationAlert / AccessControllerEvent) and simple XML.
 */

const AUTH_OK_MINORS = new Set([1, 38, 39, 75, 76]);

export type ParsedHikPunch = {
  employeeExternalId: string;
  direction: 'IN' | 'OUT' | 'AUTO';
  occurredAt: string;
  serialNo?: string;
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

export function parseHikvisionEventBody(
  body: string | Buffer | Record<string, unknown> | null | undefined,
  contentType?: string,
): ParsedHikPunch[] {
  if (body == null) return [];
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    return parseJsonPayload(JSON.stringify(body));
  }
  const text =
    typeof body === 'string'
      ? body
      : Buffer.isBuffer(body)
        ? body.toString('utf8')
        : String(body);
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('xml') || text.trimStart().startsWith('<?xml') || text.includes('<Event')) {
    const xml = parseXmlPayload(text);
    if (xml.length) return xml;
  }
  return parseJsonPayload(text);
}

export type HikPushHostConfig = {
  pushToken: string;
  protocolType: 'HTTPS';
  addressingFormatType: 'hostname';
  hostName: string;
  portNo: number;
  urlPath: string;
  httpAuthenticationMethod: 'none';
  fullNotifyUrl: string;
};

export function buildHikPushHostConfig(
  apiBaseUrl: string,
  pushToken: string,
): HikPushHostConfig {
  const base = apiBaseUrl.replace(/\/$/, '');
  let hostName = 'localhost';
  let portNo = 443;
  try {
    const u = new URL(base);
    hostName = u.hostname;
    portNo = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  } catch {
    hostName = base.replace(/^https?:\/\//, '').split('/')[0] || 'localhost';
  }
  const urlPath = `/api/attendance/hikvision/events/${pushToken}`;
  return {
    pushToken,
    protocolType: 'HTTPS',
    addressingFormatType: 'hostname',
    hostName,
    portNo,
    urlPath,
    httpAuthenticationMethod: 'none',
    fullNotifyUrl: `${base}${urlPath}`,
  };
}
