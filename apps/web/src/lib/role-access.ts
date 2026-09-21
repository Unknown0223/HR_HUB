/**
 * Role-access helpers — mega-nav / page gating from TenantSetting.extras.roleAccess.
 * Grant keys look like `/employees::*`, `/divisions?tab=divisions::*`.
 */

export type MyAccess = {
  bypass: boolean;
  /** Allowed page hrefs (without `::*` suffix) */
  allowed: string[];
};

export function isAccessBypassRole(role?: string | null) {
  return role === 'tenant_admin' || role === 'platform_admin';
}

/** True if current location is covered by an allowed grant href. */
export function isHrefAllowed(
  pathname: string,
  search: string,
  allowed: string[],
  bypass: boolean,
): boolean {
  if (bypass) return true;
  // Fallback landing so a locked user is never stuck on a blank shell.
  if (pathname === '/dashboard' || pathname === '/') return true;

  const qs = search.startsWith('?') ? search.slice(1) : search;
  const have = new URLSearchParams(qs);

  for (const href of allowed) {
    const [path, wantQs] = href.split('?');
    if (pathname !== path && !(path !== '/' && pathname.startsWith(path + '/'))) {
      continue;
    }
    if (!wantQs) return true;
    const want = new URLSearchParams(wantQs);
    let ok = true;
    for (const [k, v] of want.entries()) {
      if (have.get(k) !== v) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function filterMegaItems<T extends { href: string; badge?: string }>(
  items: T[],
  access: MyAccess | null,
  authRole?: string | null,
): T[] {
  return items.filter((i) => {
    if (i.badge === 'platform' && authRole !== 'platform_admin') return false;
    if (!access || access.bypass) return true;
    return isHrefAllowed(
      i.href.split('?')[0],
      i.href.includes('?') ? `?${i.href.split('?')[1]}` : '',
      access.allowed,
      false,
    );
  });
}
