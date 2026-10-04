import { createHash } from 'crypto';

/**
 * Photos stored inline (`data:` URLs, often 100–200 KB) are replaced with a short link to
 * `GET /me/photos/:employeeId`, so profile and team payloads stay small on mobile networks.
 * `v` changes with the photo, letting the app cache the bytes per link.
 */
export function photoRef(employeeId: string, url: string | null): string | null {
  if (!url?.startsWith('data:')) return url;
  const v = createHash('sha1').update(url).digest('hex').slice(0, 12);
  return `/api/me/photos/${employeeId}?v=${v}`;
}

/** Decodes a `data:<type>;base64,<body>` URL; null when it is not one. */
export function decodeDataUrl(url: string): { contentType: string; body: Buffer } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const contentType = m[1] || 'application/octet-stream';
  const body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  return { contentType, body };
}
