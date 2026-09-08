export type SortDir = 'asc' | 'desc' | 'none';

export type TableFieldDef = {
  key: string;
  label: string;
  /** Shown in column picker */
  column?: boolean;
  /** Shown in sort list */
  sortable?: boolean;
  /** Toggle in search settings */
  searchable?: boolean;
};

export type SortRule = { key: string; dir: SortDir };

export type TablePrefsState = {
  columns: string[];
  searchKeys: string[];
  sort: SortRule[];
};

export type TablePrefsConfig = {
  /** localStorage namespace, e.g. hrhub.table.absence-requests.mine */
  storageKey: string;
  title: string;
  fields: TableFieldDef[];
  defaultColumns: string[];
  defaultSearchKeys: string[];
  defaultSort: SortRule[];
};
