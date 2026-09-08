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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import {
  fmtDate,
  money,
  payTypeLabel,
  type SalesAccrualDoc,
} from '@/lib/sales-accruals';
import { SalesAccrualFormModal } from './SalesAccrualFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/sales-accruals';
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;

const salesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.sales-accruals.v1',
  title: 'Начисление % от продаж',
  columns: [
    { key: 'docDate', label: 'Дата' },
    { key: 'number', label: 'Номер' },
    { key: 'periodFrom', label: 'Дата начала' },
    { key: 'periodTo', label: 'Дата окончания' },
    { key: 'paymentType', label: 'Тип начисление' },
    { key: 'totalAmount', label: 'Сумма' },
    { key: 'posted', label: 'Проведен' },
  ],
  defaultColumns: [
    'docDate',
    'number',
    'periodFrom',
    'periodTo',
    'paymentType',
    'totalAmount',
    'posted',
  ],
  defaultSearchKeys: ['number', 'paymentType'],
  defaultSort: [{ key: 'docDate', dir: 'asc' }],
  searchableKeys: ['number', 'paymentType'],
});

function cellOf(row: SalesAccrualDoc, key: string): string {
  switch (key) {
    case 'docDate':
      return fmtDate(row.docDate);
    case 'number':
      return row.number || '';
    case 'periodFrom':
      return fmtDate(row.periodFrom);
    case 'periodTo':
      return fmtDate(row.periodTo);
    case 'paymentType':
      return payTypeLabel(row.paymentType);
    case 'totalAmount':
      return money(row.totalAmount);
    case 'posted':
      return row.status === 'posted' ? 'Да' : 'Нет';
    default:
      return '';
  }
}

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(salesListPrefs);
  const q = filters.q;
  const [rows, setRows] = useState<SalesAccrualDoc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.posted || filters.from || filters.to),
  );
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<SalesAccrualDoc[]>('/api/payroll/sales-accruals'));
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
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      const d = String(r.docDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.title, payTypeLabel(r.paymentType), r.note].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.number, filters.posted, filters.from, filters.to]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : salesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
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

  function exportCsv() {
    downloadCsv(
      `sales-accruals.csv`,
      displayRows.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          obj[prefs.labelOf(k)] = cellOf(r, k) || '—';
        }
        return obj;
      }),
    );
  }

  async function runBulk(kind: 'post' | 'unpost' | 'delete') {
    const targets =
      kind === 'post'
        ? checkedRows.filter((r) => r.status === 'draft')
        : kind === 'unpost'
          ? checkedRows.filter((r) => r.status === 'posted')
          : checkedRows.filter((r) => r.status !== 'posted');
    if (!targets.length) {
      setError(
        kind === 'post'
          ? 'Нет черновиков среди выбранных'
          : kind === 'unpost'
            ? 'Нет проведённых среди выбранных'
            : 'Нет документов, доступных для удаления',
      );
      return;
    }
    if (kind === 'delete') {
      if (!(await confirm(`Удалить выбранные документы (${targets.length} шт.)?`))) return;
    } else if (kind === 'post') {
      if (!(await confirm(`Провести выбранные документы (${targets.length} шт.)?`))) return;
    } else if (!(await confirm(`Отменить проведение выбранных (${targets.length} шт.)?`))) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/sales-accruals/bulk-${kind}`, {
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

  async function run(row: SalesAccrualDoc, action: 'post' | 'unpost' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить документ ${row.number}?`))) return;
    if (
      action === 'unpost' &&
      !(await confirm({ message: 'Отменить проведение?', confirmText: 'Да', cancelText: 'Нет' }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/sales-accruals/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/sales-accruals/${row.id}/${action}`, { method: 'POST' });
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

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="sales-accruals" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-percent" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Начисление % от продаж</h1>
          <p className={shared.pageSubtitle}>Документы начисления процентов от продаж</p>
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
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата' },
              { type: 'postedChecks', key: 'posted', label: 'Проведен' },
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
            onClick={() => void runBulk('post')}
          >
            <i className="fas fa-check" aria-hidden />
            Провести
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('unpost')}
          >
            <i className="fas fa-undo" aria-hidden />
            Отменить
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
                  <th key={key} className={key === 'totalAmount' ? styles.numCol : undefined}>
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
                        if (key === 'totalAmount') {
                          return (
                            <td key={key} className={styles.numCol}>
                              {money(row.totalAmount)}
                            </td>
                          );
                        }
                        if (key === 'posted') {
                          return (
                            <td key={key}>
                              {row.status === 'posted' ? (
                                <span className={styles.postedYes}>Да</span>
                              ) : (
                                <span className={styles.postedNo}>Нет</span>
                              )}
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
                            {row.status !== 'posted' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'posted' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'unpost')}
                              >
                                <i className="fas fa-undo" aria-hidden />
                                Отменить
                              </button>
                            ) : null}
                            {row.status !== 'posted' ? (
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

      <SalesAccrualFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={(id, openDoc) => {
          closeModal();
          void load();
          if (openDoc && id) router.push(`${PATH}/${id}/edit`);
        }}
      />
    </div>
  );
}

export default function SalesAccrualsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
