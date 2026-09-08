'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDate, travelStatusLabel, type TravelDoc } from '@/lib/travel-expenses';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { TravelExpenseFormModal } from './TravelExpenseForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/travel-expenses';
const FILTER_KEYS = ['q', 'number', 'status', 'from', 'to'] as const;

const travelExpensesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.travel-expenses.v1',
  title: 'Авансовые отчёты',
  columns: [
    { key: 'docDate', label: 'Дата' },
    { key: 'number', label: 'Номер' },
    { key: 'employee', label: 'Сотрудник' },
    { key: 'trip', label: 'Номер документа командировки' },
    { key: 'status', label: 'Состояние' },
  ],
  defaultColumns: ['docDate', 'number', 'employee', 'trip', 'status'],
  defaultSearchKeys: ['number', 'employee', 'trip'],
  defaultSort: [{ key: 'docDate', dir: 'asc' }],
  searchableKeys: ['number', 'employee', 'trip', 'status'],
});

function cellOf(row: TravelDoc, key: string): string {
  switch (key) {
    case 'docDate':
      return fmtDate(row.docDate);
    case 'number':
      return row.number || '';
    case 'employee':
      return row.employee?.label || '';
    case 'trip':
      return row.tripNumber || row.trip?.title || '';
    case 'status':
      return travelStatusLabel(row.status);
    default:
      return '';
  }
}

function TravelExpensesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(travelExpensesListPrefs);
  const q = filters.q;

  const [rows, setRows] = useState<TravelDoc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.status || filters.from || filters.to),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await apiFetch<TravelDoc[]>('/api/payroll/travel-expenses'));
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
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.status && r.status !== filters.status) return false;
      const d = String(r.docDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.employee?.label, r.tripNumber, r.trip?.title].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.number, filters.status, filters.from, filters.to]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : travelExpensesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const selectedRows = useMemo(
    () => displayRows.filter((r) => checked[r.id]),
    [displayRows, checked],
  );
  const completeCount = selectedRows.filter((r) => r.status !== 'approved').length;
  const deleteCount = selectedRows.filter((r) => r.status !== 'approved').length;

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked = displayRows.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of displayRows) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const qs = params.toString();
      router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
    }
  }

  async function run(row: TravelDoc, action: 'complete' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить отчет ${row.number || ''}?`))) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/travel-expenses/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/travel-expenses/${row.id}/complete`, { method: 'POST' });
      }
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulk(kind: 'complete' | 'delete') {
    const ids = selectedRows.filter((r) => r.status !== 'approved').map((r) => r.id);
    if (!ids.length) return;
    const message =
      kind === 'delete'
        ? `Удалить выбранные отчеты (${ids.length} шт.)?`
        : `Завершить выбранные отчеты (${ids.length} шт.)?`;
    if (
      !(await confirm({
        message,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: kind === 'delete' ? 'danger' : undefined,
      }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/travel-expenses/bulk-${kind}`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `travel-expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          obj[prefs.labelOf(k)] = cellOf(r, k) || '—';
        }
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="travel-expenses" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-plane" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Авансовые отчёты</h1>
          <p className={shared.pageSubtitle}>Отчёты по командировочным расходам</p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={() => setModalOpen(true)}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата' },
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'approved', label: 'Завершён' },
                ],
              },
            ]}
          />
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button type="button" className={styles.iconBtn} onClick={exportCsv} title="CSV" aria-label="Экспорт CSV">
            <i className="fas fa-file-csv" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          {completeCount > 0 ? (
            <button type="button" className={styles.bulkBtn} disabled={busy} onClick={() => void bulk('complete')}>
              <i className="fas fa-check" aria-hidden />
              Завершить ({completeCount})
            </button>
          ) : null}
          {deleteCount > 0 ? (
            <button
              type="button"
              className={`${styles.bulkBtn} ${styles.bulkDanger}`}
              disabled={busy}
              onClick={() => void bulk('delete')}
            >
              <i className="fas fa-trash" aria-hidden />
              Удалить ({deleteCount})
            </button>
          ) : null}
          <button type="button" className={styles.bulkGhost} disabled={busy} onClick={() => setChecked({})}>
            Снять выделение
          </button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageChecked;
                    }}
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                {visibleCols.map((key) => (
                  <th key={key}>{prefs.labelOf(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.empName}>
                              {row.employee?.label || '—'}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span
                                className={
                                  row.status === 'approved' ? styles.statusOk : styles.statusMuted
                                }
                              >
                                {travelStatusLabel(row.status)}
                              </span>
                            </td>
                          );
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`${PATH}/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {row.status !== 'approved' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status !== 'approved' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'complete')}>
                                <i className="fas fa-check" aria-hidden />
                                Завершить
                              </button>
                            ) : null}
                            {row.status !== 'approved' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void run(row, 'delete')}
                              >
                                <i className="fas fa-trash" aria-hidden />
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
        <div className={styles.footer}>
          <p>
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <TravelExpenseFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function TravelExpensesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <TravelExpensesInner />
    </Suspense>
  );
}
