import type { ScheduleSettings, WeekPattern } from '../attendance/schedule-settings';

const TZ_OFFSET = '+05:00';
/** yearGrid cells that mean "not a working day" (Cyrillic В, Latin B, R = rest). */
const OFF_CELLS = new Set(['В', 'B', 'R', '0']);

export type CalendarDayType = 'holiday' | 'day_off' | 'transfer' | 'short_day' | 'workday';

export type DayContext = {
  ymd: string;
  calendarDayType?: CalendarDayType | null;
  onAbsence?: boolean;
};

export type ScheduleInput = {
  startTime?: string | null;
  endTime?: string | null;
  settings: ScheduleSettings;
};

export type TrackingWindowReason =
  | 'working'
  | 'day_off'
  | 'holiday'
  | 'absence'
  | 'before_start'
  | 'after_end';

export type TrackingWindow = {
  active: boolean;
  reason: TrackingWindowReason;
  start: Date | null;
  end: Date | null;
  /** When the phone should ask again (window edge, or a periodic recheck). */
  recheckAt: Date;
};

export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hmMinutes(hm: string | null | undefined, fallback: string): number {
  const [h, m] = String(hm || fallback)
    .split(':')
    .map((x) => Number(x) || 0);
  return h * 60 + m;
}

function atMinutes(ymd: string, minutes: number): Date {
  return new Date(new Date(`${ymd}T00:00:00${TZ_OFFSET}`).getTime() + minutes * 60_000);
}

function isOffByPattern(ymd: string, pattern: WeekPattern): boolean {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (pattern === '6/1') return dow === 0;
  return dow === 0 || dow === 6;
}

/** Schedule grid beats production calendar, which beats the weekly pattern. */
export function dayOffReason(
  schedule: ScheduleInput,
  day: DayContext,
): 'day_off' | 'holiday' | 'absence' | null {
  if (day.onAbsence) return 'absence';
  const cell = schedule.settings.yearGrid?.[day.ymd];
  if (cell != null && String(cell).trim() !== '') {
    return OFF_CELLS.has(String(cell).trim()) ? 'day_off' : null;
  }
  if (day.calendarDayType === 'holiday') return 'holiday';
  if (day.calendarDayType === 'day_off') return 'day_off';
  if (day.calendarDayType) return null;
  return isOffByPattern(day.ymd, schedule.settings.weekPattern ?? '6/1') ? 'day_off' : null;
}

/** Shift bounds for a work day, widened by the schedule's arrival-before / leave-after allowances. */
export function shiftBounds(schedule: ScheduleInput, ymd: string): { start: Date; end: Date } {
  const s = schedule.settings;
  const before = (s.arrivalBeforeHours ?? 0) * 60 + (s.arrivalBeforeMinutes ?? 0);
  const after = (s.leaveAfterHours ?? 0) * 60 + (s.leaveAfterMinutes ?? 0);
  const startMin = hmMinutes(schedule.startTime, '09:00');
  let endMin = hmMinutes(schedule.endTime, '18:00');
  if (endMin <= startMin) endMin += 24 * 60;
  return {
    start: atMinutes(ymd, startMin - before),
    end: atMinutes(ymd, endMin + after),
  };
}

/**
 * Is `now` inside the employee's working time? Yesterday is also checked so an
 * overnight shift keeps tracking after midnight.
 */
export function trackingWindow(
  now: Date,
  schedule: ScheduleInput,
  today: DayContext,
  yesterday: DayContext,
  recheckMinutes = 30,
): TrackingWindow {
  const periodic = new Date(now.getTime() + recheckMinutes * 60_000);
  const minDate = (a: Date, b: Date) => (a.getTime() < b.getTime() ? a : b);

  if (!dayOffReason(schedule, yesterday)) {
    const y = shiftBounds(schedule, yesterday.ymd);
    if (now >= y.start && now < y.end) {
      return { active: true, reason: 'working', start: y.start, end: y.end, recheckAt: minDate(y.end, periodic) };
    }
  }

  const off = dayOffReason(schedule, today);
  if (off) {
    return { active: false, reason: off, start: null, end: null, recheckAt: periodic };
  }
  const t = shiftBounds(schedule, today.ymd);
  if (now < t.start) {
    return { active: false, reason: 'before_start', start: t.start, end: t.end, recheckAt: minDate(t.start, periodic) };
  }
  if (now >= t.end) {
    return { active: false, reason: 'after_end', start: t.start, end: t.end, recheckAt: periodic };
  }
  return { active: true, reason: 'working', start: t.start, end: t.end, recheckAt: minDate(t.end, periodic) };
}