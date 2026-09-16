const SECRET_KEYS = new Set([
  'password',
  'passwordenc',
  'password_enc',
  'passwordhash',
  'password_hash',
  'secret',
  'jwt_secret',
  'accesstoken',
  'access_token',
  'token',
  'apikey',
  'api_key',
  'punch_ingest_api_key',
  'employee_form_ingest_key',
  'x-employee-form-key',
  'authorization',
  'x-punch-key',
  'secretaccesskey',
  'secret_key',
  'minio_secret_key',
]);

/** Deep-clone and replace secret-looking fields with [REDACTED] for safe logs. */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (value == null || depth > 8) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, depth + 1)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase().replace(/-/g, '_'))) {
        out[k] = v == null || v === '' ? v : '[REDACTED]';
      } else {
        out[k] = redactSecrets(v, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}

export function safeJsonForLog(value: unknown): string {
  try {
    return JSON.stringify(redactSecrets(value));
  } catch {
    return '[unserializable]';
  }
}

/**
 * Cloudflare / proxy HTML (502 etc.) must never land in UI progress banners.
 * Keep short, human-readable GW errors.
 */
export function sanitizeGwErrorText(
  raw: string,
  opts?: { status?: number; fallback?: string },
): string {
  const status = opts?.status;
  const fallback =
    opts?.fallback ||
    (status === 502 || status === 504
      ? 'Ofis tunnel vaqtincha uzildi (502). Tunnelni saqlang va «Синхронизировать» ni qayta bosing.'
      : 'Device gateway xatosi');
  const text = (raw || '').trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (
    lower.includes('<!doctype') ||
    lower.includes('<html') ||
    lower.includes('cloudflare') ||
    lower.includes('bad gateway') ||
    lower.includes('error code 502') ||
    (lower.includes('<title>') && lower.includes('<'))
  ) {
    return fallback;
  }
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 240 ? `${oneLine.slice(0, 240)}…` : oneLine;
}
