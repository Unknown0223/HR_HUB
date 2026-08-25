'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { pickSearchText, type EmployeePickItem } from '@/components/employee-pick';
import styles from './employee-pick.module.css';

const PREVIEW = 80;

export function EmployeeLookup({
  value,
  options,
  onChange,
  disabled,
  invalid,
  placeholder = 'Поиск...',
}: {
  value: string;
  options: EmployeePickItem[];
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [dropUp, setDropUp] = useState(false);

  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    const list = qq ? options.filter((o) => pickSearchText(o).includes(qq)) : options;
    return showAll ? list : list.slice(0, PREVIEW);
  }, [options, draft, showAll]);

  const more = !showAll && (draft.trim() ? options.filter((o) => pickSearchText(o).includes(draft.trim().toLowerCase())).length : options.length) > PREVIEW;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setDropUp(rect.bottom + 280 > window.innerHeight && rect.top > 280);
  }, [open]);

  return (
    <div className={styles.lookup} ref={wrapRef}>
      <input
        className={`${styles.lookupInput} ${invalid ? styles.lookupInvalid : ''}`}
        disabled={disabled}
        value={open ? draft : selected?.name || ''}
        placeholder={placeholder}
        onFocus={() => {
          setDraft('');
          setShowAll(false);
          setOpen(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setShowAll(false);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {value && !open && !disabled ? (
        <button type="button" className={styles.lookupClear} aria-label="Очистить" onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
      {open && !disabled ? (
        <div className={`${styles.drop} ${dropUp ? styles.dropUp : styles.dropDown}`}>
          <div className={styles.dropHead}>
            <span>Табельный номер</span>
            <span>Сотрудник</span>
          </div>
          <div className={styles.dropBody}>
            {filtered.length === 0 ? <div className={styles.dropEmpty}>Нет данных</div> : null}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${styles.dropOpt} ${styles.dropRow} ${o.id === value ? styles.dropOptOn : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className={styles.dropTab}>{o.tabNumber || '—'}</span>
                <span className={styles.dropName}>{o.name}</span>
              </button>
            ))}
          </div>
          <div className={styles.dropFoot}>
            {more ? (
              <button type="button" className={styles.showAll} onMouseDown={(e) => e.preventDefault()} onClick={() => setShowAll(true)}>
                Показать все
              </button>
            ) : (
              <span />
            )}
            <input
              className={styles.dropSearch}
              placeholder="Поиск..."
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setShowAll(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
