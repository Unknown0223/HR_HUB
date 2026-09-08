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
import type { ColumnDef } from '@/lib/catalog-columns';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { WorkScheduleFormModal } from './WorkScheduleFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

export type ScheduleKind =
  | 'ordinary'
  | 'hourly'
  | 'advanced'
  | 'multi_shift'
  | 'advanced_multi_shift';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'По-часовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
  { kind: 'advanced_multi_shift', label: 'Продвинутый многосменный' },
];

const KIND_LABEL: Record<ScheduleKind, string> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k.label]),
) as Record<ScheduleKind, string>;

const FILTER_KEYS = ['q', 'name', 'code', 'kind', 'status'] as const;

const WORK_SCHEDULE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название' },
  { key: 'code', label: 'Код' },
  { key: 'kind', label: 'Тип' },
  { key: 'shiftTime', label: 'Время смены' },
  { key: 'calendar', label: 'Календарь' },
  { key: 'employeeCount', label: 'Сотрудники' },
  { key: 'isActive', label: 'Статус' },
  { key: 'updatedAt', label: 'Изменён' },
];

const workSchedulePrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.work-schedules.v1',
  title: 'Графики работы',
  columns: WORK_SCHEDULE_COLUMNS,
  defaultColumns: ['name', 'code', 'kind', 'isActive'],
  defaultSearchKeys: ['name', 'code'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

type Row = {
  id: string;
  name: string;
  code: string;
  kind?: ScheduleKind;
  isActive: boolean;
  startTime?: string;
  endTime?: string;
  settings?: Record<string, unknown> | null;
  updatedAt?: string;
  _count?: { employees?: number };
};

function cellOf(row: Row, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'code':
      return row.code || '';
    case 'kind': {
      const kind = (row.kind || 'ordinary') as ScheduleKind;
      return KIND_LABEL[kind] || kind;
    }
    case 'shiftTime': {
      const start = row.startTime || '';
      const end = row.endTime || '';
      if (!start && !end) return '';
      return `${start || '—'}${start || end ? '–' : ''}${end || '—'}`;
    }
    case 'calendar': {
      const s = row.settings;
      if (!s || typeof s !== 'object') return '';
      const name =
        (typeof s.calendarName === 'string' && s.calendarName) ||
        (typeof s.productionCalendarName === 'string' && s.productionCalendarName) ||
        '';
      const id =
        (typeof s.calendarId === 'string' && s.calendarId) ||
        (typeof s.productionCalendarId === 'string' && s.productionCalendarId) ||
        '';
      return name || id || '';
    }
    case 'employeeCount':
      return String(row._count?.employees ?? 0);
    case 'isActive':
      return row.isActive ? 'Активный' : 'Неактивный';
    case 'updatedAt': {
      if (!row.updatedAt) return '';
      const d = new Date(row.updatedAt);
      return Number.isNaN(d.getTime()) ? row.updatedAt : d.toLocaleString('ru-RU');
    }
    default:
      return '';
  }
}

function WorkSchedulesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(workSchedulePrefs);
  const q = filters.q;
  const nameFilter = filters.name;
  const codeFilter = filters.code;
  const kindFilter = filters.kind;
  const statusFilter = filters.status;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || nameFilter || codeFilter || kindFilter || statusFilter),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<ScheduleKind>('ordinary');

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : workSchedulePrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Row[]>('/api/attendance/schedules');
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
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const create = searchParams.get('create') === '1';
    const edit = searchParams.get('edit');
    if (create || edit) {
      const rawKind = searchParams.get('kind') || 'ordinary';
      setCreateKind(
        (KINDS.some((k) => k.kind === rawKind) ? rawKind : 'ordinary') as ScheduleKind,
      );
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = rows;
    const nameF = nameFilter.trim().toLowerCase();
    const codeF = codeFilter.trim().toLowerCase();
    if (nameF) list = list.filter((r) => (r.name || '').toLowerCase().includes(nameF));
    if (codeF) list = list.filter((r) => (r.code || '').toLowerCase().includes(codeF));
    if (kindFilter) list = list.filter((r) => (r.kind || 'ordinary') === kindFilter);
    if (statusFilter === 'active') list = list.filter((r) => r.isActive);
    else if (statusFilter === 'inactive') list = list.filter((r) => !r.isActive);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) =>
        [r.name, r.code, KIND_LABEL[(r.kind || 'ordinary') as ScheduleKind] || r.kind]
          .join(' ')
          .toLowerCase()
          .includes(qq),
      );
    }
    return list;
  }, [rows, q, nameFilter, codeFilter, kindFilter, statusFilter]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/work-schedules?${qs}` : '/catalog/work-schedules', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setCreateKind('ordinary');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (
      searchParams.get('create') === '1' ||
      searchParams.get('edit') ||
      searchParams.get('kind')
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('edit');
      params.delete('kind');
      const qs = params.toString();
      router.replace(qs ? `/catalog/work-schedules?${qs}` : '/catalog/work-schedules', {
        scroll: false,
      });
    }
  }

  async function remove(row: Row) {
    if (!(await confirm(`Удалить график «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/attendance/schedules/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'delete' | 'activate' | 'deactivate') {
    const targets = filtered.filter((r) => checked[r.id]);
    if (!targets.length) return;
    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные графики (${targets.length} шт.)?`))) return;
    }
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/attendance/schedules/${row.id}`, { method: 'DELETE' });
          } else {
            const isActive = action === 'activate';
            if (row.isActive === isActive) continue;
            await apiFetch(`/api/attendance/schedules/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive }),
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

  async function toggleActive(row: Row, value: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/attendance/schedules/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: value }),
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: value } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `work-schedules-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <PageSubnav groupKey="work-schedules" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-calendar-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Графики работы</h1>
          <p className={shared.pageSubtitle}>
            Шаблоны рабочих графиков: обычные, почасовые и многосменные
          </p>
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
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'kind',
                label: 'Тип',
                options: KINDS.map((k) => ({ value: k.kind, label: k.label })),
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активный' },
                  { value: 'inactive', label: 'Неактивный' },
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
            onClick={() => void runBulk('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
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
                          aria-label={`Выбрать ${row.name}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'name') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {row.name}
                            </td>
                          );
                        }
                        if (key === 'code') {
                          return (
                            <td key={key} className={styles.codeCell}>
                              {row.code || '—'}
                            </td>
                          );
                        }
                        if (key === 'isActive') {
                          return (
                            <td key={key}>
                              {row.isActive ? (
                                <span className={styles.statusActive}>Активный</span>
                              ) : (
                                <span className={styles.statusMuted}>Неактивный</span>
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
                            <Link href={`/catalog/work-schedules/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Открыть
                            </Link>
                            <button type="button" onClick={() => openEdit(row.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleActive(row, !row.isActive)}
                            >
                              <i
                                className={row.isActive ? 'fas fa-ban' : 'fas fa-check'}
                                aria-hidden
                              />
                              {row.isActive ? 'Деактивировать' : 'Активировать'}
                            </button>
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <WorkScheduleFormModal
        open={modalOpen}
        editId={editId}
        initialKind={createKind}
        onClose={closeModal}
        onSaved={(id, openDoc) => {
          closeModal();
          if (openDoc && id) router.push(`/catalog/work-schedules/${id}`);
          else void load();
        }}
      />
    </div>
  );
}

export default function WorkSchedulesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <WorkSchedulesInner />
    </Suspense>
  );
}
