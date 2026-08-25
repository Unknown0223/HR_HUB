'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['name', 'fullName', 'status'] as const;

type TariffGroup = {
  id: string;
  code: string;
  name: string;
  fullName?: string | null;
  isActive: boolean;
  updatedAt?: string;
  baseRate?: string | number;
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function TariffGroupsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<TariffGroup[]>([]);
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
      const data = await apiFetch<TariffGroup[]>('/api/catalog/tariff-groups');
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
    const fullF = (filters.fullName || '').trim().toLowerCase();
    const statusF = (filters.status || '').trim();
    return rows.filter((r) => {
      if (nameF && !(r.name || '').toLowerCase().includes(nameF)) return false;
      if (fullF && !(r.fullName || r.name || '').toLowerCase().includes(fullF)) return false;
      if (statusF === 'active' && !r.isActive) return false;
      if (statusF === 'inactive' && r.isActive) return false;
      if (!q) return true;
      return [r.name, r.fullName, r.code].join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, filters]);

  async function remove(row: TariffGroup) {
    if (!(await confirm('Удалить тарифную группу?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-groups/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: TariffGroup) {
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-groups/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="tariff-groups" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/tariff-groups/new" className={styles.createBtn}>
            Создать
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'fullName',
                label: 'Полное название',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активный' },
                  { value: 'inactive', label: 'Неактивный' },
                ],
              },
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
              <th>Полное название</th>
              <th>Дата последнего изменения</th>
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
                    <td>{row.fullName || row.name || '—'}</td>
                    <td>{fmtDate(row.updatedAt)}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/tariff-groups/${row.id}`}>Изменить</Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleActive(row)}
                          >
                            {row.isActive ? 'Неактивный' : 'Активный'}
                          </button>
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

export default function TariffGroupsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <TariffGroupsInner />
    </Suspense>
  );
}
