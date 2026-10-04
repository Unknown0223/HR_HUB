import { ForbiddenException, Injectable } from '@nestjs/common';
import { DayStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MeService } from '../me/me.service';
import { photoRef } from '../me/photo-ref';
import { StorageService } from '../storage/storage.service';
import { TrackingService } from '../tracking/tracking.service';
import { runUnscoped } from '../common/data-scope';
import { ymdInTz } from '../attendance/attendance-day';
import type { AuthUser } from '../auth/current-user.decorator';
import { dayOffReason, shiftYmd, trackingWindow, type TrackingWindow } from '../tracking/tracking-window';

/** A phone that has not reported for this long is shown as offline. */
const ONLINE_MS = 3 * 60_000;

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  tabNumber: true,
  phone: true,
  position: { select: { name: true } },
  division: { select: { name: true } },
  faceProfile: { select: { photoUrl: true, photoKey: true } },
  person: { select: { photoUrl: true } },
  schedule: { select: { name: true, startTime: true, endTime: true, settings: true } },
} satisfies Prisma.EmployeeSelect;

type Member = Prisma.EmployeeGetPayload<{ select: typeof MEMBER_SELECT }>;

export type TeamDayStatus = DayStatus | 'holiday' | 'planned';

function workedMinutes(d: {
  workedHours: Prisma.Decimal | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
}): number {
  if (d.workedHours != null) return Math.round(Number(d.workedHours) * 60);
  if (d.firstInAt && d.lastOutAt && d.lastOutAt > d.firstInAt) {
    return Math.round((d.lastOutAt.getTime() - d.firstInAt.getTime()) / 60_000);
  }
  return 0;
}

/**
 * Manager's view of the people they lead (division manager tree): today's
 * attendance, monthly timesheet and the live position during working hours.
 * Authority comes from the org chart, so queries run outside the branch scope.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly storage: StorageService,
    private readonly tracking: TrackingService,
  ) {}

  async list(user: AuthUser) {
    const { tenantId, ids } = await this.team(user);
    return runUnscoped(async () => {
      const now = new Date();
      const today = ymdInTz(now);
      const [members, days, devices] = await Promise.all([
        this.prisma.employee.findMany({
          where: { tenantId, id: { in: ids } },
          select: MEMBER_SELECT,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        this.prisma.attendanceDay.findMany({
          where: { tenantId, employeeId: { in: ids }, workDate: new Date(`${today}T00:00:00.000Z`) },
        }),
        this.activeDevices(tenantId, ids),
      ]);
      const dayBy = new Map(days.map((d) => [d.employeeId, d]));

      const items = await Promise.all(
        members.map(async (m) => {
          const window = await this.windowOf(tenantId, m, now);
          const day = dayBy.get(m.id);
          const device = devices.get(m.id);
          return {
            ...this.memberCard(m),
            today: {
              status: this.todayStatus(day?.status, window),
              firstIn: day?.firstInAt ?? null,
              lastOut: day?.lastOutAt ?? null,
              lateMinutes: day?.lateMinutes ?? 0,
            },
            workingNow: window.active,
            windowReason: window.reason,
            online: !!device?.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() < ONLINE_MS,
            batteryPct: device?.batteryPct ?? null,
            location: this.liveLocation(device, window),
          };
        }),
      );

      const count = (pred: (i: (typeof items)[number]) => boolean) => items.filter(pred).length;
      return {
        date: today,
        summary: {
          total: items.length,
          present: count((i) => i.today.status === 'on_time' || i.today.status === 'late'),
          late: count((i) => i.today.status === 'late'),
          absent: count((i) => i.today.status === 'absent'),
          notStarted: count((i) => i.today.status === 'not_started'),
          off: count((i) => ['day_off', 'holiday', 'leave'].includes(i.today.status)),
          workingNow: count((i) => i.workingNow),
          located: count((i) => !!i.location),
        },
        items,
      };
    });
  }

  async timesheet(user: AuthUser, employeeId: string, year?: number, month?: number) {
    const { tenantId } = await this.assertMember(user, employeeId);
    return runUnscoped(async () => {
      const now = new Date();
      const today = ymdInTz(now);
      const y = year && year > 2000 ? year : Number(today.slice(0, 4));
      const mo = month && month >= 1 && month <= 12 ? month : Number(today.slice(5, 7));
      const fromYmd = `${y}-${String(mo).padStart(2, '0')}-01`;
      const toYmd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);

      const [member, records, contexts] = await Promise.all([
        this.prisma.employee.findFirstOrThrow({ where: { tenantId, id: employeeId }, select: MEMBER_SELECT }),
        this.prisma.attendanceDay.findMany({
          where: {
            tenantId,
            employeeId,
            workDate: { gte: new Date(`${fromYmd}T00:00:00.000Z`), lte: new Date(`${toYmd}T00:00:00.000Z`) },
          },
        }),
        this.tracking.dayContexts(tenantId, employeeId, fromYmd, toYmd),
      ]);
      const schedule = this.tracking.scheduleInput(member.schedule);
      const recBy = new Map(records.map((r) => [r.workDate.toISOString().slice(0, 10), r]));
      const todayWindow = today >= fromYmd && today <= toYmd ? await this.windowOf(tenantId, member, now) : null;

      const days: {
        date: string;
        status: TeamDayStatus;
        plannedWork: boolean;
        firstIn: Date | null;
        lastOut: Date | null;
        lateMinutes: number;
        earlyLeaveMinutes: number;
        workedMinutes: number;
      }[] = [];
      for (let ymd = fromYmd; ymd <= toYmd; ymd = shiftYmd(ymd, 1)) {
        const rec = recBy.get(ymd);
        const off = dayOffReason(schedule, contexts.get(ymd) ?? { ymd });
        let status: TeamDayStatus;
        if (rec && rec.status !== DayStatus.not_started) status = rec.status;
        else if (off === 'absence') status = DayStatus.leave;
        else if (off === 'holiday') status = 'holiday';
        else if (off) status = DayStatus.day_off;
        else if (ymd > today) status = 'planned';
        else if (ymd === today && todayWindow) status = this.todayStatus(rec?.status, todayWindow);
        else status = DayStatus.absent;
        days.push({
          date: ymd,
          status,
          plannedWork: !off,
          firstIn: rec?.firstInAt ?? null,
          lastOut: rec?.lastOutAt ?? null,
          lateMinutes: rec?.lateMinutes ?? 0,
          earlyLeaveMinutes: rec?.earlyLeaveMinutes ?? 0,
          workedMinutes: rec ? workedMinutes(rec) : 0,
        });
      }

      const has = (s: TeamDayStatus) => days.filter((d) => d.status === s).length;
      const present = has(DayStatus.on_time) + has(DayStatus.late);
      const plannedToDate = days.filter((d) => d.plannedWork && d.date <= today).length;
      return {
        year: y,
        month: mo,
        employee: this.memberCard(member),
        days,
        summary: {
          planDays: days.filter((d) => d.plannedWork).length,
          plannedToDate,
          present,
          onTime: has(DayStatus.on_time),
          late: has(DayStatus.late),
          absent: has(DayStatus.absent),
          leave: has(DayStatus.leave),
          dayOff: has(DayStatus.day_off) + has('holiday'),
          lateMinutes: days.reduce((s, d) => s + d.lateMinutes, 0),
          earlyLeaveMinutes: days.reduce((s, d) => s + d.earlyLeaveMinutes, 0),
          workedMinutes: days.reduce((s, d) => s + d.workedMinutes, 0),
          attendanceRate: plannedToDate ? Math.round((present / plannedToDate) * 100) : null,
        },
      };
    });
  }

  /** Position is only disclosed while the employee is inside their working window. */
  async live(user: AuthUser, employeeId: string) {
    const { tenantId } = await this.assertMember(user, employeeId);
    return runUnscoped(async () => {
      const now = new Date();
      const [member, devices] = await Promise.all([
        this.prisma.employee.findFirstOrThrow({ where: { tenantId, id: employeeId }, select: MEMBER_SELECT }),
        this.activeDevices(tenantId, [employeeId]),
      ]);
      const window = await this.windowOf(tenantId, member, now);
      const device = devices.get(employeeId);
      const track =
        window.active && window.start
          ? await this.prisma.gpsTrackPoint.findMany({
              where: { tenantId, employeeId, recordedAt: { gte: window.start, lte: now } },
              orderBy: { recordedAt: 'asc' },
              select: { latitude: true, longitude: true, accuracyM: true, recordedAt: true },
              take: 3000,
            })
          : [];
      const path = track.length >= 2 ? await this.tracking.pathFor(track) : null;
      return {
        employee: this.memberCard(member),
        window: { active: window.active, reason: window.reason, start: window.start, end: window.end },
        device: device
          ? {
              model: device.model,
              state: device.state,
              batteryPct: device.batteryPct,
              charging: device.charging,
              lastSeenAt: device.lastSeenAt,
              online: !!device.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() < ONLINE_MS,
            }
          : null,
        location: this.liveLocation(device, window),
        track: track.map((p) => ({ lat: p.latitude, lng: p.longitude, accuracy: p.accuracyM, at: p.recordedAt })),
        /** Road-snapped line to draw instead of joining raw fixes; empty when there is nothing to draw. */
        route: (path?.segments ?? []).flatMap((s) => s.coords.map(([lat, lng]) => ({ lat, lng }))),
        distanceM: path?.distanceM ?? 0,
      };
    });
  }

  private async team(user: AuthUser) {
    const { tenantId, employee } = await this.me.requireEmployee(user);
    const ids = await this.me.subordinateIds(tenantId, employee.id);
    return { tenantId, ids };
  }

  private async assertMember(user: AuthUser, employeeId: string) {
    const { tenantId, ids } = await this.team(user);
    if (!ids.includes(employeeId)) {
      throw new ForbiddenException('Bu xodim sizning qo‘l ostingizda emas');
    }
    return { tenantId };
  }

  private async activeDevices(tenantId: string, ids: string[]) {
    const rows = await this.prisma.trackingDevice.findMany({
      where: { tenantId, employeeId: { in: ids }, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    const byEmployee = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, r);
    return byEmployee;
  }

  private async windowOf(tenantId: string, m: Member, now: Date): Promise<TrackingWindow> {
    const today = ymdInTz(now);
    const yesterday = shiftYmd(today, -1);
    const ctx = await this.tracking.dayContexts(tenantId, m.id, yesterday, today);
    return trackingWindow(
      now,
      this.tracking.scheduleInput(m.schedule),
      ctx.get(today) ?? { ymd: today },
      ctx.get(yesterday) ?? { ymd: yesterday },
    );
  }

  private todayStatus(recorded: DayStatus | undefined, window: TrackingWindow): TeamDayStatus {
    if (recorded && recorded !== DayStatus.not_started) return recorded;
    if (window.reason === 'absence') return DayStatus.leave;
    if (window.reason === 'holiday') return 'holiday';
    if (window.reason === 'day_off') return DayStatus.day_off;
    if (window.reason === 'after_end') return DayStatus.absent;
    return DayStatus.not_started;
  }

  private liveLocation(
    device: { lastLat: number | null; lastLng: number | null; lastAccuracy: number | null; lastFixAt: Date | null } | undefined,
    window: TrackingWindow,
  ) {
    if (!window.active || !device?.lastFixAt || device.lastLat == null || device.lastLng == null) return null;
    if (window.start && device.lastFixAt < window.start) return null;
    return {
      lat: device.lastLat,
      lng: device.lastLng,
      accuracy: device.lastAccuracy,
      at: device.lastFixAt,
    };
  }

  private memberCard(m: Member) {
    return {
      employeeId: m.id,
      fullName: [m.lastName, m.firstName, m.middleName].filter(Boolean).join(' '),
      tabNumber: m.tabNumber,
      phone: m.phone,
      position: m.position?.name ?? null,
      division: m.division?.name ?? null,
      photoUrl: photoRef(
        m.id,
        this.storage.mediaUrl(m.faceProfile?.photoKey, m.faceProfile?.photoUrl ?? m.person?.photoUrl),
      ),
      schedule: m.schedule
        ? { name: m.schedule.name, startTime: m.schedule.startTime, endTime: m.schedule.endTime }
        : null,
    };
  }
}
