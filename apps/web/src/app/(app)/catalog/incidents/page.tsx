'use client';

import { confirm } from '@/lib/dialogs';
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
import { downloadXlsxViaApi } from '@/lib/excel';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { IncidentFormModal } from './IncidentFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
};

type IncidentRow = {
  id: string;
  number?: string | null;
  title: string;
  occurredAt: string;
  action: string;
  status?: string | null;
  damageAmount?: string | number | null;
  employee?: EmpRef | null;
  incidentType?: { id: string; name: string } | null;
};

const FILTER_KEYS = ['q', 'status', 'from', 'to'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

const ACTION_LABEL: Record<string, string> = {
  verbal_warning: 'Устное предупреждение',
  written_warning: 'Письменное предупреждение',
  fine: 'Штраф',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт',
  investigating: 'В работе',
  resolved: 'Решён',
  closed: 'Закрыт',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const incidentListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.incidents.v1',
  title: 'Инциденты',
  columns: [
    { key: 'number', label: 'Номер инцидента' },
    { key: 'occurredAt', label: 'Дата инцидента' },
    { key: 'person', label: 'Физическое лицо' },
    { key: 'incidentType', label: 'Тип инцидента' },
    { key: 'damageAmount', label: 'Сумма ущерба' },
    { key: 'action', label: 'Действие' },
    { key: 'status', label: 'Статус' },
  ],
  defaultColumns: [
    'number',
    'occurredAt',
    'person',
    'incidentType',
    'damageAmount',
    'action',
    'status',
  ],
  defaultSearchKeys: ['number', 'person', 'incidentType'],
  defaultSort: [{ key: 'occurredAt', dir: 'desc' }],
});

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function money(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function statusBadge(status?: string | null) {
  const key = status || 'open';
  const text = STATUS_LABEL[key] || key;
  if (key === 'resolved') return { text, cls: styles.badgeOk };
  if (key === 'closed') return { text, cls: styles.badgeMuted };
  if (key === 'investigating') return { text, cls: styles.badgeWarn };
  return { text, cls: styles.badgeOpen };
}

/** Statuses that still allow «Завершить». */
function isOpenish(row: IncidentRow) {
  const s = row.status || 'open';
  return s === 'open' || s === 'investigating';
}

function incidentCell(row: IncidentRow, key: string): string {
  switch (key) {
    case 'number':
      return row.number || row.title || '';
    case 'occurredAt':
      return fmtDate(row.occurredAt);
    case 'person':
      return empName(row.employee);
    case 'incidentType':
      return row.incidentType?.name || '';
    case 'damageAmount':
      return money(row.damageAmount);
    case 'action':
      return ACTION_LABEL[row.action] || row.action || '';
    case 'status':
      return STATUS_LABEL[row.status || 'open'] || row.status || '';
    default:
      return '';
  }
}

function IncidentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(incidentListPrefs);
  const q = filters.q;
  const status = filters.status;
  const from = filters.from;
  const to = filters.to;

  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(status || from || to));
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : incidentListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return rows.filter((r) => {
      if (fromTs != null || toTs != null) {
        const ts = new Date(r.occurredAt).getTime();
        if (!Number.isNaN(ts)) {
          if (fromTs != null && ts < fromTs) return false;
          if (toTs != null && ts > toTs) return false;
        }
      }
      if (!qq) return true;
      const blob = [
        r.number,
        r.title,
        empName(r.employee),
        r.incidentType?.name,
        ACTION_LABEL[r.action] || r.action,
        STATUS_LABEL[r.status || 'open'],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, from, to]);

  const sorted = useMemo(
    () => prefs.applySortToRows(filtered, incidentCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedRows = useMemo(
    () => sorted.filter((r) => checked[r.id]),
    [sorted, checked],
  );

  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => checked[r.id]);
  const somePageChecked = pageRows.some((r) => checked[r.id]) && !allPageChecked;

  const rangeFrom = sorted.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, sorted.length);

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of pageRows) {
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
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      const qs = p.toString();
      const data = await apiFetch<IncidentRow[]>(
        `/api/catalog/incidents${qs ? `?${qs}` : ''}`,
      );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    setPage(1);
  }, [q, status, from, to, pageSize]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  function applySearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) p.set('q', searchDraft.trim());
    else p.delete('q');
    const qs = p.toString();
    router.replace(qs ? `/catalog/incidents?${qs}` : '/catalog/incidents', {
      scroll: false,
    });
  }

  function closeCreate() {
    setCreateOpen(false);
    if (searchParams.get('create') === '1') {
      const p = new URLSearchParams(searchParams.toString());
      p.delete('create');
      const qs = p.toString();
      router.replace(qs ? `/catalog/incidents?${qs}` : '/catalog/incidents', {
        scroll: false,
      });
    }
  }

  async function onCreated(id: string, openAfter: boolean) {
    closeCreate();
    if (openAfter && id) {
      router.push(`/catalog/incidents/${id}`);
      return;
    }
    await load();
  }

  function forget(ids: string[]) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setExpandedId((cur) => (cur && ids.includes(cur) ? null : cur));
  }

  async function remove(row: IncidentRow) {
    if (!(await confirm('Удалить инцидент?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/incidents/${row.id}`, { method: 'DELETE' });
      forget([row.id]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: IncidentRow, next: 'resolved' | 'closed') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/incidents/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: next,
          ...(next === 'resolved'
            ? { resolvedAt: new Date().toISOString().slice(0, 10) }
            : {}),
        }),
      });
      forget([row.id]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения статуса');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'resolve' | 'close' | 'delete') {
    if (checkedRows.length === 0) return;

    let targets = checkedRows;
    if (action === 'resolve') {
      targets = checkedRows.filter(isOpenish);
      if (targets.length === 0) {
        setError('Нет незавершённых инцидентов среди выбранных');
        return;
      }
    } else if (action === 'close') {
      targets = checkedRows.filter((r) => (r.status || 'open') !== 'closed');
      if (targets.length === 0) {
        setError('Все выбранные инциденты уже закрыты');
        return;
      }
    } else if (
      !(await confirm(`Удалить выбранные инциденты (${targets.length} шт.)?`))
    ) {
      return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/incidents/${row.id}`, { method: 'DELETE' });
          } else {
            await apiFetch(`/api/catalog/incidents/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: action === 'resolve' ? 'resolved' : 'closed',
                ...(action === 'resolve'
                  ? { resolvedAt: new Date().toISOString().slice(0, 10) }
                  : {}),
              }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setExpandedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `incidents-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = incidentCell(r, k);
        return obj;
      }),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      const qs = p.toString();
      await downloadXlsxViaApi(
        `/api/catalog/incidents/export.xlsx${qs ? `?${qs}` : ''}`,
        `incidents-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
      <PageSubnav groupKey="incidents" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeIncident}`}>
          <i className="fas fa-exclamation-triangle" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Инциденты</h1>
          <p className={shared.pageSubtitle}>Регистрация и учёт дисциплинарных инцидентов</p>
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
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              setError('');
              setCreateOpen(true);
            }}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать инцидент
          </button>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', label: 'Дата инцидента', fromKey: 'from', toKey: 'to' },
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              { type: 'status', label: 'Статус', options: STATUS_OPTIONS },
            ]}
          />
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {sorted.length} / {rows.length}
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
            onClick={() => void runBulk('resolve')}
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

      <IncidentFormModal
        open={createOpen}
        onClose={closeCreate}
        onSaved={(id, openAfter) => void onCreated(id, openAfter)}
      />

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
              {loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать инцидент»
                  </td>
                </tr>
              ) : null}
              {pageRows.map((row) => {
                const open = expandedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const badge = statusBadge(row.status);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setExpandedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.number || row.title}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'person') {
                          return (
                            <td key={key} className={styles.empName}>
                              {empName(row.employee)}
                            </td>
                          );
                        }
                        if (key === 'damageAmount') {
                          return (
                            <td key={key} className={styles.num}>
                              {money(row.damageAmount)}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span className={badge.cls}>{badge.text}</span>
                            </td>
                          );
                        }
                        return <td key={key}>{incidentCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/incidents/${row.id}`}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </Link>
                            {isOpenish(row) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void setStatus(row, 'resolved')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Завершить
                              </button>
                            ) : null}
                            {(row.status || 'open') !== 'closed' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void setStatus(row, 'closed')}
                              >
                                <i className="fas fa-lock" aria-hidden />
                                Закрыть
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void remove(row)}
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
        <div className={styles.footer}>
          <p>
            Показано{' '}
            <strong>
              {rangeFrom}–{rangeTo}
            </strong>{' '}
            из <strong>{sorted.length}</strong>
          </p>
          <div className={styles.footerPager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Предыдущая страница"
            >
              ‹
            </button>
            <span className={styles.countBadge}>
              {page}/{totalPages}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Следующая страница"
            >
              ›
            </button>
            <select
              aria-label="Размер страницы"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className={styles.pageSize}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <IncidentsInner />
    </Suspense>
  );
}
