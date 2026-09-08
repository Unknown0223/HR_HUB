'use client';

import { confirm } from '@/lib/dialogs';

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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { TimeTypeFormModal } from './TimeTypeForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type ParentRef = { id: string; name: string; code: string };

type TimeTypeRow = {
  id: string;
  code: string;
  name: string;
  letterCode?: string | null;
  digitalCode?: string | null;
  planLoad?: string | null;
  color?: string | null;
  parentId?: string | null;
  isPaid?: boolean;
  isActive?: boolean;
  parent?: ParentRef | null;
};

const FILTER_KEYS = ['q', 'status', 'planLoad'] as const;

const PLAN_LOADS: { value: string; label: string }[] = [
  { value: 'partial', label: 'Частичная' },
  { value: 'full', label: 'Полная' },
  { value: 'unplanned', label: 'Внеплановая' },
];

const timeTypeListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.time-types.v1',
  title: 'Виды рабочего времени',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'parent', label: 'Родитель' },
    { key: 'letterCode', label: 'Буквенный код' },
    { key: 'digitalCode', label: 'Цифровой код' },
    { key: 'planLoad', label: 'Нагрузка на план' },
    { key: 'color', label: 'Цвет' },
    { key: 'isActive', label: 'Статус' },
  ],
  defaultColumns: [
    'name',
    'parent',
    'letterCode',
    'digitalCode',
    'planLoad',
    'color',
    'isActive',
  ],
  defaultSearchKeys: ['name', 'letterCode', 'digitalCode'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function planLoadLabel(v?: string | null) {
  return PLAN_LOADS.find((p) => p.value === v)?.label || v || '—';
}

function letterOf(row: TimeTypeRow) {
  if (row.letterCode && String(row.letterCode).trim()) return String(row.letterCode).trim();
  const c = (row.code || '').trim();
  if (c && c.length <= 3) return c;
  return c ? c.slice(0, 1) : '';
}

function timeTypeCell(row: TimeTypeRow, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'parent':
      return row.parent?.name || '';
    case 'letterCode':
      return letterOf(row);
    case 'digitalCode':
      return row.digitalCode || '';
    case 'planLoad':
      return planLoadLabel(row.planLoad);
    case 'color':
      return row.color || '';
    case 'isActive':
      return row.isActive === false ? 'Неактивный' : 'Активный';
    default:
      return '';
  }
}

function TimeTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(timeTypeListPrefs);
  const q = filters.q;
  const statusFilter = filters.status;
  const planFilter = filters.planLoad;

  const [rows, setRows] = useState<TimeTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || statusFilter || planFilter),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : timeTypeListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.name,
          r.code,
          r.letterCode,
          r.digitalCode,
          r.parent?.name,
          planLoadLabel(r.planLoad),
          r.color,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (statusFilter === 'active') list = list.filter((r) => r.isActive !== false);
    else if (statusFilter === 'inactive') list = list.filter((r) => r.isActive === false);
    if (planFilter) list = list.filter((r) => (r.planLoad || '') === planFilter);
    return list;
  }, [rows, q, statusFilter, planFilter]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, timeTypeCell),
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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TimeTypeRow[] | { items: TimeTypeRow[] }>(
        '/api/catalog/time-types',
      );
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { items?: TimeTypeRow[] }).items)
          ? (data as { items: TimeTypeRow[] }).items
          : [];
      setRows(list);
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/time-types?${qs}` : '/catalog/time-types', {
      scroll: false,
    });
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
      router.replace(qs ? `/catalog/time-types?${qs}` : '/catalog/time-types', {
        scroll: false,
      });
    }
  }

  async function runDelete(row: TimeTypeRow) {
    if (!(await confirm(`Удалить вид «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/time-types/${row.id}`, { method: 'DELETE' });
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
    const targets = displayRows.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные виды времени (${targets.length} шт.)?`))) {
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/time-types/${row.id}`, { method: 'DELETE' });
          } else {
            const isActive = action === 'activate';
            if ((row.isActive !== false) === isActive) continue;
            await apiFetch(`/api/catalog/time-types/${row.id}`, {
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

  async function toggleActive(row: TimeTypeRow, value: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/time-types/${row.id}`, {
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
      `time-types-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = timeTypeCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="time-types" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-clock" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Виды рабочего времени</h1>
          <p className={shared.pageSubtitle}>
            Справочник видов рабочего времени, кодов и нагрузки на план
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
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активный' },
                  { value: 'inactive', label: 'Неактивный' },
                ],
              },
              {
                type: 'select',
                key: 'planLoad',
                label: 'Нагрузка',
                options: PLAN_LOADS.map((p) => ({ value: p.value, label: p.label })),
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
                const hex = row.color || '';
                const active = row.isActive !== false;
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
                        if (key === 'letterCode' || key === 'digitalCode') {
                          return (
                            <td key={key} className={styles.codeCell}>
                              {timeTypeCell(row, key) || '—'}
                            </td>
                          );
                        }
                        if (key === 'color') {
                          return (
                            <td key={key}>
                              {hex ? (
                                <span className={styles.colorSwatch}>
                                  <span
                                    className={styles.colorBox}
                                    style={{ background: hex }}
                                  />
                                  <span className={styles.colorHex}>{hex}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        }
                        if (key === 'isActive') {
                          return (
                            <td key={key}>
                              {active ? (
                                <span className={styles.statusActive}>Активный</span>
                              ) : (
                                <span className={styles.statusMuted}>Неактивный</span>
                              )}
                            </td>
                          );
                        }
                        return <td key={key}>{timeTypeCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button type="button" onClick={() => openEdit(row.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleActive(row, !active)}
                            >
                              <i
                                className={active ? 'fas fa-ban' : 'fas fa-check'}
                                aria-hidden
                              />
                              {active ? 'Деактивировать' : 'Активировать'}
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

      <TimeTypeFormModal
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

export default function TimeTypesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <TimeTypesPageInner />
    </Suspense>
  );
}
