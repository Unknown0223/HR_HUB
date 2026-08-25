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
  currencyLabel,
  fmtDate,
  formatMonthRu,
  type OneTimeDoc,
  type OneTimeKind,
} from '@/lib/one-time-accruals';
import styles from '../absence-types/page.module.css';
import local from '../../payroll/timesheets/page.module.css';

const PATH = '/catalog/one-time-accruals';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind: OneTimeKind = searchParams.get('kind') === 'deduction' ? 'deduction' : 'accrual';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const [rows, setRows] = useState<OneTimeDoc[]>([]);
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
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<OneTimeDoc[]>(`/api/payroll/one-time-accruals?kind=${kind}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
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
  }, [kind]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      const d = String(r.docDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.title, r.currency, r.note].join(' ').toLowerCase();
      return blob.includes(qq);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const ad = String(a.docDate || '');
      const bd = String(b.docDate || '');
      if (ad !== bd) return ad < bd ? -dir : dir;
      return String(a.number).localeCompare(String(b.number));
    });
    return list;
  }, [rows, q, filters.number, filters.posted, filters.from, filters.to, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = paged.map((r) => r.id);

  useEffect(() => {
    setPage(1);
  }, [q, filters.number, filters.posted, filters.from, filters.to, sortDir]);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('kind', kind);
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.replace(`${PATH}?${params.toString()}`, { scroll: false });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const postCount = selectedRows.filter((r) => r.status === 'draft').length;
  const unpostCount = selectedRows.filter((r) => r.status === 'posted').length;
  const deleteCount = selectedRows.filter((r) => r.status !== 'posted').length;

  async function bulk(kind: 'post' | 'unpost' | 'delete') {
    const ids =
      kind === 'post'
        ? selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
        : kind === 'unpost'
          ? selectedRows.filter((r) => r.status === 'posted').map((r) => r.id)
          : selectedRows.filter((r) => r.status !== 'posted').map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/one-time-accruals/bulk-${kind}`,
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

  async function run(row: OneTimeDoc, action: 'post' | 'unpost' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить документ ${row.number}?`))) return;
    if (action === 'unpost' && !(await confirm({ message: 'Отменить проведение?', confirmText: 'Да', cancelText: 'Нет' }))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') await apiFetch(`/api/payroll/one-time-accruals/${row.id}`, { method: 'DELETE' });
      else await apiFetch(`/api/payroll/one-time-accruals/${row.id}/${action}`, { method: 'POST' });
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
      `one-time-${kind}.csv`,
      filtered.map((r) => ({
        Месяц: formatMonthRu(r.month),
        Дата: fmtDate(r.docDate),
        Номер: r.number,
        Валюта: currencyLabel(r.currency),
        'Название документа': r.title || '',
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="one-time-accruals" />
      <div className={local.tabs}>
        <Link href={`${PATH}?kind=accrual`} className={kind === 'accrual' ? local.tabOn : local.tab}>
          Начисление
        </Link>
        <Link href={`${PATH}?kind=deduction`} className={kind === 'deduction' ? local.tabOn : local.tab}>
          Удержание
        </Link>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new?kind=${kind}`} className={styles.createBtn}>
            Создать
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
              <th>Месяц</th>
              <th>
                <button
                  type="button"
                  style={{ all: 'unset', cursor: 'pointer' }}
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  Дата <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                </button>
              </th>
              <th>Номер</th>
              <th>Валюта</th>
              <th>Название документа</th>
              <th>Проведен</th>
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
                    <td>{formatMonthRu(row.month)}</td>
                    <td>{fmtDate(row.docDate)}</td>
                    <td>{row.number || '—'}</td>
                    <td>{currencyLabel(row.currency)}</td>
                    <td>{row.title || '—'}</td>
                    <td>
                      {row.status === 'posted' ? (
                        <span className={styles.postedYes}>Да</span>
                      ) : (
                        <span className={styles.postedNo}>Нет</span>
                      )}
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={7}>
                        <div className={styles.rowActions}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status !== 'posted' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {row.status === 'draft' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'post')}>
                              Провести
                            </button>
                          ) : null}
                          {row.status === 'posted' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'unpost')}>
                              Отменить
                            </button>
                          ) : null}
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
    </div>
  );
}

export default function OneTimeAccrualsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
