import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeJsonForLog } from '../common/redact';

export type GwDeviceRegister = {
  id?: string;
  tenant_id: string;
  name: string;
  serial: string;
  adapter: 'mock' | 'hikvision_isapi' | 'zkteco_push';
  host?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  model?: string | null;
  punchLocked?: boolean;
  lastAdminLoginSerial?: number;
  adminLoginAt?: string | null;
};

export type DeviceForGw = {
  id: string;
  tenantId: string;
  name: string;
  serialNumber: string;
  adapterType?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  passwordEnc?: string | null;
  model?: string | null;
  meta?: unknown;
};

export function punchLockFromMeta(meta: unknown): {
  active: boolean;
  lastSerial: number;
  loginAt: string | null;
} {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { active: false, lastSerial: 0, loginAt: null };
  }
  const guard = (meta as Record<string, unknown>).clockGuard;
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) {
    return { active: false, lastSerial: 0, loginAt: null };
  }
  const g = guard as Record<string, unknown>;
  const lock =
    g.punchLock && typeof g.punchLock === 'object' && !Array.isArray(g.punchLock)
      ? (g.punchLock as Record<string, unknown>)
      : {};
  const lastSerial = Number(lock.lastSerial ?? g.lastAdminLoginSerial ?? 0);
  const loginAt =
    typeof lock.loginAt === 'string' && lock.loginAt.trim()
      ? lock.loginAt
      : null;
  return {
    active: lock.active === true,
    lastSerial: Number.isFinite(lastSerial) && lastSerial > 0 ? lastSerial : 0,
    loginAt,
  };
}

export type GwSyncFace = {
  employee_external_id: string;
  employee_name: string;
  face_image_base64?: string | null;
};

@Injectable()
export class DeviceGwClient {
  private readonly logger = new Logger(DeviceGwClient.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('DEVICE_GW_URL') || 'http://127.0.0.1:8000'
    ).replace(/\/$/, '');
  }

  mapAdapter(adapterType?: string | null): 'mock' | 'hikvision_isapi' | 'zkteco_push' {
    const t = (adapterType || 'mock').toLowerCase();
    if (t === 'hikvision' || t === 'hikvision_isapi') return 'hikvision_isapi';
    if (t === 'zkteco' || t === 'zkteco_push') return 'zkteco_push';
    return 'mock';
  }

  registerFromDevice(d: DeviceForGw) {
    const lock = punchLockFromMeta(d.meta);
    return this.registerDevice({
      id: d.id,
      tenant_id: d.tenantId,
      name: d.name,
      serial: d.serialNumber,
      adapter: this.mapAdapter(d.adapterType),
      host: d.host,
      port: d.port,
      username: d.username,
      password: d.passwordEnc,
      model: d.model,
      punchLocked: lock.active,
      lastAdminLoginSerial: lock.lastSerial,
      adminLoginAt: lock.loginAt,
    });
  }

  async registerDevice(body: GwDeviceRegister) {
    try {
      const payload: Record<string, unknown> = {
        tenant_id: body.tenant_id,
        name: body.name,
        serial: body.serial,
        adapter: body.adapter,
      };
      if (body.id) payload.id = body.id;
      if (body.host) payload.host = body.host;
      if (body.port != null) payload.port = body.port;
      else payload.port = 80;
      if (body.username) payload.username = body.username;
      if (body.password) payload.password = body.password;
      if (body.model) payload.model = body.model;
      payload.punch_locked = body.punchLocked === true;
      payload.last_admin_login_serial = body.lastAdminLoginSerial ?? 0;
      if (body.adminLoginAt) payload.admin_login_at = body.adminLoginAt;

      const res = await fetch(`${this.baseUrl}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(
          `GW register failed ${res.status}: ${text} payload=${safeJsonForLog(payload)}`,
        );
        return null;
      }
      return (await res.json()) as { id: string; status: string };
    } catch (e) {
      this.logger.warn(`GW register unavailable: ${e}`);
    }
    return null;
  }

  async heartbeat(gatewayRef: string) {
    try {
      const res = await fetch(`${this.baseUrl}/devices/${gatewayRef}/heartbeat`, {
        method: 'POST',
      });
      if (!res.ok) return null;
      return (await res.json()) as { status: string };
    } catch {
      return null;
    }
  }

  async syncFace(gatewayRef: string, body: GwSyncFace) {
    const res = await fetch(`${this.baseUrl}/devices/${gatewayRef}/sync-face`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GW sync-face ${res.status}: ${text}`);
    }
    return (await res.json()) as {
      synced: boolean;
      face_enrolled: boolean;
      adapter: string;
    };
  }

    async health() {
        try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) return { ok: false };
      return { ok: true, ...(await res.json()) };
    } catch {
      return { ok: false };
    }
  }

  async remoteCommand(
    gatewayRef: string,
    action: 'heartbeat' | 'sync_clock' | 'pull_events' | 'open_door' | 'reboot',
  ) {
    const res = await fetch(`${this.baseUrl}/devices/${gatewayRef}/remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { detail: text };
    }
    if (!res.ok) {
      const err = new Error(
        typeof body.detail === 'string' ? body.detail : gwDetail(text, `GW remote ${res.status}`),
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return body as { ok?: boolean; action?: string; status?: string; count?: number };
  }

  async changePassword(gatewayRef: string, newPassword: string) {
    const res = await fetch(`${this.baseUrl}/devices/${gatewayRef}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(gwDetail(text, `GW change-password ${res.status}`)) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (text ? JSON.parse(text) : {}) as { ok: boolean; device_id: string };
  }

  async verifyPassword(gatewayRef: string, password: string) {
    const res = await fetch(`${this.baseUrl}/devices/${gatewayRef}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(gwDetail(text, `GW verify-password ${res.status}`)) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (text ? JSON.parse(text) : {}) as { ok: boolean; device_id: string };
  }
}

function gwDetail(text: string, fallback: string): string {
  const raw = (text || '').trim();
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as { detail?: unknown; message?: unknown };
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg);
          }
          return String(item);
        })
        .filter(Boolean)
        .join('; ');
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    /* not JSON */
  }
  return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}
