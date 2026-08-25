export type Billz1Sale = {
  id: string;
  billzDivision: string;
  divisionId?: string;
  divisionName?: string;
  billzSeller: string;
  employeeId?: string;
  employeeName?: string;
  saleDate: string;
  amount: number;
};

export type Billz1Config = {
  sys?: string;
  subject?: string;
  secretKey?: string;
  lastLoadFrom?: string;
  lastLoadTo?: string;
  sales?: Billz1Sale[];
};

export function asBillz1Config(raw?: unknown): Billz1Config {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Billz1Config;
}

export function newBillz1Id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function monthStartISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-01`;
}
