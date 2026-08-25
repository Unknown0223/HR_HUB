'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, PageResult } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { DAY_STATUS_LABEL, DayStatus, hhmm, uzDate } from '../_lib/mobile';

type Mark = {
  id: string;
  direction: string;
  occurredAt: string;
  source: string;
  device?: { name: string } | null;
};

type Today = {
  date: string;
  status: DayStatus;
  firstIn: string | null;
  lastOut: string | null;
  lateMinutes: number;
  nextDirection: 'IN' | 'OUT' | 'AUTO';
  marks: Mark[];
};

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function MobileAttendancePage() {
  const [today, setToday] = useState<Today | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [t, list] = await Promise.all([
        apiFetch<Today>('/api/mobile/v1/attendance/today').catch(() => null),
        apiFetch<PageResult<Mark>>(
          `/api/mobile/v1/attendance/marks?from=${daysAgoIso(14)}`,
        ).catch(() => null),
      ]);
      setToday(t);
      setMarks(list?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function punchGps() {
    setError('');
    setOk('');
    if (!navigator.geolocation) {
      setError('Qurilma GPS ni qo‘llab-quvvatlamaydi');
      return;
    }
    setBusy('gps');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch('/api/mobile/v1/punches/gps', {
            method: 'POST',
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          });
          setOk('GPS belgisi qabul qilindi');
          load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Xatolik');
        } finally {
          setBusy('');
        }
      },
      (err) => {
        setError(err.message || 'GPS ruxsati berilmadi');
        setBusy('');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function punchQr() {
    if (!qr.trim()) return;
    setError('');
    setOk('');
    setBusy('qr');
    try {
      await apiFetch('/api/mobile/v1/punches/qr', {
        method: 'POST',
        body: JSON.stringify({ qrCode: qr.trim() }),
      });
      setOk('QR belgisi qabul qilindi');
      setQr('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy('');
    }
  }

  return (
    <MobileFrame title="Qatnashish" subtitle="Bugungi kun va belgilar" back="/m">
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? (
        <p className={styles.error} style={{ background: 'rgba(6,214,160,.14)', color: 'var(--m-ok)' }}>
          {ok}
        </p>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-clock" aria-hidden />
            Bugun
          </span>
          <span className={styles.cardNote}>
            {today ? DAY_STATUS_LABEL[today.status] : '—'}
          </span>
        </div>
        <div className={styles.punchRow}>
          <span className={`${styles.punchCell} ${styles.punchIn}`}>
            <i className="fas fa-caret-down" aria-hidden />
            {hhmm(today?.firstIn)}
          </span>
          <span className={styles.punchDivider} />
          <span className={`${styles.punchCell} ${styles.punchOut}`}>
            <i className="fas fa-caret-up" aria-hidden />
            {hhmm(today?.lastOut)}
          </span>
        </div>
        {today && today.lateMinutes > 0 ? (
          <p className={styles.hint}>Kechikish: {today.lateMinutes} daqiqa</p>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-fingerprint" aria-hidden />
            Belgilash
          </span>
          <span className={styles.cardNote}>
            Keyingi: {today?.nextDirection === 'OUT' ? 'Chiqish' : 'Kirish'}
          </span>
        </div>
        <div className={styles.formGrid}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={punchGps}
            disabled={busy === 'gps'}
          >
            {busy === 'gps' ? 'Yuborilmoqda…' : 'GPS orqali belgilash'}
          </button>
          <label className={styles.label}>
            QR kod
            <input
              className={styles.control}
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              placeholder="QR kodni kiriting"
              inputMode="text"
            />
          </label>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={punchQr}
            disabled={busy === 'qr' || !qr.trim()}
          >
            {busy === 'qr' ? 'Yuborilmoqda…' : 'QR orqali belgilash'}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-crosshairs" aria-hidden />
            Qaydnoma (14 kun)
          </span>
        </div>
        {marks.length ? (
          <ul className={styles.rowList}>
            {marks.map((m) => (
              <li key={m.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{m.direction === 'OUT' ? 'Chiqish' : 'Kirish'}</strong>
                    <small>
                      {uzDate(m.occurredAt)} · {m.device?.name ?? m.source}
                    </small>
                  </span>
                  <span className={styles.rowValue}>{hhmm(m.occurredAt)}</span>
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
