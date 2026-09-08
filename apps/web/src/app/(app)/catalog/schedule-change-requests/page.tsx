'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
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
import { ScheduleChangeCreateModal } from './ScheduleChangeCreateModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['status', 'q'] as const;

const SCHEDULE_CHANGE_COLUMNS: ColumnDef[] = [
  { key: 'employee', label: 'Сотрудник' },
  { key: 'createdAt', label: 'Дата' },
  { key: 'changeKind', label: 'Тип запроса' },
  { key: 'requestDates', label: 'Даты запроса' },
  { key: 'note', label: 'Примечание' },
  { key: 'managerNote', label: 'Примечание руководителя' },
  { key: 'status', label: 'Состояние' },
];

const scheduleChangePrefsCfg = prefsConfigFromColumns({
  storageKey: 'hrhub.table.schedule-change-requests.v1',
  title: 'Запросы на изменение графика',
  columns: SCHEDULE_CHANGE_COLUMNS,
  defaultColumns: SCHEDULE_CHANGE_COLUMNS.map((c) => c.key),
  defaultSearchKeys: ['employee', 'changeKind', 'note', 'status'],
  defaultSort: [{ key: 'createdAt', dir: 'desc' }],
});

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
  createdAt: string;
  reviewNote?: string | null;
  payload?: Record<string, unknown> | null;
  employee: Emp;
};

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function changeKind(row: Row) {
  const p = row.payload || {};
  const kind = String(p.changeKind || p.requestKind || '');
  if (kind === 'day_swap') return 'Обмен дней';
  return 'Изменение рабочего графика';
}

function requestDates(row: Row) {
  const p = row.payload || {};
  if (String(p.changeKind || '') === 'day_swap' && Array.isArray(p.swaps)) {
    const parts = (p.swaps as { fromDate?: string; toDate?: string }[])
      .filter((s) => s?.fromDate)
      .map((s) =>
        s.toDate && s.toDate !== s.fromDate
          ? `${fmtDate(s.fromDate)} ↔ ${fmtDate(s.toDate)}`
          : fmtDate(s.fromDate),
      );
    return parts.length ? parts.join('; ') : '—';
  }
  if (Array.isArray(p.days)) {
    const parts = (p.days as { date?: string; dayType?: string }[])
      .filter((d) => d?.date)
      .map((d) => {
        const kind = d.dayType === 'off' ? 'вых.' : 'раб.';
        return `${fmtDate(d.date)} (${kind})`;
      });
    return parts.length ? parts.join('; ') : '—';
  }
  const start = p.startDate || p.beginDate || p.from;
  const end = p.endDate || p.to;
  if (start && end && String(start) !== String(end)) {
    return `${fmtDate(String(start))} - ${fmtDate(String(end))}`;
  }
  if (start) return fmtDate(String(start));
  return '—';
}

function noteOf(row: Row) {
  const p = row.payload || {};
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

function cellOf(row: Row, key: string): string {
  switch (key) {
    case 'employee':
      return empName(row.employee);
    case 'createdAt':
      return fmtDt(row.createdAt);
    case 'changeKind':
      return changeKind(row);
    case 'requestDates':
      return requestDates(row);
    case 'note':
      return noteOf(row);
    case 'managerNote':
      return row.reviewNote || '';
    case 'status':
      return statusLabel(row.status).text;
    default:
      return '';
  }
}

function ScheduleChangeRequestsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope') === 'mine' ? 'mine' : 'available';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(scheduleChangePrefsCfg);
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

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('type', 'schedule_change');
      qs.set('scope', scope);
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
      [empName(r.employee), changeKind(r), noteOf(r), r.status, r.title]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const scopeKeys =
    scope === 'available'
      ? ['employee', 'createdAt', 'changeKind', 'requestDates', 'note', 'status']
      : ['createdAt', 'changeKind', 'requestDates', 'note', 'managerNote', 'status'];
  const visibleCols = (prefs.columns.length
    ? prefs.columns
    : scheduleChangePrefsCfg.defaultColumns
  ).filter((k) => scopeKeys.includes(k));
  const colCount = 1 + visibleCols.length;

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

  async function action(id: string, act: string) {
    setBusy(true);
    setError('');
    try {
      if (act === 'approve' || act === 'reject') {
        await apiFetch(`/api/hr/requests/${id}/review`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: act === 'approve' ? 'approved' : 'rejected',
          }),
        });
      } else if (act === 'restore') {
        await apiFetch(`/api/hr/requests/${id}/restore`, { method: 'POST' });
      } else if (act === 'cancel') {
        await apiFetch(`/api/hr/requests/${id}/cancel`, { method: 'POST' });
      } else if (act === 'delete') {
        await apiFetch(`/api/hr/requests/${id}`, { method: 'DELETE' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(act: string, label: string) {
    if (!selectedIds.length) return;
    if (!(await confirm(`${label} выбранные запросы (${selectedIds.length})?`))) {
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const result = await apiFetch<{
        ok: number;
        skipped: number;
        errors?: { id: string; message: string }[];
      }>('/api/hr/requests/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, action: act }),
      });
      setChecked(new Set());
      setExpandedId(null);
      await load();
      if (result.skipped > 0) {
        const detail = (result.errors || [])
          .map((e) => e.message)
          .filter(Boolean)
          .slice(0, 3)
          .join('; ');
        setError(
          `Обработано: ${result.ok}, пропущено: ${result.skipped}${
            detail ? ` (${detail})` : ''
          }`,
        );
      } else {
        setInfo(`Обработано: ${result.ok}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  function setScope(next: 'mine' | 'available') {
    const p = new URLSearchParams(searchParams.toString());
    if (next === 'mine') p.set('scope', 'mine');
    else p.delete('scope');
    router.push(`/catalog/schedule-change-requests?${p}`);
  }

  function exportCsv() {
    downloadCsv(
      `schedule-change-requests-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <PageSubnav groupKey="schedule-change-requests" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-calendar-week" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Запросы на изменение графика</h1>
          <p className={shared.pageSubtitle}>
            Согласование заявок на изменение рабочего графика и обмен днями
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
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setCreateOpen(true)}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
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
          {scope === 'available' ? (
            <>
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
                className={styles.bulkBtn}
                disabled={busy}
                onClick={() => void bulkAction('restore', 'Восстановить')}
              >
                <i className="fas fa-undo" aria-hidden />
                Восстановить
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkAction('delete', 'Удалить')}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
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
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const expanded = expandedId === row.id;
                const isChecked = checked.has(row.id);
                const st = statusLabel(row.status);
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
                            <Link href={`/catalog/schedule-change-requests/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            <Link
                              href={`/catalog/schedule-change-requests/${row.id}?edit=1`}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </Link>
                            {scope === 'available' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void action(row.id, 'approve')}
                                >
                                  <i className="fas fa-check" aria-hidden />
                                  Подтвердить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void action(row.id, 'reject')}
                                >
                                  <i className="fas fa-times" aria-hidden />
                                  Отклонить
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void action(row.id, 'restore')}
                                >
                                  <i className="fas fa-undo" aria-hidden />
                                  Восстановить
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void action(row.id, 'delete')}
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

      <ScheduleChangeCreateModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (searchParams.get('create') === '1') {
            const p = new URLSearchParams(searchParams.toString());
            p.delete('create');
            const qs = p.toString();
            router.replace(
              qs
                ? `/catalog/schedule-change-requests?${qs}`
                : '/catalog/schedule-change-requests',
            );
          }
        }}
        onCreated={() => {
          void load();
        }}
      />
    </div>
  );
}

export default function ScheduleChangeRequestsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ScheduleChangeRequestsInner />
    </Suspense>
  );
}
