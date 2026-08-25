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
import { fmtDt, money, type ManualOp } from '@/lib/manual-ops';
import styles from '../../catalog/absence-types/page.module.css';
import extra from '../../catalog/settlements/extra.module.css';
import local from './manual.module.css';

const PATH = '/payroll/manual';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;

function ManualInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const [rows, setRows] = useState<ManualOp[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.posted || filters.from || filters.to),
  );

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<ManualOp[]>('/api/payroll/manual-ops'));
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
      if (filters.posted === 'yes' && !r.posted) return false;
      if (filters.posted === 'no' && r.posted) return false;
      const d = String(r.docDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      return [r.number, r.note, r.debitAccounts, r.creditAccounts, r.debitNames, r.creditNames]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [rows, q, filters.number, filters.posted, filters.from, filters.to]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const postCount = selectedRows.filter((r) => r.status === 'draft' || !r.posted).length;
  const unpostCount = selectedRows.filter((r) => r.status === 'posted' || r.posted).length;
  const deleteCount = selectedRows.filter((r) => r.status === 'draft' || !r.posted).length;

  function patchUrl(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${PATH}?${sp.toString()}`);
  }

  async function bulk(kind: 'post' | 'unpost' | 'delete') {
    const ids =
      kind === 'unpost'
        ? selectedRows.filter((r) => r.status === 'posted' || r.posted).map((r) => r.id)
        : selectedRows.filter((r) => r.status === 'draft' || !r.posted).map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/manual-ops/bulk-${kind}`,
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

  async function run(row: ManualOp, action: 'post' | 'unpost' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
        await apiFetch(`/api/payroll/manual-ops/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/manual-ops/${row.id}/${action}`, { method: 'POST' });
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
      <PageSubnav groupKey="manual-ops" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new`} className={styles.createBtn}>
            Создать
          </Link>
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
              { type: 'postedChecks', key: 'posted', label: 'Проведен' },
            ]}
          />
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              { key: 'post', label: 'Провести', count: postCount, onClick: () => void bulk('post') },
              { key: 'unpost', label: 'Отменить', count: unpostCount, variant: 'danger', onClick: () => void bulk('unpost') },
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
                'manual-ops.csv',
                filtered.map((r) => ({
                  Дата: fmtDt(r.docDate),
                  Номер: r.number || '',
                  'Счета по дебету': r.debitAccounts || '',
                  'Счета по кредиту': r.creditAccounts || '',
                  'Названия счета по дебету': r.debitNames || '',
                  'Названия счета по кредиту': r.creditNames || '',
                  Сумма: r.totalAmount,
                  Проведено: r.posted ? 'Да' : '',
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
              <th>
                Дата <span className={styles.sortMark || ''}>↑</span>
              </th>
              <th>Номер</th>
              <th>Счета по дебету</th>
              <th>Счета по кредиту</th>
              <th>Названия счета по дебету</th>
              <th>Названия счета по кредиту</th>
              <th>Сумма</th>
              <th>Проведено</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
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
                    <td>{fmtDt(row.docDate)}</td>
                    <td>{row.number || '—'}</td>
                    <td>{row.debitAccounts || '—'}</td>
                    <td>{row.creditAccounts || '—'}</td>
                    <td>{row.debitNames || '—'}</td>
                    <td>{row.creditNames || '—'}</td>
                    <td>{money(row.totalAmount)}</td>
                    <td>
                      {row.posted ? <span className={local.check}>✓</span> : ''}
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={9}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status === 'draft' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {row.status === 'draft' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'post')}>
                              Провести
                            </button>
                          ) : null}
                          {row.status === 'posted' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'unpost')}>
                              Отменить
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

export function ManualOpsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ManualInner />
    </Suspense>
  );
}
