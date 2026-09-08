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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { GradePromotionFormModal } from './GradePromotionFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['number', 'divisionId', 'status', 'from', 'to'] as const;
const MAX_NAMES = 3;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
};

type Promotion = {
  id: string;
  documentDate: string;
  documentNumber?: string | null;
  note?: string | null;
  status: string;
  divisionId?: string | null;
  division?: { id: string; name: string } | null;
  lines?: { employee?: Emp | null }[];
};

const gradeHistoryPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.grade-history.v1',
  title: 'Повышение разрядов',
  columns: [
    { key: 'documentDate', label: 'Дата' },
    { key: 'documentNumber', label: 'Номер' },
    { key: 'division', label: 'Подразделение' },
    { key: 'employees', label: 'Сотрудники' },
    { key: 'status', label: 'Состояние' },
  ],
  defaultColumns: [
    'documentDate',
    'documentNumber',
    'division',
    'employees',
    'status',
  ],
  defaultSearchKeys: ['documentNumber', 'division', 'employees'],
  defaultSort: [{ key: 'documentDate', dir: 'desc' }],
});

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function empName(e?: Emp | null) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function empNames(row: Promotion) {
  return (row.lines || []).map((l) => empName(l.employee)).filter(Boolean);
}

function statusLabel(s: string) {
  if (s === 'posted') return 'Проведён';
  if (s === 'cancelled') return 'Отменён';
  return 'Черновик';
}

function statusClass(s: string) {
  if (s === 'posted') return styles.statusPosted;
  if (s === 'cancelled') return styles.statusCancelled;
  return styles.statusDraft;
}

function gradeHistoryCell(row: Promotion, key: string): string {
  switch (key) {
    case 'documentDate':
      return fmtDate(row.documentDate);
    case 'documentNumber':
      return row.documentNumber || '';
    case 'division':
      return row.division?.name || '';
    case 'employees':
      return empNames(row).join(', ');
    case 'status':
      return statusLabel(row.status);
    default:
      return '';
  }
}

function GradeHistoryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(gradeHistoryPrefs);

  const [rows, setRows] = useState<Promotion[]>([]);
  const [divisions, setDivisions] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.number || filters.divisionId || filters.status || filters.from || filters.to,
    ),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : gradeHistoryPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups, recs] = await Promise.all([
        apiFetch<Promotion[]>('/api/catalog/grade-history'),
        apiFetch<{ divisions?: { id: string; label: string }[] }>(
          '/api/catalog/lookups',
        ),
        apiFetch<unknown[]>('/api/catalog/grade-history/recommendations').catch(() => []),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setDivisions(lookups.divisions || []);
      setPendingCount(Array.isArray(recs) ? recs.length : 0);
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
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const numF = (filters.number || '').trim().toLowerCase();
    const divF = (filters.divisionId || '').trim();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return rows.filter((r) => {
      if (numF && !(r.documentNumber || '').toLowerCase().includes(numF)) return false;
      if (divF && r.divisionId !== divF && r.division?.id !== divF) return false;
      if (statusF && r.status !== statusF) return false;
      if (from || to) {
        const d = new Date(r.documentDate);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (!q) return true;
      return [
        r.documentNumber,
        r.division?.name,
        empNames(r).join(' '),
        statusLabel(r.status),
        r.note,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filters]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, gradeHistoryCell),
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

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/grade-history?${qs}` : '/catalog/grade-history',
        { scroll: false },
      );
    }
  }

  function dropChecked(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function runPost(row: Promotion) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/grade-history/${row.id}/post`, { method: 'POST' });
      dropChecked(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setBusy(false);
    }
  }

  async function runCancel(row: Promotion) {
    if (!(await confirm(`Отменить документ № ${row.documentNumber || '—'}?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/grade-history/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      dropChecked(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отмены');
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(row: Promotion) {
    if (!(await confirm('Удалить документ?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/grade-history/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      dropChecked(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'post' | 'cancel' | 'delete') {
    const targets = displayRows.filter((r) => checked[r.id]);
    if (!targets.length) return;

    if (action === 'post') {
      const drafts = targets.filter((r) => r.status === 'draft');
      if (!drafts.length) {
        setError('Нет черновиков среди выбранных');
        return;
      }
    } else if (action === 'cancel') {
      const cancellable = targets.filter((r) => r.status === 'draft');
      if (!cancellable.length) {
        setError('Отменить можно только черновики');
        return;
      }
      if (!(await confirm(`Отменить выбранные документы (${cancellable.length} шт.)?`)))
        return;
    } else {
      const removable = targets.filter((r) => r.status !== 'posted');
      if (!removable.length) {
        setError('Проведённые документы нельзя удалить');
        return;
      }
      if (!(await confirm(`Удалить выбранные документы (${removable.length} шт.)?`)))
        return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'post') {
            if (row.status !== 'draft') continue;
            await apiFetch(`/api/catalog/grade-history/${row.id}/post`, {
              method: 'POST',
            });
          } else if (action === 'cancel') {
            if (row.status !== 'draft') continue;
            await apiFetch(`/api/catalog/grade-history/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'cancelled' }),
            });
          } else {
            if (row.status === 'posted') continue;
            await apiFetch(`/api/catalog/grade-history/${row.id}`, {
              method: 'DELETE',
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
      `grade-history-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = gradeHistoryCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="grade-history" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-level-up-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Повышение разрядов</h1>
          <p className={shared.pageSubtitle}>
            Документы повышения тарифных разрядов сотрудников
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
            onClick={() => {
              setError('');
              setModalOpen(true);
            }}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <Link href="/catalog/grade-history/recommendations" className={styles.toolBtn}>
            <i className="fas fa-clock" aria-hidden />
            Рекомендации в ожидании
            {pendingCount > 0 ? (
              <span className={styles.pendingCount}>{pendingCount}</span>
            ) : null}
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              {
                type: 'dateRange',
                fromKey: 'from',
                toKey: 'to',
                label: 'Дата',
              },
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'posted', label: 'Проведён' },
                  { value: 'cancelled', label: 'Отменён' },
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
                const names = empNames(row);
                const canEdit = row.status === 'draft';
                const canDelete = row.status !== 'posted';
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
                          aria-label={`Выбрать ${row.documentNumber || row.id}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'documentDate') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {fmtDate(row.documentDate)}
                            </td>
                          );
                        }
                        if (key === 'documentNumber') {
                          return (
                            <td key={key} className={styles.docNumber}>
                              {row.documentNumber || '—'}
                            </td>
                          );
                        }
                        if (key === 'employees') {
                          return (
                            <td key={key} className={styles.empNames}>
                              {names.length ? (
                                <>
                                  {names.slice(0, MAX_NAMES).join(', ')}
                                  {names.length > MAX_NAMES ? (
                                    <span className={styles.empMore}>
                                      {' '}
                                      +{names.length - MAX_NAMES}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span className={statusClass(row.status)}>
                                {statusLabel(row.status)}
                              </span>
                            </td>
                          );
                        }
                        return <td key={key}>{gradeHistoryCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/grade-history/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {canEdit ? (
                              <Link href={`/catalog/grade-history/${row.id}?edit=1`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runPost(row)}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runCancel(row)}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отменить
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void runDelete(row)}
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

      <GradePromotionFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function GradeHistoryPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <GradeHistoryInner />
    </Suspense>
  );
}
