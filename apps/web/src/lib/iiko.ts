export type IikoUser = {
  id: string;
  iikoName: string;
  iikoPosition?: string;
  iikoDepartment?: string;
  employeeId?: string;
  employeeName?: string;
};

export type IikoPosition = {
  id: string;
  iikoName: string;
  positionId?: string;
  positionName?: string;
};

export type IikoDivision = {
  id: string;
  iikoName: string;
  divisionId?: string;
  divisionName?: string;
};

export type IikoError = {
  id: string;
  message: string;
  createdAt: string;
};

export type IikoConfig = {
  sys?: string;
  url?: string;
  login?: string;
  password?: string;
  olapKind?: 'dishes' | 'orders';
  linkAllDivisions?: boolean;
  getIdEnabled?: boolean;
  getIdUrl?: string;
  syncShifts?: boolean;
  syncDays?: number;
  syncExpenses?: boolean;
  expenseShiftTypeId?: string;
  excludePositionIds?: string[];
  timeFrom?: string;
  timeTo?: string;
  syncLateAccrual?: boolean;
  lateShiftGroupId?: string;
  lateIikoShiftTypeId?: string;
  syncAppearances?: boolean;
  appearanceDays?: number;
  sendPin?: boolean;
  users?: IikoUser[];
  positions?: IikoPosition[];
  divisions?: IikoDivision[];
  errors?: IikoError[];
};

export const DEFAULT_IIKO: Required<
  Pick<
    IikoConfig,
    | 'olapKind'
    | 'linkAllDivisions'
    | 'getIdEnabled'
    | 'syncShifts'
    | 'syncDays'
    | 'syncExpenses'
    | 'timeFrom'
    | 'timeTo'
    | 'syncLateAccrual'
    | 'syncAppearances'
    | 'appearanceDays'
    | 'sendPin'
    | 'excludePositionIds'
  >
> = {
  olapKind: 'dishes',
  linkAllDivisions: true,
  getIdEnabled: false,
  syncShifts: true,
  syncDays: 7,
  syncExpenses: true,
  timeFrom: '23:00',
  timeTo: '06:00',
  syncLateAccrual: true,
  syncAppearances: true,
  appearanceDays: 7,
  sendPin: true,
  excludePositionIds: [],
};

export function asIikoConfig(raw?: unknown): IikoConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as IikoConfig;
}

export function newIikoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
