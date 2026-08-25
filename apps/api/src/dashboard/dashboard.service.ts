import { BadRequestException, Injectable } from '@nestjs/common';
import { DayStatus, EmploymentStatus, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

function fmtTime(d: Date | null | undefined) {
  if (!d) return null;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
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
  const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new BadRequestException('Invalid date');
  }
  const day = new Date(base);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Local calendar YYYY-MM-DD — never use toISOString() (UTC shifts the day in UTC+). */
function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

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
          occurredAt: { gte: today, lt: nextDay },
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
        where: { tenantId, occurredAt: { gte: today, lt: nextDay } },
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
    };

    const onTime: Row[] = [];
    const lateOrEarly: Row[] = [];
    const absent: Row[] = [];
    const notStarted: Row[] = [];
    const dayOff: Row[] = [];
    const leave: Row[] = [];

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
        schedule: { select: { endTime: true } },
        faceProfile: { select: { photoUrl: true, photoKey: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const dayByEmp = new Map(days.map((d) => [d.employeeId, d]));
    const now = new Date();
    const viewingToday = toLocalYmd(today) === toLocalYmd(now);
    const workdayOpen = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0);
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

    for (const emp of employees) {
      const d = dayByEmp.get(emp.id);
      const status = (d?.status as DayStatus | undefined) ?? missingStatus;
      const row: Row = {
        employeeId: emp.id,
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
      };

      const endHm = emp.schedule?.endTime ?? d?.employee.schedule?.endTime ?? '18:00';
      const endMin = parseHm(endHm);
      let earlyOut = false;
      if (d?.lastOutAt) {
        const outMin = d.lastOutAt.getHours() * 60 + d.lastOutAt.getMinutes();
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
