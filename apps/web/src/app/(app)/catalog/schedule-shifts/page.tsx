'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['status', 'from', 'to', 'q'] as const;

const scheduleShiftsListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.schedule-shifts.v1',
  title: 'Смены по графику',
  columns: [
    { key: 'employee', label: 'Сотрудник' },
    { key: 'workDate', label: 'Дата' },
    { key: 'number', label: '№' },
    { key: 'shift', label: 'Смена' },
    { key: 'status', label: 'Статус' },
    { key: 'replaced', label: 'Заменено' },
    { key: 'source', label: 'Источник' },
    { key: 'schedule', label: 'График работы' },
  ],
  defaultColumns: [
    'employee',
    'workDate',
    'number',
    'shift',
    'status',
    'replaced',
    'source',
    'schedule',
  ],
  defaultSearchKeys: ['employee', 'shift', 'schedule', 'source'],
  defaultSort: [{ key: 'workDate', dir: 'desc' }],
  searchableKeys: ['employee', 'shift', 'schedule', 'source', 'status', 'replaced'],
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
  workDate: string;
  number?: number | null;
  shiftLabel: string;
  status: string;
  replaced: boolean;
  source: string;
  note?: string | null;
  employee: Emp;
  replacedBy?: Emp | null;
  schedule?: { id: string; name: string; code: string } | null;
  shift?: {
    id: string;
    code: string;
    name: string;
    startTime?: string;
    endTime?: string;
  } | null;
};

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function statusLabel(status: string, replaced: boolean) {
  if (replaced || status === 'replaced') {
    return { text: 'Заменено', cls: styles.badgeMuted };
  }
  if (status === 'planned') return { text: 'Запланировано', cls: styles.badgeDraft };
  if (status === 'completed') return { text: 'Выполнено', cls: styles.badgePosted };
  if (status === 'cancelled') return { text: 'Отменено', cls: styles.badgeCancelled };
  return { text: status, cls: styles.badgeMuted };
}

function sourceLabel(source: string) {
  if (source === 'roster') return 'Расписание';
  if (source === 'roster_change') return 'Изменение расписания';
  if (source === 'individual') return 'Индивидуальный график';
  if (source === 'position') return 'График позиции';
  if (source === 'schedule') return 'График работы';
  if (source === 'manual') return 'Вручную';
  return source || '—';
}

function shiftText(row: Row) {
  return row.shift
    ? `${row.shift.code ? `${row.shift.code} — ` : ''}${row.shift.name}`
    : row.shiftLabel;
}

function replacedText(row: Row) {
  if (row.replaced || row.replacedBy) return empName(row.replacedBy) || 'Да';
  return '';
}

function cellOf(row: Row, key: string): string {
  switch (key) {
    case 'employee':
      return empName(row.employee);
    case 'workDate':
      return fmtDate(row.workDate);
    case 'number':
      return row.number != null ? String(row.number) : '';
    case 'shift':
      return shiftText(row);
    case 'status':
      return statusLabel(row.status, row.replaced).text;
    case 'replaced':
      return replacedText(row);
    case 'source':
      return sourceLabel(row.source);
    case 'schedule':
      return row.schedule?.name || '';
    default:
      return '';
  }
}

function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

function ScheduleShiftsInner() {
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(scheduleShiftsListPrefs);
  const defaults = monthBounds();
  const from = filters.from || searchParams.get('from') || defaults.from;
  const to = filters.to || searchParams.get('to') || defaults.to;
  const q = filters.q;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q || '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (filters.status) qs.set('status', filters.status);
      if (filters.q) qs.set('q', filters.q);
      const data = await apiFetch<Row[]>(`/api/catalog/shift-assignments?${qs}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setChecked({});
    setSelectedId(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filters.status, filters.q]);

  useEffect(() => {
    setSearchDraft(q || '');
  }, [q]);

  const filtered = useMemo(() => {
    const qq = searchDraft.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [
        empName(r.employee),
        r.shiftLabel,
        r.schedule?.name,
        sourceLabel(r.source),
        r.status,
        empName(r.replacedBy),
      ]
        .join(' ')
        .toLowerCase()
        .includes(qq),
    );
  }, [rows, searchDraft]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : scheduleShiftsListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

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

  async function rebuild() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ created: number; rosters: number }>(
        '/api/catalog/shift-assignments/rebuild',
        {
          method: 'POST',
          body: JSON.stringify({ from, to }),
        },
      );
      setInfo(
        `Обновлено: ${res.created} смен из ${res.rosters} проведённых расписаний`,
      );
      setChecked({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка обновления');
    } finally {
      setBusy(false);
    }
  }

  async function bulkAction(action: string, label: string) {
    if (!checkedIds.length) return;
    if (!(await confirm(`${label} выбранные смены (${checkedIds.length})?`))) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ ok: number; skipped: number }>(
        '/api/catalog/shift-assignments/bulk-action',
        {
          method: 'POST',
          body: JSON.stringify({ ids: checkedIds, action }),
        },
      );
      setChecked({});
      setSelectedId(null);
      await load();
      setInfo(
        `Обработано: ${res.ok}${res.skipped ? `, пропущено: ${res.skipped}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка групповой обработки');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `schedule-shifts-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <PageSubnav groupKey="schedule-shifts" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-exchange-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Смены по графику</h1>
          <p className={shared.pageSubtitle}>
            Назначения смен сотрудникам за период (из расписаний и графиков)
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
            disabled={busy}
            onClick={() => void rebuild()}
          >
            <i className="fas fa-sync" aria-hidden />
            {busy ? '…' : 'Обновить из расписаний'}
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Период' },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'planned', label: 'Запланировано' },
                  { value: 'replaced', label: 'Заменено' },
                  { value: 'completed', label: 'Выполнено' },
                  { value: 'cancelled', label: 'Отменено' },
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
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
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

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkOk}`}
            disabled={busy}
            onClick={() => void bulkAction('complete', 'Отметить выполненными')}
          >
            <i className="fas fa-check" aria-hidden />
            Выполнено
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkAction('plan', 'Вернуть в план')}
          >
            <i className="fas fa-undo" aria-hidden />
            В план
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkAction('cancel', 'Отменить')}
          >
            <i className="fas fa-ban" aria-hidden />
            Отменить
          </button>
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
                    disabled={!displayRows.length}
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
                    Нет данных — нажмите «Обновить из расписаний»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const st = statusLabel(row.status, row.replaced);
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
                          aria-label={`Выбрать ${empName(row.employee)}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {empName(row.employee)}
                            </td>
                          );
                        }
                        if (key === 'workDate') {
                          return (
                            <td key={key} className={styles.codeCell}>
                              {fmtDate(row.workDate)}
                            </td>
                          );
                        }
                        if (key === 'number') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {row.number ?? '—'}
                            </td>
                          );
                        }
                        if (key === 'shift') {
                          return <td key={key}>{shiftText(row)}</td>;
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span className={st.cls}>{st.text}</span>
                            </td>
                          );
                        }
                        if (key === 'replaced') {
                          return (
                            <td key={key}>
                              {row.replaced || row.replacedBy
                                ? empName(row.replacedBy) || 'Да'
                                : '—'}
                            </td>
                          );
                        }
                        if (key === 'source') {
                          return <td key={key}>{sourceLabel(row.source)}</td>;
                        }
                        if (key === 'schedule') {
                          return <td key={key}>{row.schedule?.name || '—'}</td>;
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void (async () => {
                                  setBusy(true);
                                  try {
                                    await apiFetch('/api/catalog/shift-assignments/bulk-action', {
                                      method: 'POST',
                                      body: JSON.stringify({
                                        ids: [row.id],
                                        action: 'complete',
                                      }),
                                    });
                                    await load();
                                  } catch (e) {
                                    setError(
                                      e instanceof Error ? e.message : 'Ошибка',
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                })()
                              }
                            >
                              <i className="fas fa-check" aria-hidden />
                              Выполнено
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void (async () => {
                                  setBusy(true);
                                  try {
                                    await apiFetch('/api/catalog/shift-assignments/bulk-action', {
                                      method: 'POST',
                                      body: JSON.stringify({
                                        ids: [row.id],
                                        action: 'plan',
                                      }),
                                    });
                                    await load();
                                  } catch (e) {
                                    setError(
                                      e instanceof Error ? e.message : 'Ошибка',
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                })()
                              }
                            >
                              <i className="fas fa-undo" aria-hidden />
                              В план
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() =>
                                void (async () => {
                                  if (!(await confirm('Отменить смену?'))) return;
                                  setBusy(true);
                                  try {
                                    await apiFetch('/api/catalog/shift-assignments/bulk-action', {
                                      method: 'POST',
                                      body: JSON.stringify({
                                        ids: [row.id],
                                        action: 'cancel',
                                      }),
                                    });
                                    await load();
                                  } catch (e) {
                                    setError(
                                      e instanceof Error ? e.message : 'Ошибка',
                                    );
                                  } finally {
                                    setBusy(false);
                                  }
                                })()
                              }
                            >
                              <i className="fas fa-ban" aria-hidden />
                              Отменить
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
    </div>
  );
}

export default function ScheduleShiftsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ScheduleShiftsInner />
    </Suspense>
  );
}
