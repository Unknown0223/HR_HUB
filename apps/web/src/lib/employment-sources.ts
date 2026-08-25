export const EMPLOYMENT_SOURCE_TYPES = [
  { value: 'hire', label: 'Прием' },
  { value: 'dismissal', label: 'Увольнение' },
  { value: 'hire_and_dismissal', label: 'Прием / Увольнение' },
] as const;

export type EmploymentSourceType =
  (typeof EMPLOYMENT_SOURCE_TYPES)[number]['value'];

export function sourceTypeLabel(value?: string | null) {
  return (
    EMPLOYMENT_SOURCE_TYPES.find((x) => x.value === value)?.label ??
    'Прием / Увольнение'
  );
}

export function parseSourceType(
  meta?: { sourceType?: string } | null,
): EmploymentSourceType {
  const v = meta?.sourceType;
  if (v === 'hire' || v === 'dismissal' || v === 'hire_and_dismissal') {
    return v;
  }
  return 'hire_and_dismissal';
}
