export type AvgSalaryMeta = {
  positionId?: string;
  positionName?: string;
  gradeId?: string;
  gradeName?: string;
  valueFrom?: number;
  valueTo?: number | null;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(n?: number | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('ru-RU');
}

export function displayMoney(n?: number | null): string {
  const s = formatMoney(n);
  return s || '—';
}

export function positionLabel(name: string, meta?: AvgSalaryMeta | null): string {
  return meta?.positionName || name || '—';
}

export function gradeLabel(meta?: AvgSalaryMeta | null): string {
  return meta?.gradeName || '';
}
