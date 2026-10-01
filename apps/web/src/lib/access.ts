import { apiFetch } from './api';

export type GrantStatus = 'active' | 'expiring' | 'expired' | 'revoked';

export type AccessTypeOption = {
  id: string;
  label: string;
  global: boolean;
  readOnly: boolean;
  allowExpiry: boolean;
  resource: 'all' | 'division' | 'flag' | 'location' | 'employee';
  canGrant: boolean;
};

export type AccessOptions = {
  canGrant: boolean;
  expiringDays: number;
  types: AccessTypeOption[];
  flags: { id: string; label: string }[];
};

export type AccessSummary = {
  employeesWithAccess: number;
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
  byType: Record<string, number>;
};

export type AccessGrant = {
  id: string;
  accessType: string;
  typeLabel: string;
  resource: string;
  resourceLabel: string;
  readOnly: boolean;
  status: GrantStatus;
  grantedAt: string;
  expiresAt: string | null;
  note: string | null;
};

export type AccessEmployee = {
  id: string;
  fullName: string;
  tabNumber: string;
  status: 'active' | 'dismissed' | 'leave';
  division: { id: string; name: string } | null;
  position: { id: string; name: string } | null;
};

export type AccessEmployeeRow = AccessEmployee & { grants: AccessGrant[] };

export type AccessHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  actor: string | null;
  meta: {
    reason?: string;
    source?: string;
    before?: { accessType: string; resource: string; isActive: boolean; expiresAt: string | null } | null;
    after?: { accessType: string; resource: string; isActive: boolean; expiresAt: string | null } | null;
  } | null;
};

export type AccessEmployeeDetail = {
  employee: AccessEmployee;
  grants: AccessGrant[];
  history: AccessHistoryEntry[];
};

export type BulkAccessResult = {
  succeeded: number;
  failed: number;
  results: { employeeId: string; ok: boolean; error?: string }[];
};

export type GrantPayload = {
  accessType: string;
  resource?: string;
  expiresAt?: string;
  reason: string;
};

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  active: 'Активен',
  expiring: 'Истекает',
  expired: 'Истёк',
  revoked: 'Отозван',
};

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  'access.grant': 'Выдан доступ',
  'access.reactivate': 'Доступ возобновлён',
  'access.revoke': 'Доступ отозван',
};

export const EMPLOYEE_ACCESS_HREF = '/access/employees';

export function employeeAccessHref(employeeId: string) {
  return `${EMPLOYEE_ACCESS_HREF}?employee=${encodeURIComponent(employeeId)}`;
}

export function grantAccess(employeeId: string, payload: GrantPayload) {
  return apiFetch<AccessGrant>('/api/access/grants', {
    method: 'POST',
    body: JSON.stringify({ employeeId, ...payload }),
  });
}

export function revokeAccess(grantId: string, reason: string) {
  return apiFetch<AccessGrant>(`/api/access/grants/${grantId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function bulkAccess(action: 'grant' | 'revoke', employeeIds: string[], payload: GrantPayload) {
  return apiFetch<BulkAccessResult>('/api/access/bulk', {
    method: 'POST',
    body: JSON.stringify({ action, employeeIds, ...payload }),
  });
}
