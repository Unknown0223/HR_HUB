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
import {
  ACCRUAL_KINDS,
  type AccrualDoc,
  fmtDate,
  formatMonthRu,
  kindLabel,
  money,
} from '@/lib/accruals';
import { AccrualFormModal } from './AccrualFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/payroll/accruals';
const PAGE_SIZE = 50;
const COL_COUNT = 9;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.posted || filters.kind || filters.from || filters.to),
  );

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

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

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
  const pageIds = paged.map((r) => r.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageChecked = pageIds.some((id) => selected.has(id)) && !allPageChecked;
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
    const qs = sp.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1' || searchParams.get('createKind')) {
      patchUrl({ create: null, createKind: null });
    }
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
        path: `/api/payroll/accruals/bulk-${kind}`,
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

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-coins" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Все начисления</h1>
          <p className={shared.pageSubtitle}>
            Документы начислений и удержаний по сотрудникам, проведение и проводки
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

      <div className={styles.tabs}>
        <Link href={PATH} className={tab === 'accruals' ? styles.tabOn : styles.tab}>
          <i className="fas fa-file-invoice-dollar" aria-hidden />
          Все начисления
        </Link>
        <Link
          href={`${PATH}?tab=orders`}
          className={tab === 'orders' ? styles.tabOn : styles.tab}
        >
          <i className="fas fa-paper-plane" aria-hidden />
          Поручения
        </Link>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {tab === 'accruals' ? (
            <button type="button" className={styles.createBtn} onClick={openCreate}>
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
          ) : (
            <Link href="/catalog/payment-orders" className={styles.createBtn}>
              <i className="fas fa-plus" aria-hidden />
              Создать
            </Link>
          )}
          {tab === 'accruals' ? (
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
          ) : null}
        </div>

        <div className={styles.rightTools}>
          {tab === 'accruals' ? (
            <label className={styles.monthFilter}>
              месяц
              <input
                type="month"
                value={filters.month ? filters.month.slice(0, 7) : ''}
                onChange={(e) =>
                  patchUrl({ month: e.target.value ? `${e.target.value}-01` : null })
                }
              />
            </label>
          ) : null}
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          {tab === 'accruals' ? (
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
          ) : null}
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

      {tab === 'accruals' && selected.size > 0 ? (
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
          {cancelCount > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => void bulk('cancel')}
            >
              <i className="fas fa-rotate-left" aria-hidden />
              Отменить ({cancelCount})
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

      {tab === 'orders' ? (
        <div className={styles.tableWrap}>
          <div className={styles.tableScroll}>
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
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      Загрузка…
                    </td>
                  </tr>
                ) : null}
                {!loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
                {orders.map((o) => (
                  <tr key={String(o.id)}>
                    <td className={styles.docNumber}>{String(o.number || '—')}</td>
                    <td className={styles.dateCell}>
                      {fmtDate(String(o.createdAt || o.dueDate || ''))}
                    </td>
                    <td className={styles.nameCell}>{String(o.title || '—')}</td>
                    <td className={styles.numCell}>{money(o.amount)}</td>
                    <td>
                      <span className={styles.statusDraft}>{String(o.status || '—')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
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
                  <th>Месяц начисления</th>
                  <th>
                    Дата <span className={styles.sortMark}>↑</span>
                  </th>
                  <th>Номер</th>
                  <th>Тип документа</th>
                  <th>Начислено</th>
                  <th>Удержано</th>
                  <th>Подразделение</th>
                  <th>Проведен</th>
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
                        <td className={styles.nameCell}>{formatMonthRu(row.month)}</td>
                        <td className={styles.dateCell}>{fmtDate(row.docDate)}</td>
                        <td className={styles.docNumber}>{row.number || '—'}</td>
                        <td>{kindLabel(row.kind)}</td>
                        <td className={styles.numCell}>{money(row.accruedTotal)}</td>
                        <td className={styles.numCell}>{money(row.deductedTotal)}</td>
                        <td className={styles.noteCell}>{row.division?.name || '—'}</td>
                        <td>
                          {row.status === 'posted' ? (
                            <span className={styles.statusPosted}>Проведен</span>
                          ) : row.status === 'cancelled' ? (
                            <span className={styles.statusCancelled}>Отменен</span>
                          ) : (
                            <span className={styles.statusDraft}>Черновик</span>
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
                                  onClick={() => void run(row, 'cancel')}
                                >
                                  <i className="fas fa-rotate-left" aria-hidden />
                                  Отменить
                                </button>
                              ) : null}
                              <Link href={`${PATH}/${row.id}/entries`}>
                                <i className="fas fa-list" aria-hidden />
                                Проводки
                              </Link>
                              {row.status !== 'posted' ? (
                                <button
                                  type="button"
                                  className={styles.danger}
                                  disabled={busy}
                                  onClick={() => void run(row, 'delete')}
                                >
                                  <i className="fas fa-trash" aria-hidden />
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
          <div className={styles.footer}>
            <p>
              Показано <strong>{paged.length}</strong> из <strong>{filtered.length}</strong>
            </p>
          </div>
        </div>
      )}

      <AccrualFormModal
        open={modalOpen}
        initialKind={searchParams.get('createKind')}
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

export function AccrualsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <AccrualsInner />
    </Suspense>
  );
}
