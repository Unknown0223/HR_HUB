import type { Prisma } from '@prisma/client';

export type AccessTypeId =
  | 'org_full'
  | 'kpe_full'
  | 'org_custom'
  | 'org_subordinate'
  | 'profile_flag'
  | 'location'
  | 'reports_to'
  | 'team_kiosk'
  | 'punch_video';

/** `feature`: an on/off capability of the employee themselves; stored with resource `*`. */
export type AccessResourceKind = 'all' | 'division' | 'flag' | 'location' | 'employee' | 'feature';

export type AccessTypeRule = {
  label: string;
  /** Tenant-wide access: only tenant/platform admins may grant or revoke it. */
  global: boolean;
  /** Managed elsewhere (employee card, device sync) — shown read-only here. */
  readOnly: boolean;
  allowExpiry: boolean;
  resource: AccessResourceKind;
};

export const ACCESS_TYPES: Record<AccessTypeId, AccessTypeRule> = {
  org_full: { label: 'Полный доступ к оргструктуре', global: true, readOnly: false, allowExpiry: true, resource: 'all' },
  kpe_full: { label: 'Полный доступ к КПЭ', global: true, readOnly: false, allowExpiry: true, resource: 'all' },
  org_custom: { label: 'Доступ к подразделению', global: false, readOnly: false, allowExpiry: true, resource: 'division' },
  org_subordinate: {
    label: 'Подчинённое подразделение',
    global: false,
    readOnly: false,
    allowExpiry: true,
    resource: 'division',
  },
  profile_flag: { label: 'Ограничение профиля', global: false, readOnly: false, allowExpiry: false, resource: 'flag' },
  location: { label: 'Локация', global: false, readOnly: true, allowExpiry: false, resource: 'location' },
  reports_to: { label: 'Руководитель', global: false, readOnly: true, allowExpiry: false, resource: 'employee' },
  team_kiosk: {
    label: 'Отметка сотрудников с телефона руководителя',
    global: false,
    readOnly: false,
    allowExpiry: true,
    resource: 'feature',
  },
  punch_video: {
    label: 'Видео-отметка с телефона',
    global: false,
    readOnly: false,
    allowExpiry: true,
    resource: 'feature',
  },
};

export const PROFILE_FLAGS: Record<string, string> = {
  system_access_closed: 'Доступ в систему закрыт',
  marks_blocked: 'Отметки заблокированы',
  exclude_from_stats: 'Исключён из статистики',
};

export const VIEW_ROLES = ['platform_admin', 'tenant_admin', 'hr', 'manager'] as const;
export const GRANT_ROLES: ReadonlySet<string> = new Set(['platform_admin', 'tenant_admin', 'hr']);
export const GLOBAL_GRANT_ROLES: ReadonlySet<string> = new Set(['platform_admin', 'tenant_admin']);

export const EXPIRING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type GrantStatus = 'active' | 'expiring' | 'expired' | 'revoked';

export function isAccessType(v: string): v is AccessTypeId {
  return Object.prototype.hasOwnProperty.call(ACCESS_TYPES, v);
}

export function grantStatus(
  g: { isActive: boolean; expiresAt: Date | null },
  now: Date = new Date(),
): GrantStatus {
  if (!g.isActive) return 'revoked';
  if (!g.expiresAt) return 'active';
  const left = g.expiresAt.getTime() - now.getTime();
  if (left <= 0) return 'expired';
  return left <= EXPIRING_DAYS * DAY_MS ? 'expiring' : 'active';
}

/** `active` includes grants that are about to expire; `expiring` is its subset. */
export function grantStatusWhere(
  status: GrantStatus,
  now: Date = new Date(),
): Prisma.EmployeeAccessGrantWhereInput {
  switch (status) {
    case 'revoked':
      return { isActive: false };
    case 'expired':
      return { isActive: true, expiresAt: { lte: now } };
    case 'expiring':
      return {
        isActive: true,
        expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) },
      };
    case 'active':
      return { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }
}

export function canGrantType(role: string, type: AccessTypeId): boolean {
  const rule = ACCESS_TYPES[type];
  if (rule.readOnly || !GRANT_ROLES.has(role)) return false;
  return !rule.global || GLOBAL_GRANT_ROLES.has(role);
}

export type GrantInput = { accessType: string; resource?: string | null; expiresAt?: string | null };

export type CheckedGrant =
  | { ok: true; accessType: AccessTypeId; resource: string; expiresAt: Date | null }
  | { ok: false; error: string };

/** Validates type, permission, resource shape and expiry; resource ownership is checked by the caller. */
export function checkGrantInput(input: GrantInput, role: string, now: Date = new Date()): CheckedGrant {
  const type = String(input.accessType || '');
  if (!isAccessType(type)) return { ok: false, error: 'Неизвестный тип доступа' };
  const rule = ACCESS_TYPES[type];
  if (rule.readOnly) return { ok: false, error: 'Этот доступ управляется в карточке сотрудника' };
  if (!canGrantType(role, type)) {
    return { ok: false, error: 'Недостаточно прав для этого типа доступа' };
  }

  let resource = String(input.resource ?? '').trim();
  if (rule.resource === 'all' || rule.resource === 'feature') resource = '*';
  if (rule.resource === 'flag' && !PROFILE_FLAGS[resource]) {
    return { ok: false, error: 'Неизвестное ограничение профиля' };
  }
  if (rule.resource === 'division' && !resource) {
    return { ok: false, error: 'Выберите подразделение' };
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    if (!rule.allowExpiry) return { ok: false, error: 'Для этого доступа срок не задаётся' };
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) return { ok: false, error: 'Некорректная дата окончания' };
    if (expiresAt.getTime() <= now.getTime()) {
      return { ok: false, error: 'Дата окончания должна быть в будущем' };
    }
  }
  return { ok: true, accessType: type, resource, expiresAt };
}
