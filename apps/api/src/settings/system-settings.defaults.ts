/** HR HUB «Настройки системы» — defaults for TenantSetting.extras.system */

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
  /** HR reminders before PersonDocument.expiresAt by doc type */
  documentTypeNotifications: DocumentTypeNotificationsSettings;

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

  // Nested HR HUB sub-panels
  hrStaff: HrStaffSettings;
  timepad: TimepadSettings;
  requiredFields: RequiredFieldsSettings;
  recruitment: RecruitmentSettings;
  /** Punch capture photos (приход / уход / отметка / примерный уход) */
  markPhotos: MarkPhotosSettings;
};

/** Per document-type expiry reminder (PersonDocument.docType / catalog doc_types.code) */
export type DocumentTypeNotificationRule = {
  id: string;
  documentTypeCode: string;
  /** Notify this many days before expiresAt */
  daysBefore: number;
  enabled: boolean;
};

export type DocumentTypeNotificationsSettings = {
  enabled: boolean;
  rules: DocumentTypeNotificationRule[];
};

export const DEFAULT_DOCUMENT_TYPE_NOTIFICATIONS: DocumentTypeNotificationsSettings =
  {
    enabled: false,
    rules: [],
  };

export function mergeDocumentTypeNotifications(
  raw: unknown,
): DocumentTypeNotificationsSettings {
  const p =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rulesRaw = Array.isArray(p.rules) ? p.rules : [];
  const rules: DocumentTypeNotificationRule[] = [];
  for (const item of rulesRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const documentTypeCode = String(o.documentTypeCode || o.docType || '')
      .trim()
      .toUpperCase();
    if (!documentTypeCode) continue;
    const daysBefore = Math.max(
      0,
      Math.min(
        3650,
        Math.floor(
          Number.isFinite(Number(o.daysBefore)) ? Number(o.daysBefore) : 30,
        ),
      ),
    );
    rules.push({
      id: String(o.id || '').trim() || `doc-notif-${rules.length + 1}`,
      documentTypeCode,
      daysBefore,
      enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
    });
  }
  return {
    enabled:
      typeof p.enabled === 'boolean'
        ? p.enabled
        : DEFAULT_DOCUMENT_TYPE_NOTIFICATIONS.enabled,
    rules,
  };
}

/** HR HUB «Настройки рекрутинга» — line in accrual/deduction tables */
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

/** Retention unit for mark punch photos in system settings. */
export type MarkPhotoRetentionUnit = 'day' | 'month' | 'year';

export type MarkPhotoKind = 'in' | 'out' | 'mark' | 'estimated_out';

export type MarkPhotoPolicy = {
  /** When false, new punch photos for this direction are discarded. */
  enabled: boolean;
  /** How long to keep stored photos (0 = forever). */
  retentionValue: number;
  retentionUnit: MarkPhotoRetentionUnit;
};

export type MarkPhotosSettings = {
  in: MarkPhotoPolicy;
  out: MarkPhotoPolicy;
  mark: MarkPhotoPolicy;
  /** Mid-day / «Примерный уход» punches */
  estimated_out: MarkPhotoPolicy;
  /**
   * Compress snapshots from terminals before MinIO (saves disk + speeds ingest).
   * Applied to all enabled directions.
   */
  compress: {
    enabled: boolean;
    /** Longest side px (240–1920). */
    maxEdge: number;
    /** JPEG quality 30–95. */
    quality: number;
  };
};

export const DEFAULT_MARK_PHOTO_POLICY: MarkPhotoPolicy = {
  enabled: true,
  retentionValue: 90,
  retentionUnit: 'day',
};

export const DEFAULT_MARK_PHOTO_COMPRESS = {
  enabled: true,
  maxEdge: 720,
  quality: 62,
} as const;

export const DEFAULT_MARK_PHOTOS_SETTINGS: MarkPhotosSettings = {
  in: { ...DEFAULT_MARK_PHOTO_POLICY },
  out: { ...DEFAULT_MARK_PHOTO_POLICY },
  mark: { ...DEFAULT_MARK_PHOTO_POLICY },
  estimated_out: { ...DEFAULT_MARK_PHOTO_POLICY },
  compress: { ...DEFAULT_MARK_PHOTO_COMPRESS },
};

/** Convert UI retention (day/month/year) to whole days for purge cutoff. */
export function retentionToDays(
  value: unknown,
  unit: unknown,
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = String(unit || 'day').toLowerCase();
  if (u === 'year') return n * 365;
  if (u === 'month') return n * 30;
  return n;
}

function normalizeMarkPhotoPolicy(raw: unknown): MarkPhotoPolicy {
  const d = DEFAULT_MARK_PHOTO_POLICY;
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const unitRaw = String(o.retentionUnit || d.retentionUnit).toLowerCase();
  const retentionUnit: MarkPhotoRetentionUnit =
    unitRaw === 'month' || unitRaw === 'year' || unitRaw === 'day'
      ? unitRaw
      : 'day';
  const retentionValue = Math.max(
    0,
    Math.floor(
      Number.isFinite(Number(o.retentionValue))
        ? Number(o.retentionValue)
        : d.retentionValue,
    ),
  );
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    retentionValue,
    retentionUnit,
  };
}

export function mergeMarkPhotosSettings(raw: unknown): MarkPhotosSettings {
  const p =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const cRaw =
    p.compress && typeof p.compress === 'object' && !Array.isArray(p.compress)
      ? (p.compress as Record<string, unknown>)
      : {};
  const maxEdge = Math.min(
    1920,
    Math.max(
      240,
      Math.floor(
        Number.isFinite(Number(cRaw.maxEdge))
          ? Number(cRaw.maxEdge)
          : DEFAULT_MARK_PHOTO_COMPRESS.maxEdge,
      ),
    ),
  );
  const quality = Math.min(
    95,
    Math.max(
      30,
      Math.floor(
        Number.isFinite(Number(cRaw.quality))
          ? Number(cRaw.quality)
          : DEFAULT_MARK_PHOTO_COMPRESS.quality,
      ),
    ),
  );
  return {
    in: normalizeMarkPhotoPolicy(p.in),
    out: normalizeMarkPhotoPolicy(p.out),
    mark: normalizeMarkPhotoPolicy(p.mark),
    estimated_out: normalizeMarkPhotoPolicy(p.estimated_out),
    compress: {
      enabled:
        typeof cRaw.enabled === 'boolean'
          ? cRaw.enabled
          : DEFAULT_MARK_PHOTO_COMPRESS.enabled,
      maxEdge,
      quality,
    },
  };
}

/** Map punch direction enum / mark type to markPhotos policy key. */
export function markPhotoKindFromDirection(
  direction: string | null | undefined,
): MarkPhotoKind {
  const d = String(direction || '').toUpperCase();
  if (d === 'IN') return 'in';
  if (d === 'OUT') return 'out';
  return 'mark';
}

/** Prefer markType (incl. Примерный уход) when classifying photo policy. */
export function markPhotoKindFromMarkType(
  markType: string | null | undefined,
  direction?: string | null,
): MarkPhotoKind {
  const t = String(markType || '')
    .trim()
    .toLowerCase();
  if (
    t === 'estimated_out' ||
    t === 'примерный уход' ||
    t === 'такминий уход' ||
    t === 'taxminiy' ||
    t === 'промежуточный уход'
  ) {
    return 'estimated_out';
  }
  if (t === 'in' || t === 'приход') return 'in';
  if (t === 'out' || t === 'уход') return 'out';
  if (t === 'mark' || t === 'отметка') return 'mark';
  return markPhotoKindFromDirection(direction);
}

/** HR HUB «Настройки обязательных полей» */
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
  documentTypeNotifications: structuredClone(DEFAULT_DOCUMENT_TYPE_NOTIFICATIONS),

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
  corporateNewsFeed: true,
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
  markPhotos: structuredClone(DEFAULT_MARK_PHOTOS_SETTINGS),
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
  merged.markPhotos = mergeMarkPhotosSettings(partial.markPhotos);
  merged.documentTypeNotifications = mergeDocumentTypeNotifications(
    partial.documentTypeNotifications,
  );
  // Alias: nested.enabled is source of truth; legacy checkbox follows it unless only legacy was patched
  if (
    partial.documentTypeNotifications &&
    typeof (partial.documentTypeNotifications as { enabled?: unknown })
      .enabled === 'boolean'
  ) {
    merged.hrNotifyDocumentDates = merged.documentTypeNotifications.enabled;
  } else if (typeof partial.hrNotifyDocumentDates === 'boolean') {
    merged.documentTypeNotifications = {
      ...merged.documentTypeNotifications,
      enabled: partial.hrNotifyDocumentDates,
    };
    merged.hrNotifyDocumentDates = partial.hrNotifyDocumentDates;
  } else {
    merged.hrNotifyDocumentDates = merged.documentTypeNotifications.enabled;
  }
  return merged;
}
