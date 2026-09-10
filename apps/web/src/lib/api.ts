import {
  isCatalogLookupsGet,
  withCatalogLookupsCache,
} from './lookups-cache';

/** Absolute API origin (always set). Use for media / SSR / display. */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3002';

/**
 * Fetch base: full origin on the server; empty string in the browser so
 * requests hit same-origin `/api/...` and Next rewrites proxy to the API.
 */
const API_URL =
  typeof window === 'undefined' ? API_ORIGIN : '';

export type Session = {
  /** Present only in the login JSON (mobile). Web stores cookie, not this field. */
  accessToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    tenantId: string | null;
  };
  tenant: { id: string; code: string; name: string } | null;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const SESSION_KEY = 'hrhub_session';

/** Nest/proxy sometimes returns HTML (Cloudflare errors) as message — never show raw markup. */
function sanitizeApiErrorMessage(message: string, fallback: string): string {
  const msg = (message || '').trim();
  if (!msg) return fallback;
  const lower = msg.toLowerCase();
  if (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.includes('cloudflare tunnel error') ||
    (lower.includes('<title>') && lower.includes('<'))
  ) {
    return (
      'Связь с терминалом недоступна (Cloudflare tunnel / office-link). ' +
      'Запустите HR HUB Link и повторите.'
    );
  }
  return msg.length > 280 ? `${msg.slice(0, 280)}…` : msg;
}
/**
 * JWT for API Authorization + <img src>?access_token=.
 * Cookie (httpOnly) is preferred when same-site; on Railway web/api are
 * cross-origin and third-party cookies are often blocked — keep a JS-readable
 * copy so Bearer auth still works.
 */
const MEDIA_TOKEN_KEY = 'hrhub_media_at';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      sessionStorage.getItem(MEDIA_TOKEN_KEY) ||
      localStorage.getItem(MEDIA_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

export function setMediaAccessToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!token) {
      sessionStorage.removeItem(MEDIA_TOKEN_KEY);
      localStorage.removeItem(MEDIA_TOKEN_KEY);
    } else {
      sessionStorage.setItem(MEDIA_TOKEN_KEY, token);
      localStorage.setItem(MEDIA_TOKEN_KEY, token);
    }
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('hrhub-media-token'));
  } catch {
    /* ignore */
  }
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.user) return null;
    return { user: parsed.user, tenant: parsed.tenant ?? null };
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  if (typeof window === 'undefined') return;
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    setMediaAccessToken(null);
    return;
  }
  if (session.accessToken) {
    setMediaAccessToken(session.accessToken);
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ user: session.user, tenant: session.tenant ?? null }),
  );
}

function authHeaders(extra?: HeadersInit, tenantIdOverride?: string | null): Headers {
  const session = getSession();
  const headers = new Headers(extra);
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const tenantId =
    tenantIdOverride ?? session?.tenant?.id ?? session?.user.tenantId;
  if (tenantId) headers.set('X-Tenant-Id', tenantId);
  return headers;
}

export { invalidateCatalogLookupsCache } from './lookups-cache';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { tenantId?: string | null } = {},
): Promise<T> {
  const { tenantId, ...init } = options;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const run = async (): Promise<T> => {
    const headers = authHeaders(init.headers, tenantId);
    const isFormData =
      typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (!isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(`${API_URL}${normalizedPath}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message || message;
      } catch {
        /* ignore */
      }
      throw new Error(sanitizeApiErrorMessage(String(message), res.statusText || 'Ошибка'));
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };

  if (isCatalogLookupsGet(normalizedPath, init.method)) {
    const session = getSession();
    const cacheTenant =
      tenantId ?? session?.tenant?.id ?? session?.user.tenantId ?? null;
    return withCatalogLookupsCache(normalizedPath, cacheTenant, run);
  }

  return run();
}

/** Authenticated binary download (e.g. .xlsx). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const headers = authHeaders();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${API_URL}${normalizedPath}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(sanitizeApiErrorMessage(String(message), res.statusText || 'Ошибка'));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { API_URL };
