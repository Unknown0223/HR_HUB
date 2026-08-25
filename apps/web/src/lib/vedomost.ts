export type SheetKind = 'vedomost' | 'advance_salary';
export type SheetPayType = 'cash' | 'bank';
export type SheetStatus = 'draft' | 'completed';

export type SheetLine = {
  id?: string;
  employeeId: string;
  employee?: { id: string; lastName?: string; firstName?: string; tabNumber?: string; label?: string } | null;
  debt: number;
  limitAmount: number;
  accruedAdvance: number;
  amount: number;
  note?: string | null;
  bank?: string | null;
  bankCode?: string | null;
  settlementAccount?: string | null;
};

export type PayrollSheet = {
  id: string;
  kind: SheetKind;
  status: SheetStatus;
  payType: SheetPayType;
  month: string;
  issueDate: string;
  number?: string | null;
  divisionId?: string | null;
  division?: { id: string; name: string; code: string } | null;
  cashbox?: string | null;
  bankAccount?: string | null;
  currency: string;
  note?: string | null;
  totalAmount: number;
  rounding: string;
  enableLimit: boolean;
  createdByName?: string | null;
  createdAt: string;
  lines: SheetLine[];
};

export type SheetSettings = {
  rounding: string;
  countPaidAdvances: boolean;
  generateNote: boolean;
  monthlyDayLimit: number;
  percent: number;
  deductionPercent: number;
  postedAccrualsOnly: boolean;
  postedDeductionsOnly: boolean;
};

export type SheetAudit = {
  id: string;
  occurredAt: string;
  userName: string;
  eventType: string;
  organization?: string;
  product?: string;
  sheet?: { id: string; number?: string | null; kind?: string } | null;
};

export function kindLabel(kind?: string) {
  if (kind === 'advance_salary') return 'Аванс по официальному окладу';
  return 'Ведомость';
}

export function payTypeLabel(t?: string) {
  return t === 'bank' ? 'Безналичные' : 'Наличные';
}

export function statusLabel(s?: string) {
  return s === 'completed' ? 'Завершена' : 'Черновик';
}

export function paymentTypeCell(row: Pick<PayrollSheet, 'kind' | 'payType'>) {
  if (row.kind === 'advance_salary') return kindLabel(row.kind);
  return payTypeLabel(row.payType);
}

export function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

export function empName(e?: SheetLine['employee']) {
  if (!e) return '—';
  return e.label || [e.lastName, e.firstName].filter(Boolean).join(' ') || e.tabNumber || '—';
}

export const ROUNDING_OPTS = ['###.000000', '####.000000', '###.##', '###'];
