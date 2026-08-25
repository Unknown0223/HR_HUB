export type CashboxRef = { id: string; label: string };

export type CashboxMeta = {
  responsible?: CashboxRef[];
  locations?: CashboxRef[];
  currencies?: CashboxRef[];
  balance?: number | null;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export function asCashboxMeta(raw?: unknown): CashboxMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as CashboxMeta;
}

export function displayCode(code?: string) {
  if (!code || code.startsWith('AUTO_')) return '';
  return code;
}

export function labelsOf(list?: CashboxRef[]) {
  return (list || []).map((x) => x.label).filter(Boolean).join(', ');
}

export function formatBalance(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('ru-RU');
}

export function eventLabel(action: string) {
  if (action === 'dictionary.item.create') return 'Создан';
  if (action === 'dictionary.item.update') return 'Изменен';
  if (action === 'dictionary.item.delete') return 'Удален';
  return action;
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}
