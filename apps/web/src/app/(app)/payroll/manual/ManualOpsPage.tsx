'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { runListBulk, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDt, money, type ManualOp } from '@/lib/manual-ops';
import { ManualFormModal } from './ManualFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/payroll/manual';
const PAGE_SIZE = 50;
const COL_COUNT = 9;
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
  const [modalOpen, setModalOpen] = useState(false);
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

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

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
  const pageIds = paged.map((r) => r.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageChecked = pageIds.some((id) => selected.has(id)) && !allPageChecked;
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
    const qs = sp.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      patchUrl({ create: null });
    }
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

  function exportCsv() {
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
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="manual-ops" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-pen-to-square" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Ручные операции</h1>
          <p className={shared.pageSubtitle}>
            Ручные бухгалтерские операции, проведение и история изменений
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
              }}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <Link
            href={`${PATH}/history`}
            className={styles.toolBtn}
            title="История изменений"
            aria-label="История изменений"
          >
            <i className="fas fa-history" aria-hidden />
            История
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
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={
              filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn
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
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
          </button>
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Предыдущая страница"
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
            <span className={styles.pagerMeta}>
              {Math.min(page, pageCount)} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Следующая страница"
            >
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          </div>
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

      {selected.size > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{selected.size}</strong>
          </span>
          {postCount > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => void bulk('post')}
            >
              <i className="fas fa-check" aria-hidden />
              Провести ({postCount})
            </button>
          ) : null}
          {unpostCount > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => void bulk('unpost')}
            >
              <i className="fas fa-rotate-left" aria-hidden />
              Отменить ({unpostCount})
            </button>
          ) : null}
          {deleteCount > 0 ? (
            <button
              type="button"
              className={`${styles.bulkBtn} ${styles.bulkDanger}`}
              disabled={busy}
              onClick={() => void bulk('delete')}
            >
              <i className="fas fa-trash" aria-hidden />
              Удалить ({deleteCount})
            </button>
          ) : null}
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setSelected(new Set())}
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
                    checked={allPageChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageChecked;
                    }}
                    onChange={(e) =>
                      setSelected(togglePage(selected, pageIds, e.target.checked))
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>
                  Дата <span className={styles.sortMark}>↑</span>
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
              {loading && paged.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && paged.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {paged.map((row) => {
                const open = focusId === row.id;
                const isChecked = selected.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setFocusId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                      className={open || isChecked ? styles.rowSelected : undefined}
                    >
                      <td
                        className={styles.checkCol}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSelected(toggleSelect(selected, row.id, e.target.checked))
                          }
                          aria-label={`Выбрать ${row.number || 'документ'}`}
                        />
                      </td>
                      <td className={styles.dateCell}>{fmtDt(row.docDate)}</td>
                      <td className={styles.docNumber}>{row.number || '—'}</td>
                      <td>{row.debitAccounts || '—'}</td>
                      <td>{row.creditAccounts || '—'}</td>
                      <td className={styles.noteCell}>{row.debitNames || '—'}</td>
                      <td className={styles.noteCell}>{row.creditNames || '—'}</td>
                      <td className={styles.numCell}>{money(row.totalAmount)}</td>
                      <td>
                        {row.posted ? (
                          <span className={styles.statusPosted}>Да</span>
                        ) : (
                          <span className={styles.statusDraft}>—</span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <Link href={`${PATH}/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {row.status === 'draft' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'posted' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'unpost')}
                              >
                                <i className="fas fa-rotate-left" aria-hidden />
                                Отменить
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void run(row, 'delete')}
                              >
                                <i className="fas fa-trash" aria-hidden />
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
        <div className={styles.footer}>
          <p>
            Показано <strong>{paged.length}</strong> из <strong>{filtered.length}</strong>
          </p>
        </div>
      </div>

      <ManualFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={(id, openAfter) => {
          closeModal();
          if (openAfter && id) router.push(`${PATH}/${id}/edit`);
          else void load();
        }}
      />
    </div>
  );
}

export function ManualOpsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ManualInner />
    </Suspense>
  );
}
