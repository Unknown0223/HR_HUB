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
import { fmtDt, type SettlementDoc } from '@/lib/settlements';
import styles from '../absence-types/page.module.css';
import localDanger from '../document-types/page.module.css';
import extra from './extra.module.css';

const PATH = '/catalog/settlements';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;

function SettlementsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [rows, setRows] = useState<SettlementDoc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.from || filters.to || filters.posted),
  );

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await apiFetch<SettlementDoc[]>('/api/payroll/settlements'));
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
      if (filters.posted === 'yes' && r.status === 'open') return false;
      if (filters.posted === 'no' && r.status !== 'open') return false;
      if (filters.from && r.docDate.slice(0, 10) < filters.from) return false;
      if (filters.to && r.docDate.slice(0, 10) > filters.to) return false;
      if (!qq) return true;
      const hay = [r.number, r.note, r.createdByName, r.title].join(' ').toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIds = paged.map((r) => r.id);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const postCount = selectedRows.filter((r) => r.status === 'open').length;
  const cancelCount = selectedRows.filter((r) => r.status !== 'open').length;
  const deleteCount = selectedRows.filter((r) => r.status === 'open').length;

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
      kind === 'cancel'
        ? selectedRows.filter((r) => r.status !== 'open').map((r) => r.id)
        : selectedRows.filter((r) => r.status === 'open').map((r) => r.id);
    setBusy(true);
    setError('');
    try {
      const ok = await runListBulk({
        path: `/api/payroll/settlements/bulk-${kind}`,
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

  async function run(row: SettlementDoc, action: 'post' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm({ message: 'Удалить документ?', variant: 'danger' }))) return;
        await apiFetch(`/api/payroll/settlements/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/settlements/${row.id}/${action}`, { method: 'POST' });
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
      <PageSubnav groupKey="settlements" />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href={`${PATH}/new`} className={styles.createBtn}>
            Создать
          </Link>
          <Link href={`${PATH}/history`} className={extra.iconBtn} title="История изменений" aria-label="История">
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
              { key: 'cancel', label: 'Отменить', count: cancelCount, variant: 'danger', onClick: () => void bulk('cancel') },
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
                `settlements-${new Date().toISOString().slice(0, 10)}.csv`,
                filtered.map((r) => ({
                  Номер: r.number || '',
                  Дата: fmtDt(r.docDate),
                  Создал: r.createdByName || '',
                  'Дата создания': fmtDt(r.createdAt),
                  Примечание: r.note || '',
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
      {loading ? <p className={extra.muted}>Загрузка…</p> : null}
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
              <th>Номер взаиморасчета</th>
              <th>Дата взаиморасчета</th>
              <th>Создал</th>
              <th>Дата создания</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
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
                    <td>{fmtDt(row.docDate)}</td>
                    <td>{row.createdByName || '—'}</td>
                    <td>{fmtDt(row.createdAt)}</td>
                    <td>{row.note || '—'}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={6}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          <Link href={`${PATH}/${row.id}`}>Просмотреть</Link>
                          {row.status === 'open' ? <Link href={`${PATH}/${row.id}/edit`}>Изменить</Link> : null}
                          {row.status === 'open' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'post')}>
                              Провести
                            </button>
                          ) : null}
                          {row.status !== 'open' ? (
                            <button type="button" disabled={busy} onClick={() => void run(row, 'cancel')}>
                              Отменить
                            </button>
                          ) : null}
                          {row.status === 'open' ? (
                            <button
                              type="button"
                              className={localDanger.btnDanger || styles.danger}
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

export function SettlementsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <SettlementsInner />
    </Suspense>
  );
}
