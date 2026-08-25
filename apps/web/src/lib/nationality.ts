export function displayCode(code?: string) {
  if (!code || code.startsWith('AUTO_')) return '';
  return code;
}

export function storeCode(raw: string, existing?: string) {
  const t = raw.trim();
  if (t) return t;
  if (existing && existing.startsWith('AUTO_')) return existing;
  return `AUTO_${Date.now().toString(36).toUpperCase()}`;
}
