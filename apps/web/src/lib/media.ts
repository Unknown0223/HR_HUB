import { API_URL, getAccessToken } from '@/lib/api';

/** Turn stored MinIO / API / data URLs into a browser-loadable src. */
export function mediaSrc(url?: string | null, photoKey?: string | null): string | null {
  let src: string | null = null;
  if (photoKey && isSafeMediaKey(photoKey)) {
    src = fileProxy(photoKey);
  } else if (!url) {
    src = null;
  } else if (url.startsWith('data:') || url.startsWith('blob:')) {
    src = url;
  } else if (url.startsWith('/api/')) {
    src = `${API_URL}${url}`;
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/api/storage/file')) {
        const key = parsed.searchParams.get('key');
        if (key && isSafeMediaKey(key)) src = fileProxy(key);
      }
    } catch {
      /* ignore */
    }
    if (!src) {
      const key = extractMinioKey(url);
      if (key) src = fileProxy(key);
      else src = url;
    }
  }

  return withAccessToken(src);
}

/** <img> cannot send Authorization — append JWT query for /api/storage/file. */
function withAccessToken(src: string | null): string | null {
  if (!src) return null;
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  const token = getAccessToken();
  if (!token) return src;
  try {
    const u = new URL(src, typeof window !== 'undefined' ? window.location.origin : API_URL);
    if (!u.pathname.includes('/api/storage/file')) return src;
    if (!u.searchParams.get('access_token')) {
      u.searchParams.set('access_token', token);
    }
    return u.toString();
  } catch {
    return src;
  }
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
