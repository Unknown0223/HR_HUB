/**
 * Role-access helpers — sidebar / page gating from TenantSetting.extras.roleAccess.
 * Grant keys look like `/employees::*`, `/divisions?tab=divisions::*`.
 */

import { NAV_SECTIONS } from './nav-registry';
import { REPORTS } from './reports-registry';

/** Hub grants that must not unlock the module pages nested under them. */
const EXACT_GRANTS = new Set(['/access']);

/** Stored grant keys of pages that moved; the old key keeps opening the new page. */
const MOVED_GRANTS: Record<string, string> = {
  '/catalog/access-grants': '/access/employees',
};

/** Rewrites grant keys (`<href>::<action>`) of moved pages to the current href. */
export function migrateMovedGrantKeys(
  byRole: Record<string, Record<string, boolean>>,
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [role, keys] of Object.entries(byRole)) {
    const next: Record<string, boolean> = {};
    for (const [key, on] of Object.entries(keys || {})) {
      const sep = key.lastIndexOf('::');
      const href = sep < 0 ? key : key.slice(0, sep);
      const moved = MOVED_GRANTS[href];
      const k = moved ? `${moved}${sep < 0 ? '' : key.slice(sep)}` : key;
      next[k] = Boolean(next[k]) || Boolean(on);
    }
    out[role] = next;
  }
  return out;
}

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

  for (const href of allowed.flatMap((h) => (MOVED_GRANTS[h] ? [h, MOVED_GRANTS[h]] : [h]))) {
    const [path, wantQs] = href.split('?');
    const nested = path !== '/' && !EXACT_GRANTS.has(path) && pathname.startsWith(path + '/');
    if (pathname !== path && !nested) continue;
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
  return reportHubAllowed(pathname, have, allowed) || accessHubAllowed(pathname, allowed);
}

/** The /access overview opens for anyone granted at least one page of the access section. */
function accessHubAllowed(pathname: string, allowed: string[]) {
  if (pathname !== '/access') return false;
  const section = NAV_SECTIONS.find((s) => s.id === 'access');
  return (section?.groups ?? []).some((g) =>
    g.items.some((i) => {
      if (i.href === '/access') return false;
      const [path, qs] = i.href.split('?');
      return isHrefAllowed(path, qs ? `?${qs}` : '', allowed, false);
    }),
  );
}

/**
 * The /reports hub (and its `?category=` views) opens for anyone granted at least one
 * report in scope; the hub itself lists only the granted reports. Quick-report tabs
 * (`?tab=`) still need the `/reports` grant.
 */
function reportHubAllowed(pathname: string, have: URLSearchParams, allowed: string[]) {
  if (pathname !== '/reports' || have.has('tab')) return false;
  const category = have.get('category');
  return REPORTS.some((r) => {
    if (r.category === 'quick' || (category && r.category !== category)) return false;
    const [path, qs] = r.href.split('?');
    return isHrefAllowed(path, qs ? `?${qs}` : '', allowed, false);
  });
}

export function filterNavItems<T extends { href: string; platformOnly?: boolean }>(
  items: T[],
  access: MyAccess | null,
  authRole?: string | null,
): T[] {
  return filterMegaItems(
    items.map((i) => ({ ...i, badge: i.platformOnly ? 'platform' : undefined })),
    access,
    authRole,
  );
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
