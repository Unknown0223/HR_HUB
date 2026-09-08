'use client';

import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { StaffPositionFormModal } from './StaffPositionFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = [
  'q',
  'title',
  'code',
  'divisionId',
  'positionId',
  'from',
  'to',
  'status',
] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type StaffPos = {
  id: string;
  code: string;
  title: string;
  headcount: number;
  openedAt?: string | null;
  closedAt?: string | null;
  isActive: boolean;
  division?: { id: string; code: string; name: string } | null;
  position?: { id: string; code: string; name: string } | null;
  employees?: Emp[];
};

type Opt = { id: string; label: string };

const staffPosPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.staff-positions.v1',
  title: 'Позиции',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'employees', label: 'Сотрудники' },
    { key: 'openedAt', label: 'Дата открытия' },
    { key: 'division', label: 'Подразделение' },
    { key: 'position', label: 'Должность' },
  ],
  defaultColumns: ['name', 'employees', 'openedAt', 'division', 'position'],
  defaultSearchKeys: ['name', 'employees', 'division', 'position'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function empName(e: Emp) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function displayName(row: StaffPos) {
  const job = row.position?.name || row.title || '—';
  const div = row.division?.name || '—';
  const code = row.code || '—';
  return `${job}/${div}/(${code})`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function staffPosCell(row: StaffPos, key: string): string {
  switch (key) {
    case 'name':
      return displayName(row);
    case 'employees':
      return (row.employees || []).map(empName).join(', ');
    case 'openedAt':
      return row.openedAt ? fmtDate(row.openedAt) : '';
    case 'division':
      return row.division?.name || '';
    case 'position':
      return row.position?.name || row.title || '';
    default:
      return '';
  }
}

function StaffPositionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const prefs = useTablePrefs(staffPosPrefs);
  const q = filters.q;

  const [rows, setRows] = useState<StaffPos[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.title ||
        filters.code ||
        filters.divisionId ||
        filters.positionId ||
        filters.from ||
        filters.to ||
        filters.status,
    ),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10));

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : staffPosPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups] = await Promise.all([
        apiFetch<StaffPos[]>('/api/catalog/staff-positions'),
        apiFetch<{ divisions?: Opt[]; positions?: Opt[] }>(
          '/api/catalog/lookups',
        ),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setDivisions(lookups.divisions || []);
      setPositions(lookups.positions || []);
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
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const titleF = filters.title.trim().toLowerCase();
    const codeF = filters.code.trim().toLowerCase();
    const divF = filters.divisionId.trim();
    const posF = filters.positionId.trim();
    const statusF = filters.status.trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return rows.filter((r) => {
      if (titleF && !displayName(r).toLowerCase().includes(titleF)) return false;
      if (codeF && !(r.code || '').toLowerCase().includes(codeF)) return false;
      if (divF && r.division?.id !== divF) return false;
      if (posF && r.position?.id !== posF) return false;
      if (statusF === 'active' && !r.isActive) return false;
      if (statusF === 'inactive' && r.isActive) return false;
      if (from || to) {
        if (!r.openedAt) return false;
        const opened = new Date(r.openedAt);
        if (Number.isNaN(opened.getTime())) return false;
        if (from && opened < from) return false;
        if (to && opened > to) return false;
      }
      if (!qq) return true;
      const emps = (r.employees || []).map(empName).join(' ');
      return [displayName(r), r.code, r.division?.name, r.position?.name, emps]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [rows, q, filters]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, staffPosCell),
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/staff-positions?${qs}` : '/catalog/staff-positions',
      { scroll: false },
    );
  }

  function openCreate() {
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (searchParams.get('create') === '1' || searchParams.get('edit')) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('edit');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/staff-positions?${qs}` : '/catalog/staff-positions',
        { scroll: false },
      );
    }
  }

  async function runDelete(row: StaffPos) {
    if (!(await confirm(`Удалить «${displayName(row)}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/staff-positions/${row.id}`, {
        method: 'DELETE',
      });
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

  async function toggleActive(row: StaffPos, value: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/staff-positions/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: value }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: value } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkActive(isActive: boolean) {
    const targets = displayRows.filter((r) => checked[r.id] && r.isActive !== isActive);
    if (targets.length === 0) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          await apiFetch(`/api/catalog/staff-positions/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
          });
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

  async function runBulkClose() {
    if (!checkedIds.length) return;
    if (
      !(await confirm(
        `Установить дату закрытия ${fmtDate(closeDate)} для ${checkedIds.length} позиций(и)?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/catalog/staff-positions/bulk-close', {
        method: 'POST',
        body: JSON.stringify({ ids: checkedIds, closedAt: closeDate }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDelete() {
    if (!checkedIds.length) return;
    if (!(await confirm(`Удалить выбранные позиции (${checkedIds.length} шт.)?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/catalog/staff-positions/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: checkedIds }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `staff-positions-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = staffPosCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="staff-positions" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-code-branch" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Позиции</h1>
          <p className={shared.pageSubtitle}>
            Штатные позиции подразделений, их наполнение и сроки действия
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
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'title',
                label: 'Название',
                placeholder: 'Поиск...',
              },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({
                  value: d.id,
                  label: d.label,
                })),
              },
              {
                type: 'select',
                key: 'positionId',
                label: 'Должность',
                options: positions.map((p) => ({
                  value: p.id,
                  label: p.label,
                })),
              },
              {
                type: 'dateRange',
                fromKey: 'from',
                toKey: 'to',
                label: 'Дата открытия',
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
            onClick={() => void runBulkActive(true)}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkActive(false)}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
          </button>
          <span className={styles.bulkDivider} aria-hidden />
          <input
            type="date"
            className={styles.bulkDate}
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            aria-label="Дата закрытия"
          />
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulkClose()}
          >
            <i className="fas fa-calendar-xmark" aria-hidden />
            Закрыть позиции
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulkDelete()}
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
                const staff = (row.employees || []).map(empName);
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
                          aria-label={`Выбрать ${displayName(row)}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'name') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              <span className={styles.nameText}>{displayName(row)}</span>
                              {!row.isActive ? (
                                <span className={styles.statusMuted}>Неактивный</span>
                              ) : null}
                              {row.closedAt ? (
                                <span className={styles.statusClosed}>
                                  закрыта {fmtDate(row.closedAt)}
                                </span>
                              ) : null}
                            </td>
                          );
                        }
                        if (key === 'employees') {
                          return (
                            <td key={key} className={styles.staffCell}>
                              {staff.length ? (
                                <>
                                  <span className={styles.staffNames}>{staff.join(', ')}</span>
                                  <span className={styles.staffCount}>
                                    {staff.length}/{row.headcount || '—'}
                                  </span>
                                </>
                              ) : (
                                <span className={styles.vacant}>Вакантна</span>
                              )}
                            </td>
                          );
                        }
                        if (key === 'openedAt') {
                          return (
                            <td key={key} className={styles.dateCell}>
                              {fmtDate(row.openedAt)}
                            </td>
                          );
                        }
                        return <td key={key}>{staffPosCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/staff-positions/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотр
                            </Link>
                            <button type="button" onClick={() => openEdit(row.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <Link href={`/catalog/staff-positions/${row.id}/edit`}>
                              <i className="fas fa-sliders" aria-hidden />
                              Полная карточка
                            </Link>
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
                              onClick={() => void runDelete(row)}
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
            Показано <strong>{displayRows.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <StaffPositionFormModal
        open={modalOpen}
        editId={editId}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function StaffPositionsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <StaffPositionsInner />
    </Suspense>
  );
}
