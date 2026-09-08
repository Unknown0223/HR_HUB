'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { bonusKindLabel, fmtDate, type BonusDoc, type BonusKind } from '@/lib/bonus-accruals';
import { BonusAccrualFormModal } from './BonusAccrualForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/bonus-accruals';
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;

const bonusListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.bonus-accruals.v1',
  title: 'Бонусные начисления',
  columns: [
    { key: 'docDate', label: 'Дата' },
    { key: 'number', label: 'Номер' },
    { key: 'startDate', label: 'Дата начала' },
    { key: 'endDate', label: 'Дата окончания' },
    { key: 'division', label: 'Подразделение' },
    { key: 'posted', label: 'Проведен' },
  ],
  defaultColumns: ['docDate', 'number', 'startDate', 'endDate', 'division', 'posted'],
  defaultSearchKeys: ['number', 'division'],
  defaultSort: [{ key: 'docDate', dir: 'desc' }],
  searchableKeys: ['number', 'division'],
});

function cellOf(row: BonusDoc, key: string): string {
  switch (key) {
    case 'docDate':
      return fmtDate(row.docDate);
    case 'number':
      return row.number || '';
    case 'startDate':
      return fmtDate(row.startDate);
    case 'endDate':
      return fmtDate(row.endDate);
    case 'division':
      return row.division?.name || '';
    case 'posted':
      return row.status === 'posted' ? 'Да' : 'Нет';
    default:
      return '';
  }
}

function BonusAccrualsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(bonusListPrefs);
  const q = filters.q;

  const [rows, setRows] = useState<BonusDoc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.number || filters.posted || filters.from || filters.to),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [createKind, setCreateKind] = useState<BonusKind>('fact');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await apiFetch<BonusDoc[]>('/api/payroll/bonus-accruals'));
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
    function onDoc(e: MouseEvent) {
      if (!createMenuRef.current?.contains(e.target as Node)) setCreateMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    const kind = searchParams.get('kind') === 'kpi' ? 'kpi' : 'fact';
    setCreateKind(kind);
    setModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    params.delete('kind');
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }, [searchParams, router]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.number && !String(r.number || '').includes(filters.number.trim())) return false;
      if (filters.posted === 'yes' && r.status !== 'posted') return false;
      if (filters.posted === 'no' && r.status === 'posted') return false;
      const d = String(r.docDate || '').slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      if (!qq) return true;
      const blob = [r.number, r.division?.name, r.note, bonusKindLabel(r.kind)].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.number, filters.posted, filters.from, filters.to]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : bonusListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const selectedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
  );
  const postCount = selectedRows.filter((r) => r.status === 'draft').length;
  const unpostCount = selectedRows.filter((r) => r.status === 'posted').length;
  const deleteCount = selectedRows.filter((r) => r.status !== 'posted').length;

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked = displayRows.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of displayRows) {
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

  function openCreate(kind: BonusKind) {
    setCreateKind(kind);
    setCreateMenuOpen(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function run(row: BonusDoc, action: 'post' | 'unpost' | 'delete') {
    if (action === 'delete' && !(await confirm(`Удалить документ ${row.number || ''}?`))) return;
    if (
      action === 'post' &&
      !(await confirm({ message: 'Сохранить и провести документ?', confirmText: 'Да', cancelText: 'Нет' }))
    ) {
      return;
    }
    if (
      action === 'unpost' &&
      !(await confirm({ message: 'Отменить проведение?', confirmText: 'Да', cancelText: 'Нет' }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/payroll/bonus-accruals/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/payroll/bonus-accruals/${row.id}/${action}`, { method: 'POST' });
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

  async function bulk(kind: 'post' | 'unpost' | 'delete') {
    const ids =
      kind === 'post'
        ? selectedRows.filter((r) => r.status === 'draft').map((r) => r.id)
        : kind === 'unpost'
          ? selectedRows.filter((r) => r.status === 'posted').map((r) => r.id)
          : selectedRows.filter((r) => r.status !== 'posted').map((r) => r.id);
    if (!ids.length) return;
    const message =
      kind === 'delete'
        ? `Удалить выбранные документы (${ids.length} шт.)?`
        : kind === 'post'
          ? `Провести выбранные документы (${ids.length} шт.)?`
          : `Отменить проведение выбранных документов (${ids.length} шт.)?`;
    if (
      !(await confirm({
        message,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: kind === 'delete' ? 'danger' : undefined,
      }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/payroll/bonus-accruals/bulk-${kind}`, {
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
      `bonus-accruals-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          obj[prefs.labelOf(k)] = cellOf(r, k) || '—';
        }
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="bonus-accruals" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-gift" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Бонусные начисления</h1>
          <p className={shared.pageSubtitle}>Документы бонусных начислений (факт / КПЭ)</p>
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
          <div className={styles.createWrap} ref={createMenuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateMenuOpen((v) => !v)}
              aria-expanded={createMenuOpen}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
            {createMenuOpen ? (
              <div className={styles.createMenu}>
                <button type="button" onClick={() => openCreate('fact')}>
                  Бонусное начисление - Факт
                </button>
                <button type="button" onClick={() => openCreate('kpi')}>
                  Бонусные начисления - КПЭ
                </button>
              </div>
            ) : null}
          </div>
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
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          {postCount > 0 ? (
            <button type="button" className={styles.bulkBtn} disabled={busy} onClick={() => void bulk('post')}>
              <i className="fas fa-check" aria-hidden />
              Провести ({postCount})
            </button>
          ) : null}
          {unpostCount > 0 ? (
            <button type="button" className={styles.bulkBtn} disabled={busy} onClick={() => void bulk('unpost')}>
              <i className="fas fa-undo" aria-hidden />
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
                {visibleCols.map((key) => (
                  <th key={key}>{prefs.labelOf(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
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
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'posted') {
                          return (
                            <td key={key}>
                              {row.status === 'posted' ? (
                                <span className={styles.badgeOk}>Да</span>
                              ) : (
                                <span className={styles.badgeMuted}>Нет</span>
                              )}
                            </td>
                          );
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`${PATH}/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {row.status !== 'posted' ? (
                              <Link href={`${PATH}/${row.id}/edit`}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'post')}>
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'posted' ? (
                              <button type="button" disabled={busy} onClick={() => void run(row, 'unpost')}>
                                <i className="fas fa-undo" aria-hidden />
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

      <BonusAccrualFormModal
        open={modalOpen}
        kind={createKind}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function BonusAccrualsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <BonusAccrualsInner />
    </Suspense>
  );
}
