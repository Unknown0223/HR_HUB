'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ListBulkBar, runListBulk, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { formatMonthRu } from '@/lib/fine-policies';
import { padNumber, type TimesheetSettings, type TimesheetSheetRow } from '@/lib/timesheets';
import styles from '../../catalog/absence-types/page.module.css';
import local from './page.module.css';

const PATH = '/payroll/timesheets';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to', 'divisionId', 'month'] as const;

type Opt = { id: string; label: string };

type CorrectionRow = {
  id: string;
  status: string;
  documentDate: string;
  number?: string | null;
  title: string;
  divisionId?: string | null;
  periodFrom: string;
  periodTo: string;
  division?: { id: string; name: string; code: string } | null;
  lines?: Array<{
    employee?: { lastName?: string; firstName?: string; tabNumber?: string } | null;
  }>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function employeesLabel(row: CorrectionRow) {
  const lines = row.lines || [];
  if (lines.length === 0) return '—';
  const first = [lines[0]?.employee?.lastName, lines[0]?.employee?.firstName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  if (lines.length === 1) return first || '—';
  return `${first} (+${lines.length - 1})`;
}

function TimesheetsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'corrections' ? 'corrections' : 'timesheets';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [sheets, setSheets] = useState<TimesheetSheetRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TimesheetSettings>({
    allTimeTypes: true,
    timeTypeIds: [],
    showPlannedDays: true,
    showPlannedHours: true,
    showWorkedHours: true,
    showWorkedDays: true,
  });
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.posted || filters.from || filters.to || filters.divisionId),
  );

  const monthFilter = filters.month;

  async function load() {
    setError('');
    setLoading(true);
    try {
      const lookups = await apiFetch<{ divisions?: Opt[] }>('/api/catalog/lookups');
      setDivisions(lookups.divisions || []);
      if (tab === 'corrections') {
        setCorrections(await apiFetch<CorrectionRow[]>('/api/catalog/timesheet-adjustments'));
      } else {
        setSheets(await apiFetch<TimesheetSheetRow[]>('/api/payroll/timesheets'));
        const ui = await apiFetch<TimesheetSettings>('/api/payroll/timesheets/settings');
        setSettings(ui);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    setSelected(new Set());
    setFocusId(null);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredSheets = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return sheets.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      if (filters.divisionId && r.divisionId !== filters.divisionId) return false;
      if (monthFilter) {
        const m = monthFilter.slice(0, 7);
        if (r.month.slice(0, 7) !== m && r.docDate.slice(0, 7) !== m) return false;
      }
      if (filters.from && r.docDate < filters.from) return false;
      if (filters.to && r.docDate > filters.to) return false;
      if (!qq) return true;
      return [fmtDate(r.docDate), padNumber(r.number), formatMonthRu(r.month), r.division?.name]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [sheets, q, filters.number, filters.posted, filters.divisionId, filters.from, filters.to, monthFilter]);

  const filteredCorrections = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return corrections.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      if (filters.divisionId && r.divisionId !== filters.divisionId) return false;
      if (monthFilter) {
        const m = monthFilter.slice(0, 7);
        if (r.periodFrom.slice(0, 7) !== m && r.documentDate.slice(0, 7) !== m) return false;
      }
      if (filters.from && r.documentDate.slice(0, 10) < filters.from) return false;
      if (filters.to && r.documentDate.slice(0, 10) > filters.to) return false;
      if (!qq) return true;
      return [
        fmtDate(r.documentDate),
        r.number,
        formatMonthRu(r.periodFrom),
        r.division?.name,
        employeesLabel(r),
      ]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [corrections, q, filters.number, filters.posted, filters.divisionId, filters.from, filters.to, monthFilter]);

  const filteredRows = tab === 'corrections' ? filteredCorrections : filteredSheets;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paged = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageIds = paged.map((r) => r.id);
  const selectedRows = (
    tab === 'corrections' ? corrections : sheets
  ).filter((r) => selected.has(r.id));
  const postCount = selectedRows.filter((r) => r.status === 'draft').length;
  const cancelCount = selectedRows.filter((r) => r.status === 'posted').length;
  const deleteCount = selectedRows.filter((r) => r.status !== 'posted').length;

  function patchUrl(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH);
  }

  async function bulk(kind: 'post' | 'cancel' | 'delete') {
    const ids =
      kind === 'post'
        ? selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
        : kind === 'cancel'
          ? selectedRows.filter((r) => r.status === 'posted').map((r) => r.id)
          : selectedRows.filter((r) => r.status !== 'posted').map((r) => r.id);
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      if (tab === 'corrections') {
        const ok = await confirm(
          kind === 'delete'
            ? 'Удалить выбранные документы?'
            : kind === 'post'
              ? 'Провести выбранные документы?'
              : 'Отменить проведение выбранных документов?',
        );
        if (!ok) return;
        for (const id of ids) {
          const row = corrections.find((r) => r.id === id);
          if (!row) continue;
          if (kind === 'post') {
            await apiFetch(`/api/catalog/timesheet-adjustments/${id}/post`, { method: 'POST' });
          } else if (kind === 'cancel') {
            await apiFetch(`/api/catalog/timesheet-adjustments/${id}/cancel`, { method: 'POST' });
          } else {
            await apiFetch(`/api/catalog/timesheet-adjustments/${id}`, { method: 'DELETE' });
          }
        }
      } else {
        const ok = await runListBulk({
          path:
            kind === 'post'
              ? '/api/payroll/timesheets/bulk-post'
              : kind === 'cancel'
                ? '/api/payroll/timesheets/bulk-cancel'
                : '/api/payroll/timesheets/bulk-delete',
          ids,
          message:
            kind === 'delete'
              ? 'Удалить выбранные документы?'
              : kind === 'post'
                ? 'Провести выбранные документы?'
                : 'Отменить проведение выбранных документов?',
          variant: kind === 'delete' ? 'danger' : undefined,
        });
        if (!ok) return;
      }
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runSheet(row: TimesheetSheetRow, action: 'post' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/timesheets/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/timesheets/${row.id}/${action}`, { method: 'POST' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runCorrection(row: CorrectionRow, action: 'post' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/catalog/timesheet-adjustments/${row.id}/${action}`, { method: 'POST' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const next = await apiFetch<TimesheetSettings>('/api/payroll/timesheets/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(next);
      setSettingsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения настроек');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (tab === 'corrections') {
      downloadCsv(
        `timesheet-corrections.csv`,
        filteredCorrections.map((r) => ({
          Дата: fmtDate(r.documentDate),
          Номер: r.number || '',
          Месяц: formatMonthRu(r.periodFrom),
          Подразделение: r.division?.name || '',
          Проведен: r.status === 'posted' ? 'Да' : 'Нет',
        })),
      );
      return;
    }
    downloadCsv(
      `timesheets.csv`,
      filteredSheets.map((r) => ({
        Дата: fmtDate(r.docDate),
        Номер: padNumber(r.number),
        Месяц: formatMonthRu(r.month),
        Подразделение: r.division?.name || '',
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="timesheet" />
      <div className={local.tabs}>
        <Link href={PATH} className={tab === 'timesheets' ? local.tabOn : local.tab}>
          Табель
        </Link>
        <Link
          href={`${PATH}?tab=corrections`}
          className={tab === 'corrections' ? local.tabOn : local.tab}
        >
          Корректировки табеля
        </Link>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {tab === 'corrections' ? (
            <div className={styles.createWrap}>
              <button
                type="button"
                className={styles.createBtn}
                onClick={() => setCreateOpen((v) => !v)}
              >
                Создать ▾
              </button>
              {createOpen ? (
                <div className={styles.createMenu}>
                  <button
                    type="button"
                    onClick={() => router.push('/catalog/timesheet-adjustments/new')}
                  >
                    Корректировка табеля
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/catalog/timesheet-adjustments/new?batch=1')}
                  >
                    Корректировка табеля списком
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link href={`${PATH}/new`} className={styles.createBtn}>
              Создать
            </Link>
          )}
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              { key: 'post', label: 'Провести', count: postCount, onClick: () => void bulk('post') },
              { key: 'cancel', label: 'Отменить', count: cancelCount, variant: 'danger', onClick: () => void bulk('cancel') },
              { key: 'delete', label: 'Удалить', count: deleteCount, variant: 'danger', onClick: () => void bulk('delete') },
            ]}
          />
          {tab === 'timesheets' ? (
            <button type="button" className={local.btnSettings} onClick={() => setSettingsOpen(true)}>
              Настройки
            </button>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <label className={local.monthFilter}>
            месяц
            <input
              type="date"
              placeholder="Выбрать дату"
              value={monthFilter}
              onChange={(e) => patchUrl({ month: e.target.value || null })}
            />
          </label>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              { type: 'postedChecks', key: 'posted', label: 'Проведен' },
            ]}
          />
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <span className={styles.pagerMeta}>
            {paged.length}/{filteredRows.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {tab === 'corrections' ? (
        <p className={local.listTab}>Корректировки табеля списком</p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))}
                  onChange={(e) => setSelected(togglePage(selected, pageIds, e.target.checked))}
                  aria-label="Выбрать все"
                />
              </th>
              {tab === 'corrections' ? (
                <>
                  <th>Номер</th>
                  <th>Сотрудники</th>
                  <th>Подразделение</th>
                  <th>Дата корректировки</th>
                  <th>Проведен</th>
                </>
              ) : (
                <>
                  <th>
                    Дата
                    <span className={local.sortMark}>↑</span>
                  </th>
                  <th>Номер</th>
                  <th>Месяц</th>
                  <th>Подразделение</th>
                  <th>Проведен</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {tab === 'timesheets'
              ? (paged as TimesheetSheetRow[]).map((row) => {
                  const open = focusId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => setFocusId(open ? null : row.id)}
                        style={{ cursor: 'pointer' }}
                        className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                      >
                        <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                          />
                        </td>
                        <td>{fmtDate(row.docDate)}</td>
                        <td>{padNumber(row.number) || '—'}</td>
                        <td>{formatMonthRu(row.month)}</td>
                        <td>{row.division?.name || ''}</td>
                        <td>
                          {row.status === 'posted' ? (
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
                          <td colSpan={6}>
                            <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                              <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                              {row.status === 'draft' ? (
                                <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link>
                              ) : null}
                              {row.status === 'posted' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runSheet(row, 'cancel')}
                                >
                                  Отменить
                                </button>
                              ) : null}
                              {row.status === 'draft' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runSheet(row, 'post')}
                                >
                                  Провести
                                </button>
                              ) : null}
                              {row.status !== 'posted' ? (
                                <button
                                  type="button"
                                  className={styles.danger}
                                  disabled={busy}
                                  onClick={() => void runSheet(row, 'delete')}
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
                })
              : (paged as CorrectionRow[]).map((row) => {
                  const open = focusId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => setFocusId(open ? null : row.id)}
                        style={{ cursor: 'pointer' }}
                        className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                      >
                        <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                          />
                        </td>
                        <td>{row.number || '—'}</td>
                        <td>{employeesLabel(row)}</td>
                        <td>{row.division?.name || ''}</td>
                        <td>{fmtDate(row.periodFrom)}</td>
                        <td>
                          {row.status === 'posted' ? (
                            <span className={styles.postedYes}>Да</span>
                          ) : (
                            <span className={styles.postedNo}>Нет</span>
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr className={styles.actionsRow}>
                          <td colSpan={6}>
                            <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                              <Link href={`/catalog/timesheet-adjustments/${row.id}`}>
                                {row.status === 'draft' ? 'Изменить' : 'Просмотреть'}
                              </Link>
                              {row.status === 'draft' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runCorrection(row, 'post')}
                                >
                                  Провести
                                </button>
                              ) : null}
                              {row.status === 'posted' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runCorrection(row, 'cancel')}
                                >
                                  Отменить
                                </button>
                              ) : null}
                              {row.status !== 'posted' ? (
                                <button
                                  type="button"
                                  className={styles.danger}
                                  disabled={busy}
                                  onClick={() => void runCorrection(row, 'delete')}
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

      {settingsOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}>
          <div className={local.settingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={local.settingsHead}>
              <h2>Настройки табеля</h2>
              <button type="button" className={local.settingsClose} onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className={local.settingsBody}>
              <div>
                <div className={local.settingsSection}>Выберите виды рабочего времени *</div>
                <div className={local.settingsBox}>
                  <label className={local.settingsCheck}>
                    <input
                      type="checkbox"
                      checked={settings.allTimeTypes}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, allTimeTypes: e.target.checked }))
                      }
                    />
                    Все виды рабочего времени
                  </label>
                </div>
              </div>
              <div>
                <div className={local.settingsSection}>Настройки по детали</div>
                <div className={local.settingsGrid}>
                  <label className={local.settingsCheck}>
                    <input
                      type="checkbox"
                      checked={settings.showPlannedDays}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, showPlannedDays: e.target.checked }))
                      }
                    />
                    По плану (дней)
                  </label>
                  <label className={local.settingsCheck}>
                    <input
                      type="checkbox"
                      checked={settings.showWorkedHours}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, showWorkedHours: e.target.checked }))
                      }
                    />
                    Отработано часов
                  </label>
                  <label className={local.settingsCheck}>
                    <input
                      type="checkbox"
                      checked={settings.showPlannedHours}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, showPlannedHours: e.target.checked }))
                      }
                    />
                    По плану (часы)
                  </label>
                  <label className={local.settingsCheck}>
                    <input
                      type="checkbox"
                      checked={settings.showWorkedDays}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, showWorkedDays: e.target.checked }))
                      }
                    />
                    Отработано дней
                  </label>
                </div>
              </div>
            </div>
            <div className={local.settingsFoot}>
              <button type="button" className={local.btnPost} onClick={() => void saveSettings()}>
                Сохранить
              </button>
              <button type="button" className={local.btnSettings} onClick={() => setSettingsOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TimesheetsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <TimesheetsInner />
    </Suspense>
  );
}
