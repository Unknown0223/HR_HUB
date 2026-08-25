export const TIME_KINDS = [
  { key: 'presence', label: 'Явка' },
  { key: 'early', label: 'Ранний уход' },
  { key: 'free', label: 'Свободное время' },
  { key: 'absence', label: 'Отсутствие' },
  { key: 'late', label: 'Опоздание' },
] as const;

export type TimeKindKey = (typeof TIME_KINDS)[number]['key'];

export const PERIOD_TYPES = [{ id: 'full_month', label: 'Полный месяц' }] as const;

export type TimesheetDays = Record<TimeKindKey, Record<string, number>>;

export type TimesheetLine = {
  id?: string;
  employeeId: string;
  sortOrder?: number;
  tabNumber?: string | null;
  fullName?: string | null;
  positionName?: string | null;
  divisionName?: string | null;
  orgUnitName?: string | null;
  scheduleName?: string | null;
  plannedDays?: number | null;
  plannedHours?: number | null;
  workedDays?: number | null;
  workedHours?: number | null;
  days?: TimesheetDays;
};

export type TimesheetSheetRow = {
  id: string;
  status: string;
  docDate: string;
  number?: string | null;
  month: string;
  divisionId?: string | null;
  periodType: string;
  note?: string | null;
  posted: boolean;
  postedAt?: string | null;
  division?: { id: string; name: string; code: string } | null;
  lineCount?: number;
  lines?: TimesheetLine[];
};

export type TimesheetSettings = {
  allTimeTypes: boolean;
  timeTypeIds: string[];
  showPlannedDays: boolean;
  showPlannedHours: boolean;
  showWorkedHours: boolean;
  showWorkedDays: boolean;
};

export const DEFAULT_TIMESHEET_SETTINGS: TimesheetSettings = {
  allTimeTypes: true,
  timeTypeIds: [],
  showPlannedDays: true,
  showPlannedHours: true,
  showWorkedHours: true,
  showWorkedDays: true,
};

export function emptyDays(): TimesheetDays {
  return { presence: {}, early: {}, free: {}, absence: {}, late: {} };
}

export function daysInMonth(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 31;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function weekdayRu(isoMonth: string, day: number): string {
  const d = new Date(`${isoMonth.slice(0, 7)}-${String(day).padStart(2, '0')}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getUTCDay()];
}

export function isWeekend(isoMonth: string, day: number): boolean {
  const w = weekdayRu(isoMonth, day);
  return w === 'сб' || w === 'вс';
}

export function periodTypeLabel(id?: string | null): string {
  return PERIOD_TYPES.find((p) => p.id === id)?.label || 'Полный месяц';
}

export function padNumber(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(10, '0');
}
