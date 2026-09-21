'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './filter-panel.module.css';

export type FilterSelectOption = { value: string; label: string };

function splitCsv(value: string): string[] {
  return (value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCsv(ids: string[]): string {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))].join(',');
}

/**
 * Searchable select for FilterPanel.
 * - multiple=false: pick one (or clear)
 * - multiple=true: comma-separated values in URL/state
 */
export function FilterSelectLookup({
  value,
  options,
  multiple = false,
  searchable = true,
  placeholder = 'Выберите…',
  searchPlaceholder = 'Поиск…',
  onChange,
}: {
  value: string;
  options: FilterSelectOption[];
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (next: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const selectedIds = useMemo(() => splitCsv(value), [value]);
  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((o) => o.value === id))
        .filter((o): o is FilterSelectOption => Boolean(o)),
    [options, selectedIds],
  );

  const available = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    return options.filter((o) => {
      if (!o.value) return false;
      if (multiple && selectedIds.includes(o.value)) return false;
      if (!qq) return true;
      return o.label.toLowerCase().includes(qq);
    });
  }, [options, selectedIds, draft, multiple]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(id: string) {
    if (!id) {
      onChange('');
      setOpen(false);
      setDraft('');
      return;
    }
    if (multiple) {
      onChange(joinCsv([...selectedIds, id]));
      setDraft('');
      return;
    }
    onChange(id);
    setOpen(false);
    setDraft('');
  }

  function remove(id: string) {
    if (multiple) {
      onChange(joinCsv(selectedIds.filter((x) => x !== id)));
      return;
    }
    onChange('');
  }

  const closedLabel =
    selected.length === 0
      ? placeholder
      : multiple
        ? selected.length === 1
          ? selected[0].label
          : `Выбрано: ${selected.length}`
        : selected[0]?.label || placeholder;

  return (
    <div
      className={[styles.lookup, open ? styles.lookupOpen : ''].filter(Boolean).join(' ')}
      ref={wrapRef}
    >
      <button
        type="button"
        className={[
          styles.lookupTrigger,
          selected.length ? styles.lookupTriggerActive : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        onClick={() => {
          setDraft('');
          setOpen((v) => !v);
        }}
      >
        <span
          className={
            selected.length ? styles.lookupValue : styles.lookupPlaceholder
          }
        >
          {closedLabel}
        </span>
        {selected.length > 0 ? (
          <span className={styles.lookupBadge}>{selected.length}</span>
        ) : null}
        <span className={styles.lookupChev} aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div className={styles.lookupMenu} role="listbox">
          {searchable ? (
            <div className={styles.lookupSearch}>
              <span aria-hidden>⌕</span>
              <input
                autoFocus
                type="search"
                value={draft}
                placeholder={searchPlaceholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
              />
            </div>
          ) : null}

          {multiple && selected.length > 0 ? (
            <div className={styles.lookupSelected}>
              {selected.map((s) => (
                <span key={s.value} className={styles.chip}>
                  <span className={styles.chipText} title={s.label}>
                    {s.label}
                  </span>
                  <button
                    type="button"
                    className={styles.chipX}
                    aria-label={`Убрать ${s.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => remove(s.value)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                className={styles.lookupClearAll}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange('');
                  setDraft('');
                }}
              >
                Очистить
              </button>
            </div>
          ) : null}

          {!multiple ? (
            <button
              type="button"
              className={styles.lookupOpt}
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick('')}
            >
              — Все —
            </button>
          ) : null}

          {available.length === 0 ? (
            <div className={styles.lookupEmpty}>Нет совпадений</div>
          ) : (
            available.map((o) => {
              const active = !multiple && selectedIds.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={active}
                  className={
                    active
                      ? `${styles.lookupOpt} ${styles.lookupOptActive}`
                      : styles.lookupOpt
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                >
                  <span className={styles.lookupOptText}>{o.label}</span>
                  {active ? <span className={styles.lookupCheck}>✓</span> : null}
                  {multiple ? <span className={styles.lookupAdd}>+</span> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
