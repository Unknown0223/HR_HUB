'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { REQUEST_STATUS_LABEL, uzDate } from '../_lib/mobile';

type AbsenceType = { id: string; code: string; name: string };

type Absence = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  note?: string | null;
  absenceType?: { name: string } | null;
};

type HrRequest = {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
};

const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: 'overtime', label: 'Qo‘shimcha ish vaqti' },
  { value: 'schedule_change', label: 'Jadval o‘zgarishi' },
  { value: 'roster_change', label: 'Smena o‘zgarishi' },
  { value: 'location', label: 'Lokatsiya' },
  { value: 'hr_change', label: 'Kadr o‘zgarishi' },
];

function statusPill(status: string) {
  if (status === 'approved') return styles.pillOk;
  if (status === 'rejected' || status === 'cancelled') return styles.pillDanger;
  if (status === 'pending') return styles.pillLate;
  return styles.pillMuted;
}

export default function MobileRequestsPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [requests, setRequests] = useState<HrRequest[]>([]);
  const [types, setTypes] = useState<AbsenceType[]>([]);
  const [mode, setMode] = useState<'list' | 'absence' | 'request'>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [mine, absenceTypes] = await Promise.all([
        apiFetch<{ absences: Absence[]; requests: HrRequest[] }>(
          '/api/mobile/v1/requests',
        ),
        apiFetch<AbsenceType[]>('/api/mobile/v1/absence-types').catch(() => []),
      ]);
      setAbsences(mine.absences ?? []);
      setRequests(mine.requests ?? []);
      setTypes(absenceTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAbsence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setOk('');
    try {
      await apiFetch('/api/mobile/v1/absences', {
        method: 'POST',
        body: JSON.stringify({
          absenceTypeId: String(fd.get('absenceTypeId') || ''),
          startDate: String(fd.get('startDate') || ''),
          endDate: String(fd.get('endDate') || ''),
          note: String(fd.get('note') || '') || undefined,
        }),
      });
      setOk('So‘rov yuborildi');
      setMode('list');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setOk('');
    try {
      await apiFetch('/api/mobile/v1/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: String(fd.get('type') || 'overtime'),
          title: String(fd.get('title') || ''),
          note: String(fd.get('note') || '') || undefined,
        }),
      });
      setOk('So‘rov yuborildi');
      setMode('list');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileFrame title="So‘rovlar" subtitle="Yo‘qlik va kadr so‘rovlari" back="/m">
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? (
        <p
          className={styles.error}
          style={{ background: 'rgba(6,214,160,.14)', color: 'var(--m-ok)' }}
        >
          {ok}
        </p>
      ) : null}

      <div className={styles.btnRow}>
        <button
          type="button"
          className={mode === 'absence' ? styles.primaryBtn : styles.ghostBtn}
          onClick={() => setMode(mode === 'absence' ? 'list' : 'absence')}
        >
          Yo‘qlik
        </button>
        <button
          type="button"
          className={mode === 'request' ? styles.primaryBtn : styles.ghostBtn}
          onClick={() => setMode(mode === 'request' ? 'list' : 'request')}
        >
          Boshqa so‘rov
        </button>
      </div>

      {mode === 'absence' ? (
        <form className={styles.card} onSubmit={submitAbsence}>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              Turi
              <select className={styles.control} name="absenceTypeId" required>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Boshlanish
              <input className={styles.control} type="date" name="startDate" required />
            </label>
            <label className={styles.label}>
              Tugash
              <input className={styles.control} type="date" name="endDate" required />
            </label>
            <label className={styles.label}>
              Izoh
              <textarea className={styles.control} name="note" rows={3} />
            </label>
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              {busy ? 'Yuborilmoqda…' : 'Yuborish'}
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'request' ? (
        <form className={styles.card} onSubmit={submitRequest}>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              Turi
              <select className={styles.control} name="type" defaultValue="overtime">
                {REQUEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Sarlavha
              <input className={styles.control} name="title" required />
            </label>
            <label className={styles.label}>
              Izoh
              <textarea className={styles.control} name="note" rows={3} />
            </label>
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              {busy ? 'Yuborilmoqda…' : 'Yuborish'}
            </button>
          </div>
        </form>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="far fa-calendar-times" aria-hidden />
            Yo‘qliklar
          </span>
        </div>
        {absences.length ? (
          <ul className={styles.rowList}>
            {absences.map((a) => (
              <li key={a.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{a.absenceType?.name ?? 'Yo‘qlik'}</strong>
                    <small>
                      {a.startDate?.slice(0, 10)} — {a.endDate?.slice(0, 10)}
                    </small>
                  </span>
                  <span className={`${styles.pill} ${statusPill(a.status)}`}>
                    {REQUEST_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Yo‘qliklar yo‘q</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-clipboard-list" aria-hidden />
            So‘rovlar
          </span>
        </div>
        {requests.length ? (
          <ul className={styles.rowList}>
            {requests.map((r) => (
              <li key={r.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{r.title}</strong>
                    <small>{uzDate(r.createdAt)}</small>
                  </span>
                  <span className={`${styles.pill} ${statusPill(r.status)}`}>
                    {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>So‘rovlar yo‘q</p>
        )}
      </section>
    </MobileFrame>
  );
}
