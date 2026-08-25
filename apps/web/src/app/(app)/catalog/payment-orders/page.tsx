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
  fmtDate,
  moneyOrder,
  orderStatusLabel,
  type PaymentOrderRow,
} from '@/lib/payment-orders';
import styles from '../absence-types/page.module.css';

const PATH = '/catalog/payment-orders';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'accrualName', 'status', 'from', 'to'] as const;

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const [rows, setRows] = useState<PaymentOrderRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.accrualName || filters.status || filters.from || filters.to),
  );

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<PaymentOrderRow[]>('/api/payroll/payment-orders'));
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
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.accrualName && !String(r.accrualName || r.title || '').toLowerCase().includes(filters.accrualName.trim().toLowerCase())) {
        return false;
      }
      if (filters.status === 'new' && r.status !== 'new' && r.status !== 'open') return false;
      if (filters.status && filters.status !== 'new' && r.status !== filters.status) return false;
      const d = String(r.startDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.employee?.label, r.accrualName, r.title, r.amount, r.note].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.accrualName, filters.status, filters.from, filters.to]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);
  const pageNums = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(pageCount, start + 4);
    const from = Math.max(1, end - 4);
    const list: number[] = [];
    for (let i = from; i <= end; i++) list.push(i);
    return list;
  }, [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [q, filters.accrualName, filters.status, filters.from, filters.to]);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.replace(`${PATH}?${params.toString()}`, { scroll: false });
  }

  const isNew = (s: string) => s === 'new' || s === 'open';
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const sendCount = selectedRows.filter((r) => isNew(r.status)).length;
  const payCount = selectedRows.filter((r) => r.status === 'sent').length;
  const deleteCount = selectedRows.filter((r) => isNew(r.status)).length;

  async function bulk(kind: 'send' | 'pay' | 'delete') {
    const ids =
      kind === 'pay'
        ? selectedRows.filter((r) => r.status === 'sent').map((r) => r.id)
        : selectedRows.filter((r) => isNew(r.status)).map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/payment-orders/bulk-${kind}`,
        ids,
        message:
          kind === 'delete'
            ? 'Удалить выбранные поручения?'
            : kind === 'send'
              ? 'Отправить выбранные поручения?'
              : 'Выплатить выбранные поручения?',
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

  async function run(row: PaymentOrderRow, action: 'send' | 'pay' | 'delete') {
    if (action === 'delete' && !(await confirm('Удалить поручение?'))) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') await apiFetch(`/api/payroll/payment-orders/${row.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/payroll/payment-orders/${row.id}/${action}`, { method: 'POST' });
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      'payment-orders.csv',
      filtered.map((r) => ({
        Сотрудник: r.employee?.label || '',
        Начисление: r.accrualName || r.title || '',
        'Сумма поручения': r.amount,
        'Дата начала': fmtDate(r.startDate),
        'Дата окончания': fmtDate(r.endDate),
        Состояние: orderStatusLabel(r.status),
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="payment-orders" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new`} className={styles.createBtn}>
            Создать
          </Link>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'accrualName', label: 'Начисление', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата начала' },
              {
                type: 'select',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'new', label: 'Новое' },
                  { value: 'sent', label: 'Отправлено' },
                  { value: 'paid', label: 'Выплачено' },
                ],
              },
            ]}
          />
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              { key: 'send', label: 'Отправить', count: sendCount, onClick: () => void bulk('send') },
              { key: 'pay', label: 'Выплатить', count: payCount, onClick: () => void bulk('pay') },
              { key: 'delete', label: 'Удалить', count: deleteCount, variant: 'danger', onClick: () => void bulk('delete') },
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
            {paged.length} / {filtered.length}
          </span>
          <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          {pageNums.map((n) => (
            <button
              key={n}
              type="button"
              className={styles.toolBtn}
              disabled={n === page}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            ›
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
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
                  checked={ids.length > 0 && ids.every((id) => selected.has(id))}
                  onChange={(e) => setSelected(togglePage(selected, ids, e.target.checked))}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Сотрудник</th>
              <th>Начисление</th>
              <th>Сумма поручения</th>
              <th>Дата начала</th>
              <th>Дата окончания</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && paged.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
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
                    <td className={styles.empName}>{row.employee?.label || '—'}</td>
                    <td>{row.accrualName || row.title || '—'}</td>
                    <td>{moneyOrder(row.amount)}</td>
                    <td>{fmtDate(row.startDate)}</td>
                    <td>{fmtDate(row.endDate)}</td>
                    <td>
                      <span className={isNew(row.status) ? styles.postedYes : styles.postedNo}>
                        {orderStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={7}>
                        <div className={styles.rowActions}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status !== 'paid' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {isNew(row.status) ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'send')}>
                              Отправить
                            </button>
                          ) : null}
                          {row.status === 'sent' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'pay')}>
                              Выплатить
                            </button>
                          ) : null}
                          {isNew(row.status) ? (
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
    </div>
  );
}

export default function PaymentOrdersPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
