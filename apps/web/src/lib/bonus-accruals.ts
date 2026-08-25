import { fmtDate, money } from './accruals';

export type BonusKind = 'fact' | 'kpi';

export type BonusLine = {
  id?: string;
  employeeId: string;
  employee?: { id: string; label: string; tabNumber?: string } | null;
  typeName?: string | null;
  accrualName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  amount: number;
};

export type BonusDoc = {
  id: string;
  kind: BonusKind | string;
  number: string;
  docDate: string;
  startDate: string;
  endDate: string;
  divisionId?: string | null;
  division?: { id: string; name: string } | null;
  factTypeId?: string | null;
  factTypeName?: string | null;
  considerPayroll: boolean;
  note?: string | null;
  totalAmount: number;
  status: 'draft' | 'posted' | 'cancelled' | string;
  lines: BonusLine[];
};

export function bonusKindLabel(kind?: string | null) {
  return kind === 'kpi' ? 'Бонусные начисления - КПЭ' : 'Бонусное начисление - Факт';
}

export function bonusTitle(kind: BonusKind, mode: 'create' | 'edit' | 'view') {
  const suffix = mode === 'create' ? 'создание' : mode === 'view' ? 'просмотр' : 'изменение';
  return `${bonusKindLabel(kind)} (${suffix})`;
}

export { fmtDate, money };
