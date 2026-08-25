'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ListBulkBar, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { formatMonthRu } from '@/lib/fine-policies';
import {
  ALLOWANCE_SCOPE_TABS,
  parseAllowanceScope,
  type AllowancePolicyRow,
  type AllowanceScope,
} from '@/lib/allowance-policies';
import styles from '../../catalog/absence-types/page.module.css';
import local from './page.module.css';

const PATH = '/payroll/allowance-policies';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'month', 'isActive', 'divisionId', 'scheduleId'] as const;

type Opt = { id: string; label: string };

function AllowancePoliciesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const scope: AllowanceScope = parseAllowanceScope(searchParams.get('tab'));

  const [rows, setRows] = useState<AllowancePolicyRow[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.name ||
        filters.month ||
        filters.isActive ||
        filters.divisionId ||
        filters.scheduleId,
    ),
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.name && !(r.name || '').toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.month) {
        const blob = `${formatMonthRu(r.month)} ${r.month}`.toLowerCase();
        if (!blob.includes(filters.month.toLowerCase())) return false;
      }
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (filters.divisionId && r.divisionId !== filters.divisionId) return false;
      if (filters.scheduleId && r.scheduleId !== filters.scheduleId) return false;
      if (!qq) return true;
      return [formatMonthRu(r.month), r.name, r.division?.name, r.schedule?.name]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [
    rows,
    q,
    filters.name,
    filters.month,
    filters.isActive,
    filters.divisionId,
    filters.scheduleId,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);
  const colSpan = scope === 'company' ? 3 : 4;

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setFocusId(null);
  }, [q, scope, filters.name, filters.month, filters.isActive, filters.divisionId, filters.scheduleId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AllowancePolicyRow[]>(
        `/api/payroll/allowance-policies?scope=${encodeURIComponent(scope)}`,
      );
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
  }, [scope]);

  useEffect(() => {
    apiFetch<{ schedules?: Opt[] }>('/api/catalog/lookups')
      .then((d) => setSchedules(d.schedules || []))
      .catch(() => setSchedules([]));
  }, []);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function setScope(next: AllowanceScope) {
    patchUrl({ tab: next === 'company' ? null : next });
  }

  async function deleteIds(ids: string[], message?: string) {
    if (!ids.length) return;
    if (!(await confirm(message || `Удалить ${ids.length}?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/payroll/allowance-policies/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function copyRow(row: AllowancePolicyRow) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/allowance-policies/${row.id}/copy`, { method: 'POST' });
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка копирования');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `allowance-policies-${scope}.csv`,
      filtered.map((r) => ({
        Месяц: formatMonthRu(r.month),
        Название: r.name || '',
        Подразделение: r.division?.name || '',
        'График работы': r.schedule?.name || '',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  const filterFields = [
    { type: 'text' as const, key: 'month', label: 'Месяц', placeholder: 'Поиск...' },
    { type: 'text' as const, key: 'name', label: 'Название', placeholder: 'Поиск...' },
    ...(scope === 'division'
      ? [{ type: 'divisionId' as const, key: 'divisionId', label: 'Подразделение' }]
      : []),
    ...(scope === 'schedule'
      ? [
          {
            type: 'select' as const,
            key: 'scheduleId',
            label: 'График работы',
            options: schedules.map((s) => ({ value: s.id, label: s.label })),
          },
        ]
      : []),
    { type: 'isActive' as const, key: 'isActive', label: 'Статус' },
  ];

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="allowance-policies" />
      <div className={local.tabs}>
        {ALLOWANCE_SCOPE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={scope === t.id ? local.tabOn : local.tab}
            onClick={() => setScope(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() =>
              router.push(`${PATH}/new${scope === 'company' ? '' : `?tab=${scope}`}`)
            }
          >
            Добавить
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={filterFields}
          />
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              {
                key: 'delete',
                label: 'Удалить',
                count: selected.size,
                variant: 'danger',
                onClick: () => void deleteIds(Array.from(selected)),
              },
            ]}
          />
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
            }}
          />
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <span className={styles.pagerMeta}>
            {paged.length}/{filtered.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            aria-label="Обновить"
          >
            ↻
          </button>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={ids.length > 0 && ids.every((id) => selected.has(id))}
                  onChange={(e) => setSelected(togglePage(selected, ids, e.target.checked))}
                  aria-label="Выбрать все"
                />
              </th>
              <th>
                Месяц
                <span className={local.sortMark}>↑</span>
              </th>
              <th>Название</th>
              {scope === 'division' ? <th>Подразделение</th> : null}
              {scope === 'schedule' ? <th>График работы</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const open = focusId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                    onClick={() => setFocusId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{formatMonthRu(row.month)}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `${PATH}/${row.id}/edit${scope === 'company' ? '' : `?tab=${scope}`}`,
                              )
                            }
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() =>
                              void deleteIds([row.id], `Удалить «${formatMonthRu(row.month)}»?`)
                            }
                          >
                            Удалить
                          </button>
                          <button type="button" disabled={busy} onClick={() => void copyRow(row)}>
                            Скопировать
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{row.name || ''}</td>
                    {scope === 'division' ? <td>{row.division?.name || ''}</td> : null}
                    {scope === 'schedule' ? <td>{row.schedule?.name || ''}</td> : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AllowancePoliciesPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <AllowancePoliciesInner />
    </Suspense>
  );
}
