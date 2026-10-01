import { NAV_ITEMS } from './nav-registry';
import { CATALOG_REPORTS } from './reports-registry';
import { TIMEZONES } from './organizations';

export { TIMEZONES };

export type UserMeta = {
  login?: string;
  photoUrl?: string;
  gender?: 'male' | 'female';
  managedBy?: 'organization' | 'self';
  managerUserId?: string;
  managerName?: string;
  timezone?: string;
  code?: string;
  phone?: string;
  catalogRoleIds?: string[];
  catalogRoleNames?: string[];
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  meta?: UserMeta | null;
  createdAt: string;
  updatedAt?: string;
  /** Филиалы the user may see (required for hr / manager). */
  locationIds?: string[];
  /** Optional narrowing to specific employees inside those филиалы. */
  employeeIds?: string[];
};

export type ScopeLocation = { id: string; name: string; code: string; isActive?: boolean };

export type ScopeEmployee = {
  id: string;
  fullName: string;
  tabNumber: string;
  position: string;
  locationIds: string[];
  locations: string[];
};

/** Roles whose employee visibility is limited to assigned филиалы. */
export const SCOPED_AUTH_ROLES = new Set(['hr', 'manager']);

/** Mirrors the API's `authRoleFromMeta`: catalog role names decide the auth role. */
export function authRoleFromCatalogNames(names: string[], fallback = 'employee') {
  const n = names.map((x) => x.toLowerCase());
  if (n.some((x) => x.includes('admin'))) return 'tenant_admin';
  if (n.some((x) => x.includes('hr') || x.includes('кадр') || x.includes('бухгалтер'))) return 'hr';
  if (n.some((x) => x.includes('руковод') || x.includes('boshliq') || x.includes('менедж')))
    return 'manager';
  if (n.some((x) => x.includes('сотрудник'))) return 'employee';
  return fallback;
}

export type RoleMeta = {
  products?: string[];
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type AppRole = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: RoleMeta | null;
};

export const PRODUCTS = [{ id: 'hrhub', label: 'HR HUB' }] as const;

export const AUTH_ROLE_LABEL: Record<string, string> = {
  tenant_admin: 'Администратор',
  hr: 'HR-менеджер',
  manager: 'Руководитель',
  employee: 'Сотрудник',
};

export function asUserMeta(raw?: unknown): UserMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as UserMeta;
}

export function asRoleMeta(raw?: unknown): RoleMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as RoleMeta;
}

export function loginOf(u: AppUser) {
  const m = asUserMeta(u.meta);
  if (m.login) return m.login;
  return (u.email || '').split('@')[0] || '';
}

export function displayRole(u: AppUser) {
  const names = asUserMeta(u.meta).catalogRoleNames;
  if (names?.length) return names.join(', ');
  return AUTH_ROLE_LABEL[u.role] || u.role;
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AccessRow = { form: string; action: string; key: string };

export function accessCatalog(): AccessRow[] {
  const items: { href: string; label: string }[] = [
    // `/reports?…` sidebar entries are views of the hub, covered by report and `/reports` grants.
    ...NAV_ITEMS.filter((it) => !it.href.startsWith('/reports?')).map((it) => ({
      href: it.href,
      label: it.label,
    })),
    ...CATALOG_REPORTS.map((r) => ({ href: r.href, label: r.title })),
  ];
  items.push(
    { href: '/settings/organizations', label: 'Организации' },
    { href: '/settings/users', label: 'Пользователи' },
    { href: '/settings/users/roles', label: 'Роли' },
    { href: '/divisions', label: 'Группы отделов' },
    { href: '/catalog/grades', label: 'Разряды' },
  );
  const seen = new Set<string>();
  const rows: AccessRow[] = [];
  for (const it of items) {
    if (seen.has(it.href)) continue;
    seen.add(it.href);
    rows.push({ form: it.label, action: '*', key: `${it.href}::*` });
    rows.push({
      form: it.label,
      action: 'Изменить статус',
      key: `${it.href}::status`,
    });
    rows.push({ form: it.label, action: 'Удалить', key: `${it.href}::delete` });
  }
  return rows;
}

export function autoRoleCode(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return slug || `ROLE_${Date.now().toString(36).toUpperCase()}`;
}
