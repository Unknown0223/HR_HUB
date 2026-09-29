import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { NotificationKind, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MeService } from '../me/me.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { ymdInTz } from '../attendance/attendance-day';
import { mergeScheduleSettings } from '../attendance/schedule-settings';
import {
  type CalendarDayType,
  type DayContext,
  type ScheduleInput,
  shiftYmd,
  trackingWindow,
} from './tracking-window';
import type { TrackingPingsDto, TrackingRegisterDto } from './dto';
import type { RawPoint } from './track-geometry';
import { checkGpsJump } from './gps-jump';
import { TrackPathService } from './track-path.service';

/** A phone that has not reported for this long is shown as offline. */
const ONLINE_MS = 3 * 60_000;
const MAX_POINT_ACCURACY_M = 300;
const MAX_POINT_AGE_MS = 3 * 24 * 60 * 60_000;
const MOCK_ALERT_DEDUPE_MS = 10 * 60_000;
/** How long a track request waits for road snapping before answering with the raw line. */
const TRACK_SNAP_BUDGET_MS = 3_000;
/**
 * The phone uploads at least every 5 min while it has internet, so a fix that
 * reaches the server later than this sat in the offline queue.
 */
const LATE_UPLOAD_MS = 7 * 60_000;
/** Punch sources that carry the phone's own coordinates in the payload. */
const PHONE_PUNCH_SOURCES = ['mobile_app', 'gps'];

export type TrackPunch = {
  id: string;
  kind: 'in' | 'out';
  at: Date;
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: string;
  valid: boolean;
  outsideGeofence: boolean;
  distanceM: number | null;
  locationName: string | null;
  photoUrl: string | null;
};

function punchKind(direction: string, payload: Record<string, unknown>): 'in' | 'out' | null {
  const raw = String(payload.markType ?? '').toLowerCase();
  if (raw === 'in' || raw === 'приход') return 'in';
  if (raw === 'out' || raw === 'уход') return 'out';
  if (direction === 'IN' || direction === 'OUT') return direction === 'IN' ? 'in' : 'out';
  const requested = String(payload.requestedDirection ?? '');
  if (requested === 'IN' || requested === 'OUT') return requested === 'IN' ? 'in' : 'out';
  return null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toRawPoint(p: {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps?: number | null;
  offline?: boolean | null;
  recordedAt: Date;
}): RawPoint {
  return {
    lat: p.latitude,
    lng: p.longitude,
    at: p.recordedAt.getTime(),
    accuracy: p.accuracyM,
    speed: p.speedMps ?? null,
    offline: p.offline === true,
  };
}

type DeviceWithEmployee = Prisma.TrackingDeviceGetPayload<{
  include: { employee: { include: { schedule: true } } };
}>;

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly paths: TrackPathService,
  ) {}

  /** One active tracking token per user: registering a phone revokes the previous one. */
  async register(user: AuthUser, dto: TrackingRegisterDto) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.trackingDevice.updateMany({
      where: { tenantId, userId: user.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    const device = await this.prisma.trackingDevice.create({
      data: {
        tenantId,
        employeeId: employee.id,
        userId: user.userId,
        tokenHash: hashToken(token),
        platform: dto.platform,
        model: dto.model,
        appVersion: dto.appVersion,
        permissions: (dto.permissions ?? undefined) as Prisma.InputJsonValue | undefined,
        lastSeenAt: now,
        state: 'paused',
      },
      include: { employee: { include: { schedule: true } } },
    });
    return { token, deviceId: device.id, window: await this.windowFor(device) };
  }

  async revoke(user: AuthUser) {
    const res = await this.prisma.trackingDevice.updateMany({
      where: { userId: user.userId, revokedAt: null },
      data: { revokedAt: new Date(), state: 'paused' },
    });
    return { ok: true, revoked: res.count };
  }

  async myStatus(user: AuthUser) {
    const { tenantId } = await this.me.requireEmployee(user);
    const device = await this.prisma.trackingDevice.findFirst({
      where: { tenantId, userId: user.userId, revokedAt: null },
      include: { employee: { include: { schedule: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!device) return { registered: false };
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const pointsToday = await this.prisma.gpsTrackPoint.count({
      where: { tenantId, employeeId: device.employeeId, recordedAt: { gte: since } },
    });
    return {
      registered: true,
      state: device.state,
      lastSeenAt: device.lastSeenAt,
      lastFixAt: device.lastFixAt,
      batteryPct: device.batteryPct,
      pointsToday,
      window: await this.windowFor(device),
    };
  }

  async authenticate(token: string | undefined): Promise<DeviceWithEmployee> {
    if (!token || token.length < 20) throw new UnauthorizedException('Tracking token required');
    const device = await this.prisma.trackingDevice.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { employee: { include: { schedule: true } } },
    });
    if (!device || device.revokedAt || device.employee.status !== 'active') {
      throw new UnauthorizedException({ message: 'Tracking token revoked', code: 'TRACKING_REVOKED' });
    }
    return device;
  }

  async windowByToken(token: string | undefined) {
    const device = await this.authenticate(token);
    const window = await this.windowFor(device);
    await this.prisma.trackingDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), state: window.active ? 'tracking' : 'off_hours' },
    });
    return window;
  }

  async ingest(token: string | undefined, dto: TrackingPingsDto) {
    const device = await this.authenticate(token);
    const now = new Date();
    const schedule = this.scheduleOf(device);
    const dayCache = new Map<string, Promise<DayContext>>();
    const dayCtx = (ymd: string) => {
      if (!dayCache.has(ymd)) dayCache.set(ymd, this.dayContext(device.tenantId, device.employeeId, ymd));
      return dayCache.get(ymd)!;
    };

    let mock = 0;
    let offHours = 0;
    let invalid = 0;
    const rows: Prisma.GpsTrackPointCreateManyInput[] = [];
    for (const p of dto.points) {
      const at = new Date(p.recordedAt);
      if (
        Number.isNaN(at.getTime()) ||
        at.getTime() > now.getTime() + 2 * 60_000 ||
        now.getTime() - at.getTime() > MAX_POINT_AGE_MS ||
        (p.accuracy != null && p.accuracy > MAX_POINT_ACCURACY_M)
      ) {
        invalid++;
        continue;
      }
      // A selected fake-GPS app can feed any provider, so nothing from that phone is trusted.
      if (p.mock || dto.activeMockApp) {
        mock++;
        continue;
      }
      const ymd = ymdInTz(at);
      const w = trackingWindow(at, schedule, await dayCtx(ymd), await dayCtx(shiftYmd(ymd, -1)));
      if (!w.active) {
        offHours++;
        continue;
      }
      rows.push({
        tenantId: device.tenantId,
        employeeId: device.employeeId,
        deviceId: device.id,
        latitude: p.lat,
        longitude: p.lng,
        accuracyM: p.accuracy ?? null,
        speedMps: p.speed ?? null,
        headingDeg: p.heading ?? null,
        altitudeM: p.altitude ?? null,
        provider: p.provider ?? null,
        batteryPct: p.battery ?? dto.battery ?? null,
        charging: p.charging ?? dto.charging ?? null,
        offline: p.offline === true || now.getTime() - at.getTime() > LATE_UPLOAD_MS,
        recordedAt: at,
        source: 'mobile_bg',
      });
    }

    if (rows.length) {
      await checkGpsJump(
        { prisma: this.prisma, notifications: this.notifications },
        {
          tenantId: device.tenantId,
          employeeId: device.employeeId,
          employeeName: [device.employee.lastName, device.employee.firstName].filter(Boolean).join(' '),
          source: 'background_tracking',
          points: rows.map((r) => ({
            lat: r.latitude,
            lng: r.longitude,
            at: new Date(r.recordedAt).getTime(),
            accuracy: r.accuracyM ?? null,
            speed: null,
          })),
        },
      );
      await this.prisma.gpsTrackPoint.createMany({ data: rows });
    }
    if (mock || dto.activeMockApp) await this.alertMock(device, dto.activeMockApp);

    const latest = rows.reduce<Prisma.GpsTrackPointCreateManyInput | null>(
      (acc, r) => (!acc || new Date(r.recordedAt) > new Date(acc.recordedAt) ? r : acc),
      null,
    );
    const window = await this.windowFor(device);
    await this.prisma.trackingDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: now,
        batteryPct: dto.battery ?? device.batteryPct,
        charging: dto.charging ?? device.charging,
        state: dto.state ?? (window.active ? 'tracking' : 'off_hours'),
        ...(dto.permissions ? { permissions: dto.permissions as Prisma.InputJsonValue } : {}),
        ...(latest
          ? {
              lastLat: latest.latitude,
              lastLng: latest.longitude,
              lastAccuracy: latest.accuracyM ?? null,
              lastFixAt: latest.recordedAt,
            }
          : {}),
      },
    });

    return { accepted: rows.length, rejected: { mock, offHours, invalid }, window };
  }

  /** Web live board: every phone that streams GPS, with its latest fix and battery. */
  async live(tenantId: string) {
    const devices = await this.prisma.trackingDevice.findMany({
      where: { tenantId, revokedAt: null, employee: { status: 'active' } },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            tabNumber: true,
            phone: true,
            positionId: true,
            position: { select: { name: true } },
            division: { select: { id: true, name: true } },
            faceProfile: { select: { photoUrl: true, photoKey: true } },
            person: { select: { photoUrl: true } },
            schedule: true,
          },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    const [divisions, users] = await Promise.all([
      this.prisma.division.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          parentId: true,
          location: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true, status: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(devices.map((d) => d.userId))] } },
        select: { id: true, role: true },
      }),
    ]);
    const roleOf = new Map(users.map((u) => [u.id, u.role]));
    const divById = new Map(divisions.map((d) => [d.id, d]));
    /** Branch of a division is its own location or the nearest ancestor's; heads are every manager up the tree. */
    const orgOf = (divisionId: string | null | undefined) => {
      let location: { id: string; name: string } | null = null;
      const heads: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      for (let d = divisionId ? divById.get(divisionId) : undefined; d && !seen.has(d.id); ) {
        seen.add(d.id);
        location ??= d.location;
        const mgr = d.manager;
        if (mgr && mgr.status === 'active' && !heads.some((h) => h.id === mgr.id)) {
          heads.push({ id: mgr.id, name: [mgr.lastName, mgr.firstName].filter(Boolean).join(' ') });
        }
        d = d.parentId ? divById.get(d.parentId) : undefined;
      }
      return { location, heads };
    };

    const now = Date.now();
    const seen = new Set<string>();
    const out = [];
    for (const d of devices) {
      if (seen.has(d.employeeId)) continue;
      seen.add(d.employeeId);
      const e = d.employee;
      const window = await this.windowFor({ ...d, employee: e } as unknown as DeviceWithEmployee);
      const online = !!d.lastSeenAt && now - d.lastSeenAt.getTime() < ONLINE_MS;
      const org = orgOf(e.division?.id);
      out.push({
        employeeId: e.id,
        deviceId: d.id,
        fullName: [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' '),
        tabNumber: e.tabNumber,
        phone: e.phone,
        positionId: e.positionId,
        position: e.position?.name ?? null,
        division: e.division?.name ?? null,
        divisionId: e.division?.id ?? null,
        locationId: org.location?.id ?? null,
        location: org.location?.name ?? null,
        role: roleOf.get(d.userId) ?? null,
        heads: org.heads.filter((h) => h.id !== e.id),
        photoUrl: this.storage.mediaUrl(
          e.faceProfile?.photoKey,
          e.faceProfile?.photoUrl ?? e.person?.photoUrl,
        ),
        model: d.model,
        lat: d.lastLat,
        lng: d.lastLng,
        accuracy: d.lastAccuracy,
        lastFixAt: d.lastFixAt,
        lastSeenAt: d.lastSeenAt,
        batteryPct: d.batteryPct,
        charging: d.charging,
        state: d.state,
        online,
        workingNow: window.active,
        windowReason: window.reason,
      });
    }
    return out;
  }

  async employeeTrack(tenantId: string, employeeId: string, ymd: string, snap = true) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } });
    if (!emp) throw new NotFoundException('Employee not found');
    const start = new Date(`${ymd}T00:00:00+05:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60_000);
    const points = await this.prisma.gpsTrackPoint.findMany({
      where: { tenantId, employeeId, recordedAt: { gte: start, lt: end } },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        accuracyM: true,
        speedMps: true,
        batteryPct: true,
        offline: true,
        recordedAt: true,
      },
      take: 5000,
    });
    const [path, punches] = await Promise.all([
      this.paths.build(points.map(toRawPoint), { snap, budgetMs: TRACK_SNAP_BUDGET_MS }),
      this.phonePunches(tenantId, employeeId, start, end),
    ]);
    return { date: ymd, points, path, punches };
  }

  /** Road-snapped line through the given fixes, for callers that already loaded them. */
  pathFor(
    points: {
      latitude: number;
      longitude: number;
      accuracyM: number | null;
      offline?: boolean | null;
      recordedAt: Date;
    }[],
  ) {
    return this.paths.build(points.map(toRawPoint), { snap: true, budgetMs: TRACK_SNAP_BUDGET_MS });
  }

  /** Check-ins/outs made from the phone, at the spot where the phone was. */
  async phonePunches(tenantId: string, employeeId: string, from: Date, to: Date): Promise<TrackPunch[]> {
    const marks = await this.prisma.attendanceMark.findMany({
      where: {
        tenantId,
        employeeId,
        source: { in: PHONE_PUNCH_SOURCES },
        occurredAt: { gte: from, lt: to },
      },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, direction: true, occurredAt: true, source: true, rawPayload: true },
      take: 200,
    });
    const out: TrackPunch[] = [];
    for (const m of marks) {
      const p =
        m.rawPayload && typeof m.rawPayload === 'object' && !Array.isArray(m.rawPayload)
          ? (m.rawPayload as Record<string, unknown>)
          : {};
      const kind = punchKind(m.direction, p);
      if (!kind || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
      out.push({
        id: m.id,
        kind,
        at: m.occurredAt,
        lat: p.latitude,
        lng: p.longitude,
        accuracyM: typeof p.accuracyM === 'number' ? p.accuracyM : null,
        source: m.source,
        valid: p.isValid !== false,
        outsideGeofence: p.outsideGeofence === true,
        distanceM: typeof p.distanceM === 'number' ? p.distanceM : null,
        locationName: typeof p.locationName === 'string' ? p.locationName : null,
        photoUrl: this.storage.mediaUrl(
          typeof p.photoKey === 'string' ? p.photoKey : null,
          typeof p.photoUrl === 'string' ? p.photoUrl : null,
        ),
      });
    }
    return out;
  }

  scheduleInput(s: { startTime?: string | null; endTime?: string | null; settings?: unknown } | null): ScheduleInput {
    return {
      startTime: s?.startTime,
      endTime: s?.endTime,
      settings: mergeScheduleSettings(s?.settings),
    };
  }

  private scheduleOf(device: DeviceWithEmployee): ScheduleInput {
    return this.scheduleInput(device.employee.schedule);
  }

  private windowFor(device: DeviceWithEmployee) {
    return this.windowForEmployee(device.tenantId, device.employeeId, this.scheduleOf(device));
  }

  async windowForEmployee(tenantId: string, employeeId: string, schedule: ScheduleInput) {
    const now = new Date();
    const ymd = ymdInTz(now);
    const [today, yesterday] = await Promise.all([
      this.dayContext(tenantId, employeeId, ymd),
      this.dayContext(tenantId, employeeId, shiftYmd(ymd, -1)),
    ]);
    return trackingWindow(now, schedule, today, yesterday);
  }

  /** Day contexts for an inclusive date range, with two queries instead of two per day. */
  async dayContexts(tenantId: string, employeeId: string, fromYmd: string, toYmd: string) {
    const from = new Date(`${fromYmd}T00:00:00.000Z`);
    const to = new Date(`${toYmd}T00:00:00.000Z`);
    const [calDays, absences] = await Promise.all([
      this.prisma.productionCalendarDay.findMany({
        where: { day: { gte: from, lte: to }, calendar: { tenantId, isActive: true } },
        select: { day: true, dayType: true },
        orderBy: { calendar: { createdAt: 'desc' } },
      }),
      this.prisma.absence.findMany({
        where: {
          tenantId,
          employeeId,
          status: RequestStatus.approved,
          startDate: { lte: to },
          endDate: { gte: from },
          startTime: null,
        },
        select: { startDate: true, endDate: true },
      }),
    ]);
    // Oldest calendar wins, matching dayContext(); rows are newest-first so later writes override.
    const calByYmd = new Map<string, CalendarDayType>();
    for (const c of calDays) calByYmd.set(c.day.toISOString().slice(0, 10), c.dayType as CalendarDayType);
    const out = new Map<string, DayContext>();
    for (let ymd = fromYmd; ymd <= toYmd; ymd = shiftYmd(ymd, 1)) {
      out.set(ymd, {
        ymd,
        calendarDayType: calByYmd.get(ymd) ?? null,
        onAbsence: absences.some(
          (a) => a.startDate.toISOString().slice(0, 10) <= ymd && a.endDate.toISOString().slice(0, 10) >= ymd,
        ),
      });
    }
    return out;
  }

  private async dayContext(tenantId: string, employeeId: string, ymd: string): Promise<DayContext> {
    const date = new Date(`${ymd}T00:00:00.000Z`);
    const [calDay, absence] = await Promise.all([
      this.prisma.productionCalendarDay.findFirst({
        where: {
          day: date,
          calendar: { tenantId, isActive: true, year: Number(ymd.slice(0, 4)) },
        },
        select: { dayType: true },
        orderBy: { calendar: { createdAt: 'asc' } },
      }),
      this.prisma.absence.findFirst({
        where: {
          tenantId,
          employeeId,
          status: RequestStatus.approved,
          startDate: { lte: date },
          endDate: { gte: date },
          startTime: null,
        },
        select: { id: true },
      }),
    ]);
    return {
      ymd,
      calendarDayType: (calDay?.dayType as CalendarDayType | undefined) ?? null,
      onAbsence: !!absence,
    };
  }

  private async alertMock(device: DeviceWithEmployee, activeMockApp?: string) {
    const recent = await this.prisma.problemMark.findFirst({
      where: {
        tenantId: device.tenantId,
        reason: 'mock_location',
        createdAt: { gte: new Date(Date.now() - MOCK_ALERT_DEDUPE_MS) },
        payload: { path: ['employeeId'], equals: device.employeeId },
      },
      select: { id: true },
    });
    if (recent) return;
    const name = [device.employee.lastName, device.employee.firstName].filter(Boolean).join(' ');
    await this.prisma.problemMark.create({
      data: {
        tenantId: device.tenantId,
        reason: 'mock_location',
        payload: {
          employeeId: device.employeeId,
          employeeName: name,
          userId: device.userId,
          source: 'background_tracking',
          activeMockApp: activeMockApp ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    await this.notifications.notifyApprovers(device.tenantId, {
      kind: NotificationKind.alert,
      title: `Soxta lokatsiya: ${name}`,
      body:
        'Fondagi GPS kuzatuvda soxta lokatsiya aniqlandi.' +
        (activeMockApp ? ` Ilova: ${activeMockApp}.` : ''),
      entity: 'employee',
      entityId: device.employeeId,
    });
  }
}
