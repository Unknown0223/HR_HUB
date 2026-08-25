export type IikoSaleRow = {
  id: string;
  saleDate: string;
  iikoUser: string;
  product: string;
  category: string;
  accrual: number;
  amountNoDiscount: number;
  qty: number;
};

export type IikoSalesConfig = {
  sys?: string;
  lastOlapAt?: string;
  lastOlapFrom?: string;
  lastOlapTo?: string;
  sales?: IikoSaleRow[];
};

export function asIikoSalesConfig(raw?: unknown): IikoSalesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as IikoSalesConfig;
}

export function newSaleId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function fmtQty(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3,
  }).format(n || 0);
}
