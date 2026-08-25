const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3001';

export type Session = {
  accessToken: string;
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

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  if (typeof window === 'undefined') return;
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function authHeaders(extra?: HeadersInit, tenantIdOverride?: string | null): Headers {
  const session = getSession();
  const headers = new Headers(extra);
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  const tenantId =
    tenantIdOverride ?? session?.tenant?.id ?? session?.user.tenantId;
  if (tenantId) headers.set('X-Tenant-Id', tenantId);
  return headers;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { tenantId?: string | null } = {},
): Promise<T> {
  const { tenantId, ...init } = options;
  const headers = authHeaders(init.headers, tenantId);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
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
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Authenticated binary download (e.g. .xlsx). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const headers = authHeaders();
  const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    headers,
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
    throw new Error(message);
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
