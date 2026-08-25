/** Shared HR HUB constants & types (Phase 0) */

export const ROLES = [
  'platform_admin',
  'tenant_admin',
  'hr',
  'manager',
  'employee',
] as const;

export type Role = (typeof ROLES)[number];

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
  source: 'mock' | 'hikvision' | 'manual';
  raw?: Record<string, unknown>;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
