/** Verifix «Графики работы» settings stored on WorkSchedule.settings */

export type WeekPattern = '6/1' | '5/1' | '5/2';

export type ScheduleKind =
  | 'ordinary'
  | 'hourly'
  | 'advanced'
  | 'multi_shift'
  | 'advanced_multi_shift';

export type ScheduleSettings = {
  year?: number;
  /** 6/1 = only Sunday off; 5/1 & 5/2 = Sat+Sun off */
  weekPattern?: WeekPattern;
  /** Early-leave grace (Уход, минут) */
  graceOutMinutes?: number;
  autoProdCalendar?: boolean;
  /** e.g. first_in_first_out | first_in_last_out */
  intervalType?: string;
  trackMarksSchedule?: boolean;
  hourly?: boolean;
  freeTime?: boolean;
  trackLate?: boolean;
  trackEarly?: boolean;
  trackAbsent?: boolean;
  byLocation?: boolean;
  advancedLateEarly?: boolean;
  /** Дозволено ≈ loyal (grace before late); Строго = late from raw start */
  delayMode?: 'allowed' | 'strict';
  lateInGraceZone?: boolean;
  addAttendanceInGrace?: boolean;
  /** Planned hours shown in grid cells (default 8) */
  dayNormHours?: number;
  /**
   * Optional per-day overrides: key YYYY-MM-DD → "8" | "В" | "D" | "R" | "" | custom
   */
  yearGrid?: Record<string, string>;
  /** Max workday duration HH:MM */
  maxWorkdayDuration?: string;
  /** Day shift boundary HH:MM */
  dayShiftTime?: string;
  arrivalBeforeHours?: number;
  arrivalBeforeMinutes?: number;
  leaveAfterHours?: number;
  leaveAfterMinutes?: number;
  trackMarksHours?: number;
  trackMarksMinutes?: number;
  useNormAsDailyLimit?: boolean;
  groupMarksByTime?: boolean;
  disableFactCalc?: boolean;
  enableGpsMap?: boolean;
  markRestrictions?: boolean;
};

export const DEFAULT_SCHEDULE_SETTINGS: Required<
  Pick<
    ScheduleSettings,
    | 'weekPattern'
    | 'graceOutMinutes'
    | 'autoProdCalendar'
    | 'intervalType'
    | 'trackLate'
    | 'trackEarly'
    | 'trackAbsent'
    | 'delayMode'
    | 'dayNormHours'
    | 'freeTime'
    | 'maxWorkdayDuration'
    | 'dayShiftTime'
    | 'trackMarksHours'
  >
> = {
  weekPattern: '6/1',
  graceOutMinutes: 0,
  autoProdCalendar: false,
  intervalType: 'first_in_first_out',
  trackLate: true,
  trackEarly: true,
  trackAbsent: true,
  delayMode: 'allowed',
  dayNormHours: 8,
  freeTime: true,
  maxWorkdayDuration: '12:00',
  dayShiftTime: '00:00',
  trackMarksHours: 24,
};

export function parseScheduleSettings(raw: unknown): ScheduleSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ScheduleSettings;
}

export function mergeScheduleSettings(
  raw: unknown,
  patch?: ScheduleSettings | null,
): ScheduleSettings {
  return { ...DEFAULT_SCHEDULE_SETTINGS, ...parseScheduleSettings(raw), ...(patch ?? {}) };
}

/** JS getDay(): 0=Sun … 6=Sat */
export function isDayOffByPattern(date: Date, pattern: WeekPattern = '6/1'): boolean {
  const day = date.getDay();
  if (pattern === '6/1') return day === 0;
  return day === 0 || day === 6;
}

export function dayKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Cell value when filling year grid for a schedule kind */
export function fillCellForKind(
  kind: ScheduleKind,
  isOff: boolean,
  dayNormHours = 8,
): string {
  const norm = String(dayNormHours);
  switch (kind) {
    case 'advanced':
      return isOff ? 'R' : 'D';
    case 'ordinary':
    case 'advanced_multi_shift':
      return isOff ? 'В' : norm;
    case 'hourly':
    case 'multi_shift':
      return isOff ? 'В' : norm;
    default:
      return isOff ? 'В' : norm;
  }
}

export function buildYearGrid(
  year: number,
  pattern: WeekPattern,
  dayNormHours = 8,
  kind: ScheduleKind = 'ordinary',
): Record<string, string> {
  const grid: Record<string, string> = {};
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(year, mi, d);
      grid[dayKey(year, mi, d)] = fillCellForKind(
        kind,
        isDayOffByPattern(dt, pattern),
        dayNormHours,
      );
    }
  }
  return grid;
}

/** Empty / initial grid (all day-off style) matching Verifix create screens */
export function emptyYearGrid(year: number, kind: ScheduleKind): Record<string, string> {
  const grid: Record<string, string> = {};
  const off =
    kind === 'advanced' ? 'R' : kind === 'hourly' || kind === 'multi_shift' ? '8' : 'В';
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      grid[dayKey(year, mi, d)] = off;
    }
  }
  return grid;
}

/** Extract day-of-month map for a month from yearGrid or pattern settings. */
export function monthDaysFromSchedule(opts: {
  year: number;
  monthIndex: number;
  settings?: ScheduleSettings | null;
  kind?: ScheduleKind;
  startTime?: string;
  endTime?: string;
  displayAsTimeRange?: boolean;
}): Record<string, string> {
  const kind = opts.kind || 'ordinary';
  const pattern = opts.settings?.weekPattern || '5/2';
  const norm = opts.settings?.dayNormHours ?? 8;
  const yearGrid = opts.settings?.yearGrid;
  const dim = new Date(Date.UTC(opts.year, opts.monthIndex + 1, 0)).getUTCDate();
  const days: Record<string, string> = {};
  for (let d = 1; d <= dim; d++) {
    const key = dayKey(opts.year, opts.monthIndex, d);
    let cell = yearGrid?.[key];
    if (cell == null || cell === '') {
      const dt = new Date(opts.year, opts.monthIndex, d);
      cell = fillCellForKind(kind, isDayOffByPattern(dt, pattern), norm);
    }
    if (opts.displayAsTimeRange && cell !== 'В' && cell !== 'R' && /^\d+(\.\d+)?$/.test(cell)) {
      days[String(d)] = `${opts.startTime || '09:00'}-${opts.endTime || '18:00'}`;
    } else {
      days[String(d)] = cell;
    }
  }
  return days;
}

export function parseHm(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  return { h, m };
}

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  ordinary: 'Обычный',
  hourly: 'По-часовой',
  advanced: 'Продвинутый',
  multi_shift: 'Многосменный',
  advanced_multi_shift: 'Продвинутый многосменный',
};

export function isScheduleKind(v: unknown): v is ScheduleKind {
  return (
    v === 'ordinary' ||
    v === 'hourly' ||
    v === 'advanced' ||
    v === 'multi_shift' ||
    v === 'advanced_multi_shift'
  );
}
