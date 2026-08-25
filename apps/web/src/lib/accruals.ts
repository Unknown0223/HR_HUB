import { formatMonthRu } from './fine-policies';

export const ACCRUAL_KINDS = [
  { value: 'salary_contributions', label: 'Начисление зарплаты и взносов' },
  { value: 'sick_leave', label: 'Начисление больничных' },
  { value: 'travel', label: 'Начисление командировочных' },
  { value: 'vacation', label: 'Начисление отпускных' },
  { value: 'all_types', label: 'Начисление всех видов' },
] as const;

export type AccrualKind = (typeof ACCRUAL_KINDS)[number]['value'];

export function kindLabel(kind?: string | null) {
  return ACCRUAL_KINDS.find((k) => k.value === kind)?.label || 'Начисление';
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

export { formatMonthRu };

export type EmpRef = {
  id: string;
  tabNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  label?: string;
};

export function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ') || e.tabNumber || '—';
}

export type AccrualLine = {
  id?: string;
  employeeId: string;
  employee?: EmpRef;
  accrualTypeId?: string | null;
  accrualName?: string | null;
  accrued: number;
  toPay: number;
  ndfl: number;
  inps: number;
  esp: number;
};

export type AccrualDeduction = {
  id?: string;
  employeeId: string;
  employee?: EmpRef;
  deductionTypeId?: string | null;
  deductionName?: string | null;
  amount: number;
};

export type AccrualDoc = {
  id: string;
  kind: AccrualKind;
  status: 'draft' | 'posted' | 'cancelled';
  month: string;
  docDate: string;
  number?: string | null;
  title?: string | null;
  divisionId?: string | null;
  division?: { id: string; name: string; code: string } | null;
  currency: string;
  note?: string | null;
  mergeAccruals: boolean;
  accruedTotal: number;
  deductedTotal: number;
  ndflTotal: number;
  inpsTotal: number;
  espTotal: number;
  attachments?: unknown;
  postedAt?: string | null;
  postedBy?: string | null;
  lines?: AccrualLine[];
  deductions?: AccrualDeduction[];
  _count?: { lines?: number; deductions?: number; entries?: number; audits?: number };
};

export type LedgerEntry = {
  id: string;
  createdDate: string;
  transDate: string;
  debitAccount: string;
  debitSubconto?: string | null;
  creditAccount: string;
  creditSubconto?: string | null;
  quantity?: number | null;
  currency?: string | null;
  note?: string | null;
  amount: number;
  exchangeRate?: number | null;
  amountFx?: number | null;
};

export type AccrualAudit = {
  id: string;
  occurredAt: string;
  userName: string;
  event: string;
  month?: string | null;
  number?: string | null;
  title?: string | null;
  posted: boolean;
};
