'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { confirm } from '@/lib/dialogs';
import { downloadXlsxViaApi } from '@/lib/excel';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { TimesheetCorrectionFormModal } from './TimesheetCorrectionFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
  divisionId?: string | null;
};

type LineRow = {
  id?: string;
  employeeId: string;
  employee?: EmpRef | null;
};

type CorrectionRow = {
  id: string;
  status: string;
  documentDate: string;
  number?: string | null;
  title: string;
  divisionId?: string | null;
  periodFrom: string;
  periodTo: string;
  postedAt?: string | null;
  division?: { id: string; name: string; code: string } | null;
  lines?: LineRow[];
};

type EmpOpt = { id: string; label: string };
type DivOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to', 'divisionId', 'employeeId'] as const;

const timesheetAdjPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.timesheet-adjustments.v1',
  title: 'Корректировки табеля',
  columns: [
    { key: 'documentDate', label: 'Дата' },
    { key: 'number', label: 'Номер' },
    { key: 'employees', label: 'Сотрудники' },
    { key: 'division', label: 'Подразделение' },
    { key: 'period', label: 'Дата корректировки' },
    { key: 'posted', label: 'Проведен' },
  ],
  defaultColumns: [
    'documentDate',
    'number',
    'employees',
    'division',
    'period',
    'posted',
  ],
  defaultSearchKeys: ['number', 'employees', 'division'],
  defaultSort: [{ key: 'documentDate', dir: 'desc' }],
});

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function empFull(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function employeesLabel(row: CorrectionRow) {
  const lines = row.lines || [];
  if (lines.length === 0) return '—';
  if (lines.length === 1) return empFull(lines[0]?.employee);
  const first = empFull(lines[0]?.employee);
  return `${first} (+${lines.length - 1})`;
}

function isPosted(row: CorrectionRow) {
  return row.status === 'posted';
}

function periodLabel(row: CorrectionRow) {
  const from = fmtDate(row.periodFrom);
  if (row.periodFrom !== row.periodTo) return `${from} – ${fmtDate(row.periodTo)}`;
  return from;
}

function postedLabel(row: CorrectionRow) {
  if (isPosted(row)) return 'Да';
  return row.status === 'cancelled' ? 'Отм.' : 'Нет';
}

function correctionCell(row: CorrectionRow, key: string): string {
  switch (key) {
    case 'documentDate':
      return fmtDate(row.documentDate);
    case 'number':
      return row.number || '';
    case 'employees':
      return employeesLabel(row);
    case 'division':
      return row.division?.name || '';
    case 'period':
      return periodLabel(row);
    case 'posted':
      return postedLabel(row);
    default:
      return '';
  }
}

function TimesheetAdjustmentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(timesheetAdjPrefs);
  const q = filters.q;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const postedFilter = filters.posted;
  const divisionIdFilter = filters.divisionId;
  const employeeIdFilter = filters.employeeId;

  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || from || to || numberFilter || postedFilter || divisionIdFilter || employeeIdFilter),
  );
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [createOpen, setCreateOpen] = useState(() => searchParams.get('create') === '1');
  const [createBatch, setCreateBatch] = useState(() => searchParams.get('batch') === '1');

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : timesheetAdjPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.number,
          r.title,
          r.division?.name,
          employeesLabel(r),
          ...(r.lines || []).map((l) => l.employee?.tabNumber),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (numberFilter.trim()) {
      const nq = numberFilter.trim().toLowerCase();
      list = list.filter((r) => String(r.number || '').toLowerCase().includes(nq));
    }
    if (divisionIdFilter) {
      list = list.filter((r) => r.divisionId === divisionIdFilter);
    }
    if (employeeIdFilter) {
      list = list.filter((r) => (r.lines || []).some((l) => l.employeeId === employeeIdFilter));
    }
    if (postedFilter === 'yes') list = list.filter((r) => isPosted(r));
    else if (postedFilter === 'no') list = list.filter((r) => !isPosted(r));
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(r.documentDate).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(r.documentDate).getTime() <= t);
    }
    return list;
  }, [
    rows,
    q,
    numberFilter,
    divisionIdFilter,
    employeeIdFilter,
    postedFilter,
    from,
    to,
  ]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, correctionCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked =
    displayRows.some((r) => checked[r.id]) && !allPageChecked;

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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<CorrectionRow[]>('/api/catalog/timesheet-adjustments');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    apiFetch<{ employees?: EmpOpt[]; divisions?: DivOpt[] }>('/api/catalog/lookups')
      .then((d) => {
        setEmployees(d.employees || []);
        setDivisions(d.divisions || []);
      })
      .catch(() => {
        setEmployees([]);
        setDivisions([]);
      });
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateBatch(searchParams.get('batch') === '1');
      setCreateOpen(true);
    }
  }, [searchParams]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/timesheet-adjustments?${qs}` : '/catalog/timesheet-adjustments', {
      scroll: false,
    });
  }

  function openCreate(batch: boolean) {
    setCreateBatch(batch);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    if (searchParams.get('create') === '1' || searchParams.get('batch') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('batch');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/timesheet-adjustments?${qs}` : '/catalog/timesheet-adjustments',
        { scroll: false },
      );
    }
  }

  async function runAction(row: CorrectionRow, action: 'post' | 'cancel' | 'delete') {
    if (action === 'delete') {
      if (!(await confirm(`Удалить корректировку № ${row.number || '—'}?`))) return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}/${action}`, {
          method: 'POST',
        });
      }
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'post' | 'cancel' | 'delete') {
    const targets = displayRows.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'post') {
      if (targets.every((r) => r.status !== 'draft')) {
        setError('Нет черновиков среди выбранных');
        return;
      }
    } else if (action === 'cancel') {
      if (targets.every((r) => r.status !== 'draft')) {
        setError('Отменить можно только черновики');
        return;
      }
      if (!(await confirm(`Отменить выбранные корректировки (${targets.length} шт.)?`))) return;
    } else {
      if (targets.every((r) => isPosted(r))) {
        setError('Проведённые документы нельзя удалить');
        return;
      }
      if (!(await confirm(`Удалить выбранные корректировки (${targets.length} шт.)?`))) return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            if (isPosted(row)) continue;
            await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}`, {
              method: 'DELETE',
            });
          } else {
            if (row.status !== 'draft') continue;
            await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}/${action}`, {
              method: 'POST',
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `timesheet-corrections-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = correctionCell(r, k);
        return obj;
      }),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/catalog/timesheet-adjustments/export.xlsx',
        `timesheet-corrections-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="timesheet-adjustments" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-clock" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Корректировки табеля</h1>
          <p className={shared.pageSubtitle}>Ручные корректировки учёта рабочего времени</p>
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
          <button type="button" className={styles.createBtn} onClick={() => openCreate(false)}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <button type="button" className={styles.createGhost} onClick={() => openCreate(true)}>
            <i className="fas fa-layer-group" aria-hidden />
            Создать списком
          </button>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'dateRange',
                label: 'Дата',
                fromKey: 'from',
                toKey: 'to',
              },
              {
                type: 'text',
                key: 'number',
                label: 'Номер',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Сотрудники',
                options: employees.map((e) => ({ value: e.id, label: e.label })),
              },
              {
                type: 'postedChecks',
                key: 'posted',
                label: 'Проведен',
              },
            ]}
          />
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {displayRows.length} / {rows.length}
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
            disabled={exportBusy}
            onClick={() => void exportExcel()}
            title="Excel"
            aria-label="Экспорт Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
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
            onClick={() => void runBulk('cancel')}
          >
            <i className="fas fa-ban" aria-hidden />
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
                        if (key === 'employees') {
                          return (
                            <td key={key} className={styles.empName}>
                              {employeesLabel(row)}
                            </td>
                          );
                        }
                        if (key === 'posted') {
                          return (
                            <td key={key}>
                              {isPosted(row) ? (
                                <span className={styles.postedYes}>Да</span>
                              ) : (
                                <span className={styles.postedNo}>
                                  {row.status === 'cancelled' ? 'Отм.' : 'Нет'}
                                </span>
                              )}
                            </td>
                          );
                        }
                        return <td key={key}>{correctionCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/timesheet-adjustments/${row.id}`}>
                              <i
                                className={row.status === 'draft' ? 'fas fa-pen' : 'fas fa-eye'}
                                aria-hidden
                              />
                              {row.status === 'draft' ? 'Изменить' : 'Открыть'}
                            </Link>
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'cancel')}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отменить
                              </button>
                            ) : null}
                            {row.status === 'draft' || row.status === 'cancelled' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void runAction(row, 'delete')}
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
            Показано <strong>{displayRows.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <TimesheetCorrectionFormModal
        open={createOpen}
        batchDefault={createBatch}
        onClose={closeCreate}
        onCreated={(id, openDoc) => {
          closeCreate();
          if (openDoc) {
            router.push(`/catalog/timesheet-adjustments/${id}`);
            return;
          }
          void load();
        }}
      />
    </div>
  );
}

export default function TimesheetAdjustmentsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <TimesheetAdjustmentsInner />
    </Suspense>
  );
}
