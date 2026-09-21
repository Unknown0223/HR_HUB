'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './month-period-picker.module.css';

const MONTHS_SHORT = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
] as const;

const MONTHS_TITLE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

function parseValue(value?: string | null): { year: number; month: number } | null {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function toValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export type MonthPeriodPickerProps = {
  /** `YYYY-MM` or `YYYY-MM-01` (or empty) */
  value?: string | null;
  /** Emits `YYYY-MM-01` or `null` when cleared */
  onChange: (next: string | null) => void;
  label?: string;
  className?: string;
  /** Compact control for filter bands */
  compact?: boolean;
};

export function MonthPeriodPicker({
  value,
  onChange,
  label = 'Период',
  className,
  compact = true,
}: MonthPeriodPickerProps) {
  const parsed = parseValue(value);
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year ?? todayY);
  const listId = useId();

  useEffect(() => {
    if (open) setViewYear(parsed?.year ?? todayY);
  }, [open, parsed?.year, todayY]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const title = parsed
    ? `${MONTHS_TITLE[parsed.month - 1]} ${parsed.year}`
    : 'Все месяцы';

  return (
    <div
      className={[
        styles.wrap,
        compact ? styles.compact : '',
        open ? styles.open : '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={wrapRef}
    >
      {label ? <span className={styles.label}>{label}</span> : null}
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={`fas fa-calendar-alt ${styles.triggerIcon}`} aria-hidden />
        <span className={styles.triggerText}>{title}</span>
        <i
          className={`fas fa-chevron-down ${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className={styles.popup} id={listId} role="dialog" aria-label={label}>
          <div className={styles.yearRow}>
            <button
              type="button"
              className={styles.yearNav}
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Предыдущий год"
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
            <span className={styles.yearLabel}>{viewYear}</span>
            <button
              type="button"
              className={styles.yearNav}
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Следующий год"
            >
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          </div>

          <div className={styles.grid} role="listbox">
            {MONTHS_SHORT.map((short, i) => {
              const m = i + 1;
              const selected = parsed?.year === viewYear && parsed.month === m;
              const isToday = viewYear === todayY && m === todayM;
              return (
                <button
                  type="button"
                  key={short}
                  role="option"
                  aria-selected={selected}
                  className={[
                    styles.cell,
                    selected ? styles.cellOn : '',
                    isToday && !selected ? styles.cellToday : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(toValue(viewYear, m));
                    setOpen(false);
                  }}
                >
                  {short}
                </button>
              );
            })}
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerBtn}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Очистить
            </button>
            <button
              type="button"
              className={`${styles.footerBtn} ${styles.footerPrimary}`}
              onClick={() => {
                onChange(toValue(todayY, todayM));
                setOpen(false);
              }}
            >
              Текущий
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
