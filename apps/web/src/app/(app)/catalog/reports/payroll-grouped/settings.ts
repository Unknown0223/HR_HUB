export type NamedGroup = {
  id: string;
  name: string;
  itemIds: string[];
};

/** Verifix «группа итогов»: сложение / вычитание — items, groups, flags */
export type TotalSide = {
  itemIds: string[];
  groupIds: string[];
  checkIds: string[];
};

export type TotalGroup = {
  id: string;
  name: string;
  add: TotalSide;
  sub: TotalSide;
  /** @deprecated migrated into add/sub */
  addIds?: string[];
  subIds?: string[];
};

export type GroupedSettings = {
  divisionGroup: boolean;
  divisionCode: boolean;
  division: boolean;
  /** Verifix «Отдел» */
  orgUnit: boolean;
  position: boolean;
  positionType: boolean;
  tabNumber: boolean;
  grade: boolean;
  schedule: boolean;
  bankAccount: boolean;
  pinfl: boolean;
  inps: boolean;
  salary: boolean;
  plannedSalary: boolean;
  empDynFields: boolean;
  divDynFields: boolean;
  emptyDateCol: boolean;
  emptySignCol: boolean;

  dataSource: 'docs' | 'preliminary';

  plannedTime: boolean;
  planDays: boolean;
  planHours: boolean;
  workedTime: boolean;
  workedDays: boolean;
  workedHours: boolean;
  overtime: boolean;
  overtimeDays: boolean;
  overtimeHours: boolean;
  schedulePlan: boolean;
  scheduleFact: boolean;
  depositStart: boolean;
  depositEnd: boolean;

  showAccruals: boolean;
  showDeductions: boolean;
  loan: boolean;
  advance: boolean;
  travelAdvance: boolean;
  ndfl: boolean;
  inpsAmount: boolean;
  deductionTotal: boolean;

  showTotals: boolean;
  /** Начислено − Удержано / Итого к выплате */
  toPay: boolean;
  sheet: boolean;
  difference: boolean;

  ungroupedAccrualIds: string[];
  ungroupedDeductionIds: string[];
  accrualGroups: NamedGroup[];
  deductionGroups: NamedGroup[];
  totalGroups: TotalGroup[];
};

export const BUILTIN_ACCRUALS: { id: string; label: string }[] = [
  { id: 'base', label: 'По окладу' },
  { id: 'bonus', label: 'Премия' },
  { id: 'overtime', label: 'Сверхурочные' },
  { id: 'one_time', label: 'Разовые' },
  { id: 'other_acc', label: 'Прочие начисления' },
];

export const BUILTIN_DEDUCTIONS: { id: string; label: string }[] = [
  { id: 'loan', label: 'Заем' },
  { id: 'advance', label: 'Аванс' },
  { id: 'travelAdvance', label: 'Командировочный аванс' },
  { id: 'ndfl', label: 'НДФЛ' },
  { id: 'inpsAmount', label: 'ИНПС' },
  { id: 'other_ded', label: 'Прочие удержания' },
];

export const TOTAL_CHECK_OPTS: { id: string; label: string }[] = [
  { id: 'loan', label: 'Заем' },
  { id: 'advance', label: 'Аванс' },
  { id: 'travelAdvance', label: 'Командировочный аванс' },
  { id: 'ndfl', label: 'НДФЛ' },
  { id: 'inpsAmount', label: 'ИНПС' },
  { id: 'deductionTotal', label: 'Итого удержано' },
  { id: 'sheet', label: 'Ведомость' },
  { id: 'toPay', label: 'Начислено − Удержано' },
  { id: 'difference', label: 'Разница' },
];

export function emptyTotalSide(): TotalSide {
  return { itemIds: [], groupIds: [], checkIds: [] };
}

export function emptyTotalGroup(): TotalGroup {
  return { id: newId(), name: '', add: emptyTotalSide(), sub: emptyTotalSide() };
}

export const DEFAULT_SETTINGS: GroupedSettings = {
  divisionGroup: true,
  divisionCode: false,
  division: true,
  orgUnit: true,
  position: true,
  positionType: true,
  tabNumber: true,
  grade: true,
  schedule: true,
  bankAccount: true,
  pinfl: true,
  inps: true,
  salary: true,
  plannedSalary: false,
  empDynFields: false,
  divDynFields: false,
  emptyDateCol: false,
  emptySignCol: false,

  dataSource: 'docs',

  plannedTime: true,
  planDays: true,
  planHours: true,
  workedTime: true,
  workedDays: true,
  workedHours: true,
  overtime: true,
  overtimeDays: true,
  overtimeHours: true,
  schedulePlan: true,
  scheduleFact: true,
  depositStart: false,
  depositEnd: false,

  showAccruals: false,
  showDeductions: true,
  loan: true,
  advance: true,
  travelAdvance: true,
  ndfl: true,
  inpsAmount: true,
  deductionTotal: true,

  showTotals: true,
  toPay: true,
  sheet: true,
  difference: true,

  ungroupedAccrualIds: [],
  ungroupedDeductionIds: [],
  accrualGroups: [],
  deductionGroups: [],
  totalGroups: [],
};

export const SETTINGS_KEY = 'hrhub.payroll-grouped.settings.v3';
export const SETTINGS_TPL_KEY = 'hrhub.payroll-grouped.settings-templates';
export const FILTER_TPL_KEY = 'hrhub.payroll-grouped.filter-templates';

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function migrateTotalSide(raw: unknown, legacyIds?: string[]): TotalSide {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Partial<TotalSide>;
    return {
      itemIds: Array.isArray(o.itemIds) ? o.itemIds : [],
      groupIds: Array.isArray(o.groupIds) ? o.groupIds : [],
      checkIds: Array.isArray(o.checkIds) ? o.checkIds : [],
    };
  }
  const ids = Array.isArray(legacyIds) ? legacyIds : [];
  return {
    itemIds: ids.filter((x) => !x.startsWith('ag:') && !x.startsWith('dg:')),
    groupIds: ids.filter((x) => x.startsWith('ag:') || x.startsWith('dg:')),
    checkIds: ids.filter((x) =>
      ['loan', 'advance', 'travelAdvance', 'ndfl', 'inpsAmount', 'deductionTotal', 'sheet', 'toPay', 'difference'].includes(x),
    ),
  };
}

function migrateTotalGroup(g: Partial<TotalGroup> & { id?: string }): TotalGroup {
  return {
    id: g.id || newId(),
    name: g.name || '',
    add: migrateTotalSide(g.add, g.addIds),
    sub: migrateTotalSide(g.sub, g.subIds),
  };
}

export function normalizeSettings(raw: Partial<GroupedSettings> | null | undefined): GroupedSettings {
  const base = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    ...base,
    accrualGroups: Array.isArray(raw?.accrualGroups) ? raw!.accrualGroups : [],
    deductionGroups: Array.isArray(raw?.deductionGroups) ? raw!.deductionGroups : [],
    totalGroups: Array.isArray(raw?.totalGroups) ? raw!.totalGroups.map((g) => migrateTotalGroup(g)) : [],
    ungroupedAccrualIds: Array.isArray(raw?.ungroupedAccrualIds) ? raw!.ungroupedAccrualIds : [],
    ungroupedDeductionIds: Array.isArray(raw?.ungroupedDeductionIds) ? raw!.ungroupedDeductionIds : [],
  };
}

/** Flatten total side into keys for API amount resolution */
export function flattenTotalSide(side: TotalSide): string[] {
  return [...side.itemIds, ...side.groupIds, ...side.checkIds];
}
