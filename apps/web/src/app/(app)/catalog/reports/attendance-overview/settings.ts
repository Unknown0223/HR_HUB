export type TimeFormat = 'clock' | 'text' | 'minutes';
export type RoundType = 'nearest' | 'up' | 'down';

export type AttSettings = {
  tabNumber: boolean;
  staffPos: boolean;
  position: boolean;
  department: boolean;
  pinfl: boolean;
  grade: boolean;
  hireDate: boolean;
  altName: boolean;
  schedule: boolean;
  manager: boolean;
  managerGroupId: string;
  division: boolean;
  sortByDivision: boolean;
  deptCode: boolean;
  deptGroup: boolean;
  region: boolean;
  location: boolean;
  showDismissed: boolean;
  empDynFields: boolean;
  empDynFieldIds: string[];
  divDynFields: boolean;
  divDynFieldIds: string[];
  late: boolean;
  early: boolean;
  overtime: boolean;
  offSchedule: boolean;
  hoursWorked: boolean;
  workCoeff: boolean;
  daysWorked: boolean;
  plannedDays: boolean;
  customNormDays: boolean;
  customNormHours: boolean;
  daysCoeff: boolean;
  consecutiveAbsent: boolean;
  hoursPerDay: boolean;
  dailyFacts: boolean;
  requestTime: boolean;
  showMinutes: boolean;
  showHhMm: boolean;
  showArrival: boolean;
  arrivalTime: boolean;
  infoByRows: boolean;
  infoByCols: boolean;
  timeDisplay: boolean;
  timeFormat: TimeFormat;
  showColorDesc: boolean;
  hideCodes: boolean;
  hideHours: boolean;
  absenceByType: boolean;
  timeTypeIds: string[];
  internalTrip: boolean;
  checkMarks: boolean;
  markSchedule: boolean;
  markDetails: boolean;
  dayMarkDetails: boolean;
  splitByDivision: boolean;
  roundHours: boolean;
  roundType: RoundType;
  roundStep: string;
  customWorked: boolean;
  countEarlyIn: boolean;
  countLateOut: boolean;
  lunch: boolean;
  weekendTime: boolean;
  missedAsAbsent: boolean;
  hourlyFacts: boolean;
  workStart: string;
  workEnd: string;
  monthlyPlan: boolean;
  absenceWithCoeff: boolean;
  weekendCoeff: boolean;
  weekendK: string;
  fineLate: boolean;
  fineTime: boolean;
  workedWithFines: boolean;
  fineEarly: boolean;
  fineAbsent: boolean;
  fineOnlyPeriod: boolean;
  origFineLate: boolean;
  origFineEarly: boolean;
  origFineAbsent: boolean;
  origFine: boolean;
};

export const DEFAULT_SETTINGS: AttSettings = {
  tabNumber: false,
  staffPos: false,
  position: false,
  department: false,
  pinfl: false,
  grade: false,
  hireDate: false,
  altName: false,
  schedule: false,
  manager: false,
  managerGroupId: '',
  division: false,
  sortByDivision: false,
  deptCode: false,
  deptGroup: false,
  region: false,
  location: false,
  showDismissed: false,
  empDynFields: false,
  empDynFieldIds: [],
  divDynFields: false,
  divDynFieldIds: [],
  late: false,
  early: false,
  overtime: false,
  offSchedule: false,
  hoursWorked: false,
  workCoeff: false,
  daysWorked: false,
  plannedDays: false,
  customNormDays: false,
  customNormHours: false,
  daysCoeff: false,
  consecutiveAbsent: false,
  hoursPerDay: false,
  dailyFacts: false,
  requestTime: false,
  showMinutes: false,
  showHhMm: false,
  showArrival: true,
  arrivalTime: true,
  infoByRows: false,
  infoByCols: false,
  timeDisplay: false,
  timeFormat: 'clock',
  showColorDesc: true,
  hideCodes: false,
  hideHours: false,
  absenceByType: false,
  timeTypeIds: [],
  internalTrip: false,
  checkMarks: false,
  markSchedule: false,
  markDetails: false,
  dayMarkDetails: false,
  splitByDivision: false,
  roundHours: false,
  roundType: 'nearest',
  roundStep: '0.5',
  customWorked: false,
  countEarlyIn: false,
  countLateOut: false,
  lunch: true,
  weekendTime: false,
  missedAsAbsent: true,
  hourlyFacts: false,
  workStart: '09:00',
  workEnd: '18:00',
  monthlyPlan: false,
  absenceWithCoeff: false,
  weekendCoeff: false,
  weekendK: '1',
  fineLate: false,
  fineTime: false,
  workedWithFines: false,
  fineEarly: false,
  fineAbsent: false,
  fineOnlyPeriod: false,
  origFineLate: false,
  origFineEarly: false,
  origFineAbsent: false,
  origFine: false,
};

export const EMP_DYN_FIELDS = [
  { id: 'phone', label: 'Телефон' },
  { id: 'email', label: 'Email' },
  { id: 'employmentType', label: 'Вид занятости' },
];
export const DIV_DYN_FIELDS = [
  { id: 'divisionCode', label: 'Код подразделения' },
  { id: 'legalEntity', label: 'Юр. лицо' },
];

export type InfoCol = { key: string; label: string };

export const T13_DEFAULT_SETTINGS: AttSettings = {
  ...DEFAULT_SETTINGS,
  tabNumber: true,
  staffPos: true,
  position: true,
  grade: true,
  division: true,
  department: true,
  location: true,
  schedule: true,
  manager: true,
  late: true,
  early: true,
  overtime: true,
  offSchedule: true,
  hoursWorked: true,
  daysWorked: true,
  customNormDays: true,
  customNormHours: true,
  showMinutes: true,
  showHhMm: true,
  showArrival: true,
  arrivalTime: true,
  checkMarks: true,
  markSchedule: true,
  showDismissed: true,
  showColorDesc: false,
};

export function identityColsT13(s: AttSettings): InfoCol[] {
  const cols: InfoCol[] = [];
  if (s.tabNumber) cols.push({ key: 'tabNumber', label: 'Табельный номер' });
  if (s.staffPos) cols.push({ key: 'staffPos', label: 'Позиция' });
  if (s.position) cols.push({ key: 'position', label: 'Должность' });
  if (s.grade) cols.push({ key: 'grade', label: 'Разряд' });
  if (s.division) cols.push({ key: 'division', label: 'Подразделение' });
  if (s.department) cols.push({ key: 'department', label: 'Отдел' });
  if (s.location) cols.push({ key: 'location', label: 'Локация' });
  if (s.schedule) cols.push({ key: 'schedule', label: 'График работы' });
  if (s.manager) cols.push({ key: 'manager', label: 'Руководитель' });
  return cols;
}

export function metricColsT13(s: AttSettings): InfoCol[] {
  const cols: InfoCol[] = [];
  if (s.late) cols.push({ key: 'lateMinutes', label: 'Опоздание' });
  if (s.early) cols.push({ key: 'earlyMinutes', label: 'Ранний уход' });
  if (s.overtime) cols.push({ key: 'overtime', label: 'Сверхурочно' });
  if (s.offSchedule) cols.push({ key: 'offSchedule', label: 'Вне графика (не учтено)' });
  if (s.hoursWorked) cols.push({ key: 'hoursWorked', label: 'Отработано часов' });
  if (s.daysWorked) cols.push({ key: 'daysWorked', label: 'Отработано дней' });
  if (s.customNormDays) cols.push({ key: 'customNormDays', label: 'Норма дней' });
  if (s.customNormHours) cols.push({ key: 'customNormHours', label: 'Норма часов' });
  return cols;
}

export function fmtAttHours(n: number, s: Pick<AttSettings, 'showMinutes' | 'showHhMm'>) {
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (s.showHhMm) {
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (s.showMinutes) return `${sign}${Math.round(abs * 100) / 100}`;
  return `${sign}${Math.round(abs * 100) / 100}`;
}

export function fmtAttMinutes(mins: number, s: Pick<AttSettings, 'showMinutes' | 'showHhMm'>) {
  if (!mins) return '';
  if (s.showHhMm) return fmtAttHours(mins / 60, s);
  return String(Math.round(mins));
}

export function identityCols(s: AttSettings): InfoCol[] {
  const cols: InfoCol[] = [];
  if (s.tabNumber) cols.push({ key: 'tabNumber', label: 'Табельный номер' });
  if (s.staffPos) cols.push({ key: 'staffPos', label: 'Позиция' });
  if (s.position) cols.push({ key: 'position', label: 'Должность' });
  if (s.department) cols.push({ key: 'department', label: 'Отдел' });
  if (s.pinfl) cols.push({ key: 'pinfl', label: 'ПИНФЛ' });
  if (s.grade) cols.push({ key: 'grade', label: 'Разряд' });
  if (s.hireDate) cols.push({ key: 'hiredAt', label: 'Дата приема' });
  if (s.altName) cols.push({ key: 'altName', label: 'Альт. имя' });
  if (s.schedule) cols.push({ key: 'schedule', label: 'График работы' });
  if (s.manager) cols.push({ key: 'manager', label: 'Руководитель' });
  if (s.division) cols.push({ key: 'division', label: 'Подразделение' });
  if (s.deptCode) cols.push({ key: 'divisionCode', label: 'Код подразделения' });
  if (s.deptGroup) cols.push({ key: 'divisionGroup', label: 'Группа подразделений' });
  if (s.region) cols.push({ key: 'region', label: 'Регион' });
  if (s.location) cols.push({ key: 'location', label: 'Локация' });
  if (s.empDynFields) {
    for (const f of EMP_DYN_FIELDS) {
      if (s.empDynFieldIds.includes(f.id)) cols.push({ key: f.id, label: f.label });
    }
  }
  if (s.divDynFields) {
    for (const f of DIV_DYN_FIELDS) {
      if (s.divDynFieldIds.includes(f.id) && !cols.some((c) => c.key === f.id)) {
        cols.push({ key: f.id, label: f.label });
      }
    }
  }
  return cols;
}

export function metricCols(s: AttSettings): InfoCol[] {
  const cols: InfoCol[] = [];
  if (s.late) cols.push({ key: 'lateMinutes', label: 'Опоздание' });
  if (s.early) cols.push({ key: 'earlyMinutes', label: 'Ранний уход' });
  if (s.overtime) cols.push({ key: 'overtime', label: 'Сверхурочно' });
  if (s.offSchedule) cols.push({ key: 'offSchedule', label: 'Вне графика' });
  if (s.hoursWorked) cols.push({ key: 'hoursWorked', label: 'Отработано часов' });
  if (s.workCoeff) cols.push({ key: 'workCoeff', label: 'Отработанный коэффициент' });
  if (s.daysWorked) cols.push({ key: 'daysWorked', label: 'Отработано дней' });
  if (s.plannedDays) cols.push({ key: 'plannedDays', label: 'Дни по плану' });
  if (s.customNormDays) cols.push({ key: 'customNormDays', label: 'Польз. норма дней' });
  if (s.customNormHours) cols.push({ key: 'customNormHours', label: 'Польз. норма часов' });
  if (s.daysCoeff) cols.push({ key: 'daysCoeff', label: 'Коэфф. отработанных дней' });
  if (s.consecutiveAbsent) cols.push({ key: 'consecutiveAbsent', label: 'Дни отсутствия подряд' });
  if (s.hoursPerDay) cols.push({ key: 'hoursPerDay', label: 'Отработано часов (за день)' });
  if (s.requestTime) cols.push({ key: 'requestTime', label: 'Время запроса' });
  if (s.fineLate) cols.push({ key: 'fineLate', label: 'Штраф за опоздание' });
  if (s.fineTime) cols.push({ key: 'fineTime', label: 'Штрафное время' });
  if (s.workedWithFines) cols.push({ key: 'workedWithFines', label: 'С учетом штрафов' });
  if (s.fineEarly) cols.push({ key: 'fineEarly', label: 'Штраф за ранний уход' });
  if (s.fineAbsent) cols.push({ key: 'fineAbsent', label: 'Штраф за отсутствие' });
  if (s.origFineLate) cols.push({ key: 'origFineLate', label: 'Исх. штраф за опоздание' });
  if (s.origFineEarly) cols.push({ key: 'origFineEarly', label: 'Исх. штраф за ранний уход' });
  if (s.origFineAbsent) cols.push({ key: 'origFineAbsent', label: 'Исх. штраф за отсутствие' });
  if (s.origFine) cols.push({ key: 'origFine', label: 'Исходное штрафное время' });
  return cols;
}

export function mergeSettings(raw: unknown): AttSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(raw as Partial<AttSettings>) };
}

export function settingsPayload(s: AttSettings) {
  return {
    ...s,
    weekendK: Number(s.weekendK) || 1,
    roundStep: Number(s.roundStep) || 0.5,
    includeInactive: s.showDismissed,
    timeDisplay: s.timeDisplay || s.showMinutes || s.showHhMm,
    timeFormat: s.showHhMm ? 'hhmm' : s.showMinutes ? 'clock' : s.timeFormat,
    showArrival: s.showArrival,
    arrivalTime: s.showArrival,
    checkMarks: s.checkMarks || s.markSchedule,
    markDetails: s.markDetails || s.checkMarks || s.markSchedule,
    dayMarkDetails: s.dayMarkDetails || s.checkMarks,
    markSchedule: s.markSchedule,
  };
}
