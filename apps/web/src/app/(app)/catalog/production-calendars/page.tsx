'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { ProductionCalendarForm } from './ProductionCalendarForm';
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

const productionCalendarListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.production-calendars.v1',
  title: 'Производственные календари',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'code', label: 'Код' },
    { key: 'year', label: 'Год' },
  ],
  defaultColumns: ['name', 'code', 'year'],
  defaultSearchKeys: ['name', 'code'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function productionCalendarCell(row: Row, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'code':
      return row.code || '';
    case 'year':
      return String(row.year ?? '');
    default:
      return '';
  }
}

function ProductionCalendarsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const prefs = useTablePrefs(productionCalendarListPrefs);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : productionCalendarListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

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

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  function clearCreateParam() {
    if (searchParams.get('create') !== '1') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/production-calendars?${qs}` : '/catalog/production-calendars',
      { scroll: false },
    );
  }

  function closeCreate() {
    setCreateOpen(false);
    clearCreateParam();
  }

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

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, productionCalendarCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

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

  function exportCsv() {
    downloadCsv(
      `production-calendars-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = productionCalendarCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="production-calendars" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setCreateOpen(true)}
          >
            Создать
          </button>
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
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
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
              {visibleCols.map((key) => (
                <th key={key}>{prefs.labelOf(key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !displayRows.length ? (
              <tr>
                <td colSpan={colCount} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !displayRows.length ? (
              <tr>
                <td colSpan={colCount} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {displayRows.map((row) => {
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
                    {visibleCols.map((key) => (
                      <td key={key}>{productionCalendarCell(row, key) || '—'}</td>
                    ))}
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={colCount}>
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

      <FormModal
        open={createOpen}
        title="Производственный календарь (создание)"
        width="xl"
        onClose={closeCreate}
      >
        <ProductionCalendarForm
          embedded
          onClose={closeCreate}
          onSaved={(id) => {
            closeCreate();
            void load();
            router.push(`/catalog/production-calendars/${id}`);
          }}
        />
      </FormModal>
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
