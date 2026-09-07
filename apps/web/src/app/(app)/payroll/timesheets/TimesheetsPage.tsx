'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { runListBulk, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { formatMonthRu } from '@/lib/fine-policies';
import { padNumber, type TimesheetSheetRow } from '@/lib/timesheets';
import { TimesheetFormModal } from './TimesheetFormModal';
import { TimesheetSettingsModal } from './TimesheetSettingsModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/payroll/timesheets';
const PAGE_SIZE = 50;
const COL_COUNT = 6;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    setCreateMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1' && tab === 'timesheets') {
      setModalOpen(true);
    }
  }, [searchParams, tab]);

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
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageChecked = pageIds.some((id) => selected.has(id)) && !allPageChecked;
  const selectedRows = (tab === 'corrections' ? corrections : sheets).filter((r) =>
    selected.has(r.id),
  );
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
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      patchUrl({ create: null });
    }
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
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
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
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
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

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-calendar-check" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Табели</h1>
          <p className={shared.pageSubtitle}>
            Учёт рабочего времени по подразделениям, проведение и корректировки
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
                if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
              }}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <Link href={PATH} className={tab === 'timesheets' ? styles.tabOn : styles.tab}>
          <i className="fas fa-calendar-alt" aria-hidden />
          Табель
        </Link>
        <Link
          href={`${PATH}?tab=corrections`}
          className={tab === 'corrections' ? styles.tabOn : styles.tab}
        >
          <i className="fas fa-pen-to-square" aria-hidden />
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
                onClick={() => setCreateMenuOpen((v) => !v)}
              >
                <i className="fas fa-plus" aria-hidden />
                Создать
              </button>
              {createMenuOpen ? (
                <div className={styles.createMenu}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      router.push('/catalog/timesheet-adjustments/new');
                    }}
                  >
                    Корректировка табеля
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      router.push('/catalog/timesheet-adjustments/new?batch=1');
                    }}
                  >
                    Корректировка табеля списком
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button type="button" className={styles.createBtn} onClick={openCreate}>
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
          )}
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
          {tab === 'timesheets' ? (
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setSettingsOpen(true)}
            >
              <i className="fas fa-cog" aria-hidden />
              Настройки
            </button>
          ) : null}
        </div>

        <div className={styles.rightTools}>
          <label className={styles.monthFilter}>
            месяц
            <input
              type="month"
              value={monthFilter ? monthFilter.slice(0, 7) : ''}
              onChange={(e) =>
                patchUrl({ month: e.target.value ? `${e.target.value}-01` : null })
              }
            />
          </label>
          <span className={styles.countBadge}>
            {filteredRows.length} /{' '}
            {tab === 'corrections' ? corrections.length : sheets.length}
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
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Предыдущая страница"
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
            <span className={styles.pagerMeta}>
              {Math.min(page, pageCount)} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Следующая страница"
            >
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          </div>
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

      {selected.size > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{selected.size}</strong>
          </span>
          {postCount > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => void bulk('post')}
            >
              <i className="fas fa-check" aria-hidden />
              Провести ({postCount})
            </button>
          ) : null}
          {cancelCount > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => void bulk('cancel')}
            >
              <i className="fas fa-rotate-left" aria-hidden />
              Отменить ({cancelCount})
            </button>
          ) : null}
          {deleteCount > 0 ? (
            <button
              type="button"
              className={`${styles.bulkBtn} ${styles.bulkDanger}`}
              disabled={busy}
              onClick={() => void bulk('delete')}
            >
              <i className="fas fa-trash" aria-hidden />
              Удалить ({deleteCount})
            </button>
          ) : null}
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setSelected(new Set())}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      {tab === 'corrections' ? (
        <p className={styles.listTab}>Корректировки табеля списком</p>
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
                    onChange={(e) =>
                      setSelected(togglePage(selected, pageIds, e.target.checked))
                    }
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
                      Дата <span className={styles.sortMark}>↑</span>
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
              {loading && paged.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && paged.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {tab === 'timesheets'
                ? (paged as TimesheetSheetRow[]).map((row) => {
                    const open = focusId === row.id;
                    const isChecked = selected.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => setFocusId(open ? null : row.id)}
                          style={{ cursor: 'pointer' }}
                          className={open || isChecked ? styles.rowSelected : undefined}
                        >
                          <td
                            className={styles.checkCol}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelected(toggleSelect(selected, row.id, e.target.checked))
                              }
                              aria-label={`Выбрать ${padNumber(row.number) || 'табель'}`}
                            />
                          </td>
                          <td className={styles.dateCell}>{fmtDate(row.docDate)}</td>
                          <td className={styles.docNumber}>{padNumber(row.number) || '—'}</td>
                          <td className={styles.nameCell}>{formatMonthRu(row.month)}</td>
                          <td className={styles.noteCell}>{row.division?.name || '—'}</td>
                          <td>
                            {row.status === 'posted' ? (
                              <span className={styles.statusPosted}>Проведен</span>
                            ) : row.status === 'cancelled' ? (
                              <span className={styles.statusCancelled}>Отменен</span>
                            ) : (
                              <span className={styles.statusDraft}>Черновик</span>
                            )}
                          </td>
                        </tr>
                        {open ? (
                          <tr className={styles.actionsRow}>
                            <td colSpan={COL_COUNT}>
                              <div className={styles.rowActions}>
                                <Link href={`${PATH}/${row.id}`}>
                                  <i className="fas fa-eye" aria-hidden />
                                  Просмотреть
                                </Link>
                                {row.status === 'draft' ? (
                                  <Link href={`${PATH}/${row.id}/edit`}>
                                    <i className="fas fa-pen" aria-hidden />
                                    Изменить
                                  </Link>
                                ) : null}
                                {row.status === 'draft' ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void runSheet(row, 'post')}
                                  >
                                    <i className="fas fa-check" aria-hidden />
                                    Провести
                                  </button>
                                ) : null}
                                {row.status === 'posted' ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void runSheet(row, 'cancel')}
                                  >
                                    <i className="fas fa-rotate-left" aria-hidden />
                                    Отменить
                                  </button>
                                ) : null}
                                {row.status !== 'posted' ? (
                                  <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={busy}
                                    onClick={() => void runSheet(row, 'delete')}
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
                  })
                : (paged as CorrectionRow[]).map((row) => {
                    const open = focusId === row.id;
                    const isChecked = selected.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => setFocusId(open ? null : row.id)}
                          style={{ cursor: 'pointer' }}
                          className={open || isChecked ? styles.rowSelected : undefined}
                        >
                          <td
                            className={styles.checkCol}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelected(toggleSelect(selected, row.id, e.target.checked))
                              }
                              aria-label={`Выбрать ${row.number || 'корректировку'}`}
                            />
                          </td>
                          <td className={styles.docNumber}>{row.number || '—'}</td>
                          <td className={styles.nameCell}>{employeesLabel(row)}</td>
                          <td className={styles.noteCell}>{row.division?.name || '—'}</td>
                          <td className={styles.dateCell}>{fmtDate(row.periodFrom)}</td>
                          <td>
                            {row.status === 'posted' ? (
                              <span className={styles.statusPosted}>Проведен</span>
                            ) : (
                              <span className={styles.statusDraft}>Черновик</span>
                            )}
                          </td>
                        </tr>
                        {open ? (
                          <tr className={styles.actionsRow}>
                            <td colSpan={COL_COUNT}>
                              <div className={styles.rowActions}>
                                <Link href={`/catalog/timesheet-adjustments/${row.id}`}>
                                  <i
                                    className={
                                      row.status === 'draft' ? 'fas fa-pen' : 'fas fa-eye'
                                    }
                                    aria-hidden
                                  />
                                  {row.status === 'draft' ? 'Изменить' : 'Просмотреть'}
                                </Link>
                                {row.status === 'draft' ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void runCorrection(row, 'post')}
                                  >
                                    <i className="fas fa-check" aria-hidden />
                                    Провести
                                  </button>
                                ) : null}
                                {row.status === 'posted' ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void runCorrection(row, 'cancel')}
                                  >
                                    <i className="fas fa-rotate-left" aria-hidden />
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
            Показано <strong>{paged.length}</strong> из <strong>{filteredRows.length}</strong>
          </p>
        </div>
      </div>

      <TimesheetFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={(id, openAfter) => {
          closeModal();
          if (openAfter && id) router.push(`${PATH}/${id}/edit`);
          else void load();
        }}
      />

      <TimesheetSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => undefined}
      />
    </div>
  );
}

export function TimesheetsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <TimesheetsInner />
    </Suspense>
  );
}
