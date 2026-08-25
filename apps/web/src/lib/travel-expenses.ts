import { fmtDate, money } from './accruals';

export type TravelStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type TravelLine = {
  id?: string;
  accrualName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  amount: number;
  note?: string | null;
};

export type TravelTripOpt = {
  id: string;
  title: string;
  label: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  amount: number;
  days: number;
};

export type TravelDoc = {
  id: string;
  number: string;
  docDate: string;
  employeeId: string;
  employee?: { id: string; label: string; tabNumber?: string; divisionName?: string } | null;
  tripId?: string | null;
  trip?: { id: string; title: string } | null;
  tripNumber?: string;
  tripDays?: number;
  currency: string;
  advance: number;
  amount: number;
  balance: number;
  calcForSalary: boolean;
  status: TravelStatus | string;
  note?: string | null;
  lines: TravelLine[];
};

export const TRAVEL_CURRENCIES = [
  { value: 'UZS', label: 'Узбекский сум' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

export function travelStatusLabel(status?: string | null) {
  if (status === 'approved') return 'Завершён';
  if (status === 'pending') return 'На согласовании';
  if (status === 'rejected') return 'Отклонён';
  return 'Черновик';
}

export function travelTitle(mode: 'create' | 'edit' | 'view') {
  const suffix = mode === 'create' ? 'создание' : mode === 'view' ? 'просмотр' : 'изменение';
  return `Авансовый отчет по командировке (${suffix})`;
}

export { fmtDate, money };
