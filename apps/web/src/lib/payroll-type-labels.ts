/** Payroll line / accrual type codes → Russian UI labels (Arena). */
export const PAYROLL_TYPE_LABELS: Record<string, string> = {
  base: 'Оклад',
  bonus: 'Премия',
  penalty: 'Штраф',
  deduction: 'Удержание',
  overtime: 'Сверхурочные',
  other: 'Прочее',
  advance: 'Аванс',
};

export const PAYROLL_TYPE_OPTIONS = Object.entries(PAYROLL_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function payrollTypeLabel(type: string | null | undefined): string {
  const key = (type ?? '').trim().toLowerCase();
  if (!key) return '—';
  return PAYROLL_TYPE_LABELS[key] ?? type!.trim();
}
