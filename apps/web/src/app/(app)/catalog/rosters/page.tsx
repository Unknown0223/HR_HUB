'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type DocRow = {
  id: string;
  status: string;
  name: string;
  documentDate: string;
  number?: string | null;
  month: string;
  scheduleId: string;
  verified?: boolean;
  schedule?: { id: string; name: string; code: string } | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtMonth(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function RostersInner() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<DocRow[]>('/api/catalog/rosters');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.number, r.schedule?.name, r.schedule?.code, r.status, fmtMonth(r.month)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  async function remove(row: DocRow) {
    if (row.status === 'posted') {
      setError('Проведённое расписание нельзя удалить');
      return;
    }
    if (!(await confirm(`Удалить «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/rosters/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="rosters" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/rosters/new" className={styles.createBtn}>
            Создать
          </Link>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            ↻
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length}/{rows.length}
          </span>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Название</th>
              <th>Дата</th>
              <th>Номер</th>
              <th>Месяц</th>
              <th>График работы</th>
              <th>Проверен</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const posted = row.status === 'posted' || row.verified;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open ? styles.selected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{fmtDate(row.documentDate)}</td>
                    <td>{row.number || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{fmtMonth(row.month)}</td>
                    <td>{row.schedule?.name || '—'}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${posted ? styles.badgePosted : styles.badgeDraft}`}
                      >
                        {posted ? 'Да' : '—'}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div className={styles.rowDetail}>
                          <Link className={styles.linkBtn} href={`/catalog/rosters/${row.id}`}>
                            Открыть
                          </Link>
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              disabled={busy}
                              onClick={() => void remove(row)}
                            >
                              Удалить
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RostersPage() {
  return (
    <Suspense fallback={<p style={{ padding: '1rem', color: '#94a3b8' }}>Загрузка…</p>}>
      <RostersInner />
    </Suspense>
  );
}
