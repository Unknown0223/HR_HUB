'use client';

import { confirm } from '@/lib/dialogs';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  FINE_SCOPE_TABS,
  formatMonthRu,
  parseFineScope,
  type FinePolicyRow,
  type FineScope,
} from '@/lib/fine-policies';
import { FinePolicyFormModal } from './FinePolicyFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const PATH = '/payroll/fine-policies';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'month', 'isActive', 'divisionId', 'positionId'] as const;

function FinePoliciesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const scope: FineScope = parseFineScope(searchParams.get('tab'));

  const [rows, setRows] = useState<FinePolicyRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.name ||
        filters.month ||
        filters.isActive ||
        filters.divisionId ||
        filters.positionId,
    ),
  );

  const colCount = scope === 'company' ? 4 : 5;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.name && !(r.name || '').toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      if (filters.month) {
        const blob = `${formatMonthRu(r.month)} ${r.month}`.toLowerCase();
        if (!blob.includes(filters.month.toLowerCase())) return false;
      }
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (filters.divisionId && r.divisionId !== filters.divisionId) return false;
      if (filters.positionId && r.positionId !== filters.positionId) return false;
      if (!qq) return true;
      const emp = (r.employees || []).map((e) => e.label).join(' ');
      return [formatMonthRu(r.month), r.name, r.division?.name, r.position?.name, emp]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [
    rows,
    q,
    filters.name,
    filters.month,
    filters.isActive,
    filters.divisionId,
    filters.positionId,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageIds = paged.map((r) => r.id);

  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageChecked = pageIds.some((id) => selected.has(id)) && !allPageChecked;

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const activateCount = selectedRows.filter((r) => r.isActive === false).length;
  const deactivateCount = selectedRows.filter((r) => r.isActive !== false).length;

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setFocusId(null);
  }, [
    q,
    scope,
    filters.name,
    filters.month,
    filters.isActive,
    filters.divisionId,
    filters.positionId,
  ]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') setModalOpen(true);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<FinePolicyRow[]>(
        `/api/payroll/fine-policies?scope=${encodeURIComponent(scope)}`,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function setScope(next: FineScope) {
    patchUrl({ tab: next === 'company' ? null : next });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPage(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function closeModal() {
    setModalOpen(false);
    if (searchParams.get('create') === '1') patchUrl({ create: null });
  }

  function editHref(id: string) {
    return `${PATH}/${id}/edit${scope === 'company' ? '' : `?tab=${scope}`}`;
  }

  async function deleteIds(ids: string[], message?: string) {
    if (!ids.length) return;
    if (!(await confirm(message || `Удалить выбранные политики (${ids.length} шт.)?`))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/payroll/fine-policies/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function setActive(targets: FinePolicyRow[], value: boolean) {
    const list = targets.filter((r) => (r.isActive !== false) !== value);
    if (!list.length) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of list) {
        try {
          await apiFetch(`/api/payroll/fine-policies/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: value }),
          });
        } catch {
          failed += 1;
        }
      }
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyRows(targets: FinePolicyRow[]) {
    if (!targets.length) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          await apiFetch(`/api/payroll/fine-policies/${row.id}/copy`, { method: 'POST' });
        } catch {
          failed += 1;
        }
      }
      setFocusId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `fine-policies-${scope}.csv`,
      filtered.map((r) => ({
        Месяц: formatMonthRu(r.month),
        Название: r.name || '',
        Подразделение: r.division?.name || '',
        Должность: r.position?.name || '',
        Сотрудники: (r.employees || []).map((e) => e.label).join('; '),
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  const filterFields = [
    { type: 'text' as const, key: 'month', label: 'Месяц', placeholder: 'Поиск...' },
    { type: 'text' as const, key: 'name', label: 'Название', placeholder: 'Поиск...' },
    ...(scope === 'division'
      ? [{ type: 'divisionId' as const, key: 'divisionId', label: 'Подразделение' }]
      : []),
    ...(scope === 'position'
      ? [{ type: 'positionId' as const, key: 'positionId', label: 'Должность' }]
      : []),
    { type: 'isActive' as const, key: 'isActive', label: 'Статус' },
  ];

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="policies" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeIncident}`}>
          <i className="fas fa-gavel" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Политики штрафов</h1>
          <p className={shared.pageSubtitle}>
            Правила удержаний за опоздания, ранний уход и пропуски отметок
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
        {FINE_SCOPE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={scope === t.id ? styles.tabOn : styles.tab}
            onClick={() => setScope(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setModalOpen(true)}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={filterFields}
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
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy || activateCount === 0}
            onClick={() => void setActive(selectedRows, true)}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать{activateCount ? ` (${activateCount})` : ''}
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy || deactivateCount === 0}
            onClick={() => void setActive(selectedRows, false)}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать{deactivateCount ? ` (${deactivateCount})` : ''}
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void copyRows(selectedRows)}
          >
            <i className="fas fa-copy" aria-hidden />
            Скопировать
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void deleteIds(Array.from(selected))}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
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
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>
                  Месяц
                  <span className={styles.sortMark}>↑</span>
                </th>
                <th>Название</th>
                {scope === 'division' ? <th>Подразделение</th> : null}
                {scope === 'position' ? <th>Должность</th> : null}
                {scope === 'employee' ? <th>Сотрудники</th> : null}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {paged.map((row) => {
                const open = focusId === row.id;
                const isChecked = selected.has(row.id);
                const active = row.isActive !== false;
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
                          onChange={() => toggleRow(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${formatMonthRu(row.month)}`}
                        />
                      </td>
                      <td className={styles.nameCell}>{formatMonthRu(row.month)}</td>
                      <td className={styles.textCell}>{row.name || '—'}</td>
                      {scope === 'division' ? (
                        <td className={styles.mutedCell}>{row.division?.name || '—'}</td>
                      ) : null}
                      {scope === 'position' ? (
                        <td className={styles.mutedCell}>{row.position?.name || '—'}</td>
                      ) : null}
                      {scope === 'employee' ? (
                        <td className={styles.mutedCell}>
                          {(row.employees || []).map((e) => e.label).join(', ') || '—'}
                        </td>
                      ) : null}
                      <td>
                        {active ? (
                          <span className={styles.statusActive}>Активный</span>
                        ) : (
                          <span className={styles.statusMuted}>Неактивный</span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => router.push(editHref(row.id))}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setActive([row], !active)}
                            >
                              <i
                                className={active ? 'fas fa-ban' : 'fas fa-check'}
                                aria-hidden
                              />
                              {active ? 'Деактивировать' : 'Активировать'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void copyRows([row])}
                            >
                              <i className="fas fa-copy" aria-hidden />
                              Скопировать
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() =>
                                void deleteIds(
                                  [row.id],
                                  `Удалить «${formatMonthRu(row.month)}»?`,
                                )
                              }
                            >
                              <i className="fas fa-trash" aria-hidden />
                              Удалить
                            </button>
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
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Назад"
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
            <span className={styles.pagerMeta}>
              {Math.min(page, pageCount)} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Вперёд"
            >
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <FinePolicyFormModal
        open={modalOpen}
        scope={scope}
        onClose={closeModal}
        onSaved={(id, openAfter) => {
          closeModal();
          if (openAfter && id) {
            router.push(editHref(id));
            return;
          }
          void load();
        }}
      />
    </div>
  );
}

export function FinePoliciesPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <FinePoliciesInner />
    </Suspense>
  );
}
