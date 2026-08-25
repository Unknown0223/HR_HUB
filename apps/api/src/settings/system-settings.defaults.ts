/** Verifix «Настройки системы» — defaults for TenantSetting.extras.system */

export type SystemSettings = {
  // Autogeneration / core
  autoPin: boolean;
  useProfilePhotoForFace: boolean;
  autoTabNumber: boolean;
  blockDismissalIfLoan: boolean;
  blockMultiDevice: boolean;
  advancedOrgStructure: boolean;
  importTaskResults: boolean;
  limitScheduleChangeRequestTime: boolean;
  limitAbsenceRequestTime: boolean;
  restrictScheduleChangeCount: boolean;
  restrictAbsenceCount: boolean;
  overtimeCoefficient: number;
  defaultOvertimeType: string;
  trackResponseTimeSeconds: boolean;
  tripArrivalLeadTime: string;
  earlyArrivalTrip: string;
  lateDepartureTrip: string;
  dynamicFactRounding: boolean;
  dynamicMethod: boolean;
  changeNameFormatForOrders: boolean;
  showUserDashboardInAttendanceStats: boolean;
  missingEmployeesWithoutRequest: boolean;
  medicalExamIntervalMonths: string;
  restrictPastShiftChange: boolean;
  blockOneTimeDocsByMonth: boolean;
  rotationExpenseAccrual: string;
  hideScheduleInEmployeeCalendar: boolean;
  showExtraTimeTypesInCalendar: boolean;

  // Verification / attendance
  employeeVerification: boolean;
  verificationDataType: 'fio' | 'passport' | 'pinfl';
  qrInventorySize: 'small' | 'normal';
  arrivalMarkRule: 'first' | 'last';
  departureMarkRule: 'first' | 'last';
  latenessPenalty: 'arrival_only' | 'arrival_with_checkout';
  showOfficialAbsences: boolean;
  checkTimesheetLimit: boolean;
  useClearanceSheet: boolean;
  showInternship: boolean;
  autoOutAsTripEnd: boolean;
  corporateNewsFeed: boolean;
  optionalGphEndDate: boolean;
  hrNotifyDocumentDates: boolean;
  blockOfficialAbsenceIntervals: boolean;
  dynamicLateSearchMultiShift: boolean;
  manualAddressEntry: boolean;
  defaultScheduleDisplay0900: boolean;
  absenceConfirmManagerOnly: boolean;
  notifyHrAbsenceComplete: boolean;
  notifyHrScheduleChangeComplete: boolean;
  dailyOvertimeLimit: boolean;
  minOvertimeLimit: boolean;
  restrictOvertimeRequestPeriod: boolean;
  restrictMarkRequestPeriod: boolean;
  notifyUnopenedShifts: boolean;
  notifyOpenShiftsNearby: boolean;
  notifyManagerShiftRequest: boolean;
  notifyHrShiftRequest: boolean;
  blockRequestsClosedTimesheet: boolean;
  checkAdultAge18: boolean;
  hideInitialBalance: boolean;

  // Nested Verifix sub-panels
  hrStaff: HrStaffSettings;
  timepad: TimepadSettings;
  requiredFields: RequiredFieldsSettings;
  recruitment: RecruitmentSettings;
};

/** Verifix «Настройки рекрутинга» — line in accrual/deduction tables */
export type RecruitmentPayLine = {
  id: string;
  /** Наименование начисления / удержания */
  name: string;
  /** Показатели */
  indicators: string;
};

export type RecruitmentSettings = {
  autoCreateVacancyOnApproval: boolean;
  moveReserveToAutoVacancy: boolean;
  /** Период активации резервных кандидатов (дни) */
  reserveActivationDays: string;
  suggestNearestVacancies: boolean;
  /** Радиус поиска ближайших вакансий (км) */
  nearestVacancyRadiusKm: string;
  filterVacanciesByAge: boolean;
  filterVacanciesByGender: boolean;
  internshipAccruals: RecruitmentPayLine[];
  internshipDeductions: RecruitmentPayLine[];
};

function emptyPayLines(count = 2): RecruitmentPayLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `line_${i + 1}`,
    name: '',
    indicators: '',
  }));
}

export const DEFAULT_RECRUITMENT_SETTINGS: RecruitmentSettings = {
  autoCreateVacancyOnApproval: true,
  moveReserveToAutoVacancy: true,
  reserveActivationDays: '',
  suggestNearestVacancies: true,
  nearestVacancyRadiusKm: '10',
  filterVacanciesByAge: true,
  filterVacanciesByGender: true,
  internshipAccruals: emptyPayLines(2),
  internshipDeductions: emptyPayLines(2),
};

/** Verifix «Настройки обязательных полей» */
export type RequiredFieldsSettings = {
  employee: {
    lastName: boolean;
    patronymic: boolean;
    birthDate: boolean;
    phone: boolean;
    email: boolean;
    region: boolean;
    address: boolean;
    registrationAddress: boolean;
    passport: boolean;
    pinfl: boolean;
    inps: boolean;
    login: boolean;
  };
  absenceRequest: {
    note: boolean;
    minNoteChars: number;
  };
  scheduleChangeRequest: {
    note: boolean;
    maxNoteChars: number;
  };
  markRequest: {
    location: boolean;
    photoVideo: boolean;
    fileOnComplete: boolean;
    note: boolean;
    maxNoteChars: number;
  };
  individualSchedule: {
    productionCalendar: boolean;
  };
  hiring: {
    workSchedule: boolean;
    onProbation: boolean;
  };
  sickLeave: {
    file: boolean;
  };
  dismissal: {
    reason: boolean;
    file: boolean;
  };
  dismissalRequest: {
    reason: boolean;
  };
  overtimeRequest: {
    note: boolean;
    minNoteChars: number;
  };
};

export const DEFAULT_REQUIRED_FIELDS_SETTINGS: RequiredFieldsSettings = {
  employee: {
    lastName: true,
    patronymic: true,
    birthDate: true,
    phone: true,
    email: true,
    region: true,
    address: true,
    registrationAddress: true,
    passport: true,
    pinfl: true,
    inps: true,
    login: true,
  },
  absenceRequest: {
    note: true,
    minNoteChars: 0,
  },
  scheduleChangeRequest: {
    note: true,
    maxNoteChars: 0,
  },
  markRequest: {
    location: true,
    photoVideo: true,
    fileOnComplete: true,
    note: true,
    maxNoteChars: 0,
  },
  individualSchedule: {
    productionCalendar: true,
  },
  hiring: {
    workSchedule: true,
    onProbation: true,
  },
  sickLeave: {
    file: true,
  },
  dismissal: {
    reason: true,
    file: true,
  },
  dismissalRequest: {
    reason: true,
  },
  overtimeRequest: {
    note: true,
    minNoteChars: 0,
  },
};

export type TimepadSettings = {
  /** HH:mm QR validity window */
  qrCodeTtl: string;
  /** ru | uz | en */
  language: string;
  markTypeIn: boolean;
  markTypeOut: boolean;
  markTypeCancel: boolean;
  markTypeBreakIn: boolean;
  markTypeBreakOut: boolean;
  idQr: boolean;
  idPassword: boolean;
  faceRecognition: boolean;
  emotionEyes: boolean;
  emotionSmile: boolean;
};

export const DEFAULT_TIMEPAD_SETTINGS: TimepadSettings = {
  qrCodeTtl: '00:10',
  language: 'ru',
  markTypeIn: true,
  markTypeOut: true,
  markTypeCancel: false,
  markTypeBreakIn: true,
  markTypeBreakOut: true,
  idQr: true,
  idPassword: true,
  faceRecognition: true,
  emotionEyes: true,
  emotionSmile: true,
};

export type HrStaffSettings = {
  autoDetectMarkType: boolean;
  markTypeIn: boolean;
  markTypeOut: boolean;
  markTypeMark: boolean;
  markTypeBreakIn: boolean;
  markTypeBreakOut: boolean;
  mobileLastMarkAsOut: boolean;
  allowQrMarks: boolean;
  // stages
  stageGps: boolean;
  stageFace: boolean;
  stageEmotionEyes: boolean;
  stageEmotionSmile: boolean;
  // requests
  allowAbsenceRequests: boolean;
  absenceRequestState: boolean;
  allowScheduleChangeRequests: boolean;
  allowDaySwapRequests: boolean;
  scheduleChangeRequestState: boolean;
  allowMarkRequests: boolean;
  allowDismissalRequests: boolean;
  allowLocationRequests: boolean;
  allowOvertimeRequests: boolean;
  enableVacationRequest: boolean;
  // extras
  enableXCamera: boolean;
  allowPhotoUploadForRecognition: boolean;
  ignoreInvalidInOutMarks: boolean;
  // GPS
  gpsTracking: boolean;
  trackLocation: boolean;
  trackViaGoogleService: boolean;
  autoOutByGps: boolean;
  trackByInOutTime: boolean;
  maxWaitOutMarkHours: number;
  gpsQuality: 'low' | 'medium' | 'high';
  authValidityDays: number;
  useTaskPlanSchedule: boolean;
  useInternalTrip: boolean;
  notifyDayResult: boolean;
  notifyEndOfWorkWeek: boolean;
  showSalary: boolean;
};

export const DEFAULT_HR_STAFF_SETTINGS: HrStaffSettings = {
  autoDetectMarkType: true,
  markTypeIn: false,
  markTypeOut: false,
  markTypeMark: false,
  markTypeBreakIn: false,
  markTypeBreakOut: false,
  mobileLastMarkAsOut: false,
  allowQrMarks: false,
  stageGps: true,
  stageFace: true,
  stageEmotionEyes: true,
  stageEmotionSmile: true,
  allowAbsenceRequests: true,
  absenceRequestState: false,
  allowScheduleChangeRequests: true,
  allowDaySwapRequests: true,
  scheduleChangeRequestState: false,
  allowMarkRequests: true,
  allowDismissalRequests: true,
  allowLocationRequests: true,
  allowOvertimeRequests: true,
  enableVacationRequest: true,
  enableXCamera: false,
  allowPhotoUploadForRecognition: false,
  ignoreInvalidInOutMarks: false,
  gpsTracking: true,
  trackLocation: true,
  trackViaGoogleService: false,
  autoOutByGps: false,
  trackByInOutTime: false,
  maxWaitOutMarkHours: 2,
  gpsQuality: 'high',
  authValidityDays: 7,
  useTaskPlanSchedule: false,
  useInternalTrip: false,
  notifyDayResult: false,
  notifyEndOfWorkWeek: false,
  showSalary: true,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  autoPin: true,
  useProfilePhotoForFace: true,
  autoTabNumber: true,
  blockDismissalIfLoan: false,
  blockMultiDevice: false,
  advancedOrgStructure: false,
  importTaskResults: false,
  limitScheduleChangeRequestTime: false,
  limitAbsenceRequestTime: false,
  restrictScheduleChangeCount: false,
  restrictAbsenceCount: false,
  overtimeCoefficient: 1,
  defaultOvertimeType: 'overtime_pay',
  trackResponseTimeSeconds: false,
  tripArrivalLeadTime: '01:00',
  earlyArrivalTrip: '00:00',
  lateDepartureTrip: '00:00',
  dynamicFactRounding: false,
  dynamicMethod: false,
  changeNameFormatForOrders: false,
  showUserDashboardInAttendanceStats: false,
  missingEmployeesWithoutRequest: false,
  medicalExamIntervalMonths: '',
  restrictPastShiftChange: false,
  blockOneTimeDocsByMonth: false,
  rotationExpenseAccrual: '',
  hideScheduleInEmployeeCalendar: false,
  showExtraTimeTypesInCalendar: false,

  employeeVerification: true,
  verificationDataType: 'fio',
  qrInventorySize: 'normal',
  arrivalMarkRule: 'first',
  departureMarkRule: 'last',
  latenessPenalty: 'arrival_only',
  showOfficialAbsences: true,
  checkTimesheetLimit: true,
  useClearanceSheet: false,
  showInternship: false,
  autoOutAsTripEnd: false,
  corporateNewsFeed: false,
  optionalGphEndDate: false,
  hrNotifyDocumentDates: false,
  blockOfficialAbsenceIntervals: true,
  dynamicLateSearchMultiShift: false,
  manualAddressEntry: false,
  defaultScheduleDisplay0900: false,
  absenceConfirmManagerOnly: false,
  notifyHrAbsenceComplete: false,
  notifyHrScheduleChangeComplete: false,
  dailyOvertimeLimit: false,
  minOvertimeLimit: false,
  restrictOvertimeRequestPeriod: false,
  restrictMarkRequestPeriod: false,
  notifyUnopenedShifts: false,
  notifyOpenShiftsNearby: false,
  notifyManagerShiftRequest: false,
  notifyHrShiftRequest: false,
  blockRequestsClosedTimesheet: false,
  checkAdultAge18: false,
  hideInitialBalance: true,

  hrStaff: { ...DEFAULT_HR_STAFF_SETTINGS },
  timepad: { ...DEFAULT_TIMEPAD_SETTINGS },
  requiredFields: structuredClone(DEFAULT_REQUIRED_FIELDS_SETTINGS),
  recruitment: structuredClone(DEFAULT_RECRUITMENT_SETTINGS),
};

function mergeObj<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ...base };
  return { ...base, ...(patch as T) };
}

function normalizePayLines(raw: unknown, fallback: RecruitmentPayLine[]): RecruitmentPayLine[] {
  if (!Array.isArray(raw)) return fallback.map((l) => ({ ...l }));
  if (raw.length === 0) return emptyPayLines(1);
  return raw.map((item, i) => {
    const o =
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: o.id != null && String(o.id) ? String(o.id) : `line_${i + 1}`,
      name: o.name != null ? String(o.name) : '',
      indicators: o.indicators != null ? String(o.indicators) : '',
    };
  });
}

function mergeRecruitment(patch: unknown): RecruitmentSettings {
  const p =
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? (patch as Record<string, unknown>)
      : {};
  const d = DEFAULT_RECRUITMENT_SETTINGS;
  const merged = mergeObj(
    d as unknown as Record<string, unknown>,
    p,
  ) as unknown as RecruitmentSettings;
  merged.internshipAccruals = normalizePayLines(p.internshipAccruals, d.internshipAccruals);
  merged.internshipDeductions = normalizePayLines(
    p.internshipDeductions,
    d.internshipDeductions,
  );
  return merged;
}

function mergeRequiredFields(patch: unknown): RequiredFieldsSettings {
  const p =
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? (patch as Record<string, unknown>)
      : {};
  const d = DEFAULT_REQUIRED_FIELDS_SETTINGS;
  return {
    employee: mergeObj(
      d.employee as unknown as Record<string, unknown>,
      p.employee,
    ) as unknown as RequiredFieldsSettings['employee'],
    absenceRequest: mergeObj(
      d.absenceRequest as unknown as Record<string, unknown>,
      p.absenceRequest,
    ) as unknown as RequiredFieldsSettings['absenceRequest'],
    scheduleChangeRequest: mergeObj(
      d.scheduleChangeRequest as unknown as Record<string, unknown>,
      p.scheduleChangeRequest,
    ) as unknown as RequiredFieldsSettings['scheduleChangeRequest'],
    markRequest: mergeObj(
      d.markRequest as unknown as Record<string, unknown>,
      p.markRequest,
    ) as unknown as RequiredFieldsSettings['markRequest'],
    individualSchedule: mergeObj(
      d.individualSchedule as unknown as Record<string, unknown>,
      p.individualSchedule,
    ) as unknown as RequiredFieldsSettings['individualSchedule'],
    hiring: mergeObj(
      d.hiring as unknown as Record<string, unknown>,
      p.hiring,
    ) as unknown as RequiredFieldsSettings['hiring'],
    sickLeave: mergeObj(
      d.sickLeave as unknown as Record<string, unknown>,
      p.sickLeave,
    ) as unknown as RequiredFieldsSettings['sickLeave'],
    dismissal: mergeObj(
      d.dismissal as unknown as Record<string, unknown>,
      p.dismissal,
    ) as unknown as RequiredFieldsSettings['dismissal'],
    dismissalRequest: mergeObj(
      d.dismissalRequest as unknown as Record<string, unknown>,
      p.dismissalRequest,
    ) as unknown as RequiredFieldsSettings['dismissalRequest'],
    overtimeRequest: mergeObj(
      d.overtimeRequest as unknown as Record<string, unknown>,
      p.overtimeRequest,
    ) as unknown as RequiredFieldsSettings['overtimeRequest'],
  };
}

export function mergeSystemSettings(raw: unknown): SystemSettings {
  const partial =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const merged = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...partial,
  } as SystemSettings;
  merged.hrStaff = mergeObj(
    DEFAULT_HR_STAFF_SETTINGS as unknown as Record<string, unknown>,
    partial.hrStaff,
  ) as unknown as HrStaffSettings;
  merged.timepad = mergeObj(
    DEFAULT_TIMEPAD_SETTINGS as unknown as Record<string, unknown>,
    partial.timepad,
  ) as unknown as TimepadSettings;
  merged.requiredFields = mergeRequiredFields(partial.requiredFields);
  merged.recruitment = mergeRecruitment(partial.recruitment);
  return merged;
}
