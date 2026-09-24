import { BadRequestException, Injectable } from '@nestjs/common';
import { DayStatus, EmploymentStatus, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { minutesOfDay } from '../attendance/attendance-day';

/** Railway/API often runs in UTC — always show org local time (Tashkent). */
const APP_TZ = 'Asia/Tashkent';

function fmtTime(d: Date | null | undefined) {
  if (!d) return null;
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: APP_TZ,
  });
}

function parseHm(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fullName(e: {
  lastName: string;
  firstName: string;
  middleName: string | null;
}) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function parseIdList(raw?: string | string[]): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(',');
  return parts.map((s) => s.trim()).filter(Boolean);
}

function parseDay(dateStr?: string): Date {
  // UTC midnight of org Y-M-D — matches Prisma @db.Date / AttendanceDay.workDate
  const ymd =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : toLocalYmd(new Date());
  const day = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    throw new BadRequestException('Invalid date');
  }
  return day;
}

function markBoundsForYmd(ymd: string): { start: Date; end: Date } {
  const start = new Date(`${ymd}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Org calendar YYYY-MM-DD in Asia/Tashkent (API host may be UTC). */
function toLocalYmd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type DashboardStatsFilters = {
  date?: string;
  divisionIds?: string | string[];
  positionIds?: string | string[];
  scheduleIds?: string | string[];
  gradeIds?: string | string[];
  locationIds?: string | string[];
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new BadRequestException('Tenant required');
    return tenantId;
  }

  async stats(tenantId: string, filters: DashboardStatsFilters = {}) {
    const today = parseDay(filters.date);
    const ymd = today.toISOString().slice(0, 10);
    const { start: markFrom, end: markTo } = markBoundsForYmd(ymd);

    const divisionIds = parseIdList(filters.divisionIds);
    const positionIds = parseIdList(filters.positionIds);
    const scheduleIds = parseIdList(filters.scheduleIds);
    const gradeIds = parseIdList(filters.gradeIds);
    const locationIds = parseIdList(filters.locationIds);

    const employeeWhere: Prisma.EmployeeWhereInput = {
      tenantId,
      status: EmploymentStatus.active,
      NOT: {
        accessGrants: {
          some: {
            accessType: 'profile_flag',
            resource: 'exclude_from_stats',
            isActive: true,
          },
        },
      },
    };
    if (divisionIds.length) employeeWhere.divisionId = { in: divisionIds };
    if (positionIds.length) employeeWhere.positionId = { in: positionIds };
    if (scheduleIds.length) employeeWhere.scheduleId = { in: scheduleIds };
    if (gradeIds.length) employeeWhere.gradeId = { in: gradeIds };
    if (locationIds.length) {
      employeeWhere.marks = {
        some: {
          tenantId,
          occurredAt: { gte: markFrom, lt: markTo },
          device: { locationId: { in: locationIds } },
        },
      };
    }

    const [
      headcount,
      dismissed,
      gph,
      days,
      pendingRequests,
      pendingAbsences,
      devicesOnline,
      devicesTotal,
      marksToday,
      problems,
      divisions,
      birthEmployees,
    ] = await Promise.all([
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.employee.count({
        where: { tenantId, status: EmploymentStatus.dismissed },
      }),
      this.prisma.employee.count({
        where: { tenantId, employmentType: 'gph', status: EmploymentStatus.active },
      }),
      this.prisma.attendanceDay.findMany({
        where: {
          tenantId,
          workDate: today,
          employee: employeeWhere,
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              tabNumber: true,
              schedule: { select: { endTime: true } },
            },
          },
        },
        orderBy: { firstInAt: 'asc' },
      }),
      this.prisma.hrRequest.count({
        where: { tenantId, status: RequestStatus.pending },
      }),
      this.prisma.absence.count({
        where: { tenantId, status: RequestStatus.pending },
      }),
      this.prisma.device.count({ where: { tenantId, status: 'online' } }),
      this.prisma.device.count({ where: { tenantId } }),
      this.prisma.attendanceMark.count({
        where: { tenantId, occurredAt: { gte: markFrom, lt: markTo } },
      }),
      this.prisma.problemMark.count({ where: { tenantId, resolved: false } }),
      this.prisma.division.count({ where: { tenantId, isActive: true } }),
      this.prisma.employee.findMany({
        where: {
          tenantId,
          status: EmploymentStatus.active,
          person: { birthDate: { not: null } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          tabNumber: true,
          position: { select: { name: true } },
          person: { select: { birthDate: true } },
          faceProfile: { select: { photoUrl: true, photoKey: true } },
        },
      }),
    ]);

    const pct = (n: number) =>
      headcount ? Math.round((n / headcount) * 1000) / 10 : 0;

    type Row = {
      employeeId: string;
      id: string;
      fullName: string;
      lastName: string;
      firstName: string;
      middleName: string | null;
      tabNumber: string;
      photoUrl: string | null;
      firstIn: string | null;
      lastOut: string | null;
      status: string;
      note?: string;
      email: string | null;
      phone: string | null;
      position: string | null;
      division: string | null;
      grade: string | null;
      region: string | null;
      schedule: string | null;
      manager: string | null;
      hiredAt: string | null;
      birthDate: string | null;
      gender: string | null;
      pinfl: string | null;
      inn: string | null;
      inps: string | null;
      code: string | null;
      addressResidence: string | null;
      addressPostal: string | null;
      bankAccount: string | null;
      employmentType: string | null;
      workStatus: string | null;
      login: string | null;
      telegram: string | null;
      fax: string | null;
      site: string | null;
      fingerprints: string | null;
      accessLevel: string | null;
      arrivalLocation: string | null;
      distanceKm: number | null;
    };

    const onTime: Row[] = [];
    const lateOrEarly: Row[] = [];
    const absent: Row[] = [];
    const notStarted: Row[] = [];
    const dayOff: Row[] = [];
    const leave: Row[] = [];

    // Slim select: dashboard table needs identity + org fields, not full PII/docs.
    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        tabNumber: true,
        email: true,
        phone: true,
        status: true,
        employmentType: true,
        hiredAt: true,
        schedule: { select: { name: true, endTime: true } },
        position: { select: { name: true } },
        division: {
          select: {
            name: true,
            manager: {
              select: { firstName: true, lastName: true, middleName: true },
            },
          },
        },
        grade: { select: { name: true } },
        region: { select: { name: true } },
        person: {
          select: {
            birthDate: true,
            gender: true,
          },
        },
        faceProfile: { select: { photoUrl: true, photoKey: true } },
        marks: {
          where: { occurredAt: { gte: markFrom, lt: markTo } },
          orderBy: { occurredAt: 'asc' },
          take: 1,
          select: {
            device: { select: { location: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const dayByEmp = new Map(days.map((d) => [d.employeeId, d]));
    const now = new Date();
    const viewingToday = toLocalYmd(today) === toLocalYmd(now);
    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const nowH = Number(nowParts.find((p) => p.type === 'hour')?.value || 0);
    const nowM = Number(nowParts.find((p) => p.type === 'minute')?.value || 0);
    const workdayOpen = nowH > 9 || (nowH === 9 && nowM > 0);
    const missingStatus =
      viewingToday && !workdayOpen ? DayStatus.not_started : DayStatus.absent;

    const byStatus = {
      on_time: 0,
      late: 0,
      absent: 0,
      not_started: 0,
      leave: 0,
      day_off: 0,
    };

    const employmentTypeLabel = (t: string | null | undefined) => {
      if (t === 'gph') return 'ГПХ';
      if (t === 'staff') return 'Штатный';
      return t || null;
    };
    const workStatusLabel = (s: string | null | undefined) => {
      if (s === 'active') return 'Работает';
      if (s === 'dismissed') return 'Уволен';
      if (s === 'leave') return 'В отпуске';
      return s || null;
    };
    const genderLabel = (g: string | null | undefined) => {
      if (!g) return null;
      const low = g.toLowerCase();
      if (low === 'm' || low === 'male' || low === 'муж' || low === 'мужской') return 'Мужской';
      if (low === 'f' || low === 'female' || low === 'жен' || low === 'женский') return 'Женский';
      return g;
    };

    for (const emp of employees) {
      const d = dayByEmp.get(emp.id);
      const status = (d?.status as DayStatus | undefined) ?? missingStatus;
      const firstMark = emp.marks[0];
      const mgr = emp.division?.manager;
      const row: Row = {
        employeeId: emp.id,
        id: emp.id,
        fullName: fullName(emp),
        lastName: emp.lastName,
        firstName: emp.firstName,
        middleName: emp.middleName,
        tabNumber: emp.tabNumber,
        email: emp.email || null,
        phone: emp.phone || null,
        photoUrl: this.storage.mediaUrl(
          emp.faceProfile?.photoKey,
          emp.faceProfile?.photoUrl,
        ),
        firstIn: fmtTime(d?.firstInAt),
        lastOut: fmtTime(d?.lastOutAt),
        status,
        position: emp.position?.name || null,
        division: emp.division?.name || null,
        grade: emp.grade?.name || null,
        region: emp.region?.name || null,
        schedule: emp.schedule?.name || null,
        manager: mgr ? fullName(mgr) : null,
        hiredAt: emp.hiredAt ? toLocalYmd(emp.hiredAt) : null,
        birthDate: emp.person?.birthDate ? toLocalYmd(emp.person.birthDate) : null,
        gender: genderLabel(emp.person?.gender),
        pinfl: null,
        inn: null,
        inps: null,
        code: null,
        addressResidence: null,
        addressPostal: null,
        bankAccount: null,
        employmentType: employmentTypeLabel(emp.employmentType),
        workStatus: workStatusLabel(emp.status),
        login: null,
        telegram: null,
        fax: null,
        site: null,
        fingerprints: null,
        accessLevel: null,
        arrivalLocation: firstMark?.device?.location?.name || null,
        distanceKm: null,
      };

      const endHm = emp.schedule?.endTime ?? d?.employee.schedule?.endTime ?? '18:00';
      const endMin = parseHm(endHm);
      let earlyOut = false;
      if (d?.lastOutAt) {
        const outMin = minutesOfDay(d.lastOutAt);
        if (outMin + 5 < endMin) {
          earlyOut = true;
          row.note = 'Ertaroq chiqdi';
        }
      }

      byStatus[status] = (byStatus[status] ?? 0) + 1;

      if (status === DayStatus.on_time && !earlyOut) {
        onTime.push(row);
      } else if (status === DayStatus.late || earlyOut) {
        if (status === DayStatus.late) row.note = 'Kechikkan';
        lateOrEarly.push(row);
      } else if (status === DayStatus.not_started) {
        notStarted.push(row);
      } else if (status === DayStatus.absent) {
        absent.push(row);
      } else if (status === DayStatus.day_off) {
        dayOff.push(row);
      } else if (status === DayStatus.leave) {
        leave.push(row);
      } else {
        notStarted.push(row);
      }
    }

    const present = byStatus.on_time + byStatus.late;

    const month = today.getMonth();
    const dayOfMonth = today.getDate();
    const birthdays = birthEmployees
      .map((e) => {
        const bd = e.person?.birthDate;
        if (!bd) return null;
        const bMonth = bd.getUTCMonth();
        const bDay = bd.getUTCDate();
        let delta = bDay - dayOfMonth;
        if (bMonth !== month) {
          // include ±7 days across month boundary via day-of-year approx
          const thisYear = new Date(Date.UTC(today.getFullYear(), bMonth, bDay));
          const todayUtc = new Date(
            Date.UTC(today.getFullYear(), month, dayOfMonth),
          );
          delta = Math.round((thisYear.getTime() - todayUtc.getTime()) / 86400000);
          if (delta < -3) {
            const nextYear = new Date(
              Date.UTC(today.getFullYear() + 1, bMonth, bDay),
            );
            delta = Math.round((nextYear.getTime() - todayUtc.getTime()) / 86400000);
          }
        }
        if (delta < -1 || delta > 14) return null;
        return {
          employeeId: e.id,
          fullName: fullName(e),
          tabNumber: e.tabNumber,
          position: e.position?.name || '',
          photoUrl: this.storage.mediaUrl(
            e.faceProfile?.photoKey,
            e.faceProfile?.photoUrl,
          ),
          birthDate: toLocalYmd(bd),
          day: bDay,
          month: bMonth + 1,
          daysUntil: delta,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.daysUntil - b.daysUntil || a.fullName.localeCompare(b.fullName));

    return {
      date: toLocalYmd(today),
      filters: {
        divisionIds,
        positionIds,
        scheduleIds,
        gradeIds,
        locationIds,
      },
      headcount,
      dismissed,
      gph,
      divisions,
      attendance: {
        ...byStatus,
        present,
        checkedIn: days.length,
        marksToday,
        pctOnTime: pct(byStatus.on_time),
        pctLate: pct(byStatus.late),
        pctAbsent: pct(byStatus.absent),
        pctNotStarted: pct(byStatus.not_started),
      },
      lists: {
        onTime,
        lateOrEarly,
        absent,
        notStarted,
        dayOff,
        leave,
      },
      birthdays,
      devices: { online: devicesOnline, total: devicesTotal },
      workflow: {
        pendingRequests,
        pendingAbsences,
        openProblems: problems,
      },
    };
  }
}
