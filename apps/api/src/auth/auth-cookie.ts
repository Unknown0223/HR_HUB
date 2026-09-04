import type { Response } from 'express';

/** Browser session cookie. Mobile keeps using Authorization: Bearer. */
export const AUTH_COOKIE_NAME = 'hrhub_at';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function authCookieOptions() {
  // Local HTTP (dev): Secure cookies are dropped by browsers → <img> / fetch lose session.
  // Prod (HTTPS): keep Secure + SameSite=None for cross-origin web↔api.
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: MAX_AGE_MS,
  };
}

export function setAuthCookie(res: Response, accessToken: string) {
  res.cookie(AUTH_COOKIE_NAME, accessToken, authCookieOptions());
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions());
}

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}
