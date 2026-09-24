/** First punch = приход, last official = уход; middle = такминий уход. Day sheet runs until 23:59. */

/** Org timezone — Railway API host is usually UTC. */
export const ATTENDANCE_TZ = 'Asia/Tashkent';
const TZ_OFFSET = '+05:00'; // Asia/Tashkent has no DST

export function ymdInTz(when: Date, timeZone = ATTENDANCE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

/**
 * Calendar date for Prisma `@db.Date` columns.
 * Always UTC midnight of the org Y-M-D so PG stores the correct day.
 */
export function workDateOnly(when: Date): Date {
  const ymd = ymdInTz(when);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Org midnight for the calendar day containing `when` (mark query lower bound). */
export function startOfLocalDay(when: Date): Date {
  const ymd = ymdInTz(when);
  return new Date(`${ymd}T00:00:00${TZ_OFFSET}`);
}

export function endOfLocalDay(when: Date): Date {
  return new Date(startOfLocalDay(when).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Next org midnight (exclusive upper bound for mark queries). */
export function startOfNextLocalDay(when: Date): Date {
  return new Date(startOfLocalDay(when).getTime() + 24 * 60 * 60 * 1000);
}

export function parseHmToDate(workDate: Date, hm: string): Date {
  const [h, m] = String(hm || '18:00')
    .split(':')
    .map((x) => Number(x) || 0);
  const ymd = ymdInTz(workDate);
  const hh = String(h || 0).padStart(2, '0');
  const mi = String(m || 0).padStart(2, '0');
  return new Date(`${ymd}T${hh}:${mi}:00${TZ_OFFSET}`);
}

export type DayMarkRole = 'in' | 'out' | 'estimated_out';

export function isAttendanceDayClosed(now: Date, workDate: Date, scheduleEndHm: string): boolean {
  const dayEnd = endOfLocalDay(workDate);
  if (now.getTime() >= dayEnd.getTime()) return true;
  const schedEnd = parseHmToDate(startOfLocalDay(workDate), scheduleEndHm);
  return now.getTime() >= schedEnd.getTime();
}

/** Official last-out only after schedule end or 23:59, and only if there are 2+ marks. */
export function officialLastOutEnabled(
  markCount: number,
  now: Date,
  workDate: Date,
  scheduleEndHm: string,
): boolean {
  if (markCount < 2) return false;
  return isAttendanceDayClosed(now, workDate, scheduleEndHm);
}

export function roleForDayMark(
  index: number,
  total: number,
  lastOutOfficial: boolean,
): DayMarkRole {
  if (total <= 0) return 'in';
  if (index === 0) return 'in';
  if (index === total - 1 && lastOutOfficial) return 'out';
  return 'estimated_out';
}
