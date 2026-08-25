import { randomBytes, randomUUID } from 'crypto';
import { BadRequestException, BadGatewayException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  DayStatus,
  ProdCalendarDayType,
  PunchDirection,
  Prisma,
  WorkScheduleKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceGwClient } from '../device-gw/device-gw.client';
import { StorageService } from '../storage/storage.service';
import {
  CreateDeviceDto,
  CreateLocationDto,
  CreateProductionCalendarDto,
  CreateQrCodeDto,
  CreateScheduleDto,
  ApplyMarkSettingsDto,
  DeviceIgnoreDto,
  GpsPunchDto,
  IngestPunchDto,
  QrPunchDto,
  UpdateDeviceDto,
  UpdateLocationDto,
  UpdateProductionCalendarDto,
} from './dto';
import { pageResult, parsePagination } from '../common/pagination';
import { buildExcelBuffer } from '../common/excel';
import {
  buildYearGrid,
  emptyYearGrid,
  isDayOffByPattern,
  isScheduleKind,
  mergeScheduleSettings,
  parseHm,
  type ScheduleKind,
  type ScheduleSettings,
  type WeekPattern,
} from './schedule-settings';
import {
  officialLastOutEnabled,
  roleForDayMark,
  startOfLocalDay,
} from './attendance-day';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gw: DeviceGwClient,
    private readonly storage: StorageService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  private gwHttpException(e: unknown, fallback: string) {
    const msg = e instanceof Error && e.message.trim() ? e.message : fallback;
    const status =
      e && typeof e === 'object' && 'status' in e
        ? Number((e as { status?: unknown }).status)
        : NaN;
    if (status >= 400 && status < 500) return new BadRequestException(msg);
    return new BadGatewayException(msg);
  }

  // --- Locations ---
  private locationInclude = {
    locationType: { select: { id: true, code: true, name: true } },
    devices: {
      select: { id: true, status: true, isActive: true },
    },
    _count: { select: { devices: true, qrCodes: true, divisions: true } },
  } as const;

  private enrichLocationRow<
    T extends {
      id: string;
      devices?: Array<{ status: string; isActive: boolean }>;
      _count?: { devices?: number; qrCodes?: number; divisions?: number };
    },
  >(row: T, employeeCount: number) {
    const devices = row.devices ?? [];
    const devicesOffline = devices.some((d) => {
      const s = (d.status || '').toLowerCase();
      return s !== 'online' && s !== 'в сети';
    });
    const { devices: _devices, ...rest } = row as T & { devices?: unknown };
    return {
      ...rest,
      deviceCount: row._count?.devices ?? devices.length,
      devicesOffline,
      devicesOfflineLabel: devicesOffline ? 'Да' : 'Нет',
      employeeCount,
      geolocation:
        'latitude' in row &&
        'longitude' in row &&
        (row as { latitude?: number | null }).latitude != null &&
        (row as { longitude?: number | null }).longitude != null
          ? `${(row as { latitude: number }).latitude}, ${(row as { longitude: number }).longitude}`
          : null,
    };
  }

  async listLocations(tenantId: string, filter?: string) {
    const where: { tenantId: string; isActive?: boolean } = { tenantId };
    if (filter === 'active') where.isActive = true;
    if (filter === 'inactive') where.isActive = false;
    const rows = await this.prisma.location.findMany({
      where,
      include: this.locationInclude,
      orderBy: { name: 'asc' },
    });

    const grants = await this.prisma.employeeAccessGrant.groupBy({
      by: ['resource'],
      where: { tenantId, accessType: 'location', isActive: true },
      _count: { _all: true },
    });
    const grantMap = new Map(grants.map((g) => [g.resource, g._count._all]));

    return rows.map((row) => {
      const emp = grantMap.get(row.id) || 0;
      return this.enrichLocationRow(row, emp);
    });
  }

  async getLocation(tenantId: string, id: string) {
    const loc = await this.prisma.location.findFirst({
      where: { id, tenantId },
      include: {
        locationType: { select: { id: true, code: true, name: true } },
        _count: { select: { devices: true, qrCodes: true, divisions: true } },
        devices: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            adapterType: true,
            status: true,
            isActive: true,
            lastSeenAt: true,
          },
          orderBy: { name: 'asc' },
          take: 200,
        },
        divisions: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            openedAt: true,
            divisionGroup: { select: { id: true, name: true } },
            _count: { select: { employees: true } },
          },
          orderBy: { name: 'asc' },
          take: 200,
        },
        qrCodes: {
          select: {
            id: true,
            code: true,
            label: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!loc) throw new NotFoundException('Location not found');

    const grants = await this.prisma.employeeAccessGrant.findMany({
      where: { tenantId, accessType: 'location', resource: id, isActive: true },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            division: { select: { id: true, name: true } },
            position: { select: { id: true, name: true } },
          },
        },
      },
      take: 500,
    });

    const meta =
      loc.meta && typeof loc.meta === 'object' && !Array.isArray(loc.meta)
        ? (loc.meta as Record<string, unknown>)
        : {};
    const changeHistory = Array.isArray(meta.changeHistory)
      ? meta.changeHistory
      : [];

    return {
      ...loc,
      employeeCount: grants.length,
      persons: grants.map((g) => ({
        id: g.employee.id,
        pin: g.employee.tabNumber,
        fullName: [g.employee.lastName, g.employee.firstName, g.employee.middleName]
          .filter(Boolean)
          .join(' '),
        divisionName: g.employee.division?.name ?? null,
        positionName: g.employee.position?.name ?? null,
        attachmentNote: g.note,
      })),
      region: typeof meta.region === 'string' ? meta.region : null,
      bssid: typeof meta.bssid === 'string' ? meta.bssid : null,
      restrictMarks: meta.restrictMarks === true,
      polygonalAnalysis: typeof meta.polygonalAnalysis === 'string' ? meta.polygonalAnalysis : null,
      createdByLabel: typeof meta.createdByLabel === 'string' ? meta.createdByLabel : 'System',
      updatedByLabel: typeof meta.updatedByLabel === 'string' ? meta.updatedByLabel : 'System',
      changeHistory,
      geolocation:
        loc.latitude != null && loc.longitude != null
          ? `${loc.latitude}, ${loc.longitude}`
          : null,
    };
  }

  private asLocationMeta(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      return { ...(meta as Record<string, unknown>) };
    }
    return {};
  }

  createLocation(tenantId: string, dto: CreateLocationDto) {
    const meta = dto.meta
      ? ({
          ...dto.meta,
          createdByLabel: (dto.meta.createdByLabel as string) || 'Admin',
          updatedByLabel: (dto.meta.updatedByLabel as string) || 'Admin',
          changeHistory: [
            {
              at: new Date().toISOString(),
              by: 'Admin',
              action: 'create',
            },
          ],
        } as Prisma.InputJsonValue)
      : ({
          createdByLabel: 'Admin',
          updatedByLabel: 'Admin',
          changeHistory: [{ at: new Date().toISOString(), by: 'Admin', action: 'create' }],
        } as Prisma.InputJsonValue);

    return this.prisma.location.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone ?? 'Asia/Tashkent',
        latitude: dto.latitude,
        longitude: dto.longitude,
        geoRadiusM: dto.geoRadiusM ?? 150,
        locationTypeId: dto.locationTypeId,
        isActive: dto.isActive ?? true,
        meta,
      },
      include: this.locationInclude,
    });
  }

  async updateLocation(tenantId: string, id: string, dto: UpdateLocationDto) {
    const loc = await this.prisma.location.findFirst({ where: { id, tenantId } });
    if (!loc) throw new NotFoundException('Location not found');

    const data: Prisma.LocationUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.geoRadiusM !== undefined) data.geoRadiusM = dto.geoRadiusM;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.locationTypeId !== undefined) {
      data.locationType = dto.locationTypeId
        ? { connect: { id: dto.locationTypeId } }
        : { disconnect: true };
    }

    const prevMeta = this.asLocationMeta(loc.meta);
    const nextMeta = dto.meta ? { ...prevMeta, ...dto.meta } : { ...prevMeta };
    const history = Array.isArray(nextMeta.changeHistory)
      ? [...(nextMeta.changeHistory as unknown[])]
      : [];
    history.unshift({
      at: new Date().toISOString(),
      by: (nextMeta.updatedByLabel as string) || 'Admin',
      action: 'update',
    });
    nextMeta.changeHistory = history.slice(0, 100);
    nextMeta.updatedByLabel = (nextMeta.updatedByLabel as string) || 'Admin';
    if (!nextMeta.createdByLabel) nextMeta.createdByLabel = 'Admin';
    data.meta = nextMeta as Prisma.InputJsonValue;

    return this.prisma.location.update({
      where: { id },
      data,
      include: this.locationInclude,
    });
  }

  async deleteLocation(tenantId: string, id: string) {
    const loc = await this.prisma.location.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { devices: true, qrCodes: true, divisions: true } } },
    });
    if (!loc) throw new NotFoundException('Location not found');
    const linked =
      loc._count.devices + loc._count.qrCodes + loc._count.divisions;
    if (linked > 0) {
      // Soft-delete when related records exist
      return this.prisma.location.update({
        where: { id },
        data: { isActive: false },
        include: this.locationInclude,
      });
    }
    await this.prisma.location.delete({ where: { id } });
    return { ok: true, id, deleted: true };
  }

  // --- Devices ---
  private asMeta(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      return { ...(meta as Record<string, unknown>) };
    }
    return {};
  }

  private deviceInclude = {
    location: {
      select: { id: true, name: true, code: true, timezone: true },
    },
  } as const;

  listDevices(tenantId: string, filter?: string) {
    const where: { tenantId: string; lastSeenAt?: null; status?: string | { in: string[] } } = {
      tenantId,
    };
    if (filter === 'new') {
      // Truly new = never communicated (no lastSeenAt) AND still in a
      // pre-operational status. Offline devices that were seen before are NOT new.
      where.lastSeenAt = null;
      where.status = { in: ['new', 'registered'] };
    }
    return this.prisma.device.findMany({
      where,
      include: this.deviceInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDevice(tenantId: string, id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, tenantId },
      include: this.deviceInclude,
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async createDevice(tenantId: string, dto: CreateDeviceDto) {
    const adapterType = dto.adapterType ?? 'mock';
    const meta = dto.meta ? (dto.meta as Prisma.InputJsonValue) : undefined;
    const device = await this.prisma.device.create({
      data: {
        tenantId,
        name: dto.name,
        serialNumber: dto.serialNumber,
        locationId: dto.locationId,
        model: dto.model,
        adapterType,
        host: dto.host,
        port: dto.port,
        username: dto.username,
        passwordEnc: dto.password,
        gatewayRef: dto.gatewayRef,
        status: 'registered',
        isActive: dto.isActive ?? true,
        ...(meta !== undefined ? { meta } : {}),
      },
      include: this.deviceInclude,
    });

    const reg = await this.gw.registerFromDevice(device);

    if (reg?.id) {
      return this.prisma.device.update({
        where: { id: device.id },
        data: {
          gatewayRef: reg.id,
          status: reg.status || 'online',
          lastSeenAt: new Date(),
        },
        include: this.deviceInclude,
      });
    }

    this.logger.warn(`Device ${device.id} created but GW register skipped/failed`);
    return device;
  }

  async updateDevice(tenantId: string, id: string, dto: UpdateDeviceDto) {
    const existing = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Device not found');

    const data: Prisma.DeviceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.adapterType !== undefined) data.adapterType = dto.adapterType;
    if (dto.host !== undefined) data.host = dto.host;
    if (dto.port !== undefined) data.port = dto.port;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.password !== undefined) data.passwordEnc = dto.password;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.locationId !== undefined) {
      data.location = dto.locationId
        ? { connect: { id: dto.locationId } }
        : { disconnect: true };
    }
    if (dto.meta !== undefined) {
      data.meta = {
        ...this.asMeta(existing.meta),
        ...dto.meta,
      } as Prisma.InputJsonValue;
    }

    return this.prisma.device.update({
      where: { id },
      data,
      include: this.deviceInclude,
    });
  }

  async changeDevicePassword(tenantId: string, id: string, newPassword: string) {
    const device = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!device) throw new NotFoundException('Device not found');
    const ref = device.gatewayRef || device.id;
    try {
      await this.gw.changePassword(ref, newPassword);
    } catch (e) {
      throw this.gwHttpException(e, 'Не удалось сменить пароль на терминале');
    }
    const updated = await this.prisma.device.update({
      where: { id },
      data: { passwordEnc: newPassword },
      include: this.deviceInclude,
    });
    await this.gw.registerFromDevice(updated);
    return { ok: true, id };
  }

  /** Save the password currently set on the terminal (after a local change) into the DB. */
  async syncDevicePassword(tenantId: string, id: string, password: string) {
    const device = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!device) throw new NotFoundException('Device not found');
    const ref = device.gatewayRef || device.id;
    try {
      await this.gw.verifyPassword(ref, password);
    } catch (e) {
      throw this.gwHttpException(e, 'Пароль терминала не принят — проверьте текущий пароль на устройстве');
    }
    const meta = this.asMeta(device.meta);
    const prevAuth =
      meta.auth && typeof meta.auth === 'object' && !Array.isArray(meta.auth)
        ? { ...(meta.auth as Record<string, unknown>) }
        : {};
    meta.auth = {
      ...prevAuth,
      passwordOutOfSync: false,
      syncedAt: new Date().toISOString(),
      lastError: null,
    };
    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        passwordEnc: password,
        status: 'online',
        meta: meta as Prisma.InputJsonValue,
      },
      include: this.deviceInclude,
    });
    await this.gw.registerFromDevice(updated);
    return { ok: true, id, saved: true };
  }

  private generateTerminalPassword(username: string): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(10);
    let body = '';
    for (const b of bytes) body += alphabet[b % alphabet.length];
    let pwd = `Hr${body}9`;
    const user = (username || 'admin').toLowerCase();
    if (pwd.toLowerCase().includes(user)) pwd = `Kx${body}7`;
    return pwd.slice(0, 16);
  }

  async recordDeviceHeartbeat(dto: {
    tenantId: string;
    deviceId: string;
    deviceNow?: string | null;
    clockDriftSeconds?: number;
    punchLocked?: boolean;
    adminLoginDetected?: boolean;
    adminLoginAt?: string | null;
    adminLoginSerial?: number;
    authFailed?: boolean;
  }) {
    const device = await this.prisma.device.findFirst({
      where: {
        tenantId: dto.tenantId,
        OR: [{ id: dto.deviceId }, { gatewayRef: dto.deviceId }],
      },
    });
    if (!device) return { ok: false };
    const meta = this.asMeta(device.meta);
    const prev =
      meta.clockGuard && typeof meta.clockGuard === 'object' && !Array.isArray(meta.clockGuard)
        ? { ...(meta.clockGuard as Record<string, unknown>) }
        : {};
    const prevLock =
      prev.punchLock && typeof prev.punchLock === 'object' && !Array.isArray(prev.punchLock)
        ? { ...(prev.punchLock as Record<string, unknown>) }
        : {};
    const serial = Number(dto.adminLoginSerial ?? prevLock.lastSerial ?? 0) || 0;
    const nowIso = new Date().toISOString();
    const becomingLocked =
      dto.adminLoginDetected === true || dto.punchLocked === true;
    const unlocking =
      prevLock.active === true &&
      dto.punchLocked === false &&
      dto.adminLoginDetected !== true;
    const punchLock = {
      ...prevLock,
      active: becomingLocked && !unlocking,
      lastSerial: serial,
      loginAt: dto.adminLoginAt || prevLock.loginAt || null,
      lockedAt:
        becomingLocked && prevLock.active !== true ? nowIso : prevLock.lockedAt || null,
      unlockedAt: unlocking
        ? nowIso
        : becomingLocked
          ? null
          : prevLock.unlockedAt || null,
    };
    const driftNum = Number(dto.clockDriftSeconds);
    const clockGuard: Record<string, unknown> = {
      ...prev,
      lastHeartbeatAt: nowIso,
      lastDeviceClockAt: dto.deviceNow || prev.lastDeviceClockAt || null,
      lastDriftSeconds: dto.clockDriftSeconds ?? prev.lastDriftSeconds ?? 0,
      lastAdminLoginSerial: serial,
      punchLock,
    };
    if (dto.deviceNow && Number.isFinite(driftNum) && Math.abs(driftNum) <= 180) {
      clockGuard.lastTrustedDeviceClockAt = dto.deviceNow;
    }
    meta.clockGuard = clockGuard;
    const prevAuth =
      meta.auth && typeof meta.auth === 'object' && !Array.isArray(meta.auth)
        ? { ...(meta.auth as Record<string, unknown>) }
        : {};
    if (dto.authFailed) {
      meta.auth = {
        ...prevAuth,
        passwordOutOfSync: true,
        lastError: 'Пароль на терминале не совпадает с сервером',
        failedAt: nowIso,
      };
    } else if (prevAuth.passwordOutOfSync === true && dto.authFailed === false) {
      meta.auth = { ...prevAuth, passwordOutOfSync: false, lastError: null };
    }
    const nextStatus = dto.authFailed
      ? 'auth_failed'
      : punchLock.active
        ? 'locked'
        : 'online';
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        status: nextStatus,
        lastSeenAt: new Date(),
        meta: meta as Prisma.InputJsonValue,
      },
    });

    if (dto.adminLoginDetected) {
      const existing = await this.prisma.problemMark.findFirst({
        where: {
          tenantId: dto.tenantId,
          reason: 'device_admin_login',
          resolved: false,
        },
        orderBy: { createdAt: 'desc' },
      });
      const existingSerial =
        existing?.payload &&
        typeof existing.payload === 'object' &&
        !Array.isArray(existing.payload)
          ? Number((existing.payload as Record<string, unknown>).adminLoginSerial || 0)
          : 0;
      if (!existing || existingSerial !== serial) {
        await this.prisma.problemMark.create({
          data: {
            tenantId: dto.tenantId,
            reason: 'device_admin_login',
            payload: {
              deviceId: device.id,
              deviceName: device.name,
              adminLoginAt: dto.adminLoginAt,
              adminLoginSerial: serial,
              note: 'На терминале введён пароль администратора — отметки заблокированы, пароль перезаписывается на сервер',
            },
          },
        });
        if (!dto.authFailed && device.passwordEnc) {
          try {
            const nextPwd = this.generateTerminalPassword(device.username || 'admin');
            await this.changeDevicePassword(dto.tenantId, device.id, nextPwd);
            await this.appendCommand(dto.tenantId, device.id, {
              type: 'password_reclaim',
              status: 'completed',
            });
          } catch (e) {
            this.logger.warn(
              `password reclaim failed device=${device.id}: ${e instanceof Error ? e.message : e}`,
            );
            const fresh = await this.prisma.device.findFirst({ where: { id: device.id } });
            const m = this.asMeta(fresh?.meta);
            const auth =
              m.auth && typeof m.auth === 'object' && !Array.isArray(m.auth)
                ? { ...(m.auth as Record<string, unknown>) }
                : {};
            m.auth = {
              ...auth,
              passwordOutOfSync: true,
              lastError: e instanceof Error ? e.message : 'Не удалось перезаписать пароль',
            };
            await this.prisma.device.update({
              where: { id: device.id },
              data: {
                status: 'auth_failed',
                meta: m as Prisma.InputJsonValue,
              },
            });
          }
        }
      }
      await this.appendCommand(dto.tenantId, device.id, {
        type: 'punch_lock',
        status: 'completed',
      });
    } else if (unlocking) {
      await this.appendCommand(dto.tenantId, device.id, {
        type: 'punch_unlock',
        status: 'completed',
      });
    }
    if (dto.authFailed) {
      const existingAuth = await this.prisma.problemMark.findFirst({
        where: {
          tenantId: dto.tenantId,
          reason: 'device_password_changed',
          resolved: false,
        },
        orderBy: { createdAt: 'desc' },
      });
      const sameDevice =
        existingAuth?.payload &&
        typeof existingAuth.payload === 'object' &&
        !Array.isArray(existingAuth.payload) &&
        (existingAuth.payload as Record<string, unknown>).deviceId === device.id;
      if (!sameDevice) {
        await this.prisma.problemMark.create({
          data: {
            tenantId: dto.tenantId,
            reason: 'device_password_changed',
            payload: {
              deviceId: device.id,
              deviceName: device.name,
              note: 'Пароль на терминале изменён локально. Сохраните актуальный пароль на сервере, иначе устройство выйдет из-под контроля.',
            },
          },
        });
      }
    }
    return { ok: true };
  }

  async deleteDevice(tenantId: string, id: string) {
    const existing = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Device not found');
    await this.prisma.device.delete({ where: { id } });
    return { ok: true, id };
  }

  private async appendCommand(
    tenantId: string,
    deviceId: string,
    cmd: {
      type: string;
      employeeName?: string | null;
      status?: string;
    },
  ) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId } });
    if (!device) return;
    const meta = this.asMeta(device.meta);
    const commands = Array.isArray(meta.commands) ? [...(meta.commands as unknown[])] : [];
    const now = new Date().toISOString();
    const id = 3000000 + commands.length + Math.floor(Math.random() * 90000);
    commands.unshift({
      id,
      type: cmd.type,
      employeeName: cmd.employeeName ?? null,
      createdAt: now,
      startedAt: now,
      finishedAt: now,
      status: cmd.status ?? 'completed',
    });
    meta.commands = commands.slice(0, 200);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { meta: meta as Prisma.InputJsonValue },
    });
  }

  async syncDevice(tenantId: string, id: string) {
    const device = await this.getDevice(tenantId, id);
    await this.heartbeat(tenantId, id);

    const faceSyncs = await this.prisma.deviceFaceSync.findMany({
      where: { tenantId, deviceId: id },
      include: {
        faceProfile: {
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, tabNumber: true },
            },
          },
        },
      },
      take: 50,
    });

    let synced = 0;
    for (const fs of faceSyncs) {
      const emp = fs.faceProfile.employee;
      const name = [emp.lastName, emp.firstName].filter(Boolean).join(' ');
      if (device.gatewayRef) {
        try {
          await this.gw.syncFace(device.gatewayRef, {
            employee_external_id: emp.tabNumber || emp.id,
            employee_name: name,
          });
          await this.prisma.deviceFaceSync.update({
            where: { id: fs.id },
            data: { syncStatus: 'synced', lastSyncedAt: new Date(), lastError: null },
          });
          synced += 1;
        } catch (e) {
          await this.prisma.deviceFaceSync.update({
            where: { id: fs.id },
            data: {
              syncStatus: 'failed',
              lastError: e instanceof Error ? e.message : String(e),
            },
          });
        }
      } else {
        await this.prisma.deviceFaceSync.update({
          where: { id: fs.id },
          data: { syncStatus: 'synced', lastSyncedAt: new Date() },
        });
        synced += 1;
      }
      await this.appendCommand(tenantId, id, {
        type: 'Person Edit',
        employeeName: name,
        status: 'completed',
      });
    }

    if (!faceSyncs.length) {
      await this.appendCommand(tenantId, id, {
        type: 'Device Sync',
        status: 'completed',
      });
    }

    return this.getDevice(tenantId, id).then((d) => ({
      ok: true,
      synced,
      device: d,
    }));
  }

  private remoteActionMessage(
    device: { adapterType?: string | null; host?: string | null },
    action: string,
    ok: boolean,
    label: string,
    extra = '',
  ) {
    if (action === 'sync_clock') {
      const adapter = (device.adapterType || '').toLowerCase();
      if (adapter === 'mock' || !adapter) {
        return (
          'Mock-устройство: аппаратные часы не меняются. ' +
          'Добавьте Hikvision с IP, логином и паролем ISAPI, затем нажмите «Синхронизировать часы».'
        );
      }
      if (!device.host?.trim()) {
        return 'Не задан IP (host) устройства — синхронизация часов невозможна';
      }
      if (!ok) {
        return (
          'Синхронизация часов не удалась. Проверьте: устройство в сети, IP, логин/пароль ISAPI, ' +
          'Device GW (порт 8800).'
        );
      }
    }
    return `${label}${ok ? ' выполнено' : ' не удалось'}${extra}`;
  }

  /** Ensure device exists in device-gw memory (GW restart clears in-memory registry). */
  private async ensureGwRegistered(device: {
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
    gatewayRef?: string | null;
  }) {
    const reg = await this.gw.registerFromDevice(device);
    if (!reg?.id) return device.gatewayRef || device.id;
    if (reg.id !== device.gatewayRef) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          gatewayRef: reg.id,
          status: reg.status || 'online',
          lastSeenAt: new Date(),
        },
      });
    }
    return reg.id;
  }

  async remoteDeviceCommand(
    tenantId: string,
    id: string,
    action: 'heartbeat' | 'sync' | 'sync_clock' | 'pull_events' | 'open_door' | 'reboot',
  ) {
    if (action === 'sync') {
      const synced = await this.syncDevice(tenantId, id);
      return { ...synced, ok: true, action, message: 'Синхронизация выполнена' };
    }
    if (action === 'heartbeat') {
      const device = await this.heartbeat(tenantId, id);
      await this.appendCommand(tenantId, id, { type: 'Heartbeat', status: 'completed' });
      return {
        ok: device.status === 'online',
        action,
        status: device.status,
        message: device.status === 'online' ? 'Устройство на связи' : 'Устройство не в сети',
      };
    }

    const device = await this.getDevice(tenantId, id);
    const ref = await this.ensureGwRegistered(device);

    const labels: Record<string, string> = {
      sync_clock: 'Синхронизация часов',
      pull_events: 'Забор событий',
      open_door: 'Открытие двери',
      reboot: 'Перезагрузка',
    };
    try {
      const result = await this.gw.remoteCommand(
        ref,
        action as 'sync_clock' | 'pull_events' | 'open_door' | 'reboot',
      );
      const ok = result.ok !== false;
      await this.appendCommand(tenantId, id, {
        type: labels[action] || action,
        status: ok ? 'completed' : 'failed',
      });
      if (action === 'sync_clock' || action === 'reboot') {
        await this.prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date(), status: ok ? 'online' : device.status },
        });
      }
      const extra =
        action === 'pull_events' && result.count != null
          ? ` (${result.count})`
          : '';
      const message = this.remoteActionMessage(
        device,
        action,
        ok,
        labels[action] || action,
        extra,
      );
      const adapter = (device.adapterType || '').toLowerCase();
      const clockNotHardware =
        action === 'sync_clock' && (adapter === 'mock' || !adapter || !device.host?.trim());
      return {
        ok: clockNotHardware ? false : ok,
        action,
        count: result.count,
        message,
      };
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        try {
          const retryRef = await this.ensureGwRegistered(device);
          const result = await this.gw.remoteCommand(
            retryRef,
            action as 'sync_clock' | 'pull_events' | 'open_door' | 'reboot',
          );
          const ok = result.ok !== false;
          await this.appendCommand(tenantId, id, {
            type: labels[action] || action,
            status: ok ? 'completed' : 'failed',
          });
          return {
            ok,
            action,
            count: result.count,
            message: this.remoteActionMessage(device, action, ok, labels[action] || action),
          };
        } catch (retryErr) {
          await this.appendCommand(tenantId, id, {
            type: labels[action] || action,
            status: 'failed',
          });
          throw this.gwHttpException(retryErr, 'Команда не выполнена');
        }
      }
      await this.appendCommand(tenantId, id, {
        type: labels[action] || action,
        status: 'failed',
      });
      throw this.gwHttpException(e, 'Команда не выполнена');
    }
  }

  async applyMarkSettings(
    tenantId: string,
    deviceId: string,
    dto: ApplyMarkSettingsDto,
  ) {
    const device = await this.getDevice(tenantId, deviceId);
    const from = new Date(dto.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dto.to);
    to.setHours(23, 59, 59, 999);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (from > to) {
      throw new BadRequestException('from must be <= to');
    }

    const meta = this.asMeta(device.meta);
    const ignoreMarks = meta.ignoreMarks === true;
    const invalidMarks = meta.invalidMarks === true;
    const trackingType =
      typeof meta.trackingType === 'string' ? meta.trackingType : 'mark';

    const marks = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        deviceId,
        occurredAt: { gte: from, lte: to },
      },
      orderBy: { occurredAt: 'asc' },
    });

    let updated = 0;
    const recalcKeys = new Set<string>();

    for (const mark of marks) {
      const prev =
        mark.rawPayload &&
        typeof mark.rawPayload === 'object' &&
        !Array.isArray(mark.rawPayload)
          ? { ...(mark.rawPayload as Record<string, unknown>) }
          : {};

      let direction = mark.direction;
      if (trackingType === 'in') {
        direction = PunchDirection.IN;
        prev.markType = 'in';
      } else if (trackingType === 'out') {
        direction = PunchDirection.OUT;
        prev.markType = 'out';
      } else {
        prev.markType = prev.markType || 'mark';
        if (direction === PunchDirection.IN || direction === PunchDirection.OUT) {
          // keep existing punch direction for mark mode
        } else {
          direction = PunchDirection.AUTO;
        }
      }

      if (ignoreMarks || invalidMarks) {
        prev.isValid = false;
      } else if (prev.isValid === false && !invalidMarks && !ignoreMarks) {
        prev.isValid = true;
      }

      prev.appliedFromDeviceSettings = true;
      prev.appliedAt = new Date().toISOString();
      prev.deviceTrackingType = trackingType;

      await this.prisma.attendanceMark.update({
        where: { id: mark.id },
        data: {
          direction,
          rawPayload: prev as Prisma.InputJsonValue,
        },
      });
      updated += 1;

      if (mark.employeeId) {
        const dayKey = `${mark.employeeId}|${mark.occurredAt.toISOString().slice(0, 10)}`;
        recalcKeys.add(dayKey);
      }
    }

    let days = 0;
    for (const key of recalcKeys) {
      const [employeeId, day] = key.split('|');
      await this.recalcDay(tenantId, employeeId, new Date(day));
      days += 1;
    }

    await this.appendCommand(tenantId, deviceId, {
      type: 'Apply Mark Settings',
      status: 'completed',
    });

    return {
      ok: true,
      deviceId,
      from: dto.from.slice(0, 10),
      to: dto.to.slice(0, 10),
      marksUpdated: updated,
      daysRecalculated: days,
    };
  }

  async listDevicePersons(tenantId: string, deviceId: string) {
    await this.getDevice(tenantId, deviceId);
    const rows = await this.prisma.deviceFaceSync.findMany({
      where: { tenantId, deviceId },
      include: {
        faceProfile: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                tabNumber: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => {
      const e = r.faceProfile.employee;
      return {
        id: e.id,
        pin: e.tabNumber,
        fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
        photoUrl: r.faceProfile.photoUrl,
        role: 'Обычный пользователь',
        synchronized: r.syncStatus === 'synced',
        syncStatus: r.syncStatus,
        lastSyncedAt: r.lastSyncedAt,
      };
    });
  }

  async syncDevicePersons(tenantId: string, deviceId: string) {
    const device = await this.getDevice(tenantId, deviceId);
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active' },
      take: 100,
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        tabNumber: true,
        faceProfile: true,
      },
    });

    let created = 0;
    for (const emp of employees) {
      let profile = emp.faceProfile;
      if (!profile) {
        profile = await this.prisma.faceProfile.create({
          data: { tenantId, employeeId: emp.id, syncStatus: 'pending' },
        });
      }
      const existing = await this.prisma.deviceFaceSync.findUnique({
        where: {
          deviceId_faceProfileId: { deviceId, faceProfileId: profile.id },
        },
      });
      if (!existing) {
        await this.prisma.deviceFaceSync.create({
          data: {
            tenantId,
            deviceId,
            faceProfileId: profile.id,
            employeeId: emp.id,
            syncStatus: 'pending',
          },
        });
        created += 1;
        await this.appendCommand(tenantId, deviceId, {
          type: 'Person Add',
          employeeName: [emp.lastName, emp.firstName].filter(Boolean).join(' '),
        });
      }
    }

    if (device.gatewayRef || created > 0) {
      await this.syncDevice(tenantId, deviceId);
    }

    return { ok: true, created, persons: await this.listDevicePersons(tenantId, deviceId) };
  }

  async listDeviceMarks(
    tenantId: string,
    deviceId: string,
    opts: { page?: string | number; limit?: string | number; all?: boolean } = {},
  ) {
    await this.getDevice(tenantId, deviceId);
    const where: Prisma.AttendanceMarkWhereInput = { tenantId, deviceId };
    const { page, limit, skip } = parsePagination(opts.page, opts.limit, {
      defaultLimit: 50,
      maxLimit: 500,
    });
    const [total, items] = await Promise.all([
      this.prisma.attendanceMark.count({ where }),
      this.prisma.attendanceMark.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, tabNumber: true },
          },
          device: {
            select: {
              id: true,
              name: true,
              model: true,
              adapterType: true,
              location: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const enriched = items.map((m) => this.enrichMark(m));

    // "Все отметки" may also include door events stored in meta.doorEvents
    if (opts.all) {
      const device = await this.getDevice(tenantId, deviceId);
      const meta = this.asMeta(device.meta);
      const doorEvents = Array.isArray(meta.doorEvents)
        ? (meta.doorEvents as Array<Record<string, unknown>>)
        : [];
      const extra = doorEvents.map((ev, i) => ({
        id: `door-${i}-${String(ev.at || i)}`,
        photoUrl: null,
        employee: null,
        fullName: null,
        markTypeLabel: String(ev.type || 'Door Event'),
        markTypeKey: 'mark' as const,
        occurredAt: ev.at || null,
        locationName: device.location?.name ?? null,
        identificationType: null,
        source: 'device',
        isDoorEvent: true,
      }));
      return pageResult([...enriched, ...extra], total + extra.length, page, limit);
    }

    return pageResult(enriched, total, page, limit);
  }

  async listDeviceCommands(tenantId: string, deviceId: string) {
    const device = await this.getDevice(tenantId, deviceId);
    const meta = this.asMeta(device.meta);
    const commands = Array.isArray(meta.commands) ? meta.commands : [];
    return { items: commands, total: commands.length };
  }

  async listIgnoredPersons(
    tenantId: string,
    deviceId: string,
    scope: 'attached' | 'available' = 'attached',
  ) {
    const device = await this.getDevice(tenantId, deviceId);
    const meta = this.asMeta(device.meta);
    const ignored = Array.isArray(meta.ignoredPersonIds)
      ? (meta.ignoredPersonIds as string[])
      : [];

    if (scope === 'attached') {
      if (!ignored.length) return [];
      const employees = await this.prisma.employee.findMany({
        where: { tenantId, id: { in: ignored } },
        include: {
          division: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
        orderBy: { lastName: 'asc' },
      });
      return employees.map((e) => ({
        id: e.id,
        fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
        photoUrl: null as string | null,
        divisionName: e.division?.name ?? null,
        positionName: e.position?.name ?? null,
      }));
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(ignored.length ? { id: { notIn: ignored } } : {}),
      },
      include: {
        division: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 200,
    });
    return employees.map((e) => ({
      id: e.id,
      fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
      photoUrl: null as string | null,
      divisionName: e.division?.name ?? null,
      positionName: e.position?.name ?? null,
    }));
  }

  async setIgnoredPersons(
    tenantId: string,
    deviceId: string,
    dto: DeviceIgnoreDto,
    mode: 'attach' | 'detach',
  ) {
    const device = await this.getDevice(tenantId, deviceId);
    const meta = this.asMeta(device.meta);
    const current = new Set(
      Array.isArray(meta.ignoredPersonIds) ? (meta.ignoredPersonIds as string[]) : [],
    );
    for (const id of dto.ids || []) {
      if (mode === 'attach') current.add(id);
      else current.delete(id);
    }
    meta.ignoredPersonIds = [...current];
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { meta: meta as Prisma.InputJsonValue },
    });
    return this.listIgnoredPersons(tenantId, deviceId, 'attached');
  }

  async listIgnoredDivisions(
    tenantId: string,
    deviceId: string,
    scope: 'attached' | 'available' = 'attached',
  ) {
    const device = await this.getDevice(tenantId, deviceId);
    const meta = this.asMeta(device.meta);
    const ignored = Array.isArray(meta.ignoredDivisionIds)
      ? (meta.ignoredDivisionIds as string[])
      : [];

    if (scope === 'attached') {
      if (!ignored.length) return [];
      return this.prisma.division.findMany({
        where: { tenantId, id: { in: ignored } },
        include: { divisionGroup: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.division.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(ignored.length ? { id: { notIn: ignored } } : {}),
      },
      include: { divisionGroup: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async setIgnoredDivisions(
    tenantId: string,
    deviceId: string,
    dto: DeviceIgnoreDto,
    mode: 'attach' | 'detach',
  ) {
    const device = await this.getDevice(tenantId, deviceId);
    const meta = this.asMeta(device.meta);
    const current = new Set(
      Array.isArray(meta.ignoredDivisionIds) ? (meta.ignoredDivisionIds as string[]) : [],
    );
    for (const id of dto.ids || []) {
      if (mode === 'attach') current.add(id);
      else current.delete(id);
    }
    meta.ignoredDivisionIds = [...current];
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { meta: meta as Prisma.InputJsonValue },
    });
    return this.listIgnoredDivisions(tenantId, deviceId, 'attached');
  }

  async heartbeat(tenantId: string, deviceId: string) {
    const d = await this.prisma.device.findFirst({ where: { id: deviceId, tenantId } });
    if (!d) throw new NotFoundException('Device not found');

    if (d.gatewayRef) {
      const gw = await this.gw.heartbeat(d.gatewayRef);
      if (gw) {
        return this.prisma.device.update({
          where: { id: deviceId },
          data: {
            status: gw.status || 'online',
            lastSeenAt: new Date(),
          },
        });
      }
    }

    // GW restarted or device never registered — re-register, then probe again.
    const reg = await this.gw.registerFromDevice(d);
    if (reg?.id) {
      const probe = await this.gw.heartbeat(reg.id);
      return this.prisma.device.update({
        where: { id: deviceId },
        data: {
          gatewayRef: reg.id,
          status: probe?.status || reg.status || 'offline',
          lastSeenAt: new Date(),
        },
      });
    }

    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'offline', lastSeenAt: d.lastSeenAt },
    });
  }

  async registerTenantDevices(tenantId: string) {
    const devices = await this.prisma.device.findMany({
      where: { tenantId, isActive: true },
    });
    const results: { id: string; name: string; gatewayRef: string | null; ok: boolean }[] =
      [];
    for (const d of devices) {
      const reg = await this.gw.registerFromDevice(d);
      if (reg?.id) {
        await this.prisma.device.update({
          where: { id: d.id },
          data: {
            gatewayRef: reg.id,
            status: reg.status || 'online',
            lastSeenAt: new Date(),
          },
        });
        results.push({ id: d.id, name: d.name, gatewayRef: reg.id, ok: true });
      } else {
        results.push({
          id: d.id,
          name: d.name,
          gatewayRef: d.gatewayRef,
          ok: false,
        });
      }
    }
    return { registered: results.filter((r) => r.ok).length, results };
  }

  // --- Schedules ---
  listSchedules(tenantId: string, mode?: string) {
    if (mode === 'rosters') {
      return this.prisma.workSchedule.findMany({
        where: { tenantId },
        include: {
          employees: {
            select: { id: true, firstName: true, lastName: true, tabNumber: true },
            orderBy: { lastName: 'asc' },
          },
          _count: { select: { employees: true } },
        },
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.workSchedule.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getSchedule(tenantId: string, id: string) {
    const row = await this.prisma.workSchedule.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { employees: true } } },
    });
    if (!row) throw new NotFoundException('Schedule not found');
    return row;
  }

  private resolveKind(raw?: string | null): WorkScheduleKind {
    if (raw && isScheduleKind(raw)) return raw as WorkScheduleKind;
    return WorkScheduleKind.ordinary;
  }

  createSchedule(tenantId: string, dto: CreateScheduleDto) {
    const kind = this.resolveKind(dto.kind);
    const year =
      typeof dto.settings?.year === 'number'
        ? dto.settings.year
        : new Date().getFullYear();
    const settings = mergeScheduleSettings({
      year,
      yearGrid: emptyYearGrid(year, kind as ScheduleKind),
      ...(kind === 'hourly' || kind === 'multi_shift'
        ? { maxWorkdayDuration: kind === 'multi_shift' ? '24:00' : '12:00' }
        : {}),
      ...(dto.settings ?? {}),
    });
    const code =
      (dto.code || '').trim() ||
      `SCH-${kind.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.workSchedule.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        kind,
        startTime: dto.startTime ?? '09:00',
        endTime: dto.endTime ?? '18:00',
        graceMinutes: dto.graceMinutes ?? 15,
        settings: settings as Prisma.InputJsonValue,
      },
    });
  }

  async updateSchedule(
    tenantId: string,
    id: string,
    dto: {
      name?: string;
      code?: string;
      startTime?: string;
      endTime?: string;
      graceMinutes?: number;
      isActive?: boolean;
      kind?: string;
      settings?: ScheduleSettings | Record<string, unknown>;
    },
  ) {
    const row = await this.prisma.workSchedule.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Schedule not found');
    const nextSettings =
      dto.settings !== undefined
        ? (mergeScheduleSettings(row.settings, dto.settings as ScheduleSettings) as Prisma.InputJsonValue)
        : undefined;
    return this.prisma.workSchedule.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        startTime: dto.startTime,
        endTime: dto.endTime,
        graceMinutes: dto.graceMinutes,
        isActive: dto.isActive,
        ...(dto.kind ? { kind: this.resolveKind(dto.kind) } : {}),
        ...(nextSettings !== undefined ? { settings: nextSettings } : {}),
      },
      include: { _count: { select: { employees: true } } },
    });
  }

  async deleteSchedule(tenantId: string, id: string) {
    const row = await this.prisma.workSchedule.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Schedule not found');
    await this.prisma.employee.updateMany({
      where: { tenantId, scheduleId: id },
      data: { scheduleId: null },
    });
    await this.prisma.workSchedule.delete({ where: { id } });
    return { ok: true };
  }

  async fillScheduleYear(
    tenantId: string,
    id: string,
    opts?: { year?: number; weekPattern?: WeekPattern; dayNormHours?: number },
  ) {
    const row = await this.prisma.workSchedule.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Schedule not found');
    const s = mergeScheduleSettings(row.settings, {
      year: opts?.year,
      weekPattern: opts?.weekPattern,
      dayNormHours: opts?.dayNormHours,
    });
    const y = opts?.year ?? s.year ?? new Date().getFullYear();
    const pattern = (opts?.weekPattern ?? s.weekPattern ?? '6/1') as WeekPattern;
    const norm = opts?.dayNormHours ?? s.dayNormHours ?? 8;
    const kind = (row.kind as ScheduleKind) || 'ordinary';
    const yearGrid = buildYearGrid(y, pattern, norm, kind);
    const settings = mergeScheduleSettings(row.settings, {
      year: y,
      yearGrid,
      weekPattern: pattern,
      dayNormHours: norm,
    });
    return this.prisma.workSchedule.update({
      where: { id },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  async assignSchedule(tenantId: string, scheduleId: string, employeeId: string) {
    const schedule = await this.prisma.workSchedule.findFirst({
      where: { id: scheduleId, tenantId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { scheduleId },
      include: { schedule: true },
    });
  }

  // --- Production calendars ---
  listProductionCalendars(tenantId: string) {
    return this.prisma.productionCalendar.findMany({
      where: { tenantId },
      include: { _count: { select: { days: true } } },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
    });
  }

  async getProductionCalendar(tenantId: string, id: string) {
    const row = await this.prisma.productionCalendar.findFirst({
      where: { id, tenantId },
      include: { days: { orderBy: { day: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Production calendar not found');
    return row;
  }

  private parseDayType(raw?: string): ProdCalendarDayType {
    const map: Record<string, ProdCalendarDayType> = {
      holiday: ProdCalendarDayType.holiday,
      day_off: ProdCalendarDayType.day_off,
      transfer: ProdCalendarDayType.transfer,
      short_day: ProdCalendarDayType.short_day,
      workday: ProdCalendarDayType.workday,
      праздник: ProdCalendarDayType.holiday,
      выходной: ProdCalendarDayType.day_off,
      перенос: ProdCalendarDayType.transfer,
    };
    if (raw && map[raw]) return map[raw];
    return ProdCalendarDayType.holiday;
  }

  private async replaceCalendarDays(
    calendarId: string,
    days?: CreateProductionCalendarDto['days'],
  ) {
    if (days === undefined) return;
    await this.prisma.productionCalendarDay.deleteMany({ where: { calendarId } });
    if (!days.length) return;
    await this.prisma.productionCalendarDay.createMany({
      data: days.map((d) => ({
        calendarId,
        day: new Date(d.day),
        dayType: this.parseDayType(d.dayType),
        name: d.name || null,
        replacementDay: d.replacementDay ? new Date(d.replacementDay) : null,
        hours: d.hours != null ? d.hours : null,
      })),
    });
  }

  computeCalendarTotals(
    year: number,
    weekendDays: number[],
    holidays: { day: Date; dayType: ProdCalendarDayType; hours?: number | null }[],
    dailyAttendance = '08:00',
  ) {
    const weekend = new Set(weekendDays);
    const toKey = (dt: Date) =>
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const holidayMap = new Map(holidays.map((h) => [toKey(h.day), h]));
    const { h: attH, m: attM } = parseHm(dailyAttendance);
    const dayHours = attH + attM / 60;
    let workDays = 0;
    let dayOffs = 0;
    let holidayCount = 0;
    let shortDays = 0;
    let workHours = 0;
    const byMonth: { month: number; workDays: number; workHours: number }[] = [];

    for (let mi = 0; mi < 12; mi++) {
      let mDays = 0;
      let mHours = 0;
      const dim = new Date(year, mi + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const key = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dt = new Date(year, mi, d);
        const special = holidayMap.get(key);
        const wd = dt.getDay();
        if (special) {
          if (special.dayType === ProdCalendarDayType.holiday) {
            holidayCount += 1;
            dayOffs += 1;
          } else if (special.dayType === ProdCalendarDayType.day_off) {
            dayOffs += 1;
          } else if (special.dayType === ProdCalendarDayType.short_day) {
            shortDays += 1;
            workDays += 1;
            mDays += 1;
            const hrs =
              special.hours != null ? Number(special.hours) : Math.max(0, dayHours - 1);
            workHours += hrs;
            mHours += hrs;
          } else if (special.dayType === ProdCalendarDayType.workday) {
            workDays += 1;
            mDays += 1;
            workHours += dayHours;
            mHours += dayHours;
          } else if (special.dayType === ProdCalendarDayType.transfer) {
            dayOffs += 1;
          }
        } else if (weekend.has(wd)) {
          dayOffs += 1;
        } else {
          workDays += 1;
          mDays += 1;
          workHours += dayHours;
          mHours += dayHours;
        }
      }
      byMonth.push({
        month: mi + 1,
        workDays: mDays,
        workHours: Math.round(mHours * 100) / 100,
      });
    }

    return {
      workDays,
      dayOffs,
      holidays: holidayCount,
      shortDays,
      workHours: Math.round(workHours * 100) / 100,
      byMonth,
    };
  }

  async createProductionCalendar(tenantId: string, dto: CreateProductionCalendarDto) {
    const code =
      (dto.code || '').trim() ||
      `PC-${dto.year}-${Date.now().toString(36).toUpperCase()}`;
    const weekendDays = dto.weekendDays?.length ? dto.weekendDays : [0, 6];
    const row = await this.prisma.productionCalendar.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        year: dto.year,
        weekendDays: weekendDays as Prisma.InputJsonValue,
        preHolidayHours: dto.preHolidayHours,
        holidayHours: dto.holidayHours,
        dailyAttendance: dto.dailyAttendance ?? '08:00',
        monthlyLimit: dto.monthlyLimit ?? false,
        dailyLimit: dto.dailyLimit ?? false,
        isActive: dto.isActive !== false,
      },
    });
    await this.replaceCalendarDays(row.id, dto.days);
    return this.recalculateProductionCalendar(tenantId, row.id);
  }

  async updateProductionCalendar(
    tenantId: string,
    id: string,
    dto: UpdateProductionCalendarDto,
  ) {
    const row = await this.prisma.productionCalendar.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Production calendar not found');
    await this.prisma.productionCalendar.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        year: dto.year,
        ...(dto.weekendDays
          ? { weekendDays: dto.weekendDays as Prisma.InputJsonValue }
          : {}),
        preHolidayHours: dto.preHolidayHours,
        holidayHours: dto.holidayHours,
        dailyAttendance: dto.dailyAttendance,
        monthlyLimit: dto.monthlyLimit,
        dailyLimit: dto.dailyLimit,
        isActive: dto.isActive,
      },
    });
    if (dto.days !== undefined) await this.replaceCalendarDays(id, dto.days);
    return this.recalculateProductionCalendar(tenantId, id);
  }

  async deleteProductionCalendar(tenantId: string, id: string) {
    const row = await this.prisma.productionCalendar.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Production calendar not found');
    await this.prisma.productionCalendar.delete({ where: { id } });
    return { ok: true };
  }

  async recalculateProductionCalendar(tenantId: string, id: string) {
    const row = await this.prisma.productionCalendar.findFirst({
      where: { id, tenantId },
      include: { days: true },
    });
    if (!row) throw new NotFoundException('Production calendar not found');
    const weekendDays = Array.isArray(row.weekendDays)
      ? (row.weekendDays as number[])
      : [0, 6];
    const totals = this.computeCalendarTotals(
      row.year,
      weekendDays,
      row.days.map((d) => ({
        day: d.day,
        dayType: d.dayType,
        hours: d.hours != null ? Number(d.hours) : null,
      })),
      row.dailyAttendance,
    );
    return this.prisma.productionCalendar.update({
      where: { id },
      data: { totals: totals as Prisma.InputJsonValue },
      include: { days: { orderBy: { day: 'asc' } } },
    });
  }

  // --- QR codes ---
  listQrCodes(tenantId: string) {
    return this.prisma.qrCode.findMany({
      where: { tenantId },
      include: { location: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createQrCode(tenantId: string, dto: CreateQrCodeDto) {
    const code =
      dto.code ||
      `QR-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.qrCode.create({
      data: {
        tenantId,
        code,
        label: dto.label,
        locationId: dto.locationId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      include: { location: true },
    });
  }

  async updateQrCode(
    tenantId: string,
    id: string,
    dto: { label?: string; locationId?: string; isActive?: boolean },
  ) {
    const row = await this.prisma.qrCode.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('QR not found');
    return this.prisma.qrCode.update({
      where: { id },
      data: {
        label: dto.label,
        locationId: dto.locationId,
        isActive: dto.isActive,
      },
      include: { location: { select: { id: true, name: true, code: true } } },
    });
  }

  async punchQr(tenantId: string, dto: QrPunchDto) {
    const qr = await this.prisma.qrCode.findFirst({
      where: { tenantId, code: dto.qrCode, isActive: true },
    });
    if (!qr) throw new BadRequestException('QR kod topilmadi yoki nofaol');
    if (qr.expiresAt && qr.expiresAt < new Date()) {
      throw new BadRequestException('QR kod muddati tugagan');
    }
    return this.ingestPunch({
      tenantId,
      employeeId: dto.employeeId,
      direction: dto.direction,
      occurredAt: new Date().toISOString(),
      source: 'qr',
      raw: { qrCode: dto.qrCode, locationId: qr.locationId },
    });
  }

  async punchGps(tenantId: string, dto: GpsPunchDto) {
    let location = dto.locationId
      ? await this.prisma.location.findFirst({
          where: { id: dto.locationId, tenantId },
        })
      : await this.prisma.location.findFirst({
          where: {
            tenantId,
            isActive: true,
            latitude: { not: null },
            longitude: { not: null },
          },
        });

    if (!location || location.latitude == null || location.longitude == null) {
      await this.prisma.problemMark.create({
        data: {
          tenantId,
          reason: 'gps_no_geofence',
          payload: dto as unknown as Prisma.InputJsonValue,
        },
      });
      throw new BadRequestException('Lokatsiyada GPS geofence sozlanmagan');
    }

    const dist = this.haversineM(
      dto.latitude,
      dto.longitude,
      location.latitude,
      location.longitude,
    );
    const radius = location.geoRadiusM ?? 150;
    if (dist > radius) {
      await this.prisma.problemMark.create({
        data: {
          tenantId,
          reason: 'gps_out_of_range',
          payload: {
            ...dto,
            distanceM: Math.round(dist),
            radiusM: radius,
            locationId: location.id,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      throw new BadRequestException(
        `GPS tashqarida: ${Math.round(dist)} m (ruxsat ${radius} m)`,
      );
    }

    return this.ingestPunch({
      tenantId,
      employeeId: dto.employeeId,
      direction: dto.direction,
      occurredAt: new Date().toISOString(),
      source: 'gps',
      raw: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        distanceM: Math.round(dist),
        locationId: location.id,
      },
    });
  }

  private haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // --- Marks ---
  async listMarks(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      employeeId?: string;
      locationId?: string;
      divisionId?: string;
      markTypes?: string;
      q?: string;
      page?: string | number;
      limit?: string | number;
    } = {},
  ) {
    const where: Prisma.AttendanceMarkWhereInput = { tenantId };
    if (opts.employeeId) where.employeeId = opts.employeeId;
    const localDay = (value: string, endOfDay: boolean) => {
      const ymd = value.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        const [y, m, d] = ymd.split('-').map(Number);
        return endOfDay
          ? new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
          : new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      if (endOfDay) parsed.setHours(23, 59, 59, 999);
      else parsed.setHours(0, 0, 0, 0);
      return parsed;
    };
    if (opts.from || opts.to) {
      where.occurredAt = {};
      if (opts.from) {
        const start = localDay(opts.from, false);
        if (start) where.occurredAt.gte = start;
      }
      if (opts.to) {
        const end = localDay(opts.to, true);
        if (end) where.occurredAt.lte = end;
      }
    }
    if (opts.divisionId) {
      where.employee = { ...(where.employee as object), divisionId: opts.divisionId };
    }
    if (opts.locationId) {
      where.device = { locationId: opts.locationId };
    }
    if (opts.q?.trim()) {
      const q = opts.q.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { employee: { lastName: { contains: q, mode: 'insensitive' } } },
            { employee: { firstName: { contains: q, mode: 'insensitive' } } },
            { employee: { tabNumber: { contains: q, mode: 'insensitive' } } },
            { device: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }
    const { page, limit, skip } = parsePagination(opts.page, opts.limit, {
      defaultLimit: 50,
      maxLimit: 500,
    });
    const [total, items] = await Promise.all([
      this.prisma.attendanceMark.count({ where }),
      this.prisma.attendanceMark.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              phone: true,
              hiredAt: true,
              division: { select: { id: true, name: true } },
              position: { select: { id: true, name: true } },
              faceProfile: { select: { photoUrl: true, photoKey: true } },
            },
          },
          device: {
            select: {
              id: true,
              name: true,
              model: true,
              adapterType: true,
              serialNumber: true,
              location: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  latitude: true,
                  longitude: true,
                  geoRadiusM: true,
                },
              },
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    let mapped = items.map((m) => this.enrichMark(m));
    if (opts.markTypes?.trim()) {
      const allowed = new Set(
        opts.markTypes
          .split(',')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      );
      if (allowed.size) {
        mapped = mapped.filter((m) => allowed.has(String(m.markType).toLowerCase()));
      }
    }
    return pageResult(mapped, total, page, limit);
  }

  async createManualMark(
    tenantId: string,
    dto: {
      employeeId: string;
      occurredAt: string;
      direction?: PunchDirection;
      markType?: string;
      locationId?: string;
      locationName?: string;
      note?: string;
      identificationType?: string;
      deviceType?: string;
      isValid?: boolean;
    },
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const markType = (dto.markType || 'mark').toLowerCase();
    let direction = dto.direction ?? PunchDirection.AUTO;
    if (!dto.direction) {
      if (markType === 'in' || markType === 'приход' || markType === 'break_in') {
        direction = PunchDirection.IN;
      } else if (
        markType === 'out' ||
        markType === 'уход' ||
        markType === 'break_out'
      ) {
        direction = PunchDirection.OUT;
      } else {
        direction = PunchDirection.AUTO;
      }
    }

    let locationName = dto.locationName ?? null;
    if (dto.locationId && !locationName) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
        select: { name: true },
      });
      locationName = loc?.name ?? null;
    }

    const occurredAt = new Date(dto.occurredAt);
    const mark = await this.prisma.attendanceMark.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        direction,
        occurredAt,
        source: 'manual',
        rawPayload: {
          markType,
          locationId: dto.locationId ?? null,
          locationName,
          note: dto.note ?? null,
          identificationType: dto.identificationType ?? 'Ручной ввод',
          deviceType: dto.deviceType ?? 'Ручной',
          isValid: dto.isValid !== false,
          photoUrl: null,
          createdByLabel: 'Admin',
          updatedByLabel: 'Admin',
          changeHistory: [
            {
              at: new Date().toISOString(),
              by: 'Admin',
              event: 'Добавлен',
              occurredAt: occurredAt.toISOString(),
              markType,
              isValid: dto.isValid !== false,
            },
          ],
        } as Prisma.InputJsonValue,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, tabNumber: true },
        },
        device: {
          select: {
            id: true,
            name: true,
            model: true,
            adapterType: true,
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    await this.recalcDay(tenantId, dto.employeeId, occurredAt);
    return this.enrichMark(mark);
  }

  async updateMark(
    tenantId: string,
    markId: string,
    dto: {
      isValid?: boolean;
      note?: string;
      markType?: string;
      occurredAt?: string;
    },
  ) {
    const mark = await this.prisma.attendanceMark.findFirst({
      where: { id: markId, tenantId },
    });
    if (!mark) throw new NotFoundException('Mark not found');

    const prevPayload =
      mark.rawPayload &&
      typeof mark.rawPayload === 'object' &&
      !Array.isArray(mark.rawPayload)
        ? { ...(mark.rawPayload as Record<string, unknown>) }
        : {};

    if (dto.isValid !== undefined) prevPayload.isValid = dto.isValid;
    if (dto.note !== undefined) prevPayload.note = dto.note;
    if (dto.markType !== undefined) prevPayload.markType = dto.markType;

    let direction = mark.direction;
    if (dto.markType) {
      const mt = dto.markType.toLowerCase();
      if (mt === 'in' || mt === 'break_in') direction = PunchDirection.IN;
      else if (mt === 'out' || mt === 'break_out') direction = PunchDirection.OUT;
      else direction = PunchDirection.AUTO;
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : mark.occurredAt;

    const history = Array.isArray(prevPayload.changeHistory)
      ? [...(prevPayload.changeHistory as unknown[])]
      : [];
    const mtLabel = this.normalizeMarkType(
      String(dto.markType || prevPayload.markType || 'mark'),
    ).label;
    history.unshift({
      at: new Date().toISOString(),
      by: 'Admin',
      event:
        dto.isValid === false
          ? 'Сделана недействительной'
          : dto.isValid === true
            ? 'Сделана действительной'
            : dto.markType
              ? 'Изменён тип'
              : 'Изменена',
      occurredAt: occurredAt.toISOString(),
      markType: dto.markType || prevPayload.markType || 'mark',
      markTypeLabel: mtLabel,
      isValid: prevPayload.isValid !== false,
    });
    prevPayload.changeHistory = history.slice(0, 100);
    prevPayload.updatedByLabel = 'Admin';

    const updated = await this.prisma.attendanceMark.update({
      where: { id: markId },
      data: {
        direction,
        occurredAt,
        rawPayload: prevPayload as Prisma.InputJsonValue,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            faceProfile: { select: { photoUrl: true, photoKey: true } },
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            model: true,
            adapterType: true,
            serialNumber: true,
            location: {
              select: {
                id: true,
                name: true,
                code: true,
                latitude: true,
                longitude: true,
                geoRadiusM: true,
              },
            },
          },
        },
      },
    });

    if (mark.employeeId) {
      await this.recalcDay(tenantId, mark.employeeId, occurredAt);
      if (dto.occurredAt) {
        await this.recalcDay(tenantId, mark.employeeId, mark.occurredAt);
      }
    }
    return this.enrichMark(updated);
  }

  async deleteMark(tenantId: string, markId: string) {
    const mark = await this.prisma.attendanceMark.findFirst({
      where: { id: markId, tenantId },
    });
    if (!mark) throw new NotFoundException('Mark not found');
    await this.prisma.attendanceMark.delete({ where: { id: markId } });
    if (mark.employeeId) {
      await this.recalcDay(tenantId, mark.employeeId, mark.occurredAt);
    }
    return { ok: true, id: markId };
  }

  async bulkMarks(
    tenantId: string,
    dto: { ids: string[]; action: string; markType?: string },
  ) {
    const ids = [...new Set(dto.ids || [])];
    if (!ids.length) return { ok: true, affected: 0 };
    const marks = await this.prisma.attendanceMark.findMany({
      where: { tenantId, id: { in: ids } },
    });
    if (!marks.length) return { ok: true, affected: 0 };

    const action = (dto.action || '').toLowerCase();
    if (action === 'delete') {
      await this.prisma.attendanceMark.deleteMany({
        where: { tenantId, id: { in: marks.map((m) => m.id) } },
      });
      const seen = new Set<string>();
      for (const m of marks) {
        if (!m.employeeId) continue;
        const key = `${m.employeeId}:${m.occurredAt.toISOString().slice(0, 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await this.recalcDay(tenantId, m.employeeId, m.occurredAt);
      }
      return { ok: true, affected: marks.length };
    }

    let affected = 0;
    for (const mark of marks) {
      if (action === 'set_valid') {
        await this.updateMark(tenantId, mark.id, { isValid: true });
        affected += 1;
      } else if (action === 'set_invalid') {
        await this.updateMark(tenantId, mark.id, { isValid: false });
        affected += 1;
      } else if (action === 'set_type' && dto.markType) {
        await this.updateMark(tenantId, mark.id, { markType: dto.markType });
        affected += 1;
      }
    }
    return { ok: true, affected };
  }

  async copyMarksPreview(
    tenantId: string,
    dto: { employeeIds: string[]; from: string; to: string },
  ) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    to.setHours(23, 59, 59, 999);
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: dto.employeeIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        hiredAt: true,
        division: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: { lastName: 'asc' },
    });
    const counts = await this.prisma.attendanceMark.groupBy({
      by: ['employeeId'],
      where: {
        tenantId,
        employeeId: { in: dto.employeeIds },
        occurredAt: { gte: from, lte: to },
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((c) => [c.employeeId!, c._count._all]),
    );
    return employees.map((e) => ({
      ...e,
      fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
      marksCount: countMap.get(e.id) ?? 0,
    }));
  }

  async copyMarks(
    tenantId: string,
    dto: {
      employeeIds: string[];
      from: string;
      to: string;
      targetFrom: string;
    },
  ) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    to.setHours(23, 59, 59, 999);
    const targetFrom = new Date(dto.targetFrom);
    targetFrom.setHours(0, 0, 0, 0);
    const sourceStart = new Date(from);
    sourceStart.setHours(0, 0, 0, 0);
    const dayShiftMs = targetFrom.getTime() - sourceStart.getTime();

    const source = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        employeeId: { in: dto.employeeIds },
        occurredAt: { gte: from, lte: to },
      },
    });
    if (!source.length) {
      return { ok: false, copied: 0, message: 'Не найдены отметки для копирования' };
    }

    let copied = 0;
    const recalc = new Map<string, Date>();
    for (const m of source) {
      if (!m.employeeId) continue;
      const occurredAt = new Date(m.occurredAt.getTime() + dayShiftMs);
      const payload =
        m.rawPayload && typeof m.rawPayload === 'object' && !Array.isArray(m.rawPayload)
          ? { ...(m.rawPayload as Record<string, unknown>), copiedFrom: m.id }
          : { copiedFrom: m.id };
      await this.prisma.attendanceMark.create({
        data: {
          tenantId,
          employeeId: m.employeeId,
          deviceId: m.deviceId,
          employeeExternalId: m.employeeExternalId,
          direction: m.direction,
          occurredAt,
          source: 'manual',
          rawPayload: payload as Prisma.InputJsonValue,
        },
      });
      copied += 1;
      recalc.set(`${m.employeeId}:${occurredAt.toISOString().slice(0, 10)}`, occurredAt);
    }
    for (const [key, at] of recalc) {
      const empId = key.split(':')[0];
      await this.recalcDay(tenantId, empId, at);
    }
    return { ok: true, copied };
  }

  async listLatestMarks(tenantId: string, limit = 12) {
    const items = await this.prisma.attendanceMark.findMany({
      where: { tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            position: { select: { name: true } },
            faceProfile: { select: { photoUrl: true, photoKey: true } },
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            model: true,
            adapterType: true,
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 48),
    });
    return items.map((m) => this.enrichMark(m as never));
  }

  async locationTracking(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      employeeId?: string;
      divisionId?: string;
    },
  ) {
    const from = opts.from ? new Date(opts.from) : new Date();
    from.setHours(0, 0, 0, 0);
    const to = opts.to ? new Date(opts.to) : new Date(from);
    to.setHours(23, 59, 59, 999);

    const locations = await this.prisma.location.findMany({
      where: {
        tenantId,
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        code: true,
        latitude: true,
        longitude: true,
        geoRadiusM: true,
        locationType: { select: { id: true, name: true } },
      },
    });

    const trackWhere: Prisma.GpsTrackPointWhereInput = {
      tenantId,
      recordedAt: { gte: from, lte: to },
    };
    if (opts.employeeId) trackWhere.employeeId = opts.employeeId;
    if (opts.divisionId) {
      trackWhere.employee = { divisionId: opts.divisionId };
    }

    const tracks = opts.employeeId
      ? await this.prisma.gpsTrackPoint.findMany({
          where: trackWhere,
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                tabNumber: true,
              },
            },
          },
          orderBy: { recordedAt: 'asc' },
          take: 2000,
        })
      : [];

    const markWhere: Prisma.AttendanceMarkWhereInput = {
      tenantId,
      occurredAt: { gte: from, lte: to },
    };
    if (opts.employeeId) markWhere.employeeId = opts.employeeId;

    const marks = opts.employeeId
      ? (
          await this.prisma.attendanceMark.findMany({
            where: markWhere,
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, tabNumber: true },
              },
              device: {
                select: {
                  id: true,
                  name: true,
                  model: true,
                  adapterType: true,
                  location: { select: { id: true, name: true, code: true } },
                },
              },
            },
            orderBy: { occurredAt: 'asc' },
            take: 500,
          })
        ).map((m) => this.enrichMark(m))
      : [];

    let distanceM = 0;
    for (let i = 1; i < tracks.length; i++) {
      distanceM += this.haversineM(
        tracks[i - 1].latitude,
        tracks[i - 1].longitude,
        tracks[i].latitude,
        tracks[i].longitude,
      );
    }

    return {
      locations,
      tracks,
      marks,
      distanceM: Math.round(distanceM),
      distanceKm: Math.round((distanceM / 1000) * 100) / 100,
    };
  }

  async gpsTrackingBoard(tenantId: string, opts: { q?: string; date?: string } = {}) {
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        status: 'active',
        ...(opts.q?.trim()
          ? {
              OR: [
                { lastName: { contains: opts.q.trim(), mode: 'insensitive' } },
                { firstName: { contains: opts.q.trim(), mode: 'insensitive' } },
                { tabNumber: { contains: opts.q.trim(), mode: 'insensitive' } },
                { phone: { contains: opts.q.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        phone: true,
        position: { select: { name: true, code: true } },
        faceProfile: { select: { photoUrl: true, photoKey: true } },
      },
      orderBy: { lastName: 'asc' },
      take: 80,
    });

    return employees.map((e) => ({
      ...e,
      fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
      code: e.position?.code || e.position?.name?.slice(0, 3)?.toUpperCase() || '—',
      photoUrl: this.storage.mediaUrl(
        e.faceProfile?.photoKey,
        e.faceProfile?.photoUrl,
      ),
    }));
  }

  async gpsTrackingDetail(tenantId: string, employeeId: string, date?: string) {
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        phone: true,
        position: { select: { name: true, code: true } },
        faceProfile: { select: { photoUrl: true, photoKey: true } },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const tracks = await this.prisma.gpsTrackPoint.findMany({
      where: { tenantId, employeeId, recordedAt: { gte: day, lte: end } },
      orderBy: { recordedAt: 'asc' },
      take: 2000,
    });
    const marks = (
      await this.prisma.attendanceMark.findMany({
        where: { tenantId, employeeId, occurredAt: { gte: day, lte: end } },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, tabNumber: true },
          },
          device: {
            select: {
              id: true,
              name: true,
              model: true,
              adapterType: true,
              location: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { occurredAt: 'asc' },
      })
    ).map((m) => this.enrichMark(m));

    const last = tracks[tracks.length - 1] || null;
    return {
      employee: {
        ...emp,
        fullName: [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' '),
        photoUrl: this.storage.mediaUrl(
          emp.faceProfile?.photoKey,
          emp.faceProfile?.photoUrl,
        ),
      },
      date: day.toISOString().slice(0, 10),
      tracks,
      marks,
      lastPoint: last,
    };
  }

  private enrichMark(m: {
    id: string;
    direction: PunchDirection;
    occurredAt: Date;
    source: string;
    rawPayload: unknown;
    createdAt?: Date;
    device?: {
      id: string;
      name: string;
      model: string | null;
      adapterType: string;
      serialNumber?: string;
      location?: { id: string; name: string; code: string; latitude?: number | null; longitude?: number | null; geoRadiusM?: number } | null;
    } | null;
    employee?: {
      id: string;
      firstName: string;
      lastName: string;
      middleName?: string | null;
      tabNumber: string;
      faceProfile?: { photoUrl?: string | null; photoKey?: string | null } | null;
      position?: { name: string } | null;
    } | null;
  }) {
    const payload =
      m.rawPayload && typeof m.rawPayload === 'object' && !Array.isArray(m.rawPayload)
        ? (m.rawPayload as Record<string, unknown>)
        : {};
    const markTypeRaw = String(payload.markType ?? '').toLowerCase();
    let markTypeLabel = 'Отметка';
    let markTypeKey: 'mark' | 'in' | 'out' | 'break_out' | 'break_in' | 'estimated_out' =
      'mark';
    if (markTypeRaw === 'break_out' || markTypeRaw === 'перерыв уход') {
      markTypeLabel = 'Перерыв уход';
      markTypeKey = 'break_out';
    } else if (markTypeRaw === 'break_in' || markTypeRaw === 'перерыв приход') {
      markTypeLabel = 'Перерыв приход';
      markTypeKey = 'break_in';
    } else if (
      markTypeRaw === 'estimated_out' ||
      markTypeRaw === 'такминий уход' ||
      markTypeRaw === 'taxminiy' ||
      payload.dayRole === 'estimated_out'
    ) {
      markTypeLabel = 'Такминий уход';
      markTypeKey = 'estimated_out';
    } else if (
      markTypeRaw === 'приход' ||
      m.direction === PunchDirection.IN ||
      markTypeRaw === 'in'
    ) {
      markTypeLabel = 'Приход';
      markTypeKey = 'in';
    } else if (
      markTypeRaw === 'уход' ||
      m.direction === PunchDirection.OUT ||
      markTypeRaw === 'out'
    ) {
      markTypeLabel = 'Уход';
      markTypeKey = 'out';
    } else if (markTypeRaw === 'отметка' || markTypeRaw === 'mark') {
      markTypeLabel = 'Отметка';
      markTypeKey = 'mark';
    }

    const locationName =
      (payload.locationName as string) ||
      m.device?.location?.name ||
      null;
    const deviceType =
      (payload.deviceType as string) ||
      m.device?.model ||
      (m.device?.adapterType === 'hikvision' ? 'Hikvision' : null) ||
      (m.source === 'manual' ? 'Ручной' : m.source);
    const identificationType =
      (payload.identificationType as string) ||
      (m.source === 'face' || m.source === 'hikvision'
        ? 'Распознавание лица'
        : m.source === 'qr'
          ? 'QR-код'
          : m.source === 'gps'
            ? 'GPS'
            : m.source === 'manual'
              ? 'Ручной ввод'
              : m.source);

    const photoUrl = this.storage.mediaUrl(
      typeof payload.photoKey === 'string' ? payload.photoKey : null,
      typeof payload.photoUrl === 'string' ? payload.photoUrl : null,
    );

    const changeHistory = Array.isArray(payload.changeHistory)
      ? (payload.changeHistory as unknown[])
      : [];

    const lat =
      typeof payload.latitude === 'number'
        ? payload.latitude
        : m.device?.location?.latitude ?? null;
    const lon =
      typeof payload.longitude === 'number'
        ? payload.longitude
        : m.device?.location?.longitude ?? null;
    const accuracyM =
      typeof payload.accuracyM === 'number'
        ? payload.accuracyM
        : m.device?.location?.geoRadiusM ?? null;

    return {
      ...m,
      employee: m.employee
        ? {
            ...m.employee,
            faceProfile: m.employee.faceProfile
              ? {
                  ...m.employee.faceProfile,
                  photoUrl: this.storage.mediaUrl(
                    m.employee.faceProfile.photoKey,
                    m.employee.faceProfile.photoUrl,
                  ),
                }
              : m.employee.faceProfile,
          }
        : m.employee,
      markType: markTypeKey,
      markTypeLabel,
      locationName,
      deviceType,
      deviceSerial:
        (payload.deviceSerial as string) || m.device?.serialNumber || null,
      deviceName: (payload.deviceName as string) || m.device?.name || null,
      identificationType,
      bssid: (payload.bssid as string) || null,
      isValid: payload.isValid !== false,
      clockTamper:
        payload.clockTamper === true ||
        payload.clockRollback === true ||
        payload.offlineUnverified === true ||
        payload.adminLoginBlocked === true,
      note:
        (typeof payload.note === 'string' && payload.note) ||
        (payload.clockTamper === true
          ? `Время терминала скорректировано (сдвиг ${Number(payload.clockDriftSeconds || 0)} с)`
          : payload.clockRollback === true
            ? 'Время терминала откатили назад'
            : payload.offlineUnverified === true
              ? 'Отметка в офлайн-периоде'
              : payload.adminLoginBlocked === true
                ? 'Отметка после ввода пароля администратора на терминале'
                : null),
      faceRecognized: payload.faceRecognized !== false && identificationType.includes('лиц'),
      photoUrl,
      latitude: lat,
      longitude: lon,
      accuracyM,
      changeHistory,
      createdByLabel: (payload.createdByLabel as string) || 'System',
      updatedByLabel: (payload.updatedByLabel as string) || 'System',
      createdAt: m.createdAt ?? null,
    };
  }

  normalizeMarkType(raw: string): { key: string; direction: PunchDirection; label: string } {
    const s = raw.trim().toLowerCase();
    if (s === 'in' || s === 'приход' || s === 'arrival') {
      return { key: 'in', direction: PunchDirection.IN, label: 'Приход' };
    }
    if (s === 'out' || s === 'уход' || s === 'departure') {
      return { key: 'out', direction: PunchDirection.OUT, label: 'Уход' };
    }
    if (s === 'break_in' || s === 'перерыв приход') {
      return { key: 'break_in', direction: PunchDirection.IN, label: 'Перерыв приход' };
    }
    if (s === 'break_out' || s === 'перерыв уход') {
      return { key: 'break_out', direction: PunchDirection.OUT, label: 'Перерыв уход' };
    }
    return { key: 'mark', direction: PunchDirection.AUTO, label: 'Отметка' };
  }

  parseMarkDateTime(raw: string): Date | null {
    const s = raw.trim();
    if (!s) return null;
    // dd.mm.yyyy hh:mm[:ss]
    const m = s.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (m) {
      const d = new Date(
        Number(m[3]),
        Number(m[2]) - 1,
        Number(m[1]),
        Number(m[4] || 0),
        Number(m[5] || 0),
        Number(m[6] || 0),
      );
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const iso = new Date(s);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  async getMark(tenantId: string, id: string) {
    const mark = await this.prisma.attendanceMark.findFirst({
      where: { id, tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            position: { select: { name: true } },
            faceProfile: { select: { photoUrl: true, photoKey: true } },
          },
        },
        device: {
          select: {
            id: true,
            name: true,
            model: true,
            adapterType: true,
            serialNumber: true,
            location: {
              select: {
                id: true,
                name: true,
                code: true,
                latitude: true,
                longitude: true,
                geoRadiusM: true,
              },
            },
          },
        },
      },
    });
    if (!mark) throw new NotFoundException('Mark not found');
    return this.enrichMark(mark);
  }

  async marksImportTemplate() {
    const columns = [
      'Физическое лицо',
      'Локация',
      'Дата и время отметки (дд.мм.гггг чч:мм)',
      'Тип отметки',
      'Является ли отметка действительной',
      'Примечание',
      'Фото (URL)',
    ];
    const rows = [
      {
        'Физическое лицо': 'IVANOV IVAN',
        Локация: 'Asosiy ofis — kirish',
        'Дата и время отметки (дд.мм.гггг чч:мм)': '03.08.2026 09:15',
        'Тип отметки': 'Приход',
        'Является ли отметка действительной': 'Y',
        Примечание: '',
        'Фото (URL)': '',
      },
    ];
    const buffer = await buildExcelBuffer({
      sheetName: 'Отметки',
      columns,
      rows,
    });
    return { buffer, filename: 'import-marks-template.xlsx' };
  }

  async importMarks(tenantId: string, rows: Record<string, unknown>[]) {
    const result = { created: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    const employees = await this.prisma.employee.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        faceProfile: { select: { photoUrl: true, photoKey: true } },
      },
    });
    const locations = await this.prisma.location.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const empByName = new Map<string, (typeof employees)[0]>();
    for (const e of employees) {
      const full = norm([e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '));
      if (full) empByName.set(full, e);
      empByName.set(norm(e.tabNumber), e);
    }
    const locByName = new Map<string, (typeof locations)[0]>();
    for (const l of locations) {
      locByName.set(norm(l.name), l);
      if (l.code) locByName.set(norm(l.code), l);
    }

    const pick = (row: Record<string, unknown>, keys: string[]) => {
      for (const k of keys) {
        if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
      }
      // case-insensitive key match
      const entries = Object.entries(row);
      for (const k of keys) {
        const found = entries.find(([ek]) => norm(ek) === norm(k));
        if (found && String(found[1]).trim()) return String(found[1]).trim();
      }
      return '';
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const person = pick(row, [
          'employeeName',
          'fullName',
          'person',
          'Физическое лицо',
          'fio',
        ]);
        const locName = pick(row, ['locationName', 'location', 'Локация']);
        const whenRaw = pick(row, [
          'occurredAt',
          'datetime',
          'Дата и время отметки (дд.мм.гггг чч:мм)',
          'Дата и время отметки',
          'time',
        ]);
        const typeRaw = pick(row, ['markType', 'type', 'Тип отметки']);
        const validRaw = pick(row, [
          'isValid',
          'valid',
          'Является ли отметка действительной',
          'Является ли отметка действительным',
          'Действительна (Y/N)',
        ]);
        const note = pick(row, ['note', 'Примечание']);
        const photoUrl = pick(row, ['photoUrl', 'photo', 'Фото (URL)', 'Фото']);

        if (!person || !whenRaw) {
          result.errors.push({
            row: rowNum,
            message: 'Нужны «Физическое лицо» и «Дата и время отметки»',
          });
          continue;
        }
        const emp = empByName.get(norm(person));
        if (!emp) {
          result.errors.push({
            row: rowNum,
            message: `Сотрудник не найден: ${person}`,
          });
          continue;
        }
        const occurredAt = this.parseMarkDateTime(whenRaw);
        if (!occurredAt) {
          result.errors.push({
            row: rowNum,
            message: `Некорректная дата/время: ${whenRaw}`,
          });
          continue;
        }
        const mt = this.normalizeMarkType(typeRaw || 'Отметка');
        const loc = locName ? locByName.get(norm(locName)) : null;
        const isValid =
          !validRaw ||
          ['y', 'yes', 'да', 'true', '1', 'действ'].includes(validRaw.toLowerCase());

        const resolvedPhoto = photoUrl || emp.faceProfile?.photoUrl || null;

        await this.prisma.attendanceMark.create({
          data: {
            tenantId,
            employeeId: emp.id,
            direction: mt.direction,
            occurredAt,
            source: 'import',
            rawPayload: {
              markType: mt.key,
              locationId: loc?.id ?? null,
              locationName: loc?.name || locName || null,
              note: note || null,
              identificationType: resolvedPhoto
                ? 'Распознавание лица'
                : 'Импорт',
              deviceType: 'Импорт',
              isValid,
              photoUrl: resolvedPhoto,
              faceRecognized: Boolean(resolvedPhoto),
              createdByLabel: 'Import',
              updatedByLabel: 'Import',
              changeHistory: [
                {
                  at: new Date().toISOString(),
                  by: 'Import',
                  event: 'Добавлен',
                  occurredAt: occurredAt.toISOString(),
                  markType: mt.key,
                  markTypeLabel: mt.label,
                  isValid,
                },
              ],
            } as Prisma.InputJsonValue,
          },
        });
        await this.recalcDay(tenantId, emp.id, occurredAt);
        result.created += 1;
      } catch (e) {
        result.errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'Ошибка строки',
        });
      }
    }
    return result;
  }

  async listDays(
    tenantId: string,
    opts: { date?: string; page?: string | number; limit?: string | number } = {},
  ) {
    const workDate = opts.date ? new Date(opts.date) : new Date();
    workDate.setHours(0, 0, 0, 0);
    const where: Prisma.AttendanceDayWhereInput = { tenantId, workDate };
    const { page, limit, skip } = parsePagination(opts.page, opts.limit, {
      defaultLimit: 100,
      maxLimit: 500,
    });
    const [total, items] = await Promise.all([
      this.prisma.attendanceDay.count({ where }),
      this.prisma.attendanceDay.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              tabNumber: true,
              division: { select: { name: true } },
            },
          },
        },
        orderBy: { status: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return pageResult(items, total, page, limit);
  }

  listProblems(tenantId: string) {
    return this.prisma.problemMark.findMany({
      where: { tenantId, resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolveProblem(tenantId: string, id: string) {
    const row = await this.prisma.problemMark.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Problem not found');
    return this.prisma.problemMark.update({
      where: { id },
      data: { resolved: true },
    });
  }

  private extractPunchPhotoBase64(dto: IngestPunchDto): string | null {
    const pick = (value: unknown) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      return value.trim().replace(/^data:image\/\w+;base64,/i, '');
    };
    const fromDto = pick(dto.photoBase64);
    if (fromDto) return fromDto;
    const raw = dto.raw;
    if (!raw) return null;
    return pick(raw.photoBase64) || pick(raw.photo_base64);
  }

  private stripPunchPhoto(raw?: Record<string, unknown>) {
    if (!raw) return undefined;
    const {
      photoBase64: _photoBase64,
      photo_base64: _photoSnake,
      ...rest
    } = raw;
    return rest;
  }

  private async storeCapturePhoto(tenantId: string, jpegB64: string) {
    try {
      const buf = Buffer.from(jpegB64, 'base64');
      if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        return null;
      }
      const key = `marks/${tenantId}/${randomUUID()}.jpg`;
      return await this.storage.putObject(key, buf, 'image/jpeg');
    } catch (e) {
      this.logger.warn(`Capture photo store failed: ${e}`);
      return null;
    }
  }

  private async mergeMarkCapturePhoto(
    mark: { id: string; rawPayload: Prisma.JsonValue | null },
    tenantId: string,
    jpegB64: string,
  ) {
    const payload =
      mark.rawPayload &&
      typeof mark.rawPayload === 'object' &&
      !Array.isArray(mark.rawPayload)
        ? { ...(mark.rawPayload as Record<string, unknown>) }
        : {};
    if (typeof payload.photoUrl === 'string' && payload.photoUrl) {
      return;
    }
    const stored = await this.storeCapturePhoto(tenantId, jpegB64);
    if (!stored) return;
    payload.photoUrl = stored.url;
    payload.photoKey = stored.key;
    await this.prisma.attendanceMark.update({
      where: { id: mark.id },
      data: { rawPayload: payload as Prisma.InputJsonValue },
    });
  }

  private clockTamperFromRaw(raw?: Record<string, unknown>) {
    if (!raw) {
      return { tamper: false, drift: 0, deviceOccurredAt: null as string | null };
    }
    const nested =
      raw.raw && typeof raw.raw === 'object' && !Array.isArray(raw.raw)
        ? (raw.raw as Record<string, unknown>)
        : null;
    const src =
      nested && (nested.clock_tamper != null || nested.clockTamper != null)
        ? nested
        : raw;
    const tamper = src.clock_tamper === true || src.clockTamper === true;
    const drift = Number(src.clock_drift_seconds ?? src.clockDriftSeconds ?? 0);
    const deviceOccurredAt =
      (typeof src.device_occurred_at === 'string' && src.device_occurred_at) ||
      (typeof src.deviceOccurredAt === 'string' && src.deviceOccurredAt) ||
      null;
    return { tamper, drift: Number.isFinite(drift) ? drift : 0, deviceOccurredAt };
  }

  private adminLoginBlockedFromRaw(raw?: Record<string, unknown>): boolean {
    if (!raw) return false;
    const nested =
      raw.raw && typeof raw.raw === 'object' && !Array.isArray(raw.raw)
        ? (raw.raw as Record<string, unknown>)
        : raw;
    return (
      raw.admin_login_blocked === true ||
      raw.adminLoginBlocked === true ||
      nested.admin_login_blocked === true ||
      nested.adminLoginBlocked === true
    );
  }

  private extractAcsSerial(raw?: Record<string, unknown>): number | null {
    if (!raw) return null;
    const nested =
      raw.raw && typeof raw.raw === 'object' && !Array.isArray(raw.raw)
        ? (raw.raw as Record<string, unknown>)
        : raw;
    const src = nested.raw && typeof nested.raw === 'object' && !Array.isArray(nested.raw)
      ? (nested.raw as Record<string, unknown>)
      : nested;
    const val = src.serialNo ?? src.serial_no ?? nested.serial_no ?? raw.serial_no;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private async applyClockGuard(opts: {
    tenantId: string;
    deviceId: string | null;
    source?: string;
    occurredAt: Date;
    raw?: Record<string, unknown>;
    employeeExternalId?: string;
    employeeId: string;
  }): Promise<{
    occurredAt: Date;
    extra: Record<string, unknown>;
  }> {
    const extra: Record<string, unknown> = {};
    let occurredAt = opts.occurredAt;
    if (!opts.deviceId || (opts.source && opts.source.includes('mock'))) {
      return { occurredAt, extra };
    }
    const device = await this.prisma.device.findFirst({
      where: {
        tenantId: opts.tenantId,
        OR: [{ id: opts.deviceId }, { gatewayRef: opts.deviceId }],
      },
    });
    if (!device) return { occurredAt, extra };

    const meta = this.asMeta(device.meta);
    const guard =
      meta.clockGuard && typeof meta.clockGuard === 'object' && !Array.isArray(meta.clockGuard)
        ? { ...(meta.clockGuard as Record<string, unknown>) }
        : {};
    const lastEventAt = guard.lastEventAt ? new Date(String(guard.lastEventAt)) : null;
    const lastTrustedClock = guard.lastTrustedDeviceClockAt
      ? new Date(String(guard.lastTrustedDeviceClockAt))
      : null;
    const lastSerial = Number(guard.lastSerial || 0);
    const lastHb = guard.lastHeartbeatAt
      ? new Date(String(guard.lastHeartbeatAt))
      : device.lastSeenAt;
    const serial = this.extractAcsSerial(opts.raw);
    const now = new Date();

    const serialAdvanced = serial == null || serial > lastSerial;
    const behindEvent =
      lastEventAt &&
      !Number.isNaN(lastEventAt.getTime()) &&
      occurredAt.getTime() < lastEventAt.getTime() - 30_000;
    const behindTrustedClock =
      lastTrustedClock &&
      !Number.isNaN(lastTrustedClock.getTime()) &&
      occurredAt.getTime() < lastTrustedClock.getTime() - 30_000;
    const rolledBack = Boolean((behindEvent || behindTrustedClock) && serialAdvanced);

    if (rolledBack) {
      extra.clockTamper = true;
      extra.clockRollback = true;
      extra.deviceOccurredAt = occurredAt.toISOString();
      extra.note =
        'Время терминала откатили назад (сравнение с последней онлайн-отметкой)';
      occurredAt = now;
      const emp = await this.prisma.employee.findFirst({
        where: { id: opts.employeeId, tenantId: opts.tenantId },
        select: { firstName: true, lastName: true, middleName: true },
      });
      await this.prisma.problemMark.create({
        data: {
          tenantId: opts.tenantId,
          reason: 'device_clock_rollback',
          payload: {
            employeeExternalId: opts.employeeExternalId,
            employeeName: emp
              ? [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ')
              : opts.employeeExternalId,
            deviceId: device.id,
            deviceOccurredAt: extra.deviceOccurredAt,
            trustedOccurredAt: occurredAt.toISOString(),
            lastOnlineEventAt: lastEventAt?.toISOString() ?? null,
            lastTrustedDeviceClockAt: lastTrustedClock?.toISOString() ?? null,
            acsSerial: serial,
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(
        `Clock rollback punch employee=${opts.employeeExternalId} deviceTime=${extra.deviceOccurredAt} lastEvent=${lastEventAt?.toISOString() ?? '-'} lastTrusted=${lastTrustedClock?.toISOString() ?? '-'}`,
      );
    } else if (
      lastHb &&
      now.getTime() - lastHb.getTime() > 15 * 60_000 &&
      occurredAt.getTime() > lastHb.getTime() &&
      occurredAt.getTime() < now.getTime()
    ) {
      extra.offlineUnverified = true;
      extra.note =
        extra.note ||
        'Отметка в офлайн-периоде: время терминала нельзя подтвердить сервером';
    }

    const punchLock =
      guard.punchLock && typeof guard.punchLock === 'object' && !Array.isArray(guard.punchLock)
        ? (guard.punchLock as Record<string, unknown>)
        : {};
    const taggedBlocked = this.adminLoginBlockedFromRaw(opts.raw);
    const loginAt = punchLock.loginAt ? new Date(String(punchLock.loginAt)) : null;
    const afterAdminLogin =
      loginAt &&
      !Number.isNaN(loginAt.getTime()) &&
      opts.occurredAt.getTime() >= loginAt.getTime() - 2000;
    const lockActive = punchLock.active === true;
    if (
      taggedBlocked ||
      (lockActive && (!loginAt || Number.isNaN(loginAt.getTime()) || afterAdminLogin))
    ) {
      extra.adminLoginBlocked = true;
      extra.isValid = false;
      extra.note =
        'Отметка после ввода пароля администратора на терминале (заблокировано до синхронизации)';
    }

    const trustedMs = occurredAt.getTime();
    const prevMs = lastEventAt && !Number.isNaN(lastEventAt.getTime()) ? lastEventAt.getTime() : 0;
    const nextLastEventAt = extra.clockRollback
      ? lastEventAt && !Number.isNaN(lastEventAt.getTime())
        ? lastEventAt.toISOString()
        : lastTrustedClock && !Number.isNaN(lastTrustedClock.getTime())
          ? lastTrustedClock.toISOString()
          : now.toISOString()
      : new Date(Math.max(trustedMs, prevMs)).toISOString();
    meta.clockGuard = {
      ...guard,
      lastSerial: Math.max(serial || 0, lastSerial || 0),
      lastEventAt: nextLastEventAt,
      lastHeartbeatAt: now.toISOString(),
    };
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        meta: meta as Prisma.InputJsonValue,
        lastSeenAt: now,
        status: punchLock.active === true ? 'locked' : 'online',
      },
    });
    return { occurredAt, extra };
  }

  async ingestPunch(dto: IngestPunchDto) {
    const tenantId = dto.tenantId;
    let deviceId: string | null = null;

    if (dto.deviceId) {
      const byId = await this.prisma.device.findFirst({
        where: { tenantId, id: dto.deviceId },
      });
      if (byId) deviceId = byId.id;
    }

    if (!deviceId && (dto.gatewayRef || dto.deviceId || dto.serialNumber)) {
      const device = await this.prisma.device.findFirst({
        where: {
          tenantId,
          OR: [
            dto.gatewayRef ? { gatewayRef: dto.gatewayRef } : undefined,
            dto.deviceId ? { gatewayRef: dto.deviceId } : undefined,
            dto.serialNumber ? { serialNumber: dto.serialNumber } : undefined,
          ].filter(Boolean) as Prisma.DeviceWhereInput[],
        },
      });
      if (device) {
        deviceId = device.id;
        const meta = this.asMeta(device.meta);
        const guard =
          meta.clockGuard && typeof meta.clockGuard === 'object' && !Array.isArray(meta.clockGuard)
            ? (meta.clockGuard as Record<string, unknown>)
            : {};
        const lock =
          guard.punchLock && typeof guard.punchLock === 'object' && !Array.isArray(guard.punchLock)
            ? (guard.punchLock as Record<string, unknown>)
            : {};
        await this.prisma.device.update({
          where: { id: device.id },
          data: {
            status: lock.active === true ? 'locked' : 'online',
            lastSeenAt: new Date(),
          },
        });
      }
    }

    let employeeId = dto.employeeId ?? null;
    if (!employeeId && dto.employeeExternalId) {
      const ext = dto.employeeExternalId.trim();
      const emp = await this.prisma.employee.findFirst({
        where: {
          tenantId,
          OR: [
            { externalId: ext },
            { tabNumber: ext },
            // Hikvision often sends "1"; HR may store "0001"
            ...(ext.match(/^\d+$/)
              ? [{ tabNumber: ext.padStart(4, '0') }, { tabNumber: ext.padStart(10, '0') }]
              : []),
          ],
        },
      });
      employeeId = emp?.id ?? null;
    }

    if (!employeeId) {
      await this.prisma.problemMark.create({
        data: {
          tenantId,
          reason: 'unknown_employee',
          payload: dto as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(`Problem mark: unknown employee for punch ${dto.employeeExternalId}`);
      return { ok: false, reason: 'unknown_employee' };
    }

    let occurredAt = new Date(dto.occurredAt);
    const guardResult = await this.applyClockGuard({
      tenantId,
      deviceId,
      source: dto.source,
      occurredAt,
      raw: dto.raw,
      employeeExternalId: dto.employeeExternalId,
      employeeId,
    });
    occurredAt = guardResult.occurredAt;
    const photoB64 = this.extractPunchPhotoBase64(dto);

    // Dedupe: same employee within ±60s of this punch (not all future marks).
    const recent = await this.prisma.attendanceMark.findFirst({
      where: {
        tenantId,
        employeeId,
        occurredAt: {
          gte: new Date(occurredAt.getTime() - 60_000),
          lte: new Date(occurredAt.getTime() + 60_000),
        },
      },
      orderBy: { occurredAt: 'asc' },
    });
    if (recent) {
      if (photoB64) {
        await this.mergeMarkCapturePhoto(recent, tenantId, photoB64);
      }
      return { ok: true, deduped: true, markId: recent.id };
    }

    let rawPayload = this.stripPunchPhoto(dto.raw) as Prisma.InputJsonValue | undefined;
    if (photoB64) {
      const stored = await this.storeCapturePhoto(tenantId, photoB64);
      if (stored) {
        rawPayload = {
          ...((rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
            ? rawPayload
            : {}) as Record<string, unknown>),
          photoUrl: stored.url,
          photoKey: stored.key,
        } as Prisma.InputJsonValue;
      }
    }

    const tamper = this.clockTamperFromRaw(dto.raw);
    if (tamper.tamper) {
      const mins = Math.round(Math.abs(tamper.drift) / 60);
      const note = `Время терминала скорректировано (сдвиг ${mins} мин)`;
      rawPayload = {
        ...((rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
          ? rawPayload
          : {}) as Record<string, unknown>),
        clockTamper: true,
        clockDriftSeconds: tamper.drift,
        deviceOccurredAt: tamper.deviceOccurredAt,
        note,
      } as Prisma.InputJsonValue;
      const emp = await this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { firstName: true, lastName: true, middleName: true },
      });
      await this.prisma.problemMark.create({
        data: {
          tenantId,
          reason: 'device_clock_skew',
          payload: {
            employeeExternalId: dto.employeeExternalId,
            employeeName: emp
              ? [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ')
              : dto.employeeExternalId,
            deviceId,
            deviceOccurredAt: tamper.deviceOccurredAt,
            trustedOccurredAt: occurredAt.toISOString(),
            clockDriftSeconds: tamper.drift,
            note,
          },
        },
      });
      this.logger.warn(
        `Clock skew punch employee=${dto.employeeExternalId} drift=${tamper.drift}s`,
      );
    }

    if (Object.keys(guardResult.extra).length) {
      rawPayload = {
        ...((rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
          ? rawPayload
          : {}) as Record<string, unknown>),
        ...guardResult.extra,
      } as Prisma.InputJsonValue;
    }

    const mark = await this.prisma.attendanceMark.create({
      data: {
        tenantId,
        employeeId,
        deviceId,
        employeeExternalId: dto.employeeExternalId,
        direction: dto.direction,
        occurredAt,
        source: dto.source ?? 'manual',
        rawPayload,
      },
    });

    await this.recalcDay(tenantId, employeeId, occurredAt);
    return { ok: true, markId: mark.id, deviceId };
  }

  async recalcDay(tenantId: string, employeeId: string, when: Date) {
    const workDate = new Date(when);
    workDate.setHours(0, 0, 0, 0);
    const next = new Date(workDate);
    next.setDate(next.getDate() + 1);

    const marksRaw = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        employeeId,
        occurredAt: { gte: workDate, lt: next },
      },
      orderBy: { occurredAt: 'asc' },
    });

    const marks = marksRaw.filter((m) => {
      const payload =
        m.rawPayload &&
        typeof m.rawPayload === 'object' &&
        !Array.isArray(m.rawPayload)
          ? (m.rawPayload as Record<string, unknown>)
          : {};
      return payload.isValid !== false;
    });

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { schedule: true },
    });

    const settings = mergeScheduleSettings(employee?.schedule?.settings);
    const pattern = (settings.weekPattern ?? '6/1') as WeekPattern;
    const trackLate = settings.trackLate !== false;
    const trackEarly = settings.trackEarly !== false;
    const delayMode = settings.delayMode ?? 'allowed';
    const graceOut = settings.graceOutMinutes ?? 0;

    const firstIn = marks[0] ?? null;
    const lastOutOfficial = officialLastOutEnabled(
      marks.length,
      new Date(),
      workDate,
      employee?.schedule?.endTime ?? '18:00',
    );
    const lastOut = lastOutOfficial ? marks[marks.length - 1] : null;

    for (let i = 0; i < marks.length; i++) {
      const role = roleForDayMark(i, marks.length, lastOutOfficial);
      const mark = marks[i];
      const prev =
        mark.rawPayload &&
        typeof mark.rawPayload === 'object' &&
        !Array.isArray(mark.rawPayload)
          ? { ...(mark.rawPayload as Record<string, unknown>) }
          : {};
      const nextType =
        role === 'in' ? 'in' : role === 'out' ? 'out' : 'estimated_out';
      const nextDir =
        role === 'in'
          ? PunchDirection.IN
          : role === 'out'
            ? PunchDirection.OUT
            : PunchDirection.AUTO;
      const prevType = String(prev.markType || '');
      const keepManual =
        prevType === 'break_in' ||
        prevType === 'break_out' ||
        prevType === 'перерыв приход' ||
        prevType === 'перерыв уход';
      if (keepManual) continue;
      if (prev.markType === nextType && mark.direction === nextDir && prev.dayRole === role) {
        continue;
      }
      prev.markType = nextType;
      prev.dayRole = role;
      prev.markTypeLabel =
        role === 'in' ? 'Приход' : role === 'out' ? 'Уход' : 'Такминий уход';
      await this.prisma.attendanceMark.update({
        where: { id: mark.id },
        data: {
          direction: nextDir,
          rawPayload: prev as Prisma.InputJsonValue,
        },
      });
    }

    let status: DayStatus = DayStatus.not_started;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;

    // Approved leave wins over punch recalculation (unless forced later)
    const existingDay = await this.prisma.attendanceDay.findUnique({
      where: {
        tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
      },
    });
    if (existingDay?.status === DayStatus.leave && !firstIn) {
      return existingDay;
    }
    if (existingDay?.status === DayStatus.leave && firstIn) {
      await this.prisma.attendanceDay.update({
        where: { id: existingDay.id },
        data: {
          firstInAt: firstIn.occurredAt,
          lastOutAt: lastOut?.occurredAt ?? existingDay.lastOutAt,
        },
      });
      return this.prisma.attendanceDay.findUniqueOrThrow({
        where: { id: existingDay.id },
      });
    }

    // Production / week pattern: day off (no punches → day_off; punches still recorded as work)
    const plannedOff = isDayOffByPattern(workDate, pattern);
    if (plannedOff && !firstIn) {
      status = DayStatus.day_off;
      await this.prisma.attendanceDay.upsert({
        where: {
          tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
        },
        create: {
          tenantId,
          employeeId,
          workDate,
          status,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
        },
        update: {
          status,
          firstInAt: null,
          lastOutAt: null,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
        },
      });
      return;
    }

    if (firstIn) {
      status = DayStatus.on_time;
      if (trackLate) {
        const start = employee?.schedule?.startTime ?? '09:00';
        const grace = employee?.schedule?.graceMinutes ?? 15;
        const { h, m } = parseHm(start);
        const planned = new Date(workDate);
        // Дозволено (allowed/loyal): late only after start+grace
        // Строго (strict): late counted from raw start
        const graceUsed = delayMode === 'strict' ? 0 : grace;
        planned.setHours(h, m + graceUsed, 0, 0);
        if (firstIn.occurredAt > planned) {
          status = DayStatus.late;
          lateMinutes = Math.round(
            (firstIn.occurredAt.getTime() - planned.getTime()) / 60000,
          );
          // If «считать опоздание в дозволенной зоне» — also count minutes inside grace
          if (settings.lateInGraceZone && delayMode !== 'strict' && grace > 0) {
            const rawStart = new Date(workDate);
            rawStart.setHours(h, m, 0, 0);
            if (firstIn.occurredAt > rawStart) {
              lateMinutes = Math.round(
                (firstIn.occurredAt.getTime() - rawStart.getTime()) / 60000,
              );
            }
          }
        }
      }

      if (trackEarly && lastOut) {
        const end = employee?.schedule?.endTime ?? '18:00';
        const { h, m } = parseHm(end);
        const plannedOut = new Date(workDate);
        plannedOut.setHours(h, Math.max(0, m - graceOut), 0, 0);
        if (lastOut.occurredAt < plannedOut) {
          earlyLeaveMinutes = Math.round(
            (plannedOut.getTime() - lastOut.occurredAt.getTime()) / 60000,
          );
        }
      }
    }

    await this.prisma.attendanceDay.upsert({
      where: {
        tenantId_employeeId_workDate: { tenantId, employeeId, workDate },
      },
      create: {
        tenantId,
        employeeId,
        workDate,
        status,
        firstInAt: firstIn?.occurredAt ?? null,
        lastOutAt: lastOut?.occurredAt ?? null,
        lateMinutes,
        earlyLeaveMinutes,
      },
      update: {
        status,
        firstInAt: firstIn?.occurredAt ?? null,
        lastOutAt: lastOut?.occurredAt ?? null,
        lateMinutes,
        earlyLeaveMinutes,
      },
    });
  }

  async finalizeAttendanceDay(tenantId: string, when: Date) {
    const workDate = startOfLocalDay(when);
    const next = new Date(workDate);
    next.setDate(next.getDate() + 1);
    const rows = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        employeeId: { not: null },
        occurredAt: { gte: workDate, lt: next },
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    for (const row of rows) {
      if (!row.employeeId) continue;
      await this.recalcDay(tenantId, row.employeeId, workDate);
    }
    return { ok: true, employees: rows.length };
  }

  async finalizeOpenDays(at = new Date()) {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    const today = startOfLocalDay(at);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let days = 0;
    for (const t of tenants) {
      await this.finalizeAttendanceDay(t.id, yesterday);
      await this.finalizeAttendanceDay(t.id, today);
      days += 2;
    }
    return { ok: true, tenants: tenants.length, days };
  }

  async markAbsentsForToday(tenantId: string) {
    const workDate = new Date();
    workDate.setHours(0, 0, 0, 0);
    const actives = await this.prisma.employee.findMany({
      where: { tenantId, status: 'active', employmentType: 'staff' },
      select: { id: true, schedule: { select: { settings: true } } },
    });
    for (const e of actives) {
      const settings = mergeScheduleSettings(e.schedule?.settings);
      if (settings.trackAbsent === false) continue;
      const pattern = (settings.weekPattern ?? '6/1') as WeekPattern;

      const existing = await this.prisma.attendanceDay.findUnique({
        where: {
          tenantId_employeeId_workDate: {
            tenantId,
            employeeId: e.id,
            workDate,
          },
        },
      });

      if (isDayOffByPattern(workDate, pattern)) {
        if (
          !existing ||
          existing.status === DayStatus.not_started ||
          existing.status === DayStatus.day_off
        ) {
          await this.prisma.attendanceDay.upsert({
            where: {
              tenantId_employeeId_workDate: {
                tenantId,
                employeeId: e.id,
                workDate,
              },
            },
            create: {
              tenantId,
              employeeId: e.id,
              workDate,
              status: DayStatus.day_off,
            },
            update: { status: DayStatus.day_off },
          });
        }
        continue;
      }

      if (!existing) {
        await this.prisma.attendanceDay.create({
          data: {
            tenantId,
            employeeId: e.id,
            workDate,
            status: DayStatus.absent,
          },
        });
      } else if (existing.status === DayStatus.not_started) {
        const noon = new Date(workDate);
        noon.setHours(12, 0, 0, 0);
        if (new Date() > noon) {
          await this.prisma.attendanceDay.update({
            where: { id: existing.id },
            data: { status: DayStatus.absent },
          });
        }
      }
    }
    return { ok: true, checked: actives.length };
  }
}
