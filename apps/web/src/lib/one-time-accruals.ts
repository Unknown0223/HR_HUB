import { formatMonthRu } from './fine-policies';
import { fmtDate, money } from './accruals';

export type OneTimeKind = 'accrual' | 'deduction';
export type OneTimeCalc = 'value' | 'percent' | 'formula';

export type OneTimeLine = {
  id?: string;
  employeeId: string;
  employee?: { id: string; label: string; tabNumber?: string } | null;
  typeId?: string | null;
  typeName?: string | null;
  lineDate?: string | null;
  amount: number;
  note?: string | null;
};

export type OneTimeDoc = {
  id: string;
  kind: OneTimeKind;
  number: string;
  docDate: string;
  month: string;
  title?: string | null;
  divisionId?: string | null;
  division?: { id: string; name: string } | null;
  basis?: string | null;
  note?: string | null;
  currency: string;
  calcType: OneTimeCalc;
  percent: number;
  formula?: string | null;
  useOneForAll: boolean;
  attachments?: Array<{ name: string }>;
  totalAmount: number;
  status: 'draft' | 'posted' | 'cancelled';
  lines: OneTimeLine[];
};

export const CURRENCIES = [
  { value: 'UZS', label: 'Узбекский сум' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

export function currencyLabel(code?: string | null) {
  return CURRENCIES.find((c) => c.value === code)?.label || code || '—';
}

export function kindTitle(kind: OneTimeKind, mode: 'create' | 'edit' | 'view') {
  const base = kind === 'deduction' ? 'Разовое удержание' : 'Разовое начисление';
  const suffix = mode === 'create' ? 'создание' : mode === 'view' ? 'просмотр' : 'изменение';
  return `${base} (${suffix})`;
}

export { formatMonthRu, fmtDate, money };
