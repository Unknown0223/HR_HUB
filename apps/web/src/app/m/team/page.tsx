'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, PageResult } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { DAY_STATUS_LABEL, DayStatus, hhmm } from '../_lib/mobile';

type TeamDay = {
  id: string;
  status: DayStatus;
  firstInAt: string | null;
  lastOutAt: string | null;
  lateMinutes: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    tabNumber: string;
    division?: { name: string } | null;
  };
};

function statusPill(status: DayStatus) {
  if (status === 'on_time') return styles.pillOk;
  if (status === 'late') return styles.pillLate;
  if (status === 'absent') return styles.pillDanger;
  return styles.pillMuted;
}

export default function MobileTeamPage() {
  const [rows, setRows] = useState<TeamDay[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<PageResult<TeamDay>>('/api/mobile/v1/team/today');
      setRows(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.employee.lastName} ${r.employee.firstName} ${r.employee.tabNumber}`
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  const totals = useMemo(
    () => ({
      onTime: rows.filter((r) => r.status === 'on_time').length,
      late: rows.filter((r) => r.status === 'late').length,
      absent: rows.filter((r) => r.status === 'absent').length,
    }),
    [rows],
  );

  return (
    <MobileFrame title="Jamoa" subtitle="Bugungi qatnashish" back="/m">
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <strong style={{ color: 'var(--m-ok)' }}>{totals.onTime}</strong>
          <small>O‘z vaqtida</small>
        </div>
        <div className={styles.stat}>
          <strong style={{ color: 'var(--m-late)' }}>{totals.late}</strong>
          <small>Kechikdi</small>
        </div>
        <div className={styles.stat}>
          <strong style={{ color: 'var(--m-absent)' }}>{totals.absent}</strong>
          <small>Kelmadi</small>
        </div>
        <div className={styles.stat}>
          <strong>{rows.length}</strong>
          <small>Jami</small>
        </div>
      </div>

      <input
        className={styles.control}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Xodimni qidirish"
      />

      <section className={styles.card}>
        {filtered.length ? (
          <ul className={styles.rowList}>
            {filtered.map((r) => (
              <li key={r.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>
                      {r.employee.lastName} {r.employee.firstName}
                    </strong>
                    <small>
                      {r.employee.division?.name ?? '—'} · {hhmm(r.firstInAt)} –{' '}
                      {hhmm(r.lastOutAt)}
                    </small>
                  </span>
                  <span className={`${styles.pill} ${statusPill(r.status)}`}>
                    {DAY_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Ro‘yxat bo‘sh</p>
        )}
      </section>
    </MobileFrame>
  );
}
