'use client';

import { confirm } from '@/lib/dialogs';

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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { TariffApprovalFormModal } from './TariffApprovalFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = ['q', 'number', 'groupId', 'status', 'from', 'to'] as const;

const approvalListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.tariff-approvals.v1',
  title: 'Утверждения тарифных групп',
  columns: [
    { key: 'documentDate', label: 'Дата' },
    { key: 'documentNumber', label: 'Номер' },
    { key: 'tariffGroup', label: 'Тарифная группа' },
    { key: 'baseRate', label: 'Базовый тариф' },
    { key: 'effectiveAt', label: 'Вступает в силу с' },
    { key: 'status', label: 'Статус' },
    { key: 'note', label: 'Примечание' },
  ],
  defaultColumns: [
    'documentDate',
    'documentNumber',
    'tariffGroup',
    'baseRate',
    'effectiveAt',
    'status',
    'note',
  ],
  defaultSearchKeys: ['documentNumber', 'tariffGroup', 'note', 'status'],
  defaultSort: [{ key: 'documentDate', dir: 'desc' }],
  searchableKeys: ['documentNumber', 'tariffGroup', 'note', 'status', 'baseRate'],
});

type Approval = {
  id: string;
  documentDate?: string | null;
  documentNumber?: string | null;
  effectiveAt?: string | null;
  baseRate?: string | number | null;
  note?: string | null;
  status: string;
  createdAt?: string;
  tariffGroupId: string;
  tariffGroup?: {
    id: string;
    name: string;
    fullName?: string | null;
    baseRate?: string | number;
  } | null;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function statusLabel(s: string) {
  if (s === 'approved') return 'Проведён';
  if (s === 'rejected') return 'Отклонён';
  if (s === 'pending') return 'На утверждении';
  return 'Черновик';
}

function statusClass(s: string) {
  if (s === 'approved') return styles.statusApproved;
  if (s === 'rejected') return styles.statusRejected;
  if (s === 'pending') return styles.statusPending;
  return styles.statusDraft;
}

function baseRateOf(r: Approval) {
  return r.baseRate ?? r.tariffGroup?.baseRate ?? null;
}

function cellOf(row: Approval, key: string): string {
  switch (key) {
    case 'documentDate':
      return fmtDate(row.documentDate || row.createdAt);
    case 'documentNumber':
      return row.documentNumber || '';
    case 'tariffGroup':
      return row.tariffGroup?.name || '';
    case 'baseRate':
      return fmtMoney(baseRateOf(row));
    case 'effectiveAt':
      return fmtDate(row.effectiveAt);
    case 'status':
      return statusLabel(row.status);
    case 'note':
      return row.note || '';
    default:
      return '';
  }
}

function ApprovalsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const prefs = useTablePrefs(approvalListPrefs);
  const q = filters.q;
  const [rows, setRows] = useState<Approval[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups] = await Promise.all([
        apiFetch<Approval[]>('/api/catalog/tariff-approvals'),
        apiFetch<{ tariffGroups?: { id: string; label: string }[] }>(
          '/api/catalog/lookups',
        ),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setGroups(lookups.tariffGroups || []);
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
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/tariff-approvals?${qs}` : '/catalog/tariff-approvals',
      { scroll: false },
    );
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/tariff-approvals?${qs}` : '/catalog/tariff-approvals',
        { scroll: false },
      );
    }
  }

  const filtered = useMemo(() => {
    const qq = (q || '').trim().toLowerCase();
    const numF = (filters.number || '').trim().toLowerCase();
    const groupF = (filters.groupId || '').trim();
    const statusF = (filters.status || '').trim();
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    return rows.filter((r) => {
      if (numF && !(r.documentNumber || '').toLowerCase().includes(numF))
        return false;
      if (groupF && r.tariffGroupId !== groupF && r.tariffGroup?.id !== groupF)
        return false;
      if (statusF && r.status !== statusF) return false;
      const dateVal = r.documentDate || r.createdAt;
      if (from || to) {
        if (!dateVal) return false;
        const d = new Date(dateVal);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (!qq) return true;
      return [
        r.documentNumber,
        r.tariffGroup?.name,
        r.tariffGroup?.fullName,
        r.note,
        statusLabel(r.status),
      ]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [rows, q, filters]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : approvalListPrefs.defaultColumns;
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

  function dropChecked(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function remove(row: Approval) {
    if (!(await confirm('Удалить утверждение?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}`, {
        method: 'DELETE',
      });
      setSelectedId(null);
      dropChecked(row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function post(row: Approval) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}/post`, {
        method: 'POST',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setBusy(false);
    }
  }

  async function reject(row: Approval) {
    if (!(await confirm('Отклонить утверждение?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}/reject`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отклонения');
    } finally {
      setBusy(false);
    }
  }

  async function bulkPost() {
    if (!checkedIds.length) return;
    if (!(await confirm(`Провести выбранные утверждения (${checkedIds.length} шт.)?`))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<{
        posted: number;
        skipped: number;
        errors?: { id: string; message: string }[];
      }>('/api/catalog/tariff-approvals/bulk-post', {
        method: 'POST',
        body: JSON.stringify({ ids: checkedIds }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
      if (result.skipped > 0) {
        const detail = (result.errors || [])
          .map((e) => e.message)
          .filter(Boolean)
          .slice(0, 3)
          .join('; ');
        setError(
          `Проведено: ${result.posted}, пропущено: ${result.skipped}${
            detail ? ` (${detail})` : ''
          }`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка группового проведения');
    } finally {
      setBusy(false);
    }
  }

  async function bulkReject() {
    const targets = rows.filter(
      (r) => checked[r.id] && r.status !== 'approved' && r.status !== 'rejected',
    );
    if (!targets.length) {
      setError('Среди выбранных нет документов, которые можно отклонить');
      return;
    }
    if (!(await confirm(`Отклонить выбранные утверждения (${targets.length} шт.)?`))) {
      return;
    }
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          await apiFetch(`/api/catalog/tariff-approvals/${row.id}/reject`, {
            method: 'POST',
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

  async function bulkDelete() {
    if (!checkedIds.length) return;
    if (!(await confirm(`Удалить выбранные утверждения (${checkedIds.length} шт.)?`))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/catalog/tariff-approvals/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: checkedIds }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка группового удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `tariff-approvals-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <PageSubnav groupKey="tariff-approvals" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-file-signature" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Утверждения тарифных групп</h1>
          <p className={shared.pageSubtitle}>
            Документы изменения базового тарифа и окладов по разрядам
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
            onClick={() => setModalOpen(true)}
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
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'groupId',
                label: 'Тарифная группа',
                options: groups.map((g) => ({ value: g.id, label: g.label })),
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
                label: 'Статус',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'pending', label: 'На утверждении' },
                  { value: 'approved', label: 'Проведён' },
                  { value: 'rejected', label: 'Отклонён' },
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
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
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
            onClick={() => void bulkPost()}
          >
            <i className="fas fa-check-double" aria-hidden />
            Провести
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkReject()}
          >
            <i className="fas fa-ban" aria-hidden />
            Отклонить
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkDelete()}
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
                const canPost = row.status === 'draft' || row.status === 'pending';
                const canReject = canPost;
                const canDelete = row.status !== 'approved';
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
                          aria-label="Выбрать документ"
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'documentDate') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {fmtDate(row.documentDate || row.createdAt)}
                            </td>
                          );
                        }
                        if (key === 'documentNumber') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {row.documentNumber || '—'}
                            </td>
                          );
                        }
                        if (key === 'tariffGroup') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {row.tariffGroup?.name || '—'}
                            </td>
                          );
                        }
                        if (key === 'baseRate') {
                          return (
                            <td key={key} className={styles.moneyCell}>
                              {fmtMoney(baseRateOf(row))}
                            </td>
                          );
                        }
                        if (key === 'effectiveAt') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {fmtDate(row.effectiveAt)}
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
                        if (key === 'note') {
                          return (
                            <td key={key} className={styles.noteCell}>
                              {row.note || '—'}
                            </td>
                          );
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/tariff-approvals/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {canPost ? (
                              <Link href={`/catalog/tariff-approvals/${row.id}?edit=1`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {canPost ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void post(row)}
                              >
                                <i className="fas fa-check-double" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {canReject ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void reject(row)}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отклонить
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void remove(row)}
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <TariffApprovalFormModal
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

export default function TariffApprovalsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ApprovalsInner />
    </Suspense>
  );
}
