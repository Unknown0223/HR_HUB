'use client';

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import styles from './filter-panel.module.css';
import { FilterSelectLookup } from './FilterSelectLookup';

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
  /** Operator shown in HR HUB row (default =) — modal only */
  operator?: string;
  /** Allow selecting several values (stored as comma-separated) */
  multiple?: boolean;
  /** Show search box inside the dropdown (default: auto when many options) */
  searchable?: boolean;
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
  locationId: 'Локация',
  markTypes: 'Тип отметки',
  status: 'Статус',
  isActive: 'Активность',
  posted: 'Проведен',
};

function fieldKey(field: FilterFieldDef): string {
  if (field.key) return field.key;
  return DEFAULT_KEYS[field.type] || field.type;
}

function isPageSearchField(field: FilterFieldDef): boolean {
  if (field.type === 'search') return true;
  const key = fieldKey(field);
  if (field.type === 'text' && (key === 'q' || key === 'search' || key === 'query')) {
    return true;
  }
  return false;
}

function fieldLabel(field: FilterFieldDef): string {
  if (field.label) return field.label;
  const k = fieldKey(field);
  return DEFAULT_LABELS[k] ?? k;
}

/** Stable id for a field definition (used for visible list). */
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
  /** @deprecated Ignored in bar (default) layout */
  open?: boolean;
  /** @deprecated Ignored in bar (default) layout */
  onToggle?: () => void;
  onApply?: () => void;
  onReset?: () => void;
  children?: ReactNode;
  fields?: FilterFieldDef[];
  values?: Record<string, string>;
  onChange?: (key: string, value: string) => void;
  urlSync?: boolean;
  resetKeys?: string[];
  title?: string;
  /** @deprecated Always inline in bar mode */
  inline?: boolean;
  /**
   * `bar` — fields always on the page (default). No modal / no «Фильтр» button.
   * `modal` — legacy popup.
   */
  variant?: 'bar' | 'modal';
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

export function FilterPanel({
  open = false,
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
  variant = 'bar',
}: FilterPanelProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isBar = variant !== 'modal';

  const keys = useMemo(() => filterFieldKeys(fields), [fields]);

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
  const rootRef = useRef<HTMLDivElement>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(sourceValues);
  }, [sourceValues]);

  useEffect(() => {
    return () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, []);

  const activeCount = useMemo(
    () =>
      keys.filter((k) => {
        if (!(sourceValues[k] ?? '').trim()) return false;
        if (k === 'q') return false;
        const field = fields.find((f) => keysForField(f).includes(k));
        if (field && isPageSearchField(field)) return false;
        return true;
      }).length,
    [keys, sourceValues, fields],
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

  const commitValues = useCallback(
    (next: Record<string, string>) => {
      if (syncUrl) pushToUrl(next);
      else if (controlledValues !== undefined) {
        for (const k of keys) onChange?.(k, next[k] ?? '');
      }
      onApply?.();
    },
    [syncUrl, pushToUrl, controlledValues, keys, onChange, onApply],
  );

  const scheduleLiveApply = useCallback(
    (next: Record<string, string>) => {
      if (!isBar) return;
      if (liveTimer.current) clearTimeout(liveTimer.current);
      liveTimer.current = setTimeout(() => commitValues(next), 180);
    },
    [isBar, commitValues],
  );

  const setField = useCallback(
    (key: string, value: string) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        if (isBar) scheduleLiveApply(next);
        else if (!syncUrl && controlledValues !== undefined) onChange?.(key, value);
        return next;
      });
    },
    [isBar, scheduleLiveApply, syncUrl, controlledValues, onChange],
  );

  function handleApply() {
    commitValues(draft);
    if (!isBar) onToggle?.();
  }

  function handleReset() {
    const cleared: Record<string, string> = {};
    const toClear = resetKeys ?? keys;
    for (const k of toClear) cleared[k] = '';
    const next = { ...draft, ...cleared };
    setDraft(next);
    commitValues(next);
    onReset?.();
  }

  const pageSearchFields = useMemo(
    () => fields.filter(isPageSearchField),
    [fields],
  );

  const barFields = useMemo(
    () => fields.filter((f) => !isPageSearchField(f)),
    [fields],
  );

  const applySearchNow = useCallback(
    (key: string, value: string) => {
      const next = { ...draft, [key]: value };
      setDraft(next);
      commitValues(next);
    },
    [draft, commitValues],
  );

  function fieldAllowsMultiple(field: FilterFieldDef): boolean {
    if (field.multiple === false) return false;
    if (field.multiple === true) return true;
    if (field.type === 'divisionId' || field.type === 'positionId') return true;
    if (field.type === 'select') {
      const k = fieldKey(field);
      // Multi by default for common entity picks
      if (
        k === 'employeeId' ||
        k === 'locationId' ||
        k === 'markTypes' ||
        k === 'divisionId' ||
        k === 'positionId' ||
        k.endsWith('Ids') ||
        k.endsWith('Id')
      ) {
        // status-like single enums stay single unless options look like entities
        if (k === 'status' || k === 'isActive' || k === 'posted') return false;
        return true;
      }
    }
    return false;
  }

  function renderControl(field: FilterFieldDef) {
    const key = fieldKey(field);
    const value = draft[key] ?? '';

    if (field.type === 'search') {
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applySearchNow(key, (e.target as HTMLInputElement).value);
              }
            }}
          />
        </div>
      );
    }

    if (field.type === 'text') {
      return (
        <input
          className={styles.input}
          type="text"
          value={value}
          placeholder={field.placeholder ?? fieldLabel(field)}
          aria-label={fieldLabel(field)}
          onChange={(e) => setField(key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applySearchNow(key, (e.target as HTMLInputElement).value);
            }
          }}
        />
      );
    }

    if (field.type === 'dateRange') {
      const fromKey = field.fromKey || 'from';
      const toKey = field.toKey || 'to';
      return (
        <div className={styles.periodRange}>
          <span className={styles.periodGlyph} aria-hidden>
            <i className="fas fa-calendar-week" />
          </span>
          <div className={styles.periodFields}>
            <label className={styles.periodSlot}>
              <span className={styles.periodSlotLabel}>с</span>
              <input
                className={styles.periodInput}
                type="date"
                value={draft[fromKey] ?? ''}
                onChange={(e) => setField(fromKey, e.target.value)}
                aria-label={`${fieldLabel(field)} с`}
              />
            </label>
            <span className={styles.periodDash} aria-hidden>
              —
            </span>
            <label className={styles.periodSlot}>
              <span className={styles.periodSlotLabel}>по</span>
              <input
                className={styles.periodInput}
                type="date"
                value={draft[toKey] ?? ''}
                onChange={(e) => setField(toKey, e.target.value)}
                aria-label={`${fieldLabel(field)} по`}
              />
            </label>
          </div>
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
          aria-label={fieldLabel(field)}
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

    const isSelect =
      field.type === 'select' ||
      field.type === 'divisionId' ||
      field.type === 'positionId' ||
      field.type === 'status' ||
      field.type === 'isActive';

    if (isSelect) {
      const opts = (field.options ?? []).filter((o) => o.value !== '');
      const multiple = fieldAllowsMultiple(field);
      const searchable =
        field.searchable !== undefined
          ? field.searchable
          : opts.length >= 4 || multiple;

      if (
        !multiple &&
        !searchable &&
        (field.type === 'status' || field.type === 'isActive') &&
        opts.length <= 8
      ) {
        const defaultIsActive: FilterSelectOption[] = [
          { value: '', label: 'Все' },
          { value: '1', label: 'Активные' },
          { value: '0', label: 'Неактивные' },
        ];
        const nativeOpts =
          field.type === 'isActive' && !field.options?.length
            ? defaultIsActive
            : [{ value: '', label: '—' }, ...opts];
        return (
          <select
            className={styles.select}
            value={value}
            onChange={(e) => setField(key, e.target.value)}
          >
            {nativeOpts.map((o) => (
              <option key={o.value || '__all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <FilterSelectLookup
          value={value}
          options={opts}
          multiple={multiple}
          searchable={searchable}
          placeholder={field.placeholder ?? fieldLabel(field)}
          searchPlaceholder="Поиск…"
          onChange={(next) => setField(key, next)}
        />
      );
    }

    return null;
  }

  /* ─── Inline bar (default, all pages) ─── */
  if (isBar) {
    return (
      <div
        ref={rootRef}
        className={[
          styles.rootBar,
          inline ? styles.rootBarInline : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.barRow}>
          {pageSearchFields.map((field) => {
            const key = fieldKey(field);
            const value = draft[key] ?? '';
            return (
              <label key={fieldId(field)} className={styles.pageSearch}>
                <span className={styles.pageSearchIcon} aria-hidden>
                  ⌕
                </span>
                <input
                  className={styles.pageSearchInput}
                  type="search"
                  value={value}
                  placeholder={field.placeholder ?? 'Поиск...'}
                  aria-label={fieldLabel(field)}
                  onChange={(e) => setField(key, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applySearchNow(key, (e.target as HTMLInputElement).value);
                    }
                  }}
                  onBlur={(e) => {
                    const next = e.target.value;
                    if ((sourceValues[key] ?? '') !== next) {
                      applySearchNow(key, next);
                    }
                  }}
                />
              </label>
            );
          })}

          {children
            ? children
            : barFields.map((field) => (
                <div
                  key={fieldId(field)}
                  className={[
                    styles.barField,
                    field.type === 'dateRange' || field.type === 'dateFrom'
                      ? styles.barFieldWide
                      : '',
                    field.type === 'postedChecks' || field.type === 'isActive'
                      ? styles.barFieldNarrow
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className={styles.barLabel}>{fieldLabel(field)}</span>
                  <div className={styles.barControl}>{renderControl(field)}</div>
                </div>
              ))}

          {activeCount > 0 ? (
            <button
              type="button"
              className={styles.barReset}
              onClick={handleReset}
              title="Сбросить все фильтры"
            >
              Сбросить
              <span className={styles.activeCount}>{activeCount}</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  /* ─── Legacy modal ─── */
  return (
    <div ref={rootRef} className={inline ? styles.rootInline : styles.root}>
      <div className={styles.toggleBar}>
        {pageSearchFields.map((field) => {
          const key = fieldKey(field);
          const value = draft[key] ?? '';
          return (
            <label key={fieldId(field)} className={styles.pageSearch}>
              <span className={styles.pageSearchIcon} aria-hidden>
                ⌕
              </span>
              <input
                className={styles.pageSearchInput}
                type="search"
                value={value}
                placeholder={field.placeholder ?? 'Поиск...'}
                aria-label={fieldLabel(field)}
                onChange={(e) => setField(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applySearchNow(key, (e.target as HTMLInputElement).value);
                  }
                }}
              />
            </label>
          );
        })}
        <button
          type="button"
          className={open ? styles.toggleBtnOpen : styles.toggleBtn}
          onClick={() => onToggle?.()}
          aria-expanded={open}
        >
          Фильтр
          <span className={styles.chev}>{open ? '▴' : '▾'}</span>
        </button>
        {activeCount > 0 ? (
          <span className={styles.activeCount}>{activeCount}</span>
        ) : null}
      </div>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.backdrop}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) onToggle?.();
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
                    onClick={() => onToggle?.()}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.modalBody}>
                  {children
                    ? children
                    : barFields.map((field) => (
                        <div key={fieldId(field)} className={styles.row}>
                          <span className={styles.rowLabel}>
                            {fieldLabel(field)}
                          </span>
                          <span className={styles.operator}>
                            {field.operator || '='}
                          </span>
                          <div className={styles.rowControl}>
                            {renderControl(field)}
                          </div>
                        </div>
                      ))}
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
                    onClick={handleReset}
                  >
                    Сбросить все
                  </button>
                  <button
                    type="button"
                    className={styles.btnReset}
                    onClick={() => onToggle?.()}
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
