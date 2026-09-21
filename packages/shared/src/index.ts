/** Shared HR HUB constants & types — used by API (and eventually web/mobile). */

export const ROLES = [
  'platform_admin',
  'tenant_admin',
  'hr',
  'manager',
  'employee',
] as const;

export type RoleName = (typeof ROLES)[number];

export const TENANT_HEADER = 'x-tenant-id';

export const NATS_SUBJECTS = {
  PUNCH_RAW: 'hrhub.punch.raw',
} as const;

export interface PunchEvent {
  tenantId: string;
  deviceId: string;
  employeeExternalId?: string;
  employeeId?: string;
  direction: 'IN' | 'OUT' | 'AUTO';
  occurredAt: string;
  source: 'mock' | 'hikvision' | 'zkteco' | 'manual' | 'gps' | 'qr';
  raw?: Record<string, unknown>;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export function isRoleName(value: string): value is RoleName {
  return (ROLES as readonly string[]).includes(value);
}
