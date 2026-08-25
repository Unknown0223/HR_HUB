'use client';

import {
  DragEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import styles from './filter-panel.module.css';

export type FilterSelectOption = { value: string; label: string };

export type FilterFieldDef = {
  type:
    | 'search'
    | 'dateFrom'
    | 'dateTo'
    | 'dateRange'
    | 'divisionId'
    | 'positionId'
    | 'status'
    | 'isActive'
    | 'select'
    | 'postedChecks'
    | 'text';
  key?: string;
  /** For dateRange: from-key (default from) */
  fromKey?: string;
  /** For dateRange: to-key (default to) */
  toKey?: string;
  label?: string;
  options?: FilterSelectOption[];
  placeholder?: string;
  /** Operator shown in Verifix row (default =) */
  operator?: string;
};

const DEFAULT_KEYS: Record<FilterFieldDef['type'], string> = {
  search: 'q',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  dateRange: 'from',
  divisionId: 'divisionId',
  positionId: 'positionId',
  status: 'status',
  isActive: 'isActive',
  select: '',
  postedChecks: 'posted',
  text: '',
};

const DEFAULT_LABELS: Record<string, string> = {
  q: 'Поиск',
  dateFrom: 'Дата с',
  dateTo: 'Дата по',
  from: 'Дата',
  to: 'Дата по',
  number: 'Номер',
  documentNumber: 'Номер',
  oldName: 'Предыдущие имена',
  divisionId: 'Подразделение',
  positionId: 'Должность',
  employeeId: 'Сотрудники',
  status: 'Статус',
  isActive: 'Активность',
  posted: 'Проведен',
};

function fieldKey(field: FilterFieldDef): string {
  if (field.key) return field.key;
  return DEFAULT_KEYS[field.type] || field.type;
}

function fieldLabel(field: FilterFieldDef): string {
  if (field.label) return field.label;
  const k = fieldKey(field);
  return DEFAULT_LABELS[k] ?? k;
}

/** Stable id for a field definition (used for visible list / DnD). */
export function fieldId(field: FilterFieldDef): string {
  if (field.type === 'dateRange') {
    return `range:${field.fromKey || 'from'}:${field.toKey || 'to'}:${field.label || ''}`;
  }
  const k = fieldKey(field);
  return k || `${field.type}:${field.label || ''}`;
}

/** Collect all URL keys a field definition touches. */
export function filterFieldKeys(fields: FilterFieldDef[]): string[] {
  const keys: string[] = [];
  for (const f of fields) {
    if (f.type === 'dateRange') {
      keys.push(f.fromKey || 'from', f.toKey || 'to');
    } else if (f.type === 'dateFrom' || f.type === 'dateTo') {
      keys.push(fieldKey(f));
    } else {
      const k = fieldKey(f);
      if (k) keys.push(k);
    }
  }
  return [...new Set(keys)];
}

function keysForField(field: FilterFieldDef): string[] {
  if (field.type === 'dateRange') {
    return [field.fromKey || 'from', field.toKey || 'to'];
  }
  const k = fieldKey(field);
  return k ? [k] : [];
}

export type FilterPanelProps = {
  open: boolean;
  onToggle: () => void;
  onApply?: () => void;
  onReset?: () => void;
  children?: ReactNode;
  fields?: FilterFieldDef[];
  values?: Record<string, string>;
  onChange?: (key: string, value: string) => void;
  urlSync?: boolean;
  resetKeys?: string[];
  /** Modal title */
  title?: string;
  /** Render toggle inline (same row as toolbar actions) */
  inline?: boolean;
};

/** Read current filter keys from the URL query string. */
export function useFilterFromUrl(keys: readonly string[]): Record<string, string> {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = searchParams?.get(k) ?? '';
    return out;
  }, [keys, searchParams]);
}

function layoutStorageKey(pathname: string, allIds: string[]) {
  return `hrhub_filter_layout:${pathname}:${allIds.join('|')}`;
}

function loadVisibleIds(pathname: string, allIds: string[]): string[] {
  if (typeof window === 'undefined') return allIds;
  try {
    const raw = localStorage.getItem(layoutStorageKey(pathname, allIds));
    if (!raw) return allIds;
    const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
    const order = Array.isArray(parsed.order) ? parsed.order : allIds;
    const hidden = new Set(Array.isArray(parsed.hidden) ? parsed.hidden : []);
    const known = new Set(allIds);
    const next = order.filter((id) => known.has(id) && !hidden.has(id));
    for (const id of allIds) {
      if (!next.includes(id) && !hidden.has(id)) next.push(id);
    }
    return next;
  } catch {
    return allIds;
  }
}

function saveVisibleIds(pathname: string, allIds: string[], visible: string[]) {
  if (typeof window === 'undefined') return;
  const hidden = allIds.filter((id) => !visible.includes(id));
  localStorage.setItem(
    layoutStorageKey(pathname, allIds),
    JSON.stringify({ order: visible, hidden }),
  );
}

export function FilterPanel({
  open,
  onToggle,
  onApply,
  onReset,
  children,
  fields = [],
  values: controlledValues,
  onChange,
  urlSync,
  resetKeys,
  title = 'Фильтр',
  inline = false,
}: FilterPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const keys = useMemo(() => filterFieldKeys(fields), [fields]);
  const allIds = useMemo(() => fields.map(fieldId), [fields]);
  const fieldById = useMemo(() => {
    const map = new Map<string, FilterFieldDef>();
    fields.forEach((f) => map.set(fieldId(f), f));
    return map;
  }, [fields]);

  const syncUrl = urlSync ?? (controlledValues === undefined && fields.length > 0);

  const urlValues = useFilterFromUrl(keys);
  const sourceValues = useMemo(() => {
    const base = controlledValues ?? urlValues;
    if (
      keys.includes('posted') &&
      !(base.posted ?? '').trim() &&
      (searchParams?.get('status') ?? '') === 'posted'
    ) {
      return { ...base, posted: 'yes' };
    }
    return base;
  }, [controlledValues, urlValues, keys, searchParams]);
  const [draft, setDraft] = useState<Record<string, string>>(sourceValues);
  const [visibleIds, setVisibleIds] = useState<string[]>(allIds);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(sourceValues);
  }, [sourceValues]);

  useEffect(() => {
    if (!allIds.length) {
      setVisibleIds([]);
      return;
    }
    setVisibleIds(loadVisibleIds(pathname || '/', allIds));
  }, [pathname, allIds.join('|')]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onToggle]);

  const persistVisible = useCallback(
    (next: string[]) => {
      setVisibleIds(next);
      saveVisibleIds(pathname || '/', allIds, next);
    },
    [pathname, allIds],
  );

  const activeCount = useMemo(
    () => keys.filter((k) => (sourceValues[k] ?? '').trim()).length,
    [keys, sourceValues],
  );

  const setField = useCallback(
    (key: string, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      if (!syncUrl && controlledValues !== undefined) onChange?.(key, value);
    },
    [controlledValues, onChange, syncUrl],
  );

  const pushToUrl = useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      for (const k of keys) {
        const v = (next[k] ?? '').trim();
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const posted = (next.posted ?? '').trim();
      if (posted === 'yes') {
        params.set('status', 'posted');
        params.set('posted', 'yes');
      } else if (posted === 'no') {
        params.delete('status');
        params.set('posted', 'no');
      } else if (posted === 'both') {
        params.delete('status');
        params.set('posted', 'both');
      } else {
        params.delete('posted');
        if (keys.includes('posted') && params.get('status') === 'posted') {
          params.delete('status');
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [keys, pathname, router, searchParams],
  );

  function handleApply() {
    if (syncUrl) pushToUrl(draft);
    else if (controlledValues !== undefined) {
      for (const k of keys) onChange?.(k, draft[k] ?? '');
    }
    onApply?.();
    onToggle();
  }

  function handleReset() {
    const cleared: Record<string, string> = {};
    const toClear = resetKeys ?? keys;
    for (const k of toClear) cleared[k] = '';
    const next = { ...draft, ...cleared };
    setDraft(next);
    if (syncUrl) pushToUrl(next);
    else if (controlledValues !== undefined) {
      for (const k of toClear) onChange?.(k, '');
    }
    onReset?.();
  }

  function handleResetAll() {
    handleReset();
  }

  function addParam(id: string) {
    if (!id || visibleIds.includes(id)) return;
    persistVisible([...visibleIds, id]);
  }

  function removeParam(id: string) {
    const field = fieldById.get(id);
    if (field) {
      const clearKeys = keysForField(field);
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of clearKeys) next[k] = '';
        return next;
      });
    }
    persistVisible(visibleIds.filter((x) => x !== id));
  }

  function restoreDefaultsLayout() {
    persistVisible(allIds);
    handleReset();
  }

  function onDragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  }

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const from = visibleIds.indexOf(sourceId);
    const to = visibleIds.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...visibleIds];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    persistVisible(next);
  }

  function onDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  const availableToAdd = useMemo(
    () => allIds.filter((id) => !visibleIds.includes(id)),
    [allIds, visibleIds],
  );

  const visibleFields = useMemo(
    () =>
      visibleIds
        .map((id) => fieldById.get(id))
        .filter((f): f is FilterFieldDef => Boolean(f)),
    [visibleIds, fieldById],
  );

  function renderControl(field: FilterFieldDef) {
    const key = fieldKey(field);
    const value = draft[key] ?? '';

    if (field.type === 'search' || field.type === 'text') {
      return (
        <div className={styles.controlGrow}>
          <span className={styles.searchIcon} aria-hidden>
            ⌕
          </span>
          <input
            className={styles.inputWithIcon}
            type="search"
            value={value}
            placeholder={field.placeholder ?? 'Поиск...'}
            onChange={(e) => setField(key, e.target.value)}
          />
        </div>
      );
    }

    if (field.type === 'dateRange') {
      const fromKey = field.fromKey || 'from';
      const toKey = field.toKey || 'to';
      return (
        <div className={styles.datePair}>
          <input
            className={styles.input}
            type="date"
            value={draft[fromKey] ?? ''}
            onChange={(e) => setField(fromKey, e.target.value)}
          />
          <input
            className={styles.input}
            type="date"
            value={draft[toKey] ?? ''}
            onChange={(e) => setField(toKey, e.target.value)}
          />
        </div>
      );
    }

    if (field.type === 'dateFrom' || field.type === 'dateTo') {
      return (
        <input
          className={styles.input}
          type="date"
          value={value}
          onChange={(e) => setField(key, e.target.value)}
        />
      );
    }

    if (field.type === 'postedChecks') {
      const posted = draft[key] ?? '';
      const yes = posted === 'yes' || posted === 'both';
      const no = posted === 'no' || posted === 'both';
      const setPosted = (nextYes: boolean, nextNo: boolean) => {
        if (nextYes && nextNo) setField(key, 'both');
        else if (nextYes) setField(key, 'yes');
        else if (nextNo) setField(key, 'no');
        else setField(key, '');
      };
      return (
        <div className={styles.checks}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={yes}
              onChange={(e) => setPosted(e.target.checked, no)}
            />
            Да
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={no}
              onChange={(e) => setPosted(yes, e.target.checked)}
            />
            Нет
          </label>
        </div>
      );
    }

    const options = field.options ?? [];
    const isSelect =
      field.type === 'select' ||
      field.type === 'divisionId' ||
      field.type === 'positionId' ||
      field.type === 'status' ||
      field.type === 'isActive';

    if (isSelect) {
      const defaultIsActive: FilterSelectOption[] = [
        { value: '', label: 'Все' },
        { value: '1', label: 'Активные' },
        { value: '0', label: 'Неактивные' },
      ];
      const opts =
        field.type === 'isActive' && !field.options?.length
          ? defaultIsActive
          : [{ value: '', label: '—' }, ...options];

      return (
        <select
          className={styles.select}
          value={value}
          onChange={(e) => setField(key, e.target.value)}
        >
          {opts.map((o) => (
            <option key={o.value || '__all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    return null;
  }

  function renderRow(field: FilterFieldDef) {
    const id = fieldId(field);
    const dragging = dragId === id;
    const over = overId === id && dragId !== id;

    return (
      <div
        key={id}
        className={[
          styles.row,
          dragging ? styles.rowDragging : '',
          over ? styles.rowDropTarget : '',
        ]
          .filter(Boolean)
          .join(' ')}
        draggable={false}
        onDragOver={(e) => onDragOver(e, id)}
        onDrop={(e) => onDrop(e, id)}
        onDragEnd={onDragEnd}
      >
        <span
          className={styles.grip}
          title="Перетащите для изменения порядка"
          draggable
          onDragStart={(e) => onDragStart(e, id)}
          onDragEnd={onDragEnd}
        >
          ⋮⋮
        </span>
        <span className={styles.rowLabel}>{fieldLabel(field)}</span>
        <span className={styles.operator}>{field.operator || '='}</span>
        <div className={styles.rowControl}>{renderControl(field)}</div>
        <button
          type="button"
          className={styles.removeBtn}
          title="Удалить параметр"
          aria-label={`Удалить ${fieldLabel(field)}`}
          onClick={() => removeParam(id)}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className={inline ? styles.rootInline : styles.root}>
      <div className={styles.toggleBar}>
        <button
          type="button"
          className={open ? styles.toggleBtnOpen : styles.toggleBtn}
          onClick={onToggle}
          aria-expanded={open}
        >
          Фильтр
          <span className={styles.chev}>{open ? '▴' : '▾'}</span>
        </button>
        {activeCount > 0 ? (
          <span className={styles.activeCount} title="Активные фильтры">
            {activeCount}
          </span>
        ) : null}
      </div>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.backdrop}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) onToggle();
              }}
            >
              <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>{title}</h2>
                  <button
                    type="button"
                    className={styles.closeX}
                    aria-label="Закрыть"
                    onClick={onToggle}
                  >
                    ×
                  </button>
                </div>

                <div className={styles.modalToolbar}>
                  <label className={styles.templateField}>
                    <span>Шаблон</span>
                    <select className={styles.templateSelect} defaultValue="">
                      <option value="">—</option>
                      <option value="default">По умолчанию</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.btnToolbar}
                    onClick={restoreDefaultsLayout}
                  >
                    По умолчанию
                  </button>
                  <label className={styles.addParamsField}>
                    <span className={styles.srOnly}>Добавить параметры</span>
                    <select
                      className={styles.addParamsSelect}
                      value=""
                      disabled={!availableToAdd.length}
                      onChange={(e) => {
                        addParam(e.target.value);
                        e.target.value = '';
                      }}
                      aria-label="Добавить параметры"
                    >
                      <option value="">
                        {availableToAdd.length
                          ? 'Добавить параметры'
                          : 'Все параметры добавлены'}
                      </option>
                      {availableToAdd.map((id) => {
                        const f = fieldById.get(id);
                        if (!f) return null;
                        return (
                          <option key={id} value={id}>
                            {fieldLabel(f)}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>

                <div className={styles.modalBody}>
                  {children ? (
                    children
                  ) : visibleFields.length ? (
                    visibleFields.map(renderRow)
                  ) : (
                    <p className={styles.emptyHint}>
                      Нет параметров — добавьте через «Добавить параметры»
                    </p>
                  )}
                </div>

                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.btnApply}
                    onClick={handleApply}
                  >
                    Применить
                  </button>
                  <button
                    type="button"
                    className={styles.btnReset}
                    onClick={handleResetAll}
                  >
                    Сбросить все
                  </button>
                  <button
                    type="button"
                    className={styles.btnReset}
                    onClick={onToggle}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
