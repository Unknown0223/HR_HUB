'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import shared from '../../../page-shared.module.css';
import { ClearanceSheetForm } from './ClearanceSheetForm';
import styles from './page.module.css';

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
  if (status === 'completed') return styles.statusOk;
  if (status === 'cancelled') return styles.statusBad;
  if (status === 'in_progress') return styles.statusWarn;
  return styles.statusMuted;
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
  const [exportBusy, setExportBusy] = useState(false);
  const [search, setSearch] = useState(q);
  const [createOpen, setCreateOpen] = useState(false);

  const closeCreate = useCallback(() => setCreateOpen(false), []);

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

  async function load() {
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
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups')
      .then((d) => setEmployees(d.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    setSelectedId(null);
  }, [search]);

  async function runAction(row: ClearanceRow, action: 'complete' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/catalog/clearance-sheets/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/catalog/clearance-sheets/${row.id}/${action}`, { method: 'POST' });
      }
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
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
              placeholder="Поиск..."
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
            onClick={() => setCreateOpen(true)}
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
            className={styles.iconBtn}
            onClick={exportCsv}
            title="CSV"
            aria-label="CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
            title="Excel"
            aria-label="Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
          </button>
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
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
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
                  <td colSpan={5} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const open = selectedId === row.id;
                const total = (row.items || []).length;
                const signed = signedCount(row);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{row.number || '—'}</td>
                      <td>{fmtDate(row.documentDate || row.createdAt)}</td>
                      <td className={styles.nameCell}>{empName(row.employee)}</td>
                      <td>
                        {signed} / {total}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(row.status)}`}
                        >
                          {STATUS_LABEL[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={5}>
                          <div className={styles.detailBlock}>
                            <div className={styles.rowActions}>
                              {row.status !== 'completed' && row.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runAction(row, 'complete')}
                                >
                                  <i className="fas fa-check" aria-hidden />
                                  Завершить
                                </button>
                              ) : null}
                              {row.status !== 'completed' && row.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runAction(row, 'cancel')}
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
                                  onClick={() => void runAction(row, 'delete')}
                                >
                                  <i className="fas fa-trash-alt" aria-hidden />
                                  Удалить
                                </button>
                              ) : null}
                            </div>
                            {(row.items || []).length > 0 ? (
                              <ul className={styles.itemList}>
                                {(row.items || []).map((it) => (
                                  <li key={it.id}>
                                    <span>
                                      {it.title}
                                      {it.department ? ` (${it.department})` : ''}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={busy || row.status === 'completed'}
                                      onClick={() =>
                                        void toggleItem(
                                          it,
                                          it.status === 'done' ? 'pending' : 'done',
                                        )
                                      }
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
          <span>
            Показано{' '}
            <strong>{filtered.length === 0 ? 0 : `1–${filtered.length}`}</strong> из{' '}
            <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      <FormModal
        open={createOpen}
        title="Обходной лист (создание)"
        width="md"
        onClose={closeCreate}
      >
        <ClearanceSheetForm
          key={createOpen ? 'open' : 'closed'}
          embedded
          onSuccess={() => {
            closeCreate();
            void load();
          }}
          onCancel={closeCreate}
        />
      </FormModal>
    </div>
  );
}

export default function ClearanceSheetsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <ClearanceSheetsPageInner />
    </Suspense>
  );
}
