import { API_URL } from '@/lib/api';

/** Turn stored MinIO / API / data URLs into a browser-loadable src. */
export function mediaSrc(url?: string | null, photoKey?: string | null): string | null {
  if (photoKey && isSafeMediaKey(photoKey)) {
    return fileProxy(photoKey);
  }
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/api/')) return `${API_URL}${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/api/storage/file')) {
      const key = parsed.searchParams.get('key');
      if (key && isSafeMediaKey(key)) return fileProxy(key);
    }
  } catch {
    /* ignore */
  }
  const key = extractMinioKey(url);
  if (key) return fileProxy(key);
  return url;
}

function fileProxy(key: string): string {
  return `${API_URL}/api/storage/file?key=${encodeURIComponent(key)}`;
}

function isSafeMediaKey(key: string): boolean {
  return /^(faces|marks)\/[A-Za-z0-9._\-/]+$/.test(key) && !key.includes('..');
}

function extractMinioKey(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const bucketIdx = parts[0] === 'hrhub' ? 1 : 0;
    const key = parts.slice(bucketIdx).join('/');
    return isSafeMediaKey(key) ? key : null;
  } catch {
    return null;
  }
}
