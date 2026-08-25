'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';

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
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);

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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/timesheet-adjustments?${qs}` : '/catalog/timesheet-adjustments', {
      scroll: false,
    });
  }

  async function runAction(row: CorrectionRow, action: 'post' | 'cancel' | 'delete') {
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `timesheet-corrections-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'documentDate',
        'number',
        'employees',
        'division',
        'periodFrom',
        'periodTo',
        'posted',
      ],
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

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/timesheet-adjustments/new" className={styles.createBtn}>
            Создать
          </Link>
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
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
          >
            {exportBusy ? 'Excel…' : 'Excel'}
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => load()}>
            Обновить
          </button>
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
              <th>Дата *</th>
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
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
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
                      <td colSpan={7}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <Link href={`/catalog/timesheet-adjustments/${row.id}`}>
                            {row.status === 'draft' ? 'Изменить' : 'Открыть'}
                          </Link>
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'post')}
                            >
                              Провести
                            </button>
                          ) : null}
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'cancel')}
                            >
                              Отменить
                            </button>
                          ) : null}
                          {row.status === 'draft' || row.status === 'cancelled' ? (
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => runAction(row, 'delete')}
                            >
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

export default function TimesheetAdjustmentsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TimesheetAdjustmentsInner />
    </Suspense>
  );
}
