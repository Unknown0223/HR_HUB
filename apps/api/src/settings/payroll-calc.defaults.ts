/** Verifix «Расчет зарплаты» — TenantSetting.extras.payrollCalc */

export type TaxBlockSettings = {
  /** Облагается */
  taxable: boolean;
  /** Ставка № */
  rateNo: string;
  /** Счет */
  account: string;
};

export type PersonnelAccountsSettings = {
  accrualAccount: string;
  deductionAccount: string;
  advancesAccount: string;
  tripAdvanceReportAccount: string;
  tripExpenseAccount: string;
  loanAccount: string;
  depositAccount: string;
  allowCurrency: boolean;
  currency: string;
  allowProjects: boolean;
};

export type PayrollCalcSettings = {
  personnel: PersonnelAccountsSettings;
  ndfl: TaxBlockSettings;
  inps: TaxBlockSettings;
  esp: TaxBlockSettings;
};

export const DEFAULT_PAYROLL_CALC: PayrollCalcSettings = {
  personnel: {
    accrualAccount: '',
    deductionAccount: '',
    advancesAccount: '',
    tripAdvanceReportAccount: '',
    tripExpenseAccount: '',
    loanAccount: '',
    depositAccount: '',
    allowCurrency: false,
    currency: '',
    allowProjects: false,
  },
  ndfl: {
    taxable: false,
    rateNo: '',
    account: '',
  },
  inps: {
    taxable: false,
    rateNo: '',
    account: '',
  },
  esp: {
    taxable: false,
    rateNo: '',
    account: '',
  },
};

function str(v: unknown, fb = '') {
  return v == null ? fb : String(v);
}

function bool(v: unknown, fb = false) {
  return typeof v === 'boolean' ? v : fb;
}

function mergeTax(raw: unknown, d: TaxBlockSettings): TaxBlockSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    taxable: bool(o.taxable, d.taxable),
    rateNo: str(o.rateNo, d.rateNo),
    account: str(o.account, d.account),
  };
}

function mergePersonnel(
  raw: unknown,
  d: PersonnelAccountsSettings,
): PersonnelAccountsSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    accrualAccount: str(o.accrualAccount, d.accrualAccount),
    deductionAccount: str(o.deductionAccount, d.deductionAccount),
    advancesAccount: str(o.advancesAccount, d.advancesAccount),
    tripAdvanceReportAccount: str(
      o.tripAdvanceReportAccount,
      d.tripAdvanceReportAccount,
    ),
    tripExpenseAccount: str(o.tripExpenseAccount, d.tripExpenseAccount),
    loanAccount: str(o.loanAccount, d.loanAccount),
    depositAccount: str(o.depositAccount, d.depositAccount),
    allowCurrency: bool(o.allowCurrency, d.allowCurrency),
    currency: str(o.currency, d.currency),
    allowProjects: bool(o.allowProjects, d.allowProjects),
  };
}

export function mergePayrollCalc(raw: unknown): PayrollCalcSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const d = DEFAULT_PAYROLL_CALC;
  return {
    personnel: mergePersonnel(o.personnel, d.personnel),
    ndfl: mergeTax(o.ndfl, d.ndfl),
    inps: mergeTax(o.inps, d.inps),
    esp: mergeTax(o.esp, d.esp),
  };
}
