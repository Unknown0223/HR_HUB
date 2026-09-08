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
import {
  fmtDate,
  formatMonthRu,
  loanStatusLabel,
  money,
  type LoanRow,
} from '@/lib/loans';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { LoanFormModal } from './LoanFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/loans';
const FILTER_KEYS = ['q', 'number', 'status', 'from', 'to'] as const;

const loansListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.loans.v1',
  title: 'Займы',
  columns: [
    { key: 'number', label: 'Номер займа' },
    { key: 'loanDate', label: 'Дата займа' },
    { key: 'employee', label: 'Сотрудник' },
    { key: 'remaining', label: 'Оставшаяся сумма' },
    { key: 'principal', label: 'Сумма займа' },
    { key: 'startDate', label: 'От' },
    { key: 'endDate', label: 'До' },
    { key: 'status', label: 'Статус' },
  ],
  defaultColumns: [
    'number',
    'loanDate',
    'employee',
    'remaining',
    'principal',
    'startDate',
    'endDate',
    'status',
  ],
  defaultSearchKeys: ['number', 'employee'],
  defaultSort: [{ key: 'loanDate', dir: 'asc' }],
  searchableKeys: ['number', 'employee', 'status'],
});

function cellOf(row: LoanRow, key: string): string {
  switch (key) {
    case 'number':
      return row.number || '';
    case 'loanDate':
      return fmtDate(row.loanDate);
    case 'employee':
      return row.employee?.label || '';
    case 'remaining':
      return money(row.remaining);
    case 'principal':
      return money(row.principal);
    case 'startDate':
      return formatMonthRu(row.startDate);
    case 'endDate':
      return formatMonthRu(row.endDate || '');
    case 'status':
      return loanStatusLabel(row.status);
    default:
      return '';
  }
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(loansListPrefs);
  const q = filters.q;
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.status || filters.from || filters.to),
  );
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<LoanRow[]>('/api/payroll/loans'));
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
      const d = String(r.loanDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.employee?.label, r.note, r.contractNumber].join(' ').toLowerCase();
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
    : loansListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedRows = useMemo(
    () => displayRows.filter((r) => checked[r.id]),
    [displayRows, checked],
  );
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

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function applySearch() {
    patchUrl({ q: searchDraft.trim() || null });
  }

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') patchUrl({ create: null });
  }

  async function runBulk(action: 'complete' | 'close' | 'delete') {
    const targets =
      action === 'complete'
        ? checkedRows.filter((r) => r.status === 'draft')
        : action === 'close'
          ? checkedRows.filter((r) => r.status === 'active')
          : checkedRows.filter((r) => r.status === 'draft');
    if (!targets.length) {
      setError(
        action === 'complete'
          ? 'Нет черновиков среди выбранных'
          : action === 'close'
            ? 'Нет активных займов среди выбранных'
            : 'Нет черновиков для удаления',
      );
      return;
    }
    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные займы (${targets.length} шт.)?`))) return;
    } else if (action === 'complete') {
      if (!(await confirm(`Завершить выбранные займы (${targets.length} шт.)?`))) return;
    } else if (!(await confirm(`Закрыть выбранные займы (${targets.length} шт.)?`))) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/loans/bulk-${action}`, {
        method: 'POST',
        body: JSON.stringify({ ids: targets.map((r) => r.id) }),
      });
      setChecked({});
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function run(row: LoanRow, action: 'complete' | 'close' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить заём ${row.number || ''}?`))) return;
    if (
      action === 'close' &&
      !(await confirm({ message: 'Закрыть заём?', confirmText: 'Да', cancelText: 'Нет' }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/loans/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/loans/${row.id}/${action}`, { method: 'POST' });
      }
      setFocusId(null);
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

  function exportCsv() {
    downloadCsv(
      'loans.csv',
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
      <PageSubnav groupKey="loans" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-hand-holding-usd" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Займы</h1>
          <p className={shared.pageSubtitle}>Займы сотрудникам и график погашения</p>
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
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер займа', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата займа' },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'active', label: 'Активный' },
                  { value: 'closed', label: 'Закрыт' },
                  { value: 'defaulted', label: 'Просрочен' },
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
            className={
              filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn
            }
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
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
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('complete')}
          >
            <i className="fas fa-check" aria-hidden />
            Завершить
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('close')}
          >
            <i className="fas fa-lock" aria-hidden />
            Закрыть
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('delete')}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setChecked({})}
          >
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
                  <th
                    key={key}
                    className={
                      key === 'remaining' || key === 'principal' ? styles.numCol : undefined
                    }
                  >
                    {prefs.labelOf(key)}
                  </th>
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
                const open = focusId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setFocusId(open ? null : row.id)}
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
                        if (key === 'number') {
                          return (
                            <td key={key} className={styles.numberCell}>
                              {row.number || '—'}
                            </td>
                          );
                        }
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.empName}>
                              {row.employee?.label || '—'}
                            </td>
                          );
                        }
                        if (key === 'remaining' || key === 'principal') {
                          return (
                            <td key={key} className={styles.numCol}>
                              {cellOf(row, key) || '—'}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span
                                className={
                                  row.status === 'active' ? styles.postedYes : styles.postedNo
                                }
                              >
                                {loanStatusLabel(row.status)}
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
                            {row.status !== 'closed' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'complete')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Завершить
                              </button>
                            ) : null}
                            {row.status === 'active' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'close')}
                              >
                                <i className="fas fa-lock" aria-hidden />
                                Закрыть
                              </button>
                            ) : null}
                            {row.status === 'draft' ? (
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

      <LoanFormModal
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

export default function LoansPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
