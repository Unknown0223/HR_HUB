'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = ['number', 'divisionId', 'status', 'from', 'to'] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
};

type Promotion = {
  id: string;
  documentDate: string;
  documentNumber?: string | null;
  note?: string | null;
  status: string;
  divisionId?: string | null;
  division?: { id: string; name: string } | null;
  lines?: { employee?: Emp | null }[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function empName(e?: Emp | null) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function statusLabel(s: string) {
  if (s === 'posted') return 'Проведён';
  if (s === 'cancelled') return 'Отменён';
  return 'Черновик';
}

function GradeHistoryInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Promotion[]>([]);
  const [divisions, setDivisions] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups, recs] = await Promise.all([
        apiFetch<Promotion[]>('/api/catalog/grade-history'),
        apiFetch<{ divisions?: { id: string; label: string }[] }>('/api/catalog/lookups'),
        apiFetch<unknown[]>('/api/catalog/grade-history/recommendations').catch(() => []),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setDivisions(lookups.divisions || []);
      setPendingCount(Array.isArray(recs) ? recs.length : 0);
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
    const numF = (filters.number || '').trim().toLowerCase();
    const divF = (filters.divisionId || '').trim();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return rows.filter((r) => {
      if (numF && !(r.documentNumber || '').toLowerCase().includes(numF)) return false;
      if (divF && r.divisionId !== divF && r.division?.id !== divF) return false;
      if (statusF && r.status !== statusF) return false;
      if (from || to) {
        const d = new Date(r.documentDate);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (!q) return true;
      const names = (r.lines || []).map((l) => empName(l.employee)).join(' ');
      return [r.documentNumber, r.division?.name, names, statusLabel(r.status), r.note]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filters]);

  async function remove(row: Promotion) {
    if (!(await confirm('Удалить документ?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/grade-history/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function post(row: Promotion) {
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/grade-history/${row.id}/post`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="grade-history" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/grade-history/new" className={styles.createBtn}>
            Создать
          </Link>
          <Link href="/catalog/grade-history/recommendations" className={styles.toolBtn}>
            Рекомендации в ожидании
            {pendingCount > 0 ? ` (${pendingCount})` : ''}
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              {
                type: 'dateRange',
                fromKey: 'from',
                toKey: 'to',
                label: 'Дата',
              },
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'posted', label: 'Проведён' },
                  { value: 'cancelled', label: 'Отменён' },
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
              <th>Дата</th>
              <th>Номер</th>
              <th>Подразделение</th>
              <th>Сотрудники</th>
              <th>Состояние</th>
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
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const canPost = row.status === 'draft';
              const canDelete = row.status !== 'posted';
              const employees = (row.lines || [])
                .map((l) => empName(l.employee))
                .filter(Boolean)
                .join(', ');
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
                    <td>{fmtDate(row.documentDate)}</td>
                    <td>{row.documentNumber || '—'}</td>
                    <td>{row.division?.name || '—'}</td>
                    <td>{employees || '—'}</td>
                    <td>
                      <span className={styles.postedYes}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={6}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/grade-history/${row.id}`}>Просмотреть</Link>
                          {canPost ? (
                            <Link href={`/catalog/grade-history/${row.id}?edit=1`}>Изменить</Link>
                          ) : null}
                          {canPost ? (
                            <button type="button" disabled={busy} onClick={() => void post(row)}>
                              Провести
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" disabled={busy} onClick={() => void remove(row)}>
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

export default function GradeHistoryPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <GradeHistoryInner />
    </Suspense>
  );
}
