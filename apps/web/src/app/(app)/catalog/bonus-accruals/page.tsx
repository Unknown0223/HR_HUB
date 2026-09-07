'use client';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { bonusKindLabel, fmtDate, type BonusDoc, type BonusKind } from '@/lib/bonus-accruals';
import { BonusAccrualFormModal } from './BonusAccrualForm';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/catalog/bonus-accruals';
const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to'] as const;
const COL_COUNT = 7;

function BonusAccrualsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
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
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
    let list = rows.filter((r) => {
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
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const ad = String(a.docDate || '');
      const bd = String(b.docDate || '');
      if (ad !== bd) return ad < bd ? -dir : dir;
      return String(a.number).localeCompare(String(b.number));
    });
    return list;
  }, [rows, q, filters.number, filters.posted, filters.from, filters.to, sortDir]);

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
      filtered.map((r) => ({
        Дата: fmtDate(r.docDate),
        Номер: r.number,
        'Дата начала': fmtDate(r.startDate),
        'Дата окончания': fmtDate(r.endDate),
        Подразделение: r.division?.name || '',
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
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
                <th>
                  <button
                    type="button"
                    style={{ all: 'unset', cursor: 'pointer' }}
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  >
                    Дата {sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </th>
                <th>Номер</th>
                <th>Дата начала</th>
                <th>Дата окончания</th>
                <th>Подразделение</th>
                <th>Проведен</th>
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
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      <td>{fmtDate(row.docDate)}</td>
                      <td>{row.number || '—'}</td>
                      <td>{fmtDate(row.startDate)}</td>
                      <td>{fmtDate(row.endDate)}</td>
                      <td>{row.division?.name || '—'}</td>
                      <td>
                        {row.status === 'posted' ? (
                          <span className={styles.badgeOk}>Да</span>
                        ) : (
                          <span className={styles.badgeMuted}>Нет</span>
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
