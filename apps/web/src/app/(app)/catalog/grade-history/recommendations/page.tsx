'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../page.module.css';

type Row = {
  id: string;
  recommendedAt?: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  } | null;
  grade?: { name: string; code: string } | null;
  division?: { name: string } | null;
  position?: { name: string } | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function empName(e?: Row['employee']) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function RecommendationsInner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<Row[]>('/api/catalog/grade-history/recommendations');
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [empName(r.employee), r.grade?.name, r.division?.name, r.position?.name]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="grade-recommendations" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/grade-history" className={styles.toolBtn}>
            Закрыть
          </Link>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Сотрудник</th>
              <th>Дата</th>
              <th>Разряд</th>
              <th>Подразделение</th>
              <th>Должность</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <input type="checkbox" />
                </td>
                <td>{empName(row.employee)}</td>
                <td>{fmtDate(row.recommendedAt)}</td>
                <td>{row.grade?.name || '—'}</td>
                <td>{row.division?.name || '—'}</td>
                <td>{row.position?.name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <RecommendationsInner />
    </Suspense>
  );
}
