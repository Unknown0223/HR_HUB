export type ManualOpStatus = 'draft' | 'posted';

export type ManualLine = {
  id?: string;
  debitAccount: string;
  debitName?: string | null;
  creditAccount: string;
  creditName?: string | null;
  quantity: number;
  amount: number;
  amountBase: number;
};

export type ManualOp = {
  id: string;
  status: ManualOpStatus;
  posted: boolean;
  number?: string | null;
  docDate: string;
  note?: string | null;
  totalAmount: number;
  debitAccounts?: string;
  creditAccounts?: string;
  debitNames?: string;
  creditNames?: string;
  createdByName?: string | null;
  createdAt: string;
  lines: ManualLine[];
};

export type ManualAudit = {
  id: string;
  occurredAt: string;
  userName: string;
  eventType: string;
  organization?: string;
  product?: string;
  op?: { id: string; number?: string | null } | null;
};

export type CoaOpt = { code: string; name: string; label: string };

export function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
}

export function emptyLine(): ManualLine {
  return { debitAccount: '', debitName: '', creditAccount: '', creditName: '', quantity: 0, amount: 0, amountBase: 0 };
}

export function toDatetimeLocal(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
