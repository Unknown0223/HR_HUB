/** Verifix data types for dynamic fields */

export const DYNAMIC_FIELD_TYPES = [
  { value: 'number', label: 'номер' },
  { value: 'date', label: 'дата' },
  { value: 'string', label: 'строка' },
  { value: 'checkbox', label: 'флажок' },
  { value: 'select', label: 'выпадающий список' },
  { value: 'select_multi', label: 'выпадающий список (множественный выбор)' },
  { value: 'ref', label: 'справочник' },
  { value: 'ref_multi', label: 'справочник (множественный выбор)' },
  { value: 'file', label: 'файл' },
  { value: 'photo', label: 'фото' },
  { value: 'video', label: 'видео' },
] as const;

export type DynamicFieldDataType = (typeof DYNAMIC_FIELD_TYPES)[number]['value'];

export function dynamicFieldTypeLabel(value?: string | null) {
  return DYNAMIC_FIELD_TYPES.find((t) => t.value === value)?.label || value || '—';
}

export function isReferenceDataType(value?: string | null) {
  return value === 'ref' || value === 'ref_multi';
}

export function isSelectDataType(value?: string | null) {
  return value === 'select' || value === 'select_multi';
}
