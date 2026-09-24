/** DayStatus codes for correction grid — maps SALEC 1 / 0.5 / 0. */
export type CorrectionStatus =
  | 'on_time'
  | 'late'
  | 'absent'
  | 'day_off'
  | 'leave'
  | 'not_started';

export type CorrectionCell = {
  day: number;
  date: string;
  status: CorrectionStatus | string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  firstInAt?: string | null;
  lastOutAt?: string | null;
};

export type CorrectionRow = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
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

export const SPECIAL_STATUSES: CorrectionStatus[] = ['day_off', 'leave'];

export const STATUS_META: Record<CorrectionStatus, StatusMeta> = {
  on_time: {
    code: '1',
    short: 'Вр',
    label: 'Вовремя',
    cellClass: 'stOnTime',
  },
  late: {
    code: '0.5',
    short: 'Оп',
    label: 'Опоздание',
    cellClass: 'stLate',
  },
  absent: {
    code: '0',
    short: 'Н',
    label: 'Не пришел',
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
  if (c.status === 'late' && c.lateMinutes > 0) {
    return String(c.lateMinutes);
  }
  return statusMeta(c.status).short;
}

export function workValue(status: string): number {
  if (status === 'on_time') return 1;
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
