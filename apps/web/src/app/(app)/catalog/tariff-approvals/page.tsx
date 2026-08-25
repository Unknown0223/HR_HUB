'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
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
  tariffGroup?: { id: string; name: string; fullName?: string | null; baseRate?: string | number } | null;
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
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function statusLabel(s: string) {
  if (s === 'approved') return 'Проведён';
  if (s === 'rejected') return 'Отклонён';
  if (s === 'pending') return 'На утверждении';
  return 'Черновик';
}

function ApprovalsInner() {
  const router = useRouter();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const [rows, setRows] = useState<Approval[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, lookups] = await Promise.all([
        apiFetch<Approval[]>('/api/catalog/tariff-approvals'),
        apiFetch<{ tariffGroups?: { id: string; label: string }[] }>('/api/catalog/lookups'),
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
      if (numF && !(r.documentNumber || '').toLowerCase().includes(numF)) return false;
      if (groupF && r.tariffGroupId !== groupF && r.tariffGroup?.id !== groupF) return false;
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

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));

  function toggleAll() {
    if (allFilteredChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setChecked((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => [...checked], [checked]);

  async function remove(row: Approval) {
    if (!(await confirm('Удалить утверждение?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
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
      await apiFetch(`/api/catalog/tariff-approvals/${row.id}/post`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setBusy(false);
    }
  }

  async function bulkPost() {
    if (!selectedIds.length) return;
    if (
      !(await confirm(
        `Провести выбранные утверждения (${selectedIds.length})?`,
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
        body: JSON.stringify({ ids: selectedIds }),
      });
      setChecked(new Set());
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
    if (!selectedIds.length) return;
    if (!(await confirm(`Удалить выбранные утверждения (${selectedIds.length})?`))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/catalog/tariff-approvals/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setChecked(new Set());
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка группового удаления');
    } finally {
      setBusy(false);
    }
  }

  const baseRateOf = (r: Approval) =>
    r.baseRate ?? r.tariffGroup?.baseRate ?? null;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="tariff-approvals" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/tariff-approvals/new" className={styles.createBtn}>
            Создать
          </Link>
          {selectedIds.length > 0 ? (
            <>
              <button
                type="button"
                className={styles.bulkPost}
                disabled={busy}
                onClick={() => void bulkPost()}
              >
                Провести: {selectedIds.length}
              </button>
              <button
                type="button"
                className={styles.bulkDanger}
                disabled={busy}
                onClick={() => void bulkDelete()}
              >
                Удалить: {selectedIds.length}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => router.push('/catalog/tariff-groups')}
          >
            Закрыть
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
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
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allFilteredChecked}
                  onChange={toggleAll}
                  title="Выбрать все"
                />
              </th>
              <th>Дата</th>
              <th>Номер</th>
              <th>Тарифная группа</th>
              <th>Базовый тариф</th>
              <th>Вступает в силу с</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              const isChecked = checked.has(row.id);
              const canPost = row.status === 'draft' || row.status === 'pending';
              const canDelete = row.status !== 'approved';
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open || isChecked ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{fmtDate(row.documentDate || row.createdAt)}</td>
                    <td>{row.documentNumber || '—'}</td>
                    <td>{row.tariffGroup?.name || '—'}</td>
                    <td>{fmtMoney(baseRateOf(row))}</td>
                    <td>{fmtDate(row.effectiveAt)}</td>
                    <td>{row.note || '—'}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={7}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/tariff-approvals/${row.id}`}>
                            Просмотреть
                          </Link>
                          {canPost || row.status === 'draft' ? (
                            <Link href={`/catalog/tariff-approvals/${row.id}?edit=1`}>
                              Изменить
                            </Link>
                          ) : null}
                          {canPost ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void post(row)}
                            >
                              Провести
                            </button>
                          ) : null}
                          <span className={styles.postedYes}>{statusLabel(row.status)}</span>
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(row)}
                            >
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
