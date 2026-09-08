'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { ClearanceTemplateFormModal } from './ClearanceTemplateFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  divisionId?: string | null;
  positionId?: string | null;
  requireManagerSign: boolean;
  requireHigherManagerSign: boolean;
  isActive: boolean;
  division?: { id: string; name: string; code: string } | null;
  position?: { id: string; name: string; code: string } | null;
  employees?: { id: string; employeeId: string }[];
};

const PAGE_SIZES = [25, 50, 100] as const;

const clearanceTemplateListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.clearance-templates.v1',
  title: 'Шаблоны обходных листов',
  columns: [
    { key: 'name', label: 'Шаблон' },
    { key: 'division', label: 'Подразделения' },
    { key: 'position', label: 'Должность' },
    { key: 'requireManagerSign', label: 'Подпись руководителя' },
    { key: 'requireHigherManagerSign', label: 'Подпись вышестоящего руководителя' },
    { key: 'employees', label: 'Сотрудники' },
    { key: 'isActive', label: 'Активен' },
  ],
  defaultColumns: [
    'name',
    'division',
    'position',
    'requireManagerSign',
    'requireHigherManagerSign',
    'employees',
    'isActive',
  ],
  defaultSearchKeys: ['name', 'division', 'position'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function yesNo(v: boolean) {
  return v ? 'Да' : 'Нет';
}

function clearanceTemplateCell(row: TemplateRow, key: string): string {
  switch (key) {
    case 'name':
      return row.name || '';
    case 'division':
      return row.division?.name || '';
    case 'position':
      return row.position?.name || '';
    case 'requireManagerSign':
      return yesNo(row.requireManagerSign);
    case 'requireHigherManagerSign':
      return yesNo(row.requireHigherManagerSign);
    case 'employees':
      return String(row.employees?.length ?? 0);
    case 'isActive':
      return yesNo(row.isActive);
    default:
      return '';
  }
}

function ClearanceTemplatesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useTablePrefs(clearanceTemplateListPrefs);
  const q = searchParams.get('q') || '';

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : clearanceTemplateListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.division?.name, r.position?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, clearanceTemplateCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const pageRows = useMemo(
    () => displayRows.slice((page - 1) * pageSize, page * pageSize),
    [displayRows, page, pageSize],
  );
  const rangeFrom = displayRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, displayRows.length);

  const checkedIds = useMemo(() => Object.keys(checked).filter((id) => checked[id]), [checked]);
  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => checked[r.id]);
  const somePageChecked = pageRows.some((r) => checked[r.id]) && !allPageChecked;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TemplateRow[] | { items?: TemplateRow[] }>(
        '/api/catalog/clearance-templates',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchDraft(q);
    setPage(1);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setEditId(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  function buildUrl(next: URLSearchParams) {
    const qs = next.toString();
    return qs ? `/catalog/clearance-templates?${qs}` : '/catalog/clearance-templates';
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    params.delete('create');
    router.replace(buildUrl(params), { scroll: false });
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      router.replace(buildUrl(params), { scroll: false });
    }
  }

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
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

  function dropChecked(ids: string[]) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  async function remove(row: TemplateRow) {
    if (!(await confirm('Удалить шаблон?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/clearance-templates/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      dropChecked([row.id]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function bulkRemove() {
    if (checkedIds.length === 0) return;
    if (!(await confirm(`Удалить выбранные шаблоны (${checkedIds.length} шт.)?`))) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const id of checkedIds) {
        try {
          await apiFetch(`/api/catalog/clearance-templates/${id}`, { method: 'DELETE' });
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть шаблонов не удалена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  async function bulkSetActive(isActive: boolean) {
    if (checkedIds.length === 0) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const id of checkedIds) {
        try {
          await apiFetch(`/api/catalog/clearance-templates/${id}`, {
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
      if (failed > 0) setError(`Часть шаблонов не обновлена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `clearance-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = clearanceTemplateCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="clearance-templates" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeClearance}`}>
          <i className="fas fa-clipboard-list" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Шаблоны обходных листов</h1>
          <p className={shared.pageSubtitle}>
            Правила подписания и состав участников обходного листа
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
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              setEditId(null);
              setModalOpen(true);
            }}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
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
            onClick={() => void bulkSetActive(true)}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkSetActive(false)}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkRemove()}
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
                    disabled={pageRows.length === 0}
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
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {pageRows.map((row) => {
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
                          aria-label={`Выбрать ${row.name || row.code}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'name') {
                          return (
                            <td key={key}>
                              <div className={styles.nameCell}>
                                <span className={styles.nameIcon} aria-hidden>
                                  <i className="fas fa-clipboard-check" />
                                </span>
                                <div className={styles.nameText}>
                                  <div className={styles.name}>{row.name || '—'}</div>
                                  <div className={styles.meta}>{row.code}</div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (key === 'requireManagerSign') {
                          return (
                            <td key={key}>
                              <span
                                className={
                                  row.requireManagerSign ? styles.signYes : styles.signNo
                                }
                              >
                                {yesNo(row.requireManagerSign)}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'requireHigherManagerSign') {
                          return (
                            <td key={key}>
                              <span
                                className={
                                  row.requireHigherManagerSign
                                    ? styles.signYes
                                    : styles.signNo
                                }
                              >
                                {yesNo(row.requireHigherManagerSign)}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'employees') {
                          return (
                            <td key={key}>
                              <span className={styles.countPill}>
                                {row.employees?.length ?? 0}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'isActive') {
                          return (
                            <td key={key}>
                              <span
                                className={row.isActive ? styles.badgeOk : styles.badgeOff}
                              >
                                {yesNo(row.isActive)}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={key}>{clearanceTemplateCell(row, key) || '—'}</td>
                        );
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditId(row.id);
                                setModalOpen(true);
                              }}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <Link
                              href={`/catalog/clearance-templates/${row.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <i className="fas fa-external-link-alt" aria-hidden />
                              Открыть форму
                            </Link>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void remove(row);
                              }}
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
            из <strong>{displayRows.length}</strong>
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

      <ClearanceTemplateFormModal
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

export default function ClearanceTemplatesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ClearanceTemplatesInner />
    </Suspense>
  );
}
