'use client';

import { confirm } from '@/lib/dialogs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDate, todayISO } from '@/lib/currencies';
import {
  asIikoSalesConfig,
  fmtMoney,
  fmtQty,
  type IikoSaleRow,
  type IikoSalesConfig,
} from '@/lib/iiko-sales';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from './page.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  webhookUrl?: string | null;
  config?: IikoSalesConfig | null;
};

const FILTER_KEYS = ['q', 'from', 'to', 'user', 'product', 'category'] as const;
const PAGE_SIZE = 50;
const PATH = '/settings/iiko-sales';

function IikoSalesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const from = filters.from || todayISO();
  const to = filters.to || todayISO();

  const [row, setRow] = useState<Integration | null>(null);
  const [sales, setSales] = useState<IikoSaleRow[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.user || filters.product || filters.category),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (searchParams.get('from') && searchParams.get('to')) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!params.get('from')) params.set('from', todayISO());
    if (!params.get('to')) params.set('to', todayISO());
    router.replace(`${PATH}?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Integration[]>('/api/settings/integrations');
      const found =
        (list || []).find((i) => asIikoSalesConfig(i.config).sys === 'iiko_sales') ||
        (list || []).find((i) => {
          const n = i.name.toLowerCase();
          return n.includes('iiko') && n.includes('продаж');
        });
      if (!found) {
        setError('Интеграция «Продажи IIKO» не найдена');
        setRow(null);
        setSales([]);
        return;
      }
      setRow(found);
      setSales(asIikoSalesConfig(found.config).sales || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(nextSales: IikoSaleRow[], extraCfg?: IikoSalesConfig) {
    if (!row) return;
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<Integration>(
        `/api/settings/integrations/${row.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            config: {
              sys: 'iiko_sales',
              sales: nextSales,
              ...extraCfg,
            },
          }),
        },
      );
      setRow(updated);
      setSales(asIikoSalesConfig(updated.config).sales || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function applySearch() {
    patchUrl({ q: searchDraft.trim() || null });
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = sales.filter((s) => {
      if (from && s.saleDate < from) return false;
      if (to && s.saleDate > to) return false;
      if (filters.user && !s.iikoUser.toLowerCase().includes(filters.user.toLowerCase()))
        return false;
      if (
        filters.product &&
        !s.product.toLowerCase().includes(filters.product.toLowerCase())
      )
        return false;
      if (
        filters.category &&
        !s.category.toLowerCase().includes(filters.category.toLowerCase())
      )
        return false;
      if (!qq) return true;
      return [s.saleDate, s.iikoUser, s.product, s.category, String(s.accrual)]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
    return [...list].sort((a, b) =>
      sortDir === 'asc'
        ? a.saleDate.localeCompare(b.saleDate)
        : b.saleDate.localeCompare(a.saleDate),
    );
  }, [sales, q, from, to, filters.user, filters.product, filters.category, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, from, to, filters.user, filters.product, filters.category]);

  async function loadOlap() {
    if (!row) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      try {
        await apiFetch(`/api/settings/integrations/${row.id}/sync`, {
          method: 'POST',
        });
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Не удалось обратиться к OLAP. Проверьте Настройки IIKO.',
        );
      }
      await persist(sales, {
        lastOlapAt: new Date().toISOString(),
        lastOlapFrom: from,
        lastOlapTo: to,
      });
      const inRange = sales.filter((s) => s.saleDate >= from && s.saleDate <= to).length;
      setOk(`OLAP отчёты за период ${fmtDate(from)} — ${fmtDate(to)}: записей ${inRange}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[], message: string) {
    const okDel = await confirm({
      message,
      variant: 'danger',
      confirmText: 'Удалить',
    });
    if (!okDel) return;
    const drop = new Set(ids);
    await persist(sales.filter((s) => !drop.has(s.id)));
    setSelected(new Set());
    setFocusId(null);
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Продажи IIKO',
          siblings: [{ label: 'Настройки IIKO', href: '/settings/iiko' }],
        }}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={formStyles.ok}>{ok}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={busy || loading || !row}
            onClick={() => void loadOlap()}
          >
            Загрузить OLAP отчёты
          </button>
          <div className={extra.dates}>
            <input
              type="date"
              value={from}
              onChange={(e) => patchUrl({ from: e.target.value || null })}
              aria-label="Дата с"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => patchUrl({ to: e.target.value || null })}
              aria-label="Дата по"
            />
          </div>
          {selected.size > 0 ? (
            <button
              type="button"
              className={local.btnDanger}
              disabled={busy}
              onClick={() =>
                void deleteIds(
                  Array.from(selected),
                  `Удалить выбранные записи (${selected.size})?`,
                )
              }
            >
              Удалить {selected.size}
            </button>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Дата продажи' },
              {
                type: 'text',
                key: 'user',
                label: 'Имя пользователя IIKO',
                placeholder: 'Поиск...',
              },
              { type: 'text', key: 'product', label: 'Товар', placeholder: 'Поиск...' },
              { type: 'text', key: 'category', label: 'Категория', placeholder: 'Поиск...' },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                `iiko-sales-${from}_${to}.csv`,
                filtered.map((s) => ({
                  'Дата продажи': fmtDate(s.saleDate),
                  'Имя пользователя IIKO': s.iikoUser,
                  Товар: s.product,
                  Категория: s.category,
                  Начисление: s.accrual,
                  'Сумма без скидки': s.amountNoDiscount,
                  'Кол-во товара': s.qty,
                })),
              )
            }
          >
            Excel
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {sales.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
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
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            aria-label="Обновить"
          >
            ↻
          </button>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 && filtered.every((s) => selected.has(s.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(filtered.map((s) => s.id))
                        : new Set(),
                    )
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                Дата продажи {sortDir === 'asc' ? '↑' : '↓'}
              </th>
              <th>Имя пользователя IIKO</th>
              <th>Товар</th>
              <th>Категория</th>
              <th className={extra.num}>Начисление</th>
              <th className={extra.num}>Сумма без скидки</th>
              <th className={extra.num}>Кол-во товара</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((s) => {
                const open = focusId === s.id;
                return (
                  <tr
                    key={s.id}
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setFocusId(open ? null : s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          });
                        }}
                        aria-label={`Выбрать ${s.product}`}
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{fmtDate(s.saleDate)}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() =>
                              void deleteIds([s.id], `Удалить запись «${s.product}»?`)
                            }
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{s.iikoUser}</td>
                    <td>{s.product}</td>
                    <td>{s.category}</td>
                    <td className={extra.num}>{fmtMoney(s.accrual)}</td>
                    <td className={extra.num}>{fmtMoney(s.amountNoDiscount)}</td>
                    <td className={extra.num}>{fmtQty(s.qty)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IikoSalesPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <IikoSalesInner />
    </Suspense>
  );
}
