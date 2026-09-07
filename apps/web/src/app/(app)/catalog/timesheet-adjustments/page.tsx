'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { confirm } from '@/lib/dialogs';
import { downloadXlsxViaApi } from '@/lib/excel';
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
const COL_COUNT = 7;

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

function TimesheetAdjustmentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
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

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const somePageChecked = filtered.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
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
    const targets = filtered.filter((r) => checked[r.id]);
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
      filtered.map((r) => ({
        documentDate: fmtDate(r.documentDate),
        number: r.number || '',
        employees: employeesLabel(r),
        division: r.division?.name || '',
        periodFrom: fmtDate(r.periodFrom),
        periodTo: fmtDate(r.periodTo),
        posted: isPosted(r) ? 'Да' : 'Нет',
      })),
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
                <th>Дата</th>
                <th>Номер</th>
                <th>Сотрудники</th>
                <th>Подразделение</th>
                <th>Дата корректировки</th>
                <th>Проведен</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
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
                      <td>{fmtDate(row.documentDate)}</td>
                      <td>{row.number || '—'}</td>
                      <td className={styles.empName}>{employeesLabel(row)}</td>
                      <td>{row.division?.name || '—'}</td>
                      <td>
                        {fmtDate(row.periodFrom)}
                        {row.periodFrom !== row.periodTo ? ` – ${fmtDate(row.periodTo)}` : ''}
                      </td>
                      <td>
                        {isPosted(row) ? (
                          <span className={styles.postedYes}>Да</span>
                        ) : (
                          <span className={styles.postedNo}>
                            {row.status === 'cancelled' ? 'Отм.' : 'Нет'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
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
