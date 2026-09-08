'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SortDir,
  SortRule,
  TableFieldDef,
  TablePrefsConfig,
  TablePrefsState,
} from './types';

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function normalizeState(
  raw: Partial<TablePrefsState> | null,
  cfg: TablePrefsConfig,
): TablePrefsState {
  const allowed = new Set(cfg.fields.map((f) => f.key));
  const columns = (raw?.columns || []).filter((k) => allowed.has(k));
  const searchKeys = (raw?.searchKeys || []).filter((k) => allowed.has(k));
  const sort = (raw?.sort || [])
    .filter(
      (r) =>
        r &&
        allowed.has(r.key) &&
        (r.dir === 'asc' || r.dir === 'desc' || r.dir === 'none'),
    )
    .map((r) => ({ key: r.key, dir: r.dir as SortDir }));
  return {
    columns: columns.length ? columns : [...cfg.defaultColumns],
    searchKeys: searchKeys.length ? searchKeys : [...cfg.defaultSearchKeys],
    sort: sort.length ? sort : cfg.defaultSort.map((r) => ({ ...r })),
  };
}

export function useTablePrefs(cfg: TablePrefsConfig) {
  const [state, setState] = useState<TablePrefsState>(() =>
    normalizeState(null, cfg),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [draftColumns, setDraftColumns] = useState<string[]>([]);
  const [draftSearch, setDraftSearch] = useState<string[]>([]);
  const [draftSort, setDraftSort] = useState<SortRule[]>([]);

  useEffect(() => {
    setState(normalizeState(loadJSON(cfg.storageKey, null), cfg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.storageKey]);

  const persist = useCallback(
    (next: TablePrefsState) => {
      setState(next);
      saveJSON(cfg.storageKey, next);
    },
    [cfg.storageKey],
  );

  const labelOf = useCallback(
    (key: string) => cfg.fields.find((f) => f.key === key)?.label ?? key,
    [cfg.fields],
  );

  const columnFields = useMemo(
    () => cfg.fields.filter((f) => f.column !== false),
    [cfg.fields],
  );
  const sortableFields = useMemo(
    () => cfg.fields.filter((f) => f.sortable !== false),
    [cfg.fields],
  );
  const searchableFields = useMemo(
    () => cfg.fields.filter((f) => f.searchable),
    [cfg.fields],
  );

  const openSort = () => {
    const active = state.sort.filter((r) => r.dir !== 'none');
    const rest = sortableFields
      .filter((f) => !active.some((a) => a.key === f.key))
      .map((f) => ({ key: f.key, dir: 'none' as SortDir }));
    setDraftSort([...active, ...rest]);
    setSortOpen(true);
    setMenuOpen(false);
  };

  const openSettings = () => {
    setDraftColumns([...state.columns]);
    setDraftSearch([...state.searchKeys]);
    setSettingsOpen(true);
    setMenuOpen(false);
  };

  const applySort = () => {
    const next = draftSort.filter((r) => r.dir !== 'none');
    persist({
      ...state,
      sort: next.length
        ? next
        : cfg.defaultSort.map((r) => ({ ...r })),
    });
    setSortOpen(false);
  };

  const applySettings = () => {
    persist({
      ...state,
      columns: draftColumns.length ? draftColumns : [...cfg.defaultColumns],
      searchKeys: draftSearch.length
        ? draftSearch
        : [...cfg.defaultSearchKeys],
    });
    setSettingsOpen(false);
  };

  const resetDefaults = () => {
    const next: TablePrefsState = {
      columns: [...cfg.defaultColumns],
      searchKeys: [...cfg.defaultSearchKeys],
      sort: cfg.defaultSort.map((r) => ({ ...r })),
    };
    persist(next);
    setDraftColumns(next.columns);
    setDraftSearch(next.searchKeys);
    setConfirmDefault(false);
  };

  function applySortToRows<T>(
    rows: T[],
    getValue: (row: T, key: string) => string | number | null | undefined,
  ): T[] {
    const rules = state.sort.filter((r) => r.dir !== 'none');
    if (!rules.length) return rows;
    return [...rows].sort((a, b) => {
      for (const rule of rules) {
        const av = String(getValue(a, rule.key) ?? '');
        const bv = String(getValue(b, rule.key) ?? '');
        const cmp = av.localeCompare(bv, 'ru', {
          numeric: true,
          sensitivity: 'base',
        });
        if (cmp !== 0) return rule.dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  function matchesSearch<T>(
    row: T,
    q: string,
    getValue: (row: T, key: string) => string | number | null | undefined,
  ): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const keys = state.searchKeys.length
      ? state.searchKeys
      : cfg.defaultSearchKeys;
    return keys.some((k) =>
      String(getValue(row, k) ?? '')
        .toLowerCase()
        .includes(needle),
    );
  }

  return {
    state,
    columns: state.columns,
    searchKeys: state.searchKeys,
    sort: state.sort,
    menuOpen,
    setMenuOpen,
    sortOpen,
    setSortOpen,
    settingsOpen,
    setSettingsOpen,
    confirmDefault,
    setConfirmDefault,
    draftColumns,
    setDraftColumns,
    draftSearch,
    setDraftSearch,
    draftSort,
    setDraftSort,
    labelOf,
    columnFields,
    sortableFields,
    searchableFields,
    openSort,
    openSettings,
    applySort,
    applySettings,
    resetDefaults,
    applySortToRows,
    matchesSearch,
    title: cfg.title,
    unusedColumns: columnFields.filter(
      (f: TableFieldDef) => !draftColumns.includes(f.key),
    ),
  };
}

export type TablePrefsApi = ReturnType<typeof useTablePrefs>;
