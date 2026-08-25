'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import extra from './page.module.css';

type Opt = { id: string; label: string };

export function MultiLookup({
  value,
  options,
  placeholder = 'Поиск...',
  onChange,
}: {
  value: string[];
  options: Opt[];
  placeholder?: string;
  onChange: (ids: string[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const selected = options.filter((o) => value.includes(o.id));
  const available = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    return options.filter((o) => {
      if (value.includes(o.id)) return false;
      if (!qq) return true;
      return o.label.toLowerCase().includes(qq);
    });
  }, [options, value, draft]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className={extra.searchWrap} ref={wrapRef}>
      {selected.length ? (
        <div className={extra.chips}>
          {selected.map((s) => (
            <span key={s.id} className={extra.chip}>
              {s.label}
              <button
                type="button"
                aria-label={`Убрать ${s.label}`}
                onClick={() => onChange(value.filter((id) => id !== s.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className={extra.searchInput}
        value={open ? draft : ''}
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
      {open ? (
        <div className={extra.menu} role="listbox">
          {available.length === 0 ? (
            <div className={extra.optEmpty}>Нет данных</div>
          ) : (
            available.map((o) => (
              <button
                type="button"
                key={o.id}
                className={extra.opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange([...value, o.id]);
                  setDraft('');
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
