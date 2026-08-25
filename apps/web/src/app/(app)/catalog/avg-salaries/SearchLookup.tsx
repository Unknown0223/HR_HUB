'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import extra from './page.module.css';

type Opt = { id: string; label: string };

export function SearchLookup({
  value,
  options,
  placeholder = 'Поиск...',
  onChange,
  allowClear = false,
}: {
  value: string;
  options: Opt[];
  placeholder?: string;
  onChange: (id: string) => void;
  allowClear?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.label.toLowerCase().includes(qq));
  }, [options, draft]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className={extra.searchWrap} ref={wrapRef}>
      <input
        className={extra.searchInput}
        value={open ? draft : selected?.label || ''}
        placeholder={placeholder}
        onFocus={() => {
          setDraft('');
          setOpen(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {allowClear && value && !open ? (
        <button
          type="button"
          className={extra.searchClear}
          aria-label="Очистить"
          onClick={() => onChange('')}
        >
          ×
        </button>
      ) : null}
      {open ? (
        <div className={extra.menu} role="listbox">
          {filtered.length === 0 ? (
            <div className={extra.optEmpty}>Нет данных</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.id}
                className={o.id === value ? extra.optOn : extra.opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
