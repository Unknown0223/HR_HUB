'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  fmtDate,
  moneyOrder,
  orderStatusLabel,
  type PaymentOrderRow,
} from '@/lib/payment-orders';
import { PaymentOrderFormModal } from './PaymentOrderForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/payment-orders';
const FILTER_KEYS = ['q', 'accrualName', 'status', 'from', 'to'] as const;
const COL_COUNT = 7;

function isNew(s: string) {
  return s === 'new' || s === 'open';
}

function statusCls(s: string) {
  if (s === 'paid') return styles.statusOk;
  if (s === 'sent') return styles.statusSent;
  return styles.statusMuted;
}

function PaymentOrdersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [rows, setRows] = useState<PaymentOrderRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.accrualName || filters.status || filters.from || filters.to),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
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

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        filters.accrualName &&
        !String(r.accrualName || r.title || '')
          .toLowerCase()
          .includes(filters.accrualName.trim().toLowerCase())
      ) {
        return false;
      }
      if (filters.status === 'new' && !isNew(r.status)) return false;
      if (filters.status && filters.status !== 'new' && r.status !== filters.status) return false;
      const d = String(r.startDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.employee?.label, r.accrualName, r.title, r.amount, r.note]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.accrualName, filters.status, filters.from, filters.to]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const selectedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
  );
  const sendCount = selectedRows.filter((r) => isNew(r.status)).length;
  const payCount = selectedRows.filter((r) => r.status === 'sent').length;
  const deleteCount = selectedRows.filter((r) => isNew(r.status)).length;

  const allPageChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const somePageChecked = filtered.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      const qs = params.toString();
      router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
    }
  }

  async function run(row: PaymentOrderRow, action: 'send' | 'pay' | 'delete') {
    if (action === 'delete' && !(await confirm('Удалить поручение?'))) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/payment-orders/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/payment-orders/${row.id}/${action}`, { method: 'POST' });
      }
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function bulk(kind: 'send' | 'pay' | 'delete') {
    const ids =
      kind === 'pay'
        ? selectedRows.filter((r) => r.status === 'sent').map((r) => r.id)
        : selectedRows.filter((r) => isNew(r.status)).map((r) => r.id);
    if (!ids.length) return;
    const message =
      kind === 'delete'
        ? `Удалить выбранные поручения (${ids.length} шт.)?`
        : kind === 'send'
          ? `Отправить выбранные поручения (${ids.length} шт.)?`
          : `Выплатить выбранные поручения (${ids.length} шт.)?`;
    if (!(await confirm({ message, confirmText: 'Да', cancelText: 'Нет', variant: kind === 'delete' ? 'danger' : undefined }))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/payment-orders/bulk-${kind}`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setChecked({});
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `payment-orders-${new Date().toISOString().slice(0, 10)}.csv`,
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

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-file-invoice-dollar" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Поручения</h1>
          <p className={shared.pageSubtitle}>Платёжные поручения по начислениям и удержаниям</p>
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
                if (e.key === 'Enter') applySearch();
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
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn}
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
          <button type="button" className={styles.iconBtn} onClick={exportCsv} title="CSV" aria-label="Экспорт CSV">
            <i className="fas fa-file-csv" aria-hidden />
          </button>
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

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          {sendCount > 0 ? (
            <button type="button" className={styles.bulkBtn} disabled={busy} onClick={() => void bulk('send')}>
              <i className="fas fa-paper-plane" aria-hidden />
              Отправить ({sendCount})
            </button>
          ) : null}
          {payCount > 0 ? (
            <button type="button" className={styles.bulkBtn} disabled={busy} onClick={() => void bulk('pay')}>
              <i className="fas fa-check" aria-hidden />
              Выплатить ({payCount})
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
          <button type="button" className={styles.bulkGhost} disabled={busy} onClick={() => setChecked({})}>
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
                    onChange={(e) => toggleAllPage(e.target.checked)}
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
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.employee?.label || row.id}`}
                        />
                      </td>
                      <td className={styles.empName}>{row.employee?.label || '—'}</td>
                      <td>{row.accrualName || row.title || '—'}</td>
                      <td className={styles.moneyCell}>{moneyOrder(row.amount)}</td>
                      <td>{fmtDate(row.startDate)}</td>
                      <td>{fmtDate(row.endDate)}</td>
                      <td>
                        <span className={statusCls(row.status)}>{orderStatusLabel(row.status)}</span>
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
                            {row.status !== 'paid' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {isNew(row.status) ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'send')}>
                                <i className="fas fa-paper-plane" aria-hidden />
                                Отправить
                              </button>
                            ) : null}
                            {row.status === 'sent' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'pay')}>
                                <i className="fas fa-check" aria-hidden />
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <PaymentOrderFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function PaymentOrdersPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <PaymentOrdersInner />
    </Suspense>
  );
}
