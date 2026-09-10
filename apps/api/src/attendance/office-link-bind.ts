import { createHmac, timingSafeEqual } from 'crypto';

export type OfficeLinkBindPayload = {
  v: 1;
  apiUrl: string;
  webUrl: string;
  tenantCode: string;
  tenantName?: string;
  issuedAt: string;
  /** Optional installer URL for this deployment */
  installerUrl?: string | null;
  version?: string | null;
};

export type OfficeLinkBindFile = {
  payload: OfficeLinkBindPayload;
  /** hex HMAC-SHA256 of canonical JSON payload */
  sig: string;
};

function canonical(payload: OfficeLinkBindPayload): string {
  return JSON.stringify({
    v: payload.v,
    apiUrl: payload.apiUrl,
    webUrl: payload.webUrl,
    tenantCode: payload.tenantCode,
    tenantName: payload.tenantName || '',
    issuedAt: payload.issuedAt,
    installerUrl: payload.installerUrl || '',
    version: payload.version || '',
  });
}

export function signOfficeLinkBind(
  payload: OfficeLinkBindPayload,
  secret: string,
): OfficeLinkBindFile {
  const sig = createHmac('sha256', secret).update(canonical(payload)).digest('hex');
  return { payload, sig };
}

export function verifyOfficeLinkBind(
  file: OfficeLinkBindFile,
  secret: string,
): boolean {
  if (!file?.payload || !file?.sig || !secret) return false;
  const expected = createHmac('sha256', secret)
    .update(canonical(file.payload))
    .digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(file.sig), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function encodeConnectionHrhub(file: OfficeLinkBindFile): string {
  return Buffer.from(JSON.stringify(file), 'utf8').toString('base64url');
}

export function decodeConnectionHrhub(raw: string): OfficeLinkBindFile | null {
  try {
    const text = Buffer.from(String(raw || '').trim(), 'base64url').toString('utf8');
    const parsed = JSON.parse(text) as OfficeLinkBindFile;
    if (!parsed?.payload?.apiUrl || !parsed?.payload?.tenantCode || !parsed?.sig) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Minimal ZIP (store only) for a few text files — no extra deps. */
export function buildStoreZip(
  files: Array<{ name: string; content: string | Buffer }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.content)
      ? f.content
      : Buffer.from(f.content, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

/**
 * Inject tenant-bound config into a full portable HRHUB-Link zip.
 * Writes config at package root and next to the EXE (`ilova/`) when present.
 */
export async function injectBoundConfigIntoPortableZip(
  baseZip: Buffer,
  files: {
    configJson: string;
    connectionHrhub: string;
    readme: string;
  },
): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(baseZip);

  const names = Object.keys(zip.files);
  const norm = (n: string) => n.replace(/\\/g, '/');
  const sep = names.some((n) => n.includes('\\')) ? '\\' : '/';
  const joinZip = (...parts: string[]) =>
    parts
      .filter(Boolean)
      .map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ''))
      .join(sep);

  const hasIlova = names.some((n) => {
    const p = norm(n);
    return (
      /(^|\/)ilova\/HRHUB-Qurilma\.exe$/i.test(p) ||
      /(^|\/)ilova\/(?!_internal)/i.test(p)
    );
  });

  // Detect optional top-level folder prefix (e.g. HRHUB-Link/),
  // but never treat PyInstaller `_internal/config.json` as the package root.
  let prefix = '';
  const anchors = names
    .map(norm)
    .filter(
      (n) =>
        !n.includes('_internal') &&
        (/BOSHLASH\.bat$/i.test(n) ||
          /(^|\/)config\.json$/i.test(n) ||
          /HRHUB-Qurilma\.exe$/i.test(n)),
    )
    .sort(
      (a, b) =>
        a.split('/').length - b.split('/').length || a.length - b.length,
    );
  const sample = anchors[0];
  if (sample) {
    const idx = sample.lastIndexOf('/');
    if (idx > 0) prefix = sample.slice(0, idx + 1);
    if (/ilova\//i.test(prefix)) {
      prefix = prefix.replace(/ilova\/$/i, '');
    }
  }
  // Convert forward-slash prefix to zip's native separator
  const prefixNative = prefix ? prefix.replace(/\//g, sep) : '';

  zip.file(joinZip(prefixNative, 'config.json'), files.configJson);
  zip.file(joinZip(prefixNative, 'connection.hrhub'), files.connectionHrhub);
  zip.file(joinZip(prefixNative, 'OQISH.txt'), files.readme);
  if (hasIlova) {
    zip.file(joinZip(prefixNative, 'ilova', 'config.json'), files.configJson);
    zip.file(
      joinZip(prefixNative, 'ilova', 'connection.hrhub'),
      files.connectionHrhub,
    );
  }

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(out);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c;
}
