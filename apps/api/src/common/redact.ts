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
