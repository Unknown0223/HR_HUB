export type BillzMapping = {
  id: string;
  timeGroupId: string;
  timeGroupName: string;
  apiMethodId: string;
  apiMethodName: string;
};

export type BillzUser = {
  id: string;
  billzName: string;
  employeeId?: string;
  employeeName?: string;
  billzDivision?: string;
  phone?: string;
};

export type BillzDivision = {
  id: string;
  billzName: string;
  divisionId?: string;
  divisionName?: string;
};

export type BillzSale = {
  id: string;
  saleDate: string;
  sellerName: string;
  store: string;
  timeGroup: string;
  netAmount: number;
};

export type BillzConfig = {
  sys?: string;
  secretToken?: string;
  mappings?: BillzMapping[];
  users?: BillzUser[];
  divisions?: BillzDivision[];
  sales?: BillzSale[];
};

export const TIME_GROUPS = [
  { id: 'hour', label: 'Час' },
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
] as const;

export const API_METHODS = [
  { id: 'seller.sales', label: 'seller.sales' },
  { id: 'order.list', label: 'order.list' },
  { id: 'shop.list', label: 'shop.list' },
  { id: 'user.list', label: 'user.list' },
  { id: 'product.list', label: 'product.list' },
] as const;

export function asBillzConfig(raw?: unknown): BillzConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as BillzConfig;
}

export function newBillzId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}
