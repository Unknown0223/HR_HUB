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
  formatMonthRu,
  loanStatusLabel,
  money,
  type LoanRow,
} from '@/lib/loans';
import styles from '../absence-types/page.module.css';

const PATH = '/catalog/loans';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'status', 'from', 'to'] as const;

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.status || filters.from || filters.to),
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<LoanRow[]>('/api/payroll/loans'));
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
    let list = rows.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.status && r.status !== filters.status) return false;
      const d = String(r.loanDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.employee?.label, r.note, r.contractNumber].join(' ').toLowerCase();
      return blob.includes(qq);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const ad = String(a.loanDate || '');
      const bd = String(b.loanDate || '');
      if (ad !== bd) return ad < bd ? -dir : dir;
      return String(a.number).localeCompare(String(b.number));
    });
    return list;
  }, [rows, q, filters.number, filters.status, filters.from, filters.to, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);

  useEffect(() => {
    setPage(1);
  }, [q, filters.number, filters.status, filters.from, filters.to, sortDir]);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.replace(`${PATH}?${params.toString()}`, { scroll: false });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const completeCount = selectedRows.filter((r) => r.status === 'draft').length;
  const closeCount = selectedRows.filter((r) => r.status === 'active').length;
  const deleteCount = selectedRows.filter((r) => r.status === 'draft').length;

  async function bulk(kind: 'complete' | 'close' | 'delete') {
    const ids =
      kind === 'complete'
        ? selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
        : kind === 'close'
          ? selectedRows.filter((r) => r.status === 'active').map((r) => r.id)
          : selectedRows.filter((r) => r.status === 'draft').map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/loans/bulk-${kind}`,
        ids,
        message:
          kind === 'delete'
            ? 'Удалить выбранные займы?'
            : kind === 'complete'
              ? 'Завершить выбранные займы?'
              : 'Закрыть выбранные займы?',
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

  async function run(row: LoanRow, action: 'complete' | 'close' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить заём ${row.number || ''}?`))) return;
    if (action === 'close' && !(await confirm({ message: 'Закрыть заём?', confirmText: 'Да', cancelText: 'Нет' }))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') await apiFetch(`/api/payroll/loans/${row.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/payroll/loans/${row.id}/${action}`, { method: 'POST' });
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
      'loans.csv',
      filtered.map((r) => ({
        'Номер займа': r.number,
        'Дата займа': fmtDate(r.loanDate),
        Сотрудник: r.employee?.label || '',
        'Оставшаяся сумма займа': r.remaining,
        'Сумма займа': r.principal,
        От: formatMonthRu(r.startDate),
        До: formatMonthRu(r.endDate || ''),
        Статус: loanStatusLabel(r.status),
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="loans" />
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
              { type: 'text', key: 'number', label: 'Номер займа', placeholder: 'Поиск...' },
              { type: 'dateRange', label: 'Дата займа' },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'active', label: 'Активный' },
                  { value: 'closed', label: 'Закрыт' },
                  { value: 'defaulted', label: 'Просрочен' },
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
              { key: 'close', label: 'Закрыть', count: closeCount, onClick: () => void bulk('close') },
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
              <th>Номер займа</th>
              <th>
                <button
                  type="button"
                  style={{ all: 'unset', cursor: 'pointer' }}
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  Дата займа <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                </button>
              </th>
              <th>Сотрудник</th>
              <th>Оставшаяся сумма займа</th>
              <th>Сумма займа</th>
              <th>От</th>
              <th>До</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && paged.length === 0 ? (
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
                    <td>{row.number || '—'}</td>
                    <td>{fmtDate(row.loanDate)}</td>
                    <td>{row.employee?.label || '—'}</td>
                    <td>{money(row.remaining)}</td>
                    <td>{money(row.principal)}</td>
                    <td>{formatMonthRu(row.startDate)}</td>
                    <td>{formatMonthRu(row.endDate || '')}</td>
                    <td>
                      <span className={row.status === 'active' ? styles.postedYes : styles.postedNo}>
                        {loanStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={9}>
                        <div className={styles.rowActions}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status !== 'closed' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {row.status === 'draft' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'complete')}>
                              Завершить
                            </button>
                          ) : null}
                          {row.status === 'active' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'close')}>
                              Закрыть
                            </button>
                          ) : null}
                          {row.status === 'draft' ? (
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

export default function LoansPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
