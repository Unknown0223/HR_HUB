import type { ColumnDef } from '@/lib/catalog-columns';
import type { TableFieldDef, TablePrefsConfig, SortRule } from '@/components/table-prefs';

/** Build TablePrefsConfig from catalog ColumnDef lists (Verifix-style). */
export function prefsConfigFromColumns(opts: {
  storageKey: string;
  title: string;
  columns: ColumnDef[];
  /** Keys shown by default; defaults to first 6 / all if fewer */
  defaultColumns?: string[];
  defaultSearchKeys?: string[];
  defaultSort?: SortRule[];
  searchableKeys?: string[];
}): TablePrefsConfig {
  const fields: TableFieldDef[] = opts.columns.map((c) => ({
    key: c.key,
    label: c.label,
    column: true,
    sortable: true,
    searchable: opts.searchableKeys
      ? opts.searchableKeys.includes(c.key)
      : /name|title|code|fio|phone|email|number|note/i.test(c.key) ||
        /Наимен|ФИО|Код|Телефон|E-mail|Номер|Примеч/i.test(c.label),
  }));
  const keys = fields.map((f) => f.key);
  const defaults =
    opts.defaultColumns?.filter((k) => keys.includes(k)) ??
    keys.slice(0, Math.min(6, keys.length));
  const searchDefaults =
    opts.defaultSearchKeys?.filter((k) => keys.includes(k)) ??
    fields.filter((f) => f.searchable).map((f) => f.key).slice(0, 4);
  return {
    storageKey: opts.storageKey,
    title: opts.title.startsWith('Настройка таблицы')
      ? opts.title
      : `Настройка таблицы: ${opts.title}`,
    fields,
    defaultColumns: defaults.length ? defaults : keys.slice(0, 1),
    defaultSearchKeys: searchDefaults.length ? searchDefaults : defaults.slice(0, 1),
    defaultSort: opts.defaultSort?.length
      ? opts.defaultSort
      : [{ key: defaults[0] || keys[0], dir: 'asc' }],
  };
}

export function cellFromFlat(
  flat: Record<string, unknown>,
  key: string,
): string {
  const v = flat[key];
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
