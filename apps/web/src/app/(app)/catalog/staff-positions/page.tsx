'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

const FILTER_KEYS = [
  'title',
  'code',
  'divisionId',
  'positionId',
  'from',
  'to',
  'status',
] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type StaffPos = {
  id: string;
  code: string;
  title: string;
  headcount: number;
  openedAt?: string | null;
  closedAt?: string | null;
  isActive: boolean;
  division?: { id: string; code: string; name: string } | null;
  position?: { id: string; code: string; name: string } | null;
  employees?: Emp[];
};

type Opt = { id: string; label: string };

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function displayName(row: StaffPos) {
  const job = row.position?.name || row.title || '—';
  const div = row.division?.name || '—';
  const code = row.code || '—';
  return `${job}/${div}/(${code})`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function StaffPositionsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<StaffPos[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closeDate, setCloseDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups] = await Promise.all([
        apiFetch<StaffPos[]>('/api/catalog/staff-positions'),
        apiFetch<{ divisions?: Opt[]; positions?: Opt[] }>('/api/catalog/lookups'),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setDivisions(lookups.divisions || []);
      setPositions(lookups.positions || []);
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
    const titleF = (filters.title || '').trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const divF = (filters.divisionId || '').trim();
    const posF = (filters.positionId || '').trim();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return rows.filter((r) => {
      if (titleF && !displayName(r).toLowerCase().includes(titleF)) return false;
      if (codeF && !(r.code || '').toLowerCase().includes(codeF)) return false;
      if (divF && r.division?.id !== divF) return false;
      if (posF && r.position?.id !== posF) return false;
      if (statusF === 'active' && !r.isActive) return false;
      if (statusF === 'inactive' && r.isActive) return false;
      if (from || to) {
        if (!r.openedAt) return false;
        const opened = new Date(r.openedAt);
        if (Number.isNaN(opened.getTime())) return false;
        if (from && opened < from) return false;
        if (to && opened > to) return false;
      }
      if (!q) return true;
      const emps = (r.employees || []).map(empName).join(' ');
      return [displayName(r), r.code, r.division?.name, r.position?.name, emps]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filters]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));

  function toggleAll() {
    if (allFilteredChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => [...checked], [checked]);

  async function bulkClose() {
    if (!selectedIds.length) return;
    if (
      !(await confirm(
        `Установить дату закрытия для ${selectedIds.length} позиций(и)?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/catalog/staff-positions/bulk-close', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, closedAt: closeDate }),
      });
      setChecked(new Set());
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    if (!selectedIds.length) return;
    if (!(await confirm(`Удалить ${selectedIds.length} позиций(и)?`))) return;
    setBusy(true);
    try {
      await apiFetch('/api/catalog/staff-positions/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setChecked(new Set());
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(row: StaffPos) {
    if (!(await confirm('Удалить позицию?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/staff-positions/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="staff-positions" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/staff-positions/new" className={styles.createBtn}>
            Создать
          </Link>
          {selectedIds.length > 0 ? (
            <>
              <input
                type="date"
                className={styles.bulkDate}
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                title="Дата закрытия"
              />
              <button
                type="button"
                className={styles.bulkWarn}
                disabled={busy}
                onClick={() => void bulkClose()}
              >
                Установить дату закрытия: {selectedIds.length}
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => void bulkDelete()}
              >
                Удалить: {selectedIds.length}
              </button>
            </>
          ) : null}
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'title', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              {
                type: 'select',
                key: 'positionId',
                label: 'Должность',
                options: positions.map((p) => ({ value: p.id, label: p.label })),
              },
              {
                type: 'dateRange',
                fromKey: 'from',
                toKey: 'to',
                label: 'Дата открытия',
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
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allFilteredChecked}
                  onChange={toggleAll}
                />
              </th>
              <th>Название</th>
              <th>Сотрудники</th>
              <th>Дата открытия</th>
              <th>Подразделение</th>
              <th>Должность</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const isChecked = checked.has(row.id);
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open || isChecked ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{displayName(row)}</td>
                    <td>
                      {(row.employees || []).map(empName).join(', ') || '—'}
                    </td>
                    <td>{fmtDate(row.openedAt)}</td>
                    <td>{row.division?.name || '—'}</td>
                    <td>{row.position?.name || row.title || '—'}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={6}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/staff-positions/${row.id}`}>
                            Просмотр
                          </Link>
                          <Link href={`/catalog/staff-positions/${row.id}/edit`}>
                            Изменить
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeOne(row)}
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

export default function StaffPositionsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <StaffPositionsInner />
    </Suspense>
  );
}
