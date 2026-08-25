export const SALES_KINDS = [
  { value: 'personal', label: 'Личные продажи' },
  { value: 'division', label: 'Продажи подразделения' },
] as const;

export type SalesKind = (typeof SALES_KINDS)[number]['value'];
export type PayType = 'cash' | 'bank';

export type SalesLine = {
  id?: string;
  employeeId: string;
  employee?: { id: string; label?: string; lastName?: string; firstName?: string; position?: { name: string } | null } | null;
  positionId?: string | null;
  positionName?: string;
  salesKind: SalesKind;
  percent: number;
  salesAmount: number;
  amount: number;
};

export type SalesAccrualDoc = {
  id: string;
  number: string;
  docDate: string;
  periodFrom: string;
  periodTo: string;
  title?: string | null;
  paymentType: PayType;
  salesKind: SalesKind;
  divisionId?: string | null;
  positionId?: string | null;
  cashbox?: string | null;
  bankAccount?: string | null;
  rounding: string;
  note?: string | null;
  totalSales: number;
  totalAmount: number;
  status: string;
  postedAt?: string | null;
  lines: SalesLine[];
};

export type SalesRateRow = {
  id: string;
  positionId: string;
  positionName: string;
  positionCode?: string;
  personalPercent: number;
  divisionPercent: number;
  sortOrder: number;
};

export function payTypeLabel(t?: string) {
  return t === 'bank' ? 'Безналичные' : 'Наличные';
}

export function salesKindLabel(k?: string) {
  return SALES_KINDS.find((x) => x.value === k)?.label || 'Личные продажи';
}

export function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

export function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function roundingScale(mask?: string | null) {
  const m = String(mask || '####.000000');
  const i = m.indexOf('.');
  if (i < 0) return 0;
  return m.slice(i + 1).replace(/[^0#]/g, '').length;
}

export function roundByMask(value: number, mask?: string | null) {
  const s = roundingScale(mask);
  const f = 10 ** s;
  return Math.round((Number(value) || 0) * f) / f;
}

export function lineAmount(salesAmount: number, percent: number, rounding?: string) {
  return roundByMask((Number(salesAmount) || 0) * (Number(percent) || 0) / 100, rounding);
}
