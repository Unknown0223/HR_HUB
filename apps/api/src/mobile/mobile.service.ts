import { Injectable } from '@nestjs/common';
import { DayStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { MeService } from '../me/me.service';

const NEWS_DICTIONARY_CODE = 'news_feed';

type NewsItem = {
  id: string;
  code: string;
  title: string;
  body: string | null;
  publishedAt: string | null;
};

/**
 * Aggregates for the mobile client. Screens on a phone should not have to fan
 * out into five round-trips, so the home/calendar payloads are composed here.
 */
@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
  ) {}

  /**
   * Home screen payload. A user without a linked Employee row (e.g. the demo
   * tenant admin) still gets a usable screen instead of a 400.
   */
  async home(user: AuthUser) {
    const profile = await this.me.getProfile(user);
    const linked = !!profile.employee;

    const [today, requests, notifications, news] = await Promise.all([
      linked ? this.me.todayAttendance(user).catch(() => null) : null,
      linked
        ? this.me
            .listMyRequests(user)
            .catch(() => ({ absences: [], requests: [] }))
        : { absences: [], requests: [] },
      this.me.listNotifications(user, false).catch(() => []),
      this.news(user, 5).catch(() => [] as NewsItem[]),
    ]);

    const unread = Array.isArray(notifications)
      ? notifications.filter((n) => !(n as { readAt?: unknown }).readAt).length
      : 0;

    return {
      product: 'HR HUB',
      date: this.isoDate(new Date()),
      linked,
      profile,
      today,
      requests,
      news,
      notifications: {
        unread,
        items: Array.isArray(notifications) ? notifications.slice(0, 5) : [],
      },
      modules: this.modules(user),
    };
  }

  /**
   * Month grid for the calendar tab: one entry per day with status + times so
   * the client can colour cells without extra calls.
   */
  async calendar(user: AuthUser, year?: number, month?: number) {
    const now = new Date();
    const y = year && year > 1970 ? year : now.getFullYear();
    const m = month && month >= 1 && month <= 12 ? month : now.getMonth() + 1;

    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const resolved = await this.me.resolveEmployee(user);
    if (!resolved.employee) {
      return { year: y, month: m, linked: false, days: [], totals: null };
    }

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId: resolved.tenantId,
        employeeId: resolved.employee.id,
        workDate: { gte: from, lt: to },
      },
      orderBy: { workDate: 'asc' },
    });

    const totals = {
      onTime: days.filter((d) => d.status === DayStatus.on_time).length,
      late: days.filter((d) => d.status === DayStatus.late).length,
      absent: days.filter((d) => d.status === DayStatus.absent).length,
      dayOff: days.filter((d) => d.status === DayStatus.day_off).length,
      leave: days.filter((d) => d.status === DayStatus.leave).length,
      lateMinutes: days.reduce((sum, d) => sum + (d.lateMinutes ?? 0), 0),
    };

    return {
      year: y,
      month: m,
      linked: true,
      days: days.map((d) => ({
        // `work_date` is a DATE column: Prisma hands it back as UTC midnight.
        date: d.workDate.toISOString().slice(0, 10),
        status: d.status,
        firstIn: d.firstInAt,
        lastOut: d.lastOutAt,
        lateMinutes: d.lateMinutes,
      })),
      totals,
    };
  }

  /**
   * Employee timesheet («tabel») for one month: day grid + marks + totals.
   */
  async tabel(user: AuthUser, year?: number, month?: number) {
    const cal = await this.calendar(user, year, month);
    if (!cal.linked) {
      return {
        product: 'HR HUB',
        ...cal,
        marks: [],
        summary: {
          workDays: 0,
          presentDays: 0,
          lateDays: 0,
          absentDays: 0,
          lateMinutes: 0,
        },
      };
    }

    const y = cal.year as number;
    const m = cal.month as number;
    const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
    const marksPage = await this.me.listMarks(user, from, to);
    const marks = Array.isArray(marksPage)
      ? marksPage
      : ((marksPage as { items?: unknown[] }).items ?? []);

    const days = (cal.days as { status: DayStatus }[]) ?? [];
    const presentStatuses: DayStatus[] = [DayStatus.on_time, DayStatus.late];
    const summary = {
      workDays: days.filter((d) => d.status !== DayStatus.day_off).length,
      presentDays: days.filter((d) => presentStatuses.includes(d.status)).length,
      lateDays: days.filter((d) => d.status === DayStatus.late).length,
      absentDays: days.filter((d) => d.status === DayStatus.absent).length,
      lateMinutes: (cal.totals as { lateMinutes?: number } | null)?.lateMinutes ?? 0,
    };

    return {
      product: 'HR HUB',
      ...cal,
      marks,
      summary,
    };
  }

  /** News feed = `news_feed` dictionary items maintained in Настройки → Главное. */
  async news(user: AuthUser, limit = 30): Promise<NewsItem[]> {
    if (!user.tenantId) return [];
    const dict = await this.prisma.dictionary.findUnique({
      where: {
        tenantId_code: {
          tenantId: user.tenantId,
          code: NEWS_DICTIONARY_CODE,
        },
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'desc' }, { code: 'desc' }],
          take: limit,
        },
      },
    });
    if (!dict) return [];

    return dict.items.map((item) => {
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      return {
        id: item.id,
        code: item.code,
        title: item.name,
        body: typeof meta.body === 'string' ? meta.body : null,
        publishedAt:
          typeof meta.publishedAt === 'string' ? meta.publishedAt : null,
      };
    });
  }

  /** Module tiles («Modullar») — mirrors what the role is allowed to open. */
  private modules(user: AuthUser) {
    const approver = ['platform_admin', 'tenant_admin', 'hr', 'manager'].includes(
      user.role,
    );
    return [
      { key: 'attendance', label: 'Qatnashish', icon: 'running' },
      { key: 'face', label: 'Face ID', icon: 'face' },
      { key: 'tabel', label: 'Tabel', icon: 'table' },
      { key: 'requests', label: "So'rovlar", icon: 'clipboard-list' },
      ...(approver
        ? [{ key: 'team', label: 'Jamoa', icon: 'users' }]
        : []),
      { key: 'payroll', label: "To'lov", icon: 'money-check-alt' },
    ];
  }

  private isoDate(value: Date) {
    return new Date(
      value.getTime() - value.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);
  }
}
