'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import {
  DAY_STATUS_COLOR,
  DAY_STATUS_LABEL,
  DayStatus,
  UZ_MONTHS,
  UZ_WEEK_HEADER,
  hhmm,
} from '../_lib/mobile';

type CalDay = {
  date: string;
  status: DayStatus;
  firstIn: string | null;
  lastOut: string | null;
  lateMinutes: number;
};

type CalResponse = {
  year: number;
  month: number;
  linked: boolean;
  days: CalDay[];
  totals: {
    onTime: number;
    late: number;
    absent: number;
    dayOff: number;
    leave: number;
    lateMinutes: number;
  } | null;
};

const LEGEND: { status: DayStatus; label: string }[] = [
  { status: 'on_time', label: DAY_STATUS_LABEL.on_time },
  { status: 'late', label: DAY_STATUS_LABEL.late },
  { status: 'absent', label: DAY_STATUS_LABEL.absent },
  { status: 'day_off', label: DAY_STATUS_LABEL.day_off },
];

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number) {
  const jsDay = new Date(year, month - 1, 1).getDay();
  return (jsDay + 6) % 7;
}

export default function MobileCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<CalResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(
        await apiFetch<CalResponse>(
          `/api/mobile/v1/attendance/calendar?year=${year}&month=${month}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalDay>();
    (data?.days ?? []).forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const blanks = leadingBlanks(year, month);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function shift(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelected(null);
  }

  const selectedDay = selected ? byDate.get(selected) : undefined;

  return (
    <MobileFrame title="Kalendar" subtitle="Qatnashish taqvimi">
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.calCard}>
        <div className={styles.calHead}>
          <button
            type="button"
            className={styles.calNav}
            onClick={() => shift(-1)}
            aria-label="Oldingi oy"
          >
            <i className="fas fa-chevron-left" aria-hidden />
          </button>
          <div className={styles.calMonth}>
            {UZ_MONTHS[month - 1]} {year}
          </div>
          <button
            type="button"
            className={styles.calNav}
            onClick={() => shift(1)}
            aria-label="Keyingi oy"
          >
            <i className="fas fa-chevron-right" aria-hidden />
          </button>
        </div>

        <div className={styles.calWeek}>
          {UZ_WEEK_HEADER.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className={styles.calGrid}>
          {Array.from({ length: blanks }).map((_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec = byDate.get(iso);
            const cls = [
              styles.calDay,
              iso === todayIso ? styles.calDayToday : '',
              iso === selected ? styles.calDaySelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                onClick={() => setSelected(iso === selected ? null : iso)}
              >
                {day}
                <span
                  className={styles.calDot}
                  style={{
                    background: rec ? DAY_STATUS_COLOR[rec.status] : 'transparent',
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className={styles.calLegend}>
          {LEGEND.map((l) => (
            <span key={l.status}>
              <i style={{ background: DAY_STATUS_COLOR[l.status] }} />
              {l.label}
            </span>
          ))}
        </div>
      </section>

      {selectedDay ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>
              <i className="far fa-calendar-check" aria-hidden />
              {selected}
            </span>
            <span className={styles.cardNote}>
              {DAY_STATUS_LABEL[selectedDay.status]}
            </span>
          </div>
          <div className={styles.punchRow}>
            <span className={`${styles.punchCell} ${styles.punchIn}`}>
              <i className="fas fa-caret-down" aria-hidden />
              {hhmm(selectedDay.firstIn)}
            </span>
            <span className={styles.punchDivider} />
            <span className={`${styles.punchCell} ${styles.punchOut}`}>
              <i className="fas fa-caret-up" aria-hidden />
              {hhmm(selectedDay.lastOut)}
            </span>
          </div>
          {selectedDay.lateMinutes > 0 ? (
            <p className={styles.hint}>
              Kechikish: {selectedDay.lateMinutes} daqiqa
            </p>
          ) : null}
        </section>
      ) : null}

      {data?.totals ? (
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <strong style={{ color: 'var(--m-ok)' }}>{data.totals.onTime}</strong>
            <small>O‘z vaqtida</small>
          </div>
          <div className={styles.stat}>
            <strong style={{ color: 'var(--m-late)' }}>{data.totals.late}</strong>
            <small>Kechikdi</small>
          </div>
          <div className={styles.stat}>
            <strong style={{ color: 'var(--m-absent)' }}>{data.totals.absent}</strong>
            <small>Kelmadi</small>
          </div>
          <div className={styles.stat}>
            <strong>{data.totals.lateMinutes}</strong>
            <small>Daqiqa</small>
          </div>
        </div>
      ) : null}

      {data && !data.linked ? (
        <p className={styles.empty}>
          Foydalanuvchi xodim kartasiga bog‘lanmagan — taqvim bo‘sh.
        </p>
      ) : null}
    </MobileFrame>
  );
}
