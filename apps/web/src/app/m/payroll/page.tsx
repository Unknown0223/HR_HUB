'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { UZ_MONTHS, money, uzDate } from '../_lib/mobile';

type Summary = {
  baseSalary: string | number | null;
  latestPeriod: { year: number; month: number; status: string } | null;
  advances: {
    id: string;
    amount: string | number;
    paidAt: string | null;
    period?: { year: number; month: number } | null;
  }[];
  lines: {
    id: string;
    type: string;
    amount: string | number;
    status: string;
    note?: string | null;
  }[];
};

const LINE_TYPE_LABEL: Record<string, string> = {
  base: 'Asosiy',
  bonus: 'Bonus',
  allowance: 'Ustama',
  deduction: 'Ushlab qolish',
  penalty: 'Jarima',
  one_time: 'Bir martalik',
};

export default function MobilePayrollPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await apiFetch<Summary>('/api/mobile/v1/payroll/summary'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const period = data?.latestPeriod;

  return (
    <MobileFrame title="To‘lov" subtitle="Oylik va avanslar" back="/m">
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-money-check-alt" aria-hidden />
            Asosiy oylik
          </span>
          <span className={styles.cardNote}>
            {period ? `${UZ_MONTHS[period.month - 1]} ${period.year}` : '—'}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '1.6rem',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {money(data?.baseSalary)}
        </p>
        {period ? <p className={styles.hint}>Davr holati: {period.status}</p> : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-list-ul" aria-hidden />
            Hisob-kitob satrlari
          </span>
        </div>
        {data?.lines?.length ? (
          <ul className={styles.rowList}>
            {data.lines.map((l) => (
              <li key={l.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{LINE_TYPE_LABEL[l.type] ?? l.type}</strong>
                    <small>{l.note ?? l.status}</small>
                  </span>
                  <span className={styles.rowValue}>{money(l.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Satrlar yo‘q</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>
            <i className="fas fa-hand-holding-usd" aria-hidden />
            Avanslar
          </span>
        </div>
        {data?.advances?.length ? (
          <ul className={styles.rowList}>
            {data.advances.map((a) => (
              <li key={a.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>
                      {a.period
                        ? `${UZ_MONTHS[a.period.month - 1]} ${a.period.year}`
                        : 'Avans'}
                    </strong>
                    <small>{a.paidAt ? uzDate(a.paidAt) : 'To‘lanmagan'}</small>
                  </span>
                  <span className={styles.rowValue}>{money(a.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Avanslar yo‘q</p>
        )}
      </section>
    </MobileFrame>
  );
}
