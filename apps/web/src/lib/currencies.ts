export type CurrencyRate = { date: string; rate: number };

export type CurrencyRateLog = {
  createdAt: string;
  userName?: string;
  date: string;
  rate: number;
};

export type CurrencyMeta = {
  iso?: string;
  unit?: string;
  subunit?: string;
  affixKind?: 'prefix' | 'postfix';
  affix?: string;
  roundingType?: string;
  rounding?: string;
  rates?: CurrencyRate[];
  rateLog?: CurrencyRateLog[];
  autoCbu?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export const CFG_CODE = '_CFG';
export const BASE_ISO = 'UZS';
export const BASE_NAME = 'Узбекский сум';

export const ROUNDING_TYPES = [
  { value: 'nearest', label: 'До ближайшего' },
  { value: 'up', label: 'Вверх' },
  { value: 'down', label: 'Вниз' },
] as const;

export const ROUNDING_FORMATS = [
  '####.##0000',
  '####.##',
  '####',
  '####.###',
  '####.####',
] as const;

export function asCurrencyMeta(raw?: unknown): CurrencyMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as CurrencyMeta;
}

export function isHiddenCurrency(code?: string) {
  return Boolean(code && code.startsWith('_'));
}

export function isBaseCurrency(code?: string, meta?: CurrencyMeta) {
  const c = (code || '').toUpperCase();
  const iso = (meta?.iso || '').toUpperCase();
  return c === 'UZS' || c === '860' || iso === 'UZS' || iso === '860';
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('ru-RU');
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

export function eventLabel(action: string) {
  if (action === 'dictionary.item.create') return 'Создан';
  if (action === 'dictionary.item.update') return 'Изменен';
  if (action === 'dictionary.item.delete') return 'Удален';
  return action;
}

export function roundingTypeLabel(value?: string) {
  return ROUNDING_TYPES.find((r) => r.value === value)?.label || value || '';
}

export function affixKindLabel(kind?: string) {
  if (kind === 'prefix') return 'Префикс';
  if (kind === 'postfix') return 'Постфикс';
  return '';
}

export function formatRate(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return String(n);
}

export function parseRate(raw: string) {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function rateOnDate(rates: CurrencyRate[] | undefined, date: string) {
  const list = [...(rates || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  const exact = list.find((r) => r.date === date);
  if (exact) return exact.rate;
  const prev = [...list].reverse().find((r) => r.date <= date);
  return prev ? prev.rate : null;
}

export function upsertRate(rates: CurrencyRate[] | undefined, date: string, rate: number) {
  const next = [...(rates || [])];
  const i = next.findIndex((r) => r.date === date);
  if (i >= 0) next[i] = { date, rate };
  else next.push({ date, rate });
  next.sort((a, b) => b.date.localeCompare(a.date));
  return next;
}

export function matchCbuRow(
  code: string,
  meta: CurrencyMeta,
  row: { code: string; ccy: string },
) {
  const item = (code || '').toUpperCase();
  const iso = (meta.iso || '').toUpperCase();
  const num = (row.code || '').toUpperCase();
  const ccy = (row.ccy || '').toUpperCase();
  return item === num || item === ccy || iso === num || iso === ccy;
}
