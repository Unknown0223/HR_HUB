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
  money,
  paymentTypeCell,
  statusLabel,
  type PayrollSheet,
} from '@/lib/vedomost';
import styles from '../../catalog/absence-types/page.module.css';
import extra from '../../catalog/settlements/extra.module.css';

const PATH = '/payroll/vedomost';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'status', 'from', 'to'] as const;

function VedomostInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const [rows, setRows] = useState<PayrollSheet[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.status || filters.from || filters.to),
  );

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<PayrollSheet[]>('/api/payroll/sheets'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
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
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.status && r.status !== filters.status) return false;
      const d = String(r.issueDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      return [r.number, r.note, paymentTypeCell(r), statusLabel(r.status)].join(' ').toLowerCase().includes(qq);
    });
  }, [rows, q, filters.number, filters.status, filters.from, filters.to]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const completeCount = selectedRows.filter((r) => r.status === 'draft').length;
  const reopenCount = selectedRows.filter((r) => r.status === 'completed').length;
  const deleteCount = selectedRows.filter((r) => r.status === 'draft').length;

  function patchUrl(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${PATH}?${sp.toString()}`);
  }

  async function bulk(kind: 'complete' | 'reopen' | 'delete') {
    const ids =
      kind === 'reopen'
        ? selectedRows.filter((r) => r.status === 'completed').map((r) => r.id)
        : selectedRows.filter((r) => r.status === 'draft').map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/sheets/bulk-${kind}`,
        ids,
        message:
          kind === 'delete'
            ? 'Удалить выбранные документы?'
            : kind === 'complete'
              ? 'Завершить выбранные документы?'
              : 'Переоткрыть выбранные документы?',
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

  async function run(row: PayrollSheet, action: 'complete' | 'reopen' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
        await apiFetch(`/api/payroll/sheets/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/sheets/${row.id}/${action}`, { method: 'POST' });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="vedomost" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new?kind=vedomost`} className={styles.createBtn}>
            Добавить ведомость
          </Link>
          <div style={{ position: 'relative' }}>
            <button type="button" className={styles.createBtn} onClick={() => setAdvanceOpen((v) => !v)}>
              Добавить аванс ▾
            </button>
            {advanceOpen ? (
              <div className={styles.createMenu}>
                <button
                  type="button"
                  onClick={() => {
                    setAdvanceOpen(false);
                    router.push(`${PATH}/new?kind=advance_salary`);
                  }}
                >
                  Аванс по официальному окладу
                </button>
              </div>
            ) : null}
          </div>
          <Link href={`${PATH}/history`} className={extra.iconBtn} title="История изменений">
            ↻
          </Link>
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
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'completed', label: 'Завершена' },
                ],
              },
            ]}
          />
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              { key: 'complete', label: 'Завершить', count: completeCount, onClick: () => void bulk('complete') },
              { key: 'reopen', label: 'Открыть', count: reopenCount, onClick: () => void bulk('reopen') },
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
              if (e.key === 'Enter') patchUrl({ q: searchDraft || null });
            }}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                `vedomost.csv`,
                filtered.map((r) => ({
                  Номер: r.number || '',
                  Дата: fmtDate(r.issueDate),
                  'Тип оплаты': paymentTypeCell(r),
                  Сумма: r.totalAmount,
                  Примечание: r.note || '',
                  Статус: statusLabel(r.status),
                })),
              )
            }
          >
            CSV
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {filtered.length}
          </span>
          <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button type="button" className={styles.toolBtn} disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={extra.muted}>Загрузка…</p> : null}
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
              <th>Номер</th>
              <th>
                Дата <span className={styles.sortMark || ''}>↑</span>
              </th>
              <th>Тип оплаты</th>
              <th>Сумма</th>
              <th>Примечание</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
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
                    <td>{row.number || '—'}</td>
                    <td>{fmtDate(row.issueDate)}</td>
                    <td>{paymentTypeCell(row)}</td>
                    <td>{money(row.totalAmount)}</td>
                    <td>{row.note || '—'}</td>
                    <td>
                      <span className={row.status === 'completed' ? extra.badge : extra.badgeOff}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={7}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status === 'draft' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {row.status === 'draft' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'complete')}>
                              Завершить
                            </button>
                          ) : null}
                          {row.status === 'completed' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'reopen')}>
                              Открыть
                            </button>
                          ) : (
                            <button type="button" className={styles.danger} disabled={busy} onClick={() => void run(row, 'delete')}>
                              Удалить
                            </button>
                          )}
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

export function VedomostPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <VedomostInner />
    </Suspense>
  );
}
