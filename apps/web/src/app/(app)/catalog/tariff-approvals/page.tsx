'use client';
import { confirm } from '@/lib/dialogs';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import shared from '../../../page-shared.module.css';
import { TariffApprovalForm } from './TariffApprovalForm';
import styles from './page.module.css';

const FILTER_KEYS = ['number', 'groupId', 'status', 'from', 'to'] as const;

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

type ModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit' | 'view'; id: string };

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
  if (s === 'approved') return styles.statusOk;
  if (s === 'rejected') return styles.statusBad;
  if (s === 'pending') return styles.statusWarn;
  return styles.statusMuted;
}

function ApprovalsInner() {
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Approval[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const closeModal = useCallback(() => setModal(null), []);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
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
      if (!q) return true;
      return [
        r.documentNumber,
        r.tariffGroup?.name,
        r.tariffGroup?.fullName,
        r.note,
        statusLabel(r.status),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filters]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allChecked =
    filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  useEffect(() => {
    setChecked({});
    setSelectedId(null);
  }, [search]);

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

  const baseRateOf = (r: Approval) =>
    r.baseRate ?? r.tariffGroup?.baseRate ?? null;

  async function remove(row: Approval) {
    if (!(await confirm('Удалить утверждение?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}`, {
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

  async function post(row: Approval) {
    setBusy(true);
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

  async function bulkPost() {
    if (!checkedIds.length) return;
    if (
      !(await confirm(
        `Провести выбранные утверждения (${checkedIds.length})?`,
      ))
    ) {
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

  async function bulkDelete() {
    if (!checkedIds.length) return;
    if (
      !(await confirm(`Удалить выбранные утверждения (${checkedIds.length})?`))
    ) {
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

  const modalTitle =
    modal?.mode === 'edit'
      ? 'Утверждение тарифной группы (изменение)'
      : modal?.mode === 'view'
        ? 'Утверждение тарифной группы (просмотр)'
        : 'Утверждение тарифной группы (создание)';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="tariff-approvals" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-clipboard-check" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Утверждения тарифных групп</h1>
          <p className={shared.pageSubtitle}>
            Документы утверждения тарифных ставок по разрядам
          </p>
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
            onClick={() => setModal({ mode: 'create' })}
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
              {
                type: 'text',
                key: 'number',
                label: 'Номер',
                placeholder: 'Поиск...',
              },
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
              filtersOpen
                ? `${styles.iconBtn} ${styles.iconBtnActive}`
                : styles.iconBtn
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
            <i className="fas fa-check" aria-hidden />
            Провести
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkDelete()}
          >
            <i className="fas fa-trash-alt" aria-hidden />
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
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Дата</th>
                <th>Номер</th>
                <th>Тарифная группа</th>
                <th>Базовый тариф</th>
                <th>Вступает в силу с</th>
                <th>Примечание</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading && !filtered.length ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && !filtered.length ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const canPost =
                  row.status === 'draft' || row.status === 'pending';
                const canDelete = row.status !== 'approved';
                const canEdit = canPost || row.status === 'draft';
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        open || isChecked ? styles.rowSelected : undefined
                      }
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
                      <td>{fmtDate(row.documentDate || row.createdAt)}</td>
                      <td>{row.documentNumber || '—'}</td>
                      <td className={styles.nameCell}>
                        {row.tariffGroup?.name || '—'}
                      </td>
                      <td>{fmtMoney(baseRateOf(row))}</td>
                      <td>{fmtDate(row.effectiveAt)}</td>
                      <td>{row.note || '—'}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(row.status)}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={8}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() =>
                                setModal({ mode: 'view', id: row.id })
                              }
                            >
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </button>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setModal({ mode: 'edit', id: row.id })
                                }
                              >
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                            ) : null}
                            {canPost ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void post(row)}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void remove(row)}
                              >
                                <i className="fas fa-trash-alt" aria-hidden />
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
          <span>
            Показано{' '}
            <strong>
              {filtered.length === 0 ? 0 : `1–${filtered.length}`}
            </strong>{' '}
            из <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      <FormModal
        open={modal !== null}
        title={modalTitle}
        width="xl"
        onClose={closeModal}
      >
        {modal ? (
          <TariffApprovalForm
            key={
              modal.mode === 'create' ? 'create' : `${modal.mode}-${modal.id}`
            }
            mode={modal.mode}
            approvalId={modal.mode === 'create' ? undefined : modal.id}
            embedded
            onSuccess={() => {
              closeModal();
              void load();
            }}
            onCancel={closeModal}
          />
        ) : null}
      </FormModal>
    </div>
  );
}

export default function TariffApprovalsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <ApprovalsInner />
    </Suspense>
  );
}
