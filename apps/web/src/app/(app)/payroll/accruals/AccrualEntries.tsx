'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  type AccrualDoc,
  type LedgerEntry,
  fmtDate,
  formatMonthRu,
  kindLabel,
  money,
} from '@/lib/accruals';
import styles from './form.module.css';
import list from '../../catalog/absence-types/page.module.css';

export function AccrualEntries({ id }: { id: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<AccrualDoc | null>(null);
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [d, e] = await Promise.all([
          apiFetch<AccrualDoc>(`/api/payroll/accruals/${id}`),
          apiFetch<LedgerEntry[]>(`/api/payroll/accruals/${id}/entries`),
        ]);
        setDoc(d);
        setRows(e);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      }
    })();
  }, [id]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.debitAccount, r.creditAccount, r.debitSubconto, r.creditSubconto, r.note]
        .join(' ')
        .toLowerCase()
        .includes(qq),
    );
  }, [rows, q]);

  const title = doc ? `Проводки — ${kindLabel(doc.kind)} № ${doc.number || ''}` : 'Проводки';

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="accruals" titleOverride={title} />
      <div className={styles.topBar}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          <button type="button" className={styles.btnClose} onClick={() => router.push(`/payroll/accruals/${id}`)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {doc ? (
        <p style={{ margin: 0, color: '#7e8299', fontSize: 13 }}>
          {kindLabel(doc.kind)} № {doc.number} от {formatMonthRu(doc.month)} · {fmtDate(doc.docDate)}
        </p>
      ) : null}

      <div className={styles.card}>
        <div className={styles.lineBar}>
          <div className={styles.cardLinks}>
            <Link href={`/payroll/accruals/${id}`}>Документ</Link>
            <Link href={`/payroll/accruals/${id}`}>Операции</Link>
          </div>
          <div className={styles.lineRight}>
            <input className={styles.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button
              type="button"
              className={list.exportBtn}
              onClick={() =>
                downloadCsv(
                  `transactions-${doc?.number || id}.csv`,
                  filtered.map((r) => ({
                    'Дата создания': fmtDate(r.createdDate),
                    'Дата транзакции': fmtDate(r.transDate),
                    Дебет: r.debitAccount,
                    'Субконто Дт': r.debitSubconto || '',
                    Кредит: r.creditAccount,
                    'Субконто Кт': r.creditSubconto || '',
                    Валюта: r.currency || '',
                    Примечание: r.note || '',
                    Сумма: r.amount,
                    'Курс валют': r.exchangeRate ?? '',
                    'Сумма в валюте': r.amountFx ?? '',
                  })),
                )
              }
            >
              CSV
            </button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата создания</th>
                <th>Дата транзакции</th>
                <th>Дебет</th>
                <th>Субконто</th>
                <th>Кредит</th>
                <th>Субконто</th>
                <th>Валюта</th>
                <th>Примечание</th>
                <th className={styles.num}>Сумма</th>
                <th className={styles.num}>Курс валют</th>
                <th className={styles.num}>Сумма в валюте</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.createdDate)}</td>
                  <td>{fmtDate(r.transDate)}</td>
                  <td>{r.debitAccount}</td>
                  <td>{r.debitSubconto || '—'}</td>
                  <td>{r.creditAccount}</td>
                  <td>{r.creditSubconto || '—'}</td>
                  <td>{r.currency || '—'}</td>
                  <td>{r.note || '—'}</td>
                  <td className={styles.num}>{money(r.amount)}</td>
                  <td className={styles.num}>{r.exchangeRate ?? '—'}</td>
                  <td className={styles.num}>{r.amountFx != null ? money(r.amountFx) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
