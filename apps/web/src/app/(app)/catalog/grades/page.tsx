'use client';

import { confirm } from '@/lib/dialogs';

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
import { GradeFormModal } from './GradeForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type GradeRow = {
  id: string;
  code: string;
  name: string;
  level?: number;
  isActive: boolean;
};

const FILTER_KEYS = ['q', 'name', 'code', 'status'] as const;

const gradeListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.grades.v1',
  title: 'Разряды',
  columns: [
    { key: 'name', label: 'Название' },
    { key: 'code', label: 'Код' },
    { key: 'level', label: 'Порядковый номер' },
    { key: 'isActive', label: 'Статус' },
  ],
  defaultColumns: ['name', 'code', 'level', 'isActive'],
  defaultSearchKeys: ['name', 'code'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function gradeCell(row: GradeRow, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'code':
      return row.code || '';
    case 'level':
      return row.level != null ? String(row.level) : '';
    case 'isActive':
      return row.isActive ? 'Активный' : 'Неактивный';
    default:
      return '';
  }
}

function GradesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(gradeListPrefs);
  const q = filters.q;
  const nameFilter = filters.name;
  const codeFilter = filters.code;
  const statusFilter = filters.status;

  const [rows, setRows] = useState<GradeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || nameFilter || codeFilter || statusFilter),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : gradeListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    let list = rows;
    const nameF = nameFilter.trim().toLowerCase();
    const codeF = codeFilter.trim().toLowerCase();
    if (nameF) list = list.filter((r) => (r.name || '').toLowerCase().includes(nameF));
    if (codeF) list = list.filter((r) => (r.code || '').toLowerCase().includes(codeF));
    if (statusFilter === 'active') list = list.filter((r) => r.isActive);
    else if (statusFilter === 'inactive') list = list.filter((r) => !r.isActive);

    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [r.name, r.code, r.level != null ? String(r.level) : '']
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    return list;
  }, [rows, q, nameFilter, codeFilter, statusFilter]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, gradeCell),
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
      const data = await apiFetch<GradeRow[]>('/api/catalog/grades');
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
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/grades?${qs}` : '/catalog/grades', { scroll: false });
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
      router.replace(qs ? `/catalog/grades?${qs}` : '/catalog/grades', { scroll: false });
    }
  }

  async function runDelete(row: GradeRow) {
    if (!(await confirm(`Удалить «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/grades/${row.id}`, { method: 'DELETE' });
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
      if (!(await confirm(`Удалить выбранные разряды (${targets.length} шт.)?`))) return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/grades/${row.id}`, { method: 'DELETE' });
          } else {
            const isActive = action === 'activate';
            if (row.isActive === isActive) continue;
            await apiFetch(`/api/catalog/grades/${row.id}`, {
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

  async function toggleActive(row: GradeRow, value: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/grades/${row.id}`, {
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
      `grades-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = gradeCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="grades" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-layer-group" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Разряды</h1>
          <p className={shared.pageSubtitle}>
            Справочник тарифных разрядов и порядка их следования
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
                        if (key === 'level') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {row.level != null ? row.level : '—'}
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
                        return <td key={key}>{gradeCell(row, key) || '—'}</td>;
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

      <GradeFormModal
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

export default function GradesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <GradesInner />
    </Suspense>
  );
}
