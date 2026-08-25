/** First punch = приход, last official = уход; middle = такминий уход. Day sheet runs until 23:59. */

export function startOfLocalDay(when: Date): Date {
  const d = new Date(when);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(when: Date): Date {
  const d = startOfLocalDay(when);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseHmToDate(workDate: Date, hm: string): Date {
  const [h, m] = String(hm || '18:00')
    .split(':')
    .map((x) => Number(x) || 0);
  const d = new Date(workDate);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
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
