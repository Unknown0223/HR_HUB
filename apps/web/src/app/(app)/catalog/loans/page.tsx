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
  formatMonthRu,
  loanStatusLabel,
  money,
  type LoanRow,
} from '@/lib/loans';
import { LoanFormModal } from './LoanFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/loans';
const FILTER_KEYS = ['q', 'number', 'status', 'from', 'to'] as const;
const COL_COUNT = 9;

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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.status || filters.from || filters.to),
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);

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

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

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

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
  );
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

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
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

  function openCreate() {
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') patchUrl({ create: null });
  }

  async function runBulk(action: 'complete' | 'close' | 'delete') {
    const targets =
      action === 'complete'
        ? checkedRows.filter((r) => r.status === 'draft')
        : action === 'close'
          ? checkedRows.filter((r) => r.status === 'active')
          : checkedRows.filter((r) => r.status === 'draft');
    if (!targets.length) {
      setError(
        action === 'complete'
          ? 'Нет черновиков среди выбранных'
          : action === 'close'
            ? 'Нет активных займов среди выбранных'
            : 'Нет черновиков для удаления',
      );
      return;
    }
    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные займы (${targets.length} шт.)?`))) return;
    } else if (action === 'complete') {
      if (!(await confirm(`Завершить выбранные займы (${targets.length} шт.)?`))) return;
    } else if (!(await confirm(`Закрыть выбранные займы (${targets.length} шт.)?`))) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/loans/bulk-${action}`, {
        method: 'POST',
        body: JSON.stringify({ ids: targets.map((r) => r.id) }),
      });
      setChecked({});
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function run(row: LoanRow, action: 'complete' | 'close' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить заём ${row.number || ''}?`))) return;
    if (
      action === 'close' &&
      !(await confirm({ message: 'Закрыть заём?', confirmText: 'Да', cancelText: 'Нет' }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/loans/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/loans/${row.id}/${action}`, { method: 'POST' });
      }
      setFocusId(null);
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

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="loans" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-hand-holding-usd" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Займы</h1>
          <p className={shared.pageSubtitle}>Займы сотрудникам и график погашения</p>
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
            onClick={() =>
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
              )
            }
            title="CSV"
            aria-label="Экспорт CSV"
          >
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
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('complete')}
          >
            <i className="fas fa-check" aria-hidden />
            Завершить
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('close')}
          >
            <i className="fas fa-lock" aria-hidden />
            Закрыть
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('delete')}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setChecked({})}
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
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Номер займа</th>
                <th>
                  <button
                    type="button"
                    className={styles.sortBtn}
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  >
                    Дата займа {sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </th>
                <th>Сотрудник</th>
                <th className={styles.numCol}>Оставшаяся сумма</th>
                <th className={styles.numCol}>Сумма займа</th>
                <th>От</th>
                <th>До</th>
                <th>Статус</th>
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
                const open = focusId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setFocusId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      <td className={styles.numberCell}>{row.number || '—'}</td>
                      <td>{fmtDate(row.loanDate)}</td>
                      <td className={styles.empName}>{row.employee?.label || '—'}</td>
                      <td className={styles.numCol}>{money(row.remaining)}</td>
                      <td className={styles.numCol}>{money(row.principal)}</td>
                      <td>{formatMonthRu(row.startDate)}</td>
                      <td>{formatMonthRu(row.endDate || '')}</td>
                      <td>
                        <span
                          className={row.status === 'active' ? styles.postedYes : styles.postedNo}
                        >
                          {loanStatusLabel(row.status)}
                        </span>
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
                            {row.status !== 'closed' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'complete')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Завершить
                              </button>
                            ) : null}
                            {row.status === 'active' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(row, 'close')}
                              >
                                <i className="fas fa-lock" aria-hidden />
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

      <LoanFormModal
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

export default function LoansPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
