'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['name', 'code'] as const;

type CareerPath = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder?: number;
  _count?: { steps: number };
  steps?: unknown[];
};

function CareerPathsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<CareerPath[]>([]);
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
      const data = await apiFetch<CareerPath[]>('/api/catalog/career-paths');
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
    const codeF = (filters.code || '').trim().toLowerCase();
    return rows.filter((r) => {
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (codeF && !r.code.toLowerCase().includes(codeF)) return false;
      if (!q) return true;
      return [r.name, r.code].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, filters]);

  async function remove(row: CareerPath) {
    if (!(await confirm('Удалить карьерный путь?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/career-paths/${row.id}`, { method: 'DELETE' });
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
      <PageSubnav groupKey="career-paths" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/career-paths/new" className={styles.createBtn}>
            Создать
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
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
              <th>Название</th>
              <th>Код</th>
              <th>Кол-во должностей</th>
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
              const count = row._count?.steps ?? row.steps?.length ?? 0;
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
                    <td>{row.code}</td>
                    <td>{count}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/career-paths/${row.id}`}>Просмотреть</Link>
                          <Link href={`/catalog/career-paths/${row.id}?edit=1`}>Изменить</Link>
                          <button type="button" disabled={busy} onClick={() => void remove(row)}>
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

export default function CareerPathsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <CareerPathsInner />
    </Suspense>
  );
}
