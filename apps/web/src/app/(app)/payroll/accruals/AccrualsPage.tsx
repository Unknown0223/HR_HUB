'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { ListBulkBar, runListBulk, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  ACCRUAL_KINDS,
  type AccrualDoc,
  fmtDate,
  formatMonthRu,
  kindLabel,
  money,
} from '@/lib/accruals';
import styles from '../../catalog/absence-types/page.module.css';
import local from '../timesheets/page.module.css';

const PATH = '/payroll/accruals';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to', 'kind', 'month'] as const;

function AccrualsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'orders' ? 'orders' : 'accruals';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [rows, setRows] = useState<AccrualDoc[]>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(filters.number || filters.posted || filters.kind));

  async function load() {
    setError('');
    setLoading(true);
    try {
      if (tab === 'orders') {
        setOrders(await apiFetch('/api/catalog/payment-orders'));
      } else {
        setRows(await apiFetch<AccrualDoc[]>('/api/payroll/accruals'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    setSelected(new Set());
    setFocusId(null);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const month = filters.month;
    return rows.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.kind && r.kind !== filters.kind) return false;
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      if (month && !String(r.month).startsWith(month.slice(0, 7))) return false;
      if (filters.from && r.docDate.slice(0, 10) < filters.from) return false;
      if (filters.to && r.docDate.slice(0, 10) > filters.to) return false;
      if (!qq) return true;
      const hay = [r.number, r.title, kindLabel(r.kind), r.division?.name]
        .join(' ')
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIds = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const postCount = selectedRows.filter((r) => r.status === 'draft').length;
  const cancelCount = selectedRows.filter((r) => r.status === 'posted').length;
  const deleteCount = selectedRows.filter((r) => r.status !== 'posted').length;

  function patchUrl(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${PATH}?${sp.toString()}`);
  }

  async function bulk(kind: 'post' | 'cancel' | 'delete') {
    const ids =
      kind === 'post'
        ? selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
        : kind === 'cancel'
          ? selectedRows.filter((r) => r.status === 'posted').map((r) => r.id)
          : selectedRows.filter((r) => r.status !== 'posted').map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/accruals/bulk-${kind === 'cancel' ? 'cancel' : kind === 'post' ? 'post' : 'delete'}`,
        ids,
        message:
          kind === 'delete'
            ? 'Удалить выбранные документы?'
            : kind === 'post'
              ? 'Провести выбранные документы?'
              : 'Отменить проведение выбранных документов?',
        variant: kind === 'delete' ? 'danger' : undefined,
      });
      if (!ok) return;
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function run(row: AccrualDoc, action: 'post' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
        await apiFetch(`/api/payroll/accruals/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/accruals/${row.id}/${action}`, { method: 'POST' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `accruals-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Месяц: formatMonthRu(r.month),
        Дата: fmtDate(r.docDate),
        Номер: r.number || '',
        Тип: kindLabel(r.kind),
        Начислено: r.accruedTotal,
        Удержано: r.deductedTotal,
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="accruals" />
      <div className={local.tabs}>
        <Link href={PATH} className={tab === 'accruals' ? local.tabOn : local.tab}>
          Все начисления
        </Link>
        <Link href={`${PATH}?tab=orders`} className={tab === 'orders' ? local.tabOn : local.tab}>
          Поручения
        </Link>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {tab === 'accruals' ? (
            <div className={styles.createWrap}>
              <button type="button" className={styles.createBtn} onClick={() => setCreateOpen((v) => !v)}>
                Создать +
              </button>
              {createOpen ? (
                <div className={styles.createMenu}>
                  {ACCRUAL_KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        router.push(`${PATH}/new?kind=${k.value}`);
                      }}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <Link href="/catalog/payment-orders" className={styles.createBtn}>
              Создать
            </Link>
          )}
          {tab === 'accruals' ? (
            <ListBulkBar
              count={selected.size}
              busy={busy}
              onClear={() => setSelected(new Set())}
              actions={[
                { key: 'post', label: 'Провести', count: postCount, onClick: () => void bulk('post') },
                { key: 'cancel', label: 'Отменить', count: cancelCount, variant: 'danger', onClick: () => void bulk('cancel') },
                { key: 'delete', label: 'Удалить', count: deleteCount, variant: 'danger', onClick: () => void bulk('delete') },
              ]}
            />
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <label className={local.monthFilter}>
            месяц
            <input
              type="month"
              value={filters.month ? filters.month.slice(0, 7) : ''}
              onChange={(e) => patchUrl({ month: e.target.value ? `${e.target.value}-01` : null })}
            />
          </label>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'number', label: 'Номер', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата' },
              {
                type: 'select',
                key: 'kind',
                label: 'Тип документа',
                options: ACCRUAL_KINDS.map((k) => ({ value: k.value, label: k.label })),
              },
              { type: 'postedChecks', key: 'posted', label: 'Проведен' },
            ]}
          />
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <span className={styles.pagerMeta}>
            {paged.length}/{filtered.length}
          </span>
          <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Загрузка…</p> : null}

      {tab === 'orders' ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Наименование</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {orders.map((o) => (
                <tr key={String(o.id)}>
                  <td>{String(o.number || '—')}</td>
                  <td>{fmtDate(String(o.createdAt || o.dueDate || ''))}</td>
                  <td>{String(o.title || '—')}</td>
                  <td>{money(o.amount)}</td>
                  <td>{String(o.status || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))}
                    onChange={(e) => setSelected(togglePage(selected, filteredIds, e.target.checked))}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Месяц начисления</th>
                <th>
                  Дата <span className={local.sortMark}>↑</span>
                </th>
                <th>Номер</th>
                <th>Тип документа</th>
                <th>Начислено в базовой валюте</th>
                <th>Удержано в базовой валюте</th>
                <th>Проведен</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {paged.map((row) => {
                const open = focusId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setFocusId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                      className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                    >
                      <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                        />
                      </td>
                      <td>{formatMonthRu(row.month)}</td>
                      <td>{fmtDate(row.docDate)}</td>
                      <td>{row.number || '—'}</td>
                      <td>{kindLabel(row.kind)}</td>
                      <td>{money(row.accruedTotal)}</td>
                      <td>{money(row.deductedTotal)}</td>
                      <td>
                        {row.status === 'posted' ? (
                          <span className={styles.postedYes}>Да</span>
                        ) : (
                          <span className={styles.postedNo}>{row.status === 'cancelled' ? 'Отм.' : 'Нет'}</span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={8}>
                          <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                            <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                            {row.status === 'draft' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                            {row.status === 'posted' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'cancel')}>
                                Отменить
                              </button>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'post')}>
                                Провести
                              </button>
                            ) : null}
                            <Link href={`${PATH}/${row.id}/entries`}>Проводки</Link>
                            {row.status !== 'posted' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void run(row, 'delete')}
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
      )}
    </div>
  );
}

export function AccrualsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <AccrualsInner />
    </Suspense>
  );
}
