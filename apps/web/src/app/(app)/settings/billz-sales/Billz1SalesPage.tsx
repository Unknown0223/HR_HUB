'use client';

import { confirm } from '@/lib/dialogs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDate, todayISO } from '@/lib/currencies';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import {
  asBillz1Config,
  fmtMoney,
  monthStartISO,
  type Billz1Config,
  type Billz1Sale,
} from '@/lib/billz1';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../artix/page.module.css';
import iikoLocal from '../iiko/page.module.css';
import salesCss from '../iiko-sales/page.module.css';
import ui from './page.module.css';

type Opt = { id: string; label: string };

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  webhookUrl?: string | null;
  config?: Billz1Config | null;
};

const FILTER_KEYS = ['q', 'from', 'to', 'billzDivision', 'seller', 'employee'] as const;
const PAGE_SIZE = 50;
const PATH = '/settings/billz-sales';
const SYS = 'billz1';

const SIBLINGS = {
  title: 'Продажи Billz 1.0',
  siblings: [{ label: 'Настройки Billz 2.0', href: '/settings/billz' }],
};

function Billz1SalesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [row, setRow] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<Billz1Config>({});
  const [sales, setSales] = useState<Billz1Sale[]>([]);
  const [lookups, setLookups] = useState<{ employees: Opt[]; divisions: Opt[] }>({
    employees: [],
    divisions: [],
  });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.from ||
        filters.to ||
        filters.billzDivision ||
        filters.seller ||
        filters.employee,
    ),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loadOpen, setLoadOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [loadFrom, setLoadFrom] = useState(monthStartISO());
  const [loadTo, setLoadTo] = useState(todayISO());
  const [subjectDraft, setSubjectDraft] = useState('');
  const [secretDraft, setSecretDraft] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lu] = await Promise.all([
        apiFetch<Integration[]>('/api/settings/integrations'),
        apiFetch<{ employees?: Opt[]; divisions?: Opt[] }>('/api/catalog/lookups'),
      ]);
      const found =
        (list || []).find((i) => asBillz1Config(i.config).sys === SYS) ||
        (list || []).find((i) => {
          const n = i.name.toLowerCase();
          return n.includes('billz') && n.includes('1');
        });
      if (!found) {
        setError('Интеграция «Продажи Billz 1.0» не найдена');
        setRow(null);
        setSales([]);
        return;
      }
      const next = asBillz1Config(found.config);
      setRow(found);
      setCfg({ ...next, sys: SYS });
      setSales(next.sales || []);
      setLookups({
        employees: lu.employees || [],
        divisions: lu.divisions || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(slice: Partial<Billz1Config>) {
    if (!row) return false;
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<Integration>(
        `/api/settings/integrations/${row.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            config: { sys: SYS, ...slice },
          }),
        },
      );
      const next = asBillz1Config(updated.config);
      setRow(updated);
      setCfg({ ...next, sys: SYS });
      setSales(next.sales || []);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
      return false;
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
      if (filters.from && s.saleDate < filters.from) return false;
      if (filters.to && s.saleDate > filters.to) return false;
      if (
        filters.billzDivision &&
        !s.billzDivision.toLowerCase().includes(filters.billzDivision.toLowerCase())
      )
        return false;
      if (
        filters.seller &&
        !s.billzSeller.toLowerCase().includes(filters.seller.toLowerCase())
      )
        return false;
      if (
        filters.employee &&
        !(s.employeeName || '').toLowerCase().includes(filters.employee.toLowerCase())
      )
        return false;
      if (!qq) return true;
      return [
        s.billzDivision,
        s.divisionName,
        s.billzSeller,
        s.employeeName,
        s.saleDate,
        String(s.amount),
      ]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
    return [...list].sort((a, b) =>
      sortDir === 'asc'
        ? a.saleDate.localeCompare(b.saleDate)
        : b.saleDate.localeCompare(a.saleDate),
    );
  }, [
    sales,
    q,
    filters.from,
    filters.to,
    filters.billzDivision,
    filters.seller,
    filters.employee,
    sortDir,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filters.from, filters.to, filters.billzDivision, filters.seller, filters.employee]);

  function openLoad() {
    setOk('');
    setError('');
    setLoadFrom(cfg.lastLoadFrom || monthStartISO());
    setLoadTo(cfg.lastLoadTo || todayISO());
    setLoadOpen(true);
  }

  function openReg() {
    setOk('');
    setError('');
    setSubjectDraft(cfg.subject || '');
    setSecretDraft(cfg.secretKey || '');
    setRegOpen(true);
  }

  async function runLoad() {
    if (!row) return;
    if (!loadFrom) {
      setError('Заполните обязательные поля');
      return;
    }
    if (!cfg.subject?.trim() || !cfg.secretKey?.trim()) {
      setError('Заполните регистрационные данные Billz');
      setLoadOpen(false);
      setRegOpen(true);
      return;
    }
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
            : 'Не удалось обратиться к Billz. Проверьте регистрационные данные.',
        );
      }
      const saved = await persist({
        lastLoadFrom: loadFrom,
        lastLoadTo: loadTo || loadFrom,
      });
      if (!saved) return;
      const inRange = sales.filter(
        (s) => s.saleDate >= loadFrom && s.saleDate <= (loadTo || loadFrom),
      ).length;
      setOk(
        `Данные о продажах за период ${fmtDate(loadFrom)} — ${fmtDate(loadTo || loadFrom)}: записей ${inRange}`,
      );
      setLoadOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveReg() {
    if (!subjectDraft.trim() || !secretDraft.trim()) {
      setError('Заполните обязательные поля');
      return;
    }
    const saved = await persist({
      subject: subjectDraft.trim(),
      secretKey: secretDraft.trim(),
    });
    if (!saved) return;
    setOk('Регистрационные данные сохранены');
    setRegOpen(false);
  }

  async function patchSale(id: string, patch: Partial<Billz1Sale>) {
    const next = sales.map((s) => (s.id === id ? { ...s, ...patch } : s));
    setSales(next);
    await persist({ sales: next });
  }

  async function deleteIds(ids: string[], message: string) {
    const okDel = await confirm({
      message,
      variant: 'danger',
      confirmText: 'Удалить',
    });
    if (!okDel) return;
    const drop = new Set(ids);
    await persist({ sales: sales.filter((s) => !drop.has(s.id)) });
    setSelected(new Set());
    setFocusId(null);
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={SIBLINGS} />
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={formStyles.ok}>{ok}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={busy || loading || !row}
            onClick={openLoad}
          >
            Загрузить данные о продажах с Billz
          </button>
          <button
            type="button"
            className={styles.createBtn}
            disabled={busy || loading || !row}
            onClick={openReg}
          >
            Регистрационные данные Billz
          </button>
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
                key: 'billzDivision',
                label: 'Название подразделения в Billz',
                placeholder: 'Поиск...',
              },
              {
                type: 'text',
                key: 'seller',
                label: 'Имя продавца в Billz',
                placeholder: 'Поиск...',
              },
              {
                type: 'text',
                key: 'employee',
                label: 'Сотрудник',
                placeholder: 'Поиск...',
              },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                'billz1-sales.csv',
                filtered.map((s) => ({
                  'Название подразделения в Billz': s.billzDivision,
                  Подразделение: s.divisionName || '',
                  'Имя продавца в Billz': s.billzSeller,
                  Сотрудник: s.employeeName || '',
                  'Дата продажи': fmtDate(s.saleDate),
                  'Сумма продажи': s.amount,
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
              <th>Название подразделения в Billz</th>
              <th>Подразделение</th>
              <th>Имя продавца в Billz</th>
              <th>Сотрудник</th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                Дата продажи {sortDir === 'asc' ? '↑' : '↓'}
              </th>
              <th className={salesCss.num}>Сумма продажи</th>
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
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
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
                        aria-label={`Выбрать ${s.billzSeller}`}
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{s.billzDivision || '—'}</span>
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
                              void deleteIds(
                                [s.id],
                                `Удалить запись «${s.billzSeller}»?`,
                              )
                            }
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={iikoLocal.cellLookup}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SearchLookup
                        value={s.divisionId || ''}
                        options={lookups.divisions}
                        allowClear
                        onChange={(id) => {
                          const div = lookups.divisions.find((x) => x.id === id);
                          void patchSale(s.id, {
                            divisionId: id || undefined,
                            divisionName: div?.label,
                          });
                        }}
                      />
                    </td>
                    <td>{s.billzSeller || '—'}</td>
                    <td
                      className={iikoLocal.cellLookup}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SearchLookup
                        value={s.employeeId || ''}
                        options={lookups.employees}
                        allowClear
                        onChange={(id) => {
                          const emp = lookups.employees.find((x) => x.id === id);
                          void patchSale(s.id, {
                            employeeId: id || undefined,
                            employeeName: emp?.label,
                          });
                        }}
                      />
                    </td>
                    <td>{fmtDate(s.saleDate)}</td>
                    <td className={salesCss.num}>{fmtMoney(s.amount)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {loadOpen ? (
        <div className={extra.overlay} onClick={() => setLoadOpen(false)}>
          <div
            className={`${extra.modal} ${ui.modalWide}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={extra.modalTitle}>Загрузить данные о продажах с Billz</h3>
            <div className={iikoLocal.twoCol}>
              <div className={formStyles.field}>
                <label>
                  Дата начала <span className={formStyles.req}>*</span>
                </label>
                <input
                  type="date"
                  value={loadFrom}
                  onChange={(e) => setLoadFrom(e.target.value)}
                />
              </div>
              <div className={formStyles.field}>
                <label>Дата окончания</label>
                <input
                  type="date"
                  value={loadTo}
                  onChange={(e) => setLoadTo(e.target.value)}
                />
              </div>
            </div>
            <div className={extra.modalFooter}>
              <button
                type="button"
                className={formStyles.btnSave}
                disabled={busy}
                onClick={() => void runLoad()}
              >
                Загрузить данные о продажах с Billz
              </button>
              <button
                type="button"
                className={formStyles.btnClose}
                onClick={() => setLoadOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {regOpen ? (
        <div className={extra.overlay} onClick={() => setRegOpen(false)}>
          <div
            className={`${extra.modal} ${ui.modalWide}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={extra.modalTitle}>Регистрационные данные Billz</h3>
            <div className={formStyles.field}>
              <label>
                SUBJECT (USERNAME) <span className={formStyles.req}>*</span>
              </label>
              <input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className={formStyles.field}>
              <label>
                SECRET_KEY <span className={formStyles.req}>*</span>
              </label>
              <textarea
                className={ui.secret}
                value={secretDraft}
                onChange={(e) => setSecretDraft(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className={extra.modalFooter}>
              <button
                type="button"
                className={formStyles.btnSave}
                disabled={busy}
                onClick={() => void saveReg()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={formStyles.btnClose}
                onClick={() => setRegOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Billz1SalesPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <Billz1SalesInner />
    </Suspense>
  );
}
