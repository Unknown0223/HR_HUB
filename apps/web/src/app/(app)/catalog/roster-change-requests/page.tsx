'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import type { ColumnDef } from '@/lib/catalog-columns';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import {
  RosterChangeFormModal,
  type RosterChangeFormValues,
} from './RosterChangeFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['status', 'q'] as const;

const ROSTER_CHANGE_COLUMNS: ColumnDef[] = [
  { key: 'employee', label: 'Сотрудник' },
  { key: 'requestDate', label: 'Дата запроса' },
  { key: 'shift', label: 'Смена' },
  { key: 'recommended', label: 'Рекомендуемый сотрудник' },
  { key: 'note', label: 'Примечание' },
  { key: 'status', label: 'Статус' },
];

const rosterChangePrefsCfg = prefsConfigFromColumns({
  storageKey: 'hrhub.table.roster-change-requests.v1',
  title: 'Запросы на изменение смены',
  columns: ROSTER_CHANGE_COLUMNS,
  defaultColumns: ROSTER_CHANGE_COLUMNS.map((c) => c.key),
  defaultSearchKeys: ['employee', 'shift', 'recommended', 'note'],
  defaultSort: [{ key: 'requestDate', dir: 'desc' }],
});

type Scope = 'mine' | 'available' | 'my_requests';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type Row = {
  id: string;
  status: string;
  title: string;
  type: string;
  visibility?: string;
  createdAt: string;
  reviewNote?: string | null;
  payload?: Record<string, unknown> | null;
  employee: Emp;
};

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function payloadOf(row: Row) {
  return (row.payload || {}) as Record<string, unknown>;
}

function requestDateOf(row: Row) {
  const p = payloadOf(row);
  return fmtDate(String(p.requestDate || p.workDate || p.startDate || row.createdAt));
}

function shiftOf(row: Row) {
  const p = payloadOf(row);
  if (typeof p.shiftName === 'string' && p.shiftName) return p.shiftName;
  if (typeof p.shiftCode === 'string' && p.shiftCode) return p.shiftCode;
  return '—';
}

function recommendedOf(row: Row) {
  const p = payloadOf(row);
  if (typeof p.recommendedEmployeeName === 'string' && p.recommendedEmployeeName) {
    return p.recommendedEmployeeName;
  }
  if (typeof p.replacementEmployeeName === 'string' && p.replacementEmployeeName) {
    return p.replacementEmployeeName;
  }
  return '—';
}

function noteOf(row: Row) {
  const p = payloadOf(row);
  return (typeof p.note === 'string' && p.note) || '—';
}

function statusLabel(status: string) {
  if (status === 'approved') return { text: 'Подтвержден', cls: styles.badgeOk };
  if (status === 'pending') return { text: 'В ожидании', cls: styles.badgePending };
  if (status === 'rejected') return { text: 'Отклонен', cls: styles.badgeBad };
  if (status === 'cancelled') return { text: 'Отменен', cls: styles.badgeMuted };
  if (status === 'draft') return { text: 'Черновик', cls: styles.badgeMuted };
  return { text: status, cls: styles.badgeMuted };
}

function toFormValues(row: Row): RosterChangeFormValues {
  const p = payloadOf(row);
  return {
    employeeId: row.employee.id,
    requestDate: String(p.requestDate || p.workDate || p.startDate || '').slice(0, 10),
    shiftId: String(p.shiftId || ''),
    shiftName: typeof p.shiftName === 'string' ? p.shiftName : undefined,
    scheduleId: typeof p.scheduleId === 'string' ? p.scheduleId : undefined,
    recommendedEmployeeId: String(
      p.recommendedEmployeeId || p.replacementEmployeeId || p.replacingEmployeeId || '',
    ),
    recommendedEmployeeName:
      typeof p.recommendedEmployeeName === 'string'
        ? p.recommendedEmployeeName
        : undefined,
    note: typeof p.note === 'string' ? p.note : '',
    interHired: Boolean(p.interHired),
  };
}

function parseScope(raw: string | null): Scope {
  if (raw === 'available') return 'available';
  if (raw === 'my_requests' || raw === 'created') return 'my_requests';
  return 'mine';
}

function cellOf(row: Row, key: string): string {
  switch (key) {
    case 'employee':
      return empName(row.employee);
    case 'requestDate':
      return requestDateOf(row);
    case 'shift':
      return shiftOf(row);
    case 'recommended':
      return recommendedOf(row);
    case 'note':
      return noteOf(row);
    case 'status':
      return statusLabel(row.status).text;
    default:
      return '';
  }
}

function RosterChangeRequestsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(rosterChangePrefsCfg);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(filters.q || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(
    () => searchParams.get('create') === '1',
  );
  const [editRow, setEditRow] = useState<Row | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('type', 'roster_change');
      qs.set('scope', scope === 'my_requests' ? 'my_requests' : scope);
      if (filters.status) qs.set('status', filters.status);
      if (filters.q) qs.set('q', filters.q);
      const data = await apiFetch<Row[]>(`/api/hr/requests?${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setChecked(new Set());
    setExpandedId(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, filters.status, filters.q]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        empName(r.employee),
        shiftOf(r),
        recommendedOf(r),
        noteOf(r),
        r.status,
        r.title,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const showEmployeeCol = scope === 'available';
  const scopeKeys = showEmployeeCol
    ? ['employee', 'requestDate', 'shift', 'recommended', 'note', 'status']
    : ['requestDate', 'shift', 'recommended', 'note', 'status'];
  const visibleCols = (prefs.columns.length
    ? prefs.columns
    : rosterChangePrefsCfg.defaultColumns
  ).filter((k) => scopeKeys.includes(k));
  const colCount = 1 + visibleCols.length;
  const showCreate = scope !== 'my_requests';

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const allFilteredChecked =
    displayRows.length > 0 && displayRows.every((r) => checked.has(r.id));
  const someFilteredChecked = displayRows.some((r) => checked.has(r.id));
  const selectedIds = useMemo(() => [...checked], [checked]);

  function toggleAll() {
    if (allFilteredChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        displayRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        displayRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleOne(id: string, e?: React.MouseEvent | React.ChangeEvent) {
    e?.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function review(id: string, status: 'approved' | 'rejected') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/requests/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm('Удалить запрос?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/requests/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(act: string, label: string) {
    if (!selectedIds.length) return;
    if (!(await confirm(`${label} выбранные (${selectedIds.length})?`))) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const result = await apiFetch<{ ok: number; skipped: number }>(
        '/api/hr/requests/bulk-action',
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds, action: act }),
        },
      );
      setChecked(new Set());
      setExpandedId(null);
      await load();
      setInfo(
        `Обработано: ${result.ok}${result.skipped ? `, пропущено: ${result.skipped}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  function setScope(next: Scope) {
    const p = new URLSearchParams(searchParams.toString());
    if (next === 'mine') p.delete('scope');
    else p.set('scope', next);
    router.push(`/catalog/roster-change-requests?${p}`);
  }

  function closeCreate() {
    setCreateOpen(false);
    if (searchParams.get('create') === '1') {
      const p = new URLSearchParams(searchParams.toString());
      p.delete('create');
      const qs = p.toString();
      router.replace(
        qs ? `/catalog/roster-change-requests?${qs}` : '/catalog/roster-change-requests',
      );
    }
  }

  function exportCsv() {
    downloadCsv(
      `roster-change-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = cellOf(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="roster-change-requests" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-exchange-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Запросы на изменение смены</h1>
          <p className={shared.pageSubtitle}>
            Согласование заявок на замену и изменение смен в расписании
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {showCreate ? (
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen(true)}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
          ) : null}
          <div className={styles.scopeTabs}>
            <button
              type="button"
              className={scope === 'mine' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setScope('mine')}
            >
              Мои
            </button>
            <button
              type="button"
              className={scope === 'available' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setScope('available')}
            >
              Доступные
            </button>
            <button
              type="button"
              className={scope === 'my_requests' ? styles.scopeActive : styles.scopeTab}
              onClick={() => setScope('my_requests')}
            >
              Мои запросы
            </button>
          </div>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'pending', label: 'В ожидании' },
                  { value: 'approved', label: 'Подтвержден' },
                  { value: 'rejected', label: 'Отклонен' },
                  { value: 'cancelled', label: 'Отменен' },
                ],
              },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
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
            disabled={loading}
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
      {info ? <p className={styles.info}>{info}</p> : null}

      {selectedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{selectedIds.length}</strong>
          </span>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkOk}`}
            disabled={busy}
            onClick={() => void bulkAction('approve', 'Подтвердить')}
          >
            <i className="fas fa-check" aria-hidden />
            Подтвердить
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkAction('reject', 'Отклонить')}
          >
            <i className="fas fa-times" aria-hidden />
            Отклонить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setChecked(new Set())}
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
                    checked={allFilteredChecked}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = someFilteredChecked && !allFilteredChecked;
                    }}
                    onChange={toggleAll}
                    disabled={!displayRows.length}
                    title="Выбрать все"
                    aria-label="Выбрать все"
                  />
                </th>
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
                    {showCreate ? 'Нет данных — нажмите «Создать»' : 'Нет данных'}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const st = statusLabel(row.status);
                const isChecked = checked.has(row.id);
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        expanded || isChecked ? styles.rowSelected : undefined
                      }
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleOne(row.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${empName(row.employee)}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.empName}>
                              {cellOf(row, key) || '—'}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span className={st.cls}>{st.text}</span>
                            </td>
                          );
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {expanded ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            {(row.status === 'pending' ||
                              row.status === 'draft' ||
                              row.status === 'rejected') && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEditRow(row)}
                              >
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                            )}
                            {row.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void review(row.id, 'approved')}
                                >
                                  <i className="fas fa-check" aria-hidden />
                                  Подтвердить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void review(row.id, 'rejected')}
                                >
                                  <i className="fas fa-times" aria-hidden />
                                  Отклонить
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void remove(row.id)}
                            >
                              <i className="fas fa-trash" aria-hidden />
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

      {showCreate ? (
        <RosterChangeFormModal
          open={createOpen}
          mode={scope === 'mine' ? 'personal' : 'manager'}
          onClose={closeCreate}
          onSaved={() => {
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}

      <RosterChangeFormModal
        open={Boolean(editRow)}
        mode={scope === 'available' ? 'manager' : 'personal'}
        editId={editRow?.id}
        initial={editRow ? toFormValues(editRow) : null}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null);
          void load();
        }}
      />
    </div>
  );
}

export default function RosterChangeRequestsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <RosterChangeRequestsInner />
    </Suspense>
  );
}
