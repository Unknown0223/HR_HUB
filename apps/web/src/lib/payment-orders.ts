import { fmtDate } from './accruals';

export type PaymentOrderStatus = 'new' | 'open' | 'sent' | 'paid';

export type PaymentOrderRow = {
  id: string;
  number: string;
  title?: string | null;
  accrualName?: string | null;
  employeeId?: string | null;
  employee?: { id: string; label: string; tabNumber?: string } | null;
  amount: number;
  startDate?: string | null;
  endDate?: string | null;
  status: PaymentOrderStatus | string;
  note?: string | null;
};

export function orderStatusLabel(status?: string | null) {
  if (status === 'sent') return 'Отправлено';
  if (status === 'paid') return 'Выплачено';
  return 'Новое';
}

export function orderTitle(mode: 'create' | 'edit' | 'view') {
  const suffix = mode === 'create' ? 'создание' : mode === 'view' ? 'просмотр' : 'изменение';
  return `Поручение (${suffix})`;
}

export function moneyOrder(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

export { fmtDate };
