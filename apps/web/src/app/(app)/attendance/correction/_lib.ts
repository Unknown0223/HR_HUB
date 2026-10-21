/** DayStatus codes for correction grid — maps SALEC 1 / 0.5 / 0. */
export type CorrectionStatus =
  | 'on_time'
  | 'late'
  | 'absent'
  | 'day_off'
  | 'leave'
  | 'sick'
  | 'trip'
  | 'not_started';

export type CorrectionCell = {
  day: number;
  date: string;
  status: CorrectionStatus | string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  firstInAt?: string | null;
  lastOutAt?: string | null;
  reason?: string;
  history?: Array<{
    reason: string;
    oldStatus: string | null;
    newStatus: string;
    createdAt: string;
  }>;
  outside?: boolean;
  /** Late, but inside the company's monthly excused allowance. */
  lateExcused?: boolean;
  /** False for a late day beyond the allowance: not a full working day until corrected. */
  fullDay?: boolean;
};

export type CorrectionRow = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
  hiredAt?: string | null;
  dismissedAt?: string | null;
  locked?: boolean;
  division: string | null;
  position: string | null;
  schedule: string | null;
  presentDays: number;
  cells: CorrectionCell[];
};

export type CorrectionMatrix = {
  month: string;
  days: number[];
  referenceDate: string;
  stats: {
    employees: number;
    atWork: number;
    absent: number;
    leave: number;
    dayOff: number;
  };
  rows: CorrectionRow[];
};

export type StatusMeta = {
  code: string;
  short: string;
  label: string;
  cellClass: string;
};

/** Toolbar quick values: replaces SALEC 1 / 0.5 / 0 */
export const QUICK_STATUSES: CorrectionStatus[] = ['on_time', 'late', 'absent'];

export const SPECIAL_STATUSES: CorrectionStatus[] = ['day_off', 'leave', 'sick', 'trip'];

export const STATUS_META: Record<CorrectionStatus, StatusMeta> = {
  on_time: {
    code: '1',
    short: '1',
    label: 'Работал',
    cellClass: 'stOnTime',
  },
  late: {
    code: '0.5',
    short: '0.5',
    label: 'Полдня / опоздание',
    cellClass: 'stLate',
  },
  absent: {
    code: '0',
    short: '0',
    label: 'Отсутствовал',
    cellClass: 'stAbsent',
  },
  day_off: {
    code: '2',
    short: 'В',
    label: 'Выходной',
    cellClass: 'stDayOff',
  },
  leave: {
    code: '3',
    short: 'О',
    label: 'Отпуск',
    cellClass: 'stLeave',
  },
  sick: {
    code: '4',
    short: 'Б',
    label: 'Больничный',
    cellClass: 'stSick',
  },
  trip: {
    code: '5',
    short: 'К',
    label: 'Командировка',
    cellClass: 'stTrip',
  },
  not_started: {
    code: '',
    short: '—',
    label: 'Не начат',
    cellClass: 'stEmpty',
  },
};

export function statusMeta(s: string): StatusMeta {
  return STATUS_META[(s as CorrectionStatus) in STATUS_META ? (s as CorrectionStatus) : 'not_started'];
}

export function cellShort(c: CorrectionCell): string {
  return statusMeta(c.status).short;
}

export function workValue(status: string): number {
  if (status === 'on_time' || status === 'trip') return 1;
  if (status === 'late') return 0.5;
  return 0;
}

export function fmtTotal(n: number): string {
  return n % 1 ? n.toFixed(1) : String(n);
}

export const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const WEEKDAY_SHORT_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function monthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1] ?? m} ${y}`;
}

export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T12:00:00+05:00`).getDay();
}

export function isWeekend(ymd: string): boolean {
  const w = weekdayOf(ymd);
  return w === 0 || w === 6;
}

export function cellKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}
