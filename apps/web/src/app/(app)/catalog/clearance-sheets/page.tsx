'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { confirm } from '@/lib/dialogs';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { ClearanceSheetFormModal } from './ClearanceSheetFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
};

type ClearanceItem = {
  id: string;
  title: string;
  department?: string | null;
  status: string;
  sortOrder: number;
  note?: string | null;
  doneAt?: string | null;
};

type ClearanceRow = {
  id: string;
  employeeId: string;
  templateId?: string | null;
  number?: string | null;
  documentDate?: string | null;
  title: string;
  status: string;
  note?: string | null;
  completedAt?: string | null;
  createdAt: string;
  employee?: EmpRef | null;
  template?: { id: string; name: string; code?: string } | null;
  items?: ClearanceItem[];
};

type EmpOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'status', 'employeeId', 'from', 'to'] as const;
const COL_COUNT = 6;

const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function signedCount(row: ClearanceRow) {
  const items = row.items || [];
  if (!items.length) return 0;
  return items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
}

function statusClass(status: string) {
  if (status === 'completed') return styles.badgeDone;
  if (status === 'cancelled') return styles.badgeOff;
  return styles.badgeOpen;
}

function ClearanceSheetsPageInner() {
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const statusFilter = filters.status;
  const employeeIdFilter = filters.employeeId;
  const from = filters.from;
  const to = filters.to;

  const [rows, setRows] = useState<ClearanceRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || statusFilter || employeeIdFilter || from || to),
  );
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = (search || q).trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.number,
          r.title,
          empName(r.employee),
          r.template?.name,
          r.note,
          r.employee?.tabNumber,
          r.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    if (employeeIdFilter) list = list.filter((r) => r.employeeId === employeeIdFilter);
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(r.documentDate || r.createdAt).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(r.documentDate || r.createdAt).getTime() <= t);
    }
    return list;
  }, [rows, search, q, statusFilter, employeeIdFilter, from, to]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const allChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<ClearanceRow[]>('/api/catalog/clearance-sheets');
      setRows(Array.isArray(data) ? data : []);
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
    apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups')
      .then((d) => setEmployees(d.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams?.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  function buildUrl(next: URLSearchParams) {
    const qs = next.toString();
    return qs ? `/catalog/clearance-sheets?${qs}` : '/catalog/clearance-sheets';
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    params.delete('create');
    router.replace(buildUrl(params), { scroll: false });
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams?.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      router.replace(buildUrl(params), { scroll: false });
    }
  }

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
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

  async function runAction(row: ClearanceRow, action: 'complete' | 'cancel' | 'delete') {
    if (action === 'delete' && !(await confirm('Удалить обходной лист?'))) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/catalog/clearance-sheets/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/catalog/clearance-sheets/${row.id}/${action}`, {
          method: 'POST',
        });
      }
      setSelectedId(null);
      dropChecked([row.id]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'complete' | 'cancel' | 'delete') {
    if (checkedIds.length === 0) return;
    const targets = filtered.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    const eligible =
      action === 'delete'
        ? targets.filter((r) => r.status !== 'completed')
        : targets.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');

    if (eligible.length === 0) {
      setError('Нет подходящих по статусу обходных листов среди выбранных');
      return;
    }

    if (
      action === 'delete' &&
      !(await confirm(`Удалить выбранные обходные листы (${eligible.length} шт.)?`))
    ) {
      return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of eligible) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/clearance-sheets/${row.id}`, { method: 'DELETE' });
          } else {
            await apiFetch(`/api/catalog/clearance-sheets/${row.id}/${action}`, {
              method: 'POST',
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

  async function toggleItem(item: ClearanceItem, next: 'done' | 'pending') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/clearance-items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка пункта');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `clearance-sheets-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Номер: r.number || '',
        Дата: fmtDate(r.documentDate || r.createdAt),
        Владелец: empName(r.employee),
        Шаблон: r.template?.name || '',
        'Количество подписаний': `${signedCount(r)} / ${(r.items || []).length}`,
        Статус: STATUS_LABEL[r.status] || r.status,
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/catalog/clearance-sheets/export.xlsx',
        `clearance-sheets-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="clearance-sheets" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeClearance}`}>
          <i className="fas fa-tasks" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Обходные листы</h1>
          <p className={shared.pageSubtitle}>Обходные листы при увольнении сотрудников</p>
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
              setModalOpen(true);
            }}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', label: 'Дата', fromKey: 'from', toKey: 'to' },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Владелец',
                options: employees.map((e) => ({ value: e.id, label: e.label })),
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: Object.entries(STATUS_LABEL).map(([value, label]) => ({
                  value,
                  label,
                })),
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
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
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
            onClick={() => void runBulk('complete')}
          >
            <i className="fas fa-check" aria-hidden />
            Завершить
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
                    checked={allChecked}
                    disabled={filtered.length === 0}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Номер</th>
                <th>Дата</th>
                <th>Владелец</th>
                <th>Количество подписаний</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const total = (row.items || []).length;
                const signed = signedCount(row);
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
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      <td>{row.number || '—'}</td>
                      <td>{fmtDate(row.documentDate || row.createdAt)}</td>
                      <td className={styles.empName}>{empName(row.employee)}</td>
                      <td>
                        <span className={styles.countPill}>
                          {signed} / {total}
                        </span>
                      </td>
                      <td>
                        <span className={statusClass(row.status)}>
                          {STATUS_LABEL[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.detailBlock}>
                            <div className={styles.rowActions}>
                              {row.status !== 'completed' && row.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void runAction(row, 'complete');
                                  }}
                                >
                                  <i className="fas fa-check" aria-hidden />
                                  Завершить
                                </button>
                              ) : null}
                              {row.status !== 'completed' && row.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void runAction(row, 'cancel');
                                  }}
                                >
                                  <i className="fas fa-ban" aria-hidden />
                                  Отменить
                                </button>
                              ) : null}
                              {row.status !== 'completed' ? (
                                <button
                                  type="button"
                                  className={styles.danger}
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void runAction(row, 'delete');
                                  }}
                                >
                                  <i className="fas fa-trash" aria-hidden />
                                  Удалить
                                </button>
                              ) : null}
                            </div>
                            {(row.items || []).length > 0 ? (
                              <ul className={styles.itemList}>
                                {(row.items || []).map((it) => (
                                  <li key={it.id}>
                                    <span className={styles.itemTitle}>
                                      {it.title}
                                      {it.department ? (
                                        <em className={styles.itemDept}>{it.department}</em>
                                      ) : null}
                                    </span>
                                    <button
                                      type="button"
                                      className={
                                        it.status === 'done'
                                          ? `${styles.itemBtn} ${styles.itemBtnDone}`
                                          : styles.itemBtn
                                      }
                                      disabled={busy || row.status === 'completed'}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void toggleItem(
                                          it,
                                          it.status === 'done' ? 'pending' : 'done',
                                        );
                                      }}
                                    >
                                      {it.status === 'done' ? '✓ Подписано' : 'Подписать'}
                                    </button>
                                  </li>
                                ))}
                              </ul>
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <ClearanceSheetFormModal
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

export default function ClearanceSheetsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ClearanceSheetsPageInner />
    </Suspense>
  );
}
