'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['name', 'year'] as const;

type Row = {
  id: string;
  name: string;
  code: string;
  year: number;
  isActive: boolean;
  _count?: { days: number };
};

function ProductionCalendarsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Row[]>('/api/attendance/production-calendars');
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
    const nameF = (filters.name || '').trim().toLowerCase();
    const yearF = (filters.year || '').trim();
    return rows.filter((r) => {
      if (nameF && !(r.name || '').toLowerCase().includes(nameF)) return false;
      if (yearF && String(r.year) !== yearF) return false;
      if (!q) return true;
      return [r.name, r.code, r.year].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, filters]);

  async function remove(row: Row) {
    if (!(await confirm(`Удалить календарь «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/production-calendars/${row.id}`, {
        method: 'DELETE',
      });
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
      <PageSubnav groupKey="production-calendars" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/production-calendars/new" className={styles.createBtn}>
            Создать
          </Link>
          <Link href="/catalog/work-schedules" className={styles.closeBtn}>
            Закрыть
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'year', label: 'Год', placeholder: '2026' },
            ]}
          />
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
              <th>Код</th>
              <th>Год</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
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
                    <td>{row.code || '—'}</td>
                    <td>{row.year}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/production-calendars/${row.id}`}>
                            Изменить
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(row)}
                          >
                            Удалить
                          </button>
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

export default function ProductionCalendarsPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <ProductionCalendarsInner />
    </Suspense>
  );
}
