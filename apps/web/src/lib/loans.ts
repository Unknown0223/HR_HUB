import { formatMonthRu } from './fine-policies';
import { fmtDate, money } from './accruals';

export type LoanStatus = 'draft' | 'active' | 'closed' | 'defaulted';

export type LoanRow = {
  id: string;
  number: string;
  loanDate: string;
  contractNumber?: string | null;
  contractDate?: string | null;
  employeeId: string;
  employee?: { id: string; label: string; tabNumber?: string } | null;
  principal: number;
  remaining: number;
  monthlyPayment?: number | null;
  startDate: string;
  endDate?: string | null;
  currency: string;
  status: LoanStatus;
  note?: string | null;
};

export const LOAN_CURRENCIES = [
  { value: 'UZS', label: 'Узбекский сум' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

export function loanStatusLabel(status?: string | null) {
  if (status === 'active') return 'Активный';
  if (status === 'closed') return 'Закрыт';
  if (status === 'defaulted') return 'Просрочен';
  return 'Черновик';
}

export function loanTitle(mode: 'create' | 'edit' | 'view') {
  const suffix = mode === 'create' ? 'создание' : mode === 'view' ? 'просмотр' : 'изменение';
  return `Заем (${suffix})`;
}

export { formatMonthRu, fmtDate, money };
