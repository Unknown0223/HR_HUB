'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MobileFrame from './_components/MobileFrame';
import styles from './mobile.module.css';
import {
  DAY_STATUS_LABEL,
  DayStatus,
  REQUEST_STATUS_LABEL,
  hhmm,
  uzDateWithWeekday,
} from './_lib/mobile';

type Mark = { id: string; direction: string; occurredAt: string; source: string };

type Home = {
  date: string;
  linked: boolean;
  profile: {
    fullName: string;
    employee: { schedule?: { name: string } | null } | null;
  };
  today: {
    date: string;
    status: DayStatus;
    firstIn: string | null;
    lastOut: string | null;
    marks: Mark[];
    schedule?: { name: string; startTime?: string; endTime?: string } | null;
  } | null;
  requests: {
    absences: { id: string; status: string; startDate: string; endDate: string }[];
    requests: { id: string; title: string; status: string; createdAt: string }[];
  };
  notifications: { unread: number };
  modules: { key: string; label: string; icon: string }[];
};

const MODULE_HREF: Record<string, string> = {
  attendance: '/m/attendance',
  requests: '/m/requests',
  team: '/m/team',
  payroll: '/m/payroll',
};

export default function MobileHomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Home>('/api/mobile/v1/home'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const status = data?.today?.status;
  const dayLabel =
    status === 'day_off'
      ? 'Dam olish kuni'
      : status === 'leave'
        ? 'Ta’til'
        : 'Ish kuni';

  const scheduleNote = data?.today?.schedule
    ? `${data.today.schedule.name}${
        data.today.schedule.startTime && data.today.schedule.endTime
          ? ` · ${data.today.schedule.startTime}–${data.today.schedule.endTime}`
          : ''
      }`
    : 'O‘zingizga g‘amxo‘rlik qiling va dam oling';

  const marks = data?.today?.marks ?? [];
  const requests = data?.requests?.requests ?? [];
  const absences = data?.requests?.absences ?? [];

  return (
    <MobileFrame
      title="Asosiy"
      subtitle={`${dayLabel} - ${uzDateWithWeekday(data?.date ?? new Date())}`}
      bell
      unread={data?.notifications?.unread ?? 0}
    >
      {error ? <p className={styles.error}>{error}</p> : null}

      {data && !data.linked ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>
              <i className="fas fa-id-badge" aria-hidden />
              {data.profile.fullName}
            </span>
          </div>
          <p className={styles.empty}>
            Bu foydalanuvchi xodim kartasiga bog‘lanmagan. Qatnashish ma’lumotlari
            faqat xodim profili uchun ko‘rinadi (masalan{' '}
            <code>employee@demo.local</code>).
          </p>
        </div>
      ) : null}

      {/* Jadval */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-toggle-on" aria-hidden />
            Jadval
          </span>
          <span className={styles.cardNote}>{scheduleNote}</span>
        </div>
        <div className={styles.punchRow}>
          <span className={`${styles.punchCell} ${styles.punchIn}`}>
            <i className="fas fa-caret-down" aria-hidden />
            {hhmm(data?.today?.firstIn)}
          </span>
          <span className={styles.punchDivider} />
          <span className={`${styles.punchCell} ${styles.punchOut}`}>
            <i className="fas fa-caret-up" aria-hidden />
            {hhmm(data?.today?.lastOut)}
          </span>
        </div>
        {status ? (
          <p className={styles.hint}>{DAY_STATUS_LABEL[status]}</p>
        ) : null}
      </section>

      {/* Qaydnoma */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-crosshairs" aria-hidden />
            Qaydnoma
          </span>
          <Link href="/m/attendance" className={styles.cardLink}>
            Barchasi
          </Link>
        </div>
        {marks.length ? (
          <ul className={styles.rowList}>
            {marks.slice(0, 5).map((m) => (
              <li key={m.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{m.direction === 'OUT' ? 'Chiqish' : 'Kirish'}</strong>
                    <small>{m.source}</small>
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

      {/* Modullar */}
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Modullar</h2>
        <Link href="/m/attendance" className={styles.sectionLink}>
          Hammasi <i className="fas fa-chevron-right" aria-hidden />
        </Link>
      </div>
      <div className={styles.tiles}>
        {(data?.modules ?? []).map((m) => (
          <Link
            key={m.key}
            href={MODULE_HREF[m.key] ?? '/m'}
            className={styles.tile}
          >
            <i className={`fas fa-${m.icon}`} aria-hidden />
            {m.label}
          </Link>
        ))}
      </div>

      {/* So'rovlar */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-clipboard-list" aria-hidden />
            So‘rovlar
          </span>
          <Link href="/m/requests" className={styles.cardLink}>
            Barchasi
          </Link>
        </div>
        {requests.length || absences.length ? (
          <ul className={styles.rowList}>
            {requests.slice(0, 3).map((r) => (
              <li key={r.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{r.title}</strong>
                    <small>{uzDateWithWeekday(r.createdAt)}</small>
                  </span>
                  <span className={`${styles.pill} ${styles.pillMuted}`}>
                    {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </li>
            ))}
            {absences.slice(0, 2).map((a) => (
              <li key={a.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>Yo‘qlik</strong>
                    <small>
                      {a.startDate?.slice(0, 10)} — {a.endDate?.slice(0, 10)}
                    </small>
                  </span>
                  <span className={`${styles.pill} ${styles.pillMuted}`}>
                    {REQUEST_STATUS_LABEL[a.status] ?? a.status}
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
