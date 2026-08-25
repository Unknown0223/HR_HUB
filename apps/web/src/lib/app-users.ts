import { MEGA_NAV } from './mega-nav';
import { TIMEZONES } from './organizations';

export { TIMEZONES };

export type UserMeta = {
  login?: string;
  photoUrl?: string;
  gender?: 'male' | 'female';
  managedBy?: 'organization' | 'self';
  orgIds?: string[];
  orgNames?: string[];
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
};

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

export const PRODUCTS = [{ id: 'verifix', label: 'Verifix' }] as const;

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
  const items: { href: string; label: string }[] = [];
  for (const sec of MEGA_NAV) {
    for (const col of sec.columns) {
      for (const it of col.items) items.push({ href: it.href, label: it.label });
    }
  }
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
