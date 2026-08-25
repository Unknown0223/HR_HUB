export type AccountPair = {
  id: string;
  code: string;
  name: string;
  firstAccount: string;
  secondAccount: string;
  debitAccount?: string;
  creditAccount?: string;
  sortOrder: number;
  isActive: boolean;
  subcontos: string[];
};

export type SettlementLine = {
  id?: string;
  accountPairId?: string | null;
  pairName: string;
  currency: string;
  subconto: string;
  firstAmount: number;
  secondAmount: number;
  amount: number;
};

export type SettlementDoc = {
  id: string;
  number?: string | null;
  title?: string | null;
  note?: string | null;
  status: 'open' | 'matched' | 'closed';
  posted?: boolean;
  amount: number;
  docDate: string;
  createdAt: string;
  createdByName?: string | null;
  pairIds: string[];
  pairs: AccountPair[];
  lines: SettlementLine[];
};

export type SettlementAudit = {
  id: string;
  occurredAt: string;
  userName: string;
  eventType: string;
  organization?: string;
  product?: string;
  settlement?: { id: string; number?: string | null; title?: string | null } | null;
};

export function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function toDatetimeLocal(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function accountLabel(codeOrName: string) {
  return codeOrName || '—';
}
