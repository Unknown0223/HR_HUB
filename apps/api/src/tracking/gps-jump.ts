import { NotificationKind, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { findJump, type Jump, type RawPoint } from './track-geometry';

const JUMP_ALERT_DEDUPE_MS = 10 * 60_000;
/** Older fixes cannot contradict a new one: hours of silence explain any distance. */
const PREVIOUS_FIX_MAX_AGE_MS = 2 * 60 * 60_000;

/** Last stored fix before `before`, as the baseline for an impossible-move check. */
export async function previousFix(
  prisma: PrismaService,
  tenantId: string,
  employeeId: string,
  before: Date,
): Promise<RawPoint | null> {
  const p = await prisma.gpsTrackPoint.findFirst({
    where: {
      tenantId,
      employeeId,
      recordedAt: { lt: before, gte: new Date(before.getTime() - PREVIOUS_FIX_MAX_AGE_MS) },
    },
    orderBy: { recordedAt: 'desc' },
    select: { latitude: true, longitude: true, accuracyM: true, recordedAt: true },
  });
  return p
    ? { lat: p.latitude, lng: p.longitude, at: p.recordedAt.getTime(), accuracy: p.accuracyM, speed: null }
    : null;
}

/**
 * Checks new fixes (background points or a punch) against the employee's last known one and,
 * on an impossible move, files a `gps_jump` problem mark and alerts approvers. Never throws:
 * it must not break the upload or punch it guards.
 */
export async function checkGpsJump(
  deps: { prisma: PrismaService; notifications: NotificationsService },
  args: {
    tenantId: string;
    employeeId: string;
    employeeName: string;
    source: 'background_tracking' | 'punch';
    points: RawPoint[];
    markId?: string;
  },
): Promise<Jump | null> {
  try {
    if (!args.points.length) return null;
    const earliest = Math.min(...args.points.map((p) => p.at));
    const prev = await previousFix(deps.prisma, args.tenantId, args.employeeId, new Date(earliest));
    const jump = findJump(prev, args.points);
    if (!jump) return null;

    const recent = await deps.prisma.problemMark.findFirst({
      where: {
        tenantId: args.tenantId,
        reason: 'gps_jump',
        createdAt: { gte: new Date(Date.now() - JUMP_ALERT_DEDUPE_MS) },
        payload: { path: ['employeeId'], equals: args.employeeId },
      },
      select: { id: true },
    });
    if (recent) return jump;

    await deps.prisma.problemMark.create({
      data: {
        tenantId: args.tenantId,
        reason: 'gps_jump',
        payload: {
          employeeId: args.employeeId,
          employeeName: args.employeeName,
          source: args.source,
          markId: args.markId ?? null,
          distanceM: jump.distanceM,
          minutes: jump.minutes,
          speedKmh: jump.speedKmh,
          from: { lat: jump.from.lat, lng: jump.from.lng, at: new Date(jump.from.at).toISOString() },
          to: { lat: jump.to.lat, lng: jump.to.lng, at: new Date(jump.to.at).toISOString() },
        } as Prisma.InputJsonValue,
      },
    });
    const km = (jump.distanceM / 1000).toFixed(1);
    await deps.notifications.notifyApprovers(args.tenantId, {
      kind: NotificationKind.alert,
      title: `Shubhali GPS sakrash: ${args.employeeName}`,
      body:
        `${jump.minutes} daqiqada ${km} km (~${jump.speedKmh} km/soat) — jismonan imkonsiz. ` +
        (args.source === 'punch'
          ? 'Belgi qo‘yilgan joy fondagi oxirgi lokatsiyaga mos kelmaydi.'
          : 'Soxta lokatsiya ehtimoli bor.'),
      entity: 'employee',
      entityId: args.employeeId,
    });
    return jump;
  } catch {
    return null;
  }
}
