/** Default Verifix-style employee report column/settings toggles. */

export type EmployeeReportSettings = {
  // Информация о сотруднике
  showTabNumber: boolean;
  showPosition: boolean;
  showFullName: boolean;
  showBranch: boolean;
  showGrade: boolean;
  showHireDate: boolean;
  showAltName: boolean;
  showSchedule: boolean;
  showManager: boolean;
  showEmail: boolean;
  // Организационная структура
  showDivision: boolean;
  showDivisionCode: boolean;
  showDivisionGroup: boolean;
  showRegion: boolean;
  showLocation: boolean;
  // Фильтры и динамические поля
  includeDismissed: boolean;
  includeNotHired: boolean;
  showDynamicFields: boolean;
  showDivisionDynamicFields: boolean;
  // Информация о посещениях
  showLate: boolean;
  showEarlyLeave: boolean;
  showOvertime: boolean;
  showOffSchedule: boolean;
  showHoursWorked: boolean;
  showWorkCoeff: boolean;
  showDaysWorked: boolean;
  showPlannedDays: boolean;
  showCustomNormDays: boolean;
  showCustomNormHours: boolean;
  showWorkedDaysCoeff: boolean;
  showConsecutiveAbsence: boolean;
  showHoursWorkedPerDay: boolean;
  showFactsByDays: boolean;
  showRequestTime: boolean;
  // Отображать приходы и уходы
  showArrivals: boolean;
  showArrivalTimes: boolean;
  showDailyByRows: boolean;
  showDailyByColumns: boolean;
  // Формат и отображение
  showTimeDisplay: boolean;
  showColorLegend: boolean;
  hideLetterCodes: boolean;
  hideWorkedHours: boolean;
  showAbsencesByType: boolean;
  showInternalTrips: boolean;
  showMarkVerify: boolean;
  showMarkSchedule: boolean;
  showMarkDetails: boolean;
  showDailyMarkDetails: boolean;
  splitByDivision: boolean;
  roundHours: boolean;
  // Расчет
  customWorkedTime: boolean;
  weekendFactCalc: boolean;
  monthlyPlan: boolean;
  absenceCoeff: boolean;
  weekendWorkCoeff: boolean;
  // Показатели штрафов
  fineLate: boolean;
  fineTime: boolean;
  fineWorkedWithPenalties: boolean;
  fineEarly: boolean;
  fineAbsent: boolean;
  finePeriodOnly: boolean;
  // Исходные штрафы
  origFineLate: boolean;
  origFineEarly: boolean;
  origFineAbsent: boolean;
  origFineTime: boolean;
};

export const DEFAULT_ATTENDANCE_REPORT_SETTINGS: EmployeeReportSettings = {
  showTabNumber: true,
  showPosition: true,
  showFullName: true,
  showBranch: false,
  showGrade: false,
  showHireDate: false,
  showAltName: false,
  showSchedule: true,
  showManager: false,
  showEmail: false,
  showDivision: true,
  showDivisionCode: false,
  showDivisionGroup: false,
  showRegion: false,
  showLocation: false,
  includeDismissed: false,
  includeNotHired: false,
  showDynamicFields: false,
  showDivisionDynamicFields: false,
  showLate: true,
  showEarlyLeave: true,
  showOvertime: false,
  showOffSchedule: false,
  showHoursWorked: true,
  showWorkCoeff: false,
  showDaysWorked: true,
  showPlannedDays: false,
  showCustomNormDays: false,
  showCustomNormHours: false,
  showWorkedDaysCoeff: false,
  showConsecutiveAbsence: false,
  showHoursWorkedPerDay: true,
  showFactsByDays: true,
  showRequestTime: false,
  showArrivals: true,
  showArrivalTimes: true,
  showDailyByRows: true,
  showDailyByColumns: false,
  showTimeDisplay: true,
  showColorLegend: true,
  hideLetterCodes: false,
  hideWorkedHours: false,
  showAbsencesByType: true,
  showInternalTrips: false,
  showMarkVerify: false,
  showMarkSchedule: false,
  showMarkDetails: false,
  showDailyMarkDetails: false,
  splitByDivision: false,
  roundHours: true,
  customWorkedTime: false,
  weekendFactCalc: false,
  monthlyPlan: true,
  absenceCoeff: false,
  weekendWorkCoeff: false,
  fineLate: true,
  fineTime: false,
  fineWorkedWithPenalties: false,
  fineEarly: true,
  fineAbsent: true,
  finePeriodOnly: false,
  origFineLate: false,
  origFineEarly: false,
  origFineAbsent: false,
  origFineTime: false,
};

export function defaultReportSettings(_kind: string): EmployeeReportSettings {
  return { ...DEFAULT_ATTENDANCE_REPORT_SETTINGS };
}

export function normalizeReportKind(kind: string): string {
  const k = kind.toLowerCase();
  if (k === 'visits') return 'attendance';
  if (k === 'time-types' || k === 'time_types' || k === 'premium') return 'bonus';
  if (k === 'accrual-book') return 'accrual';
  return k;
}
