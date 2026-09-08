'use client';

import { confirm } from '@/lib/dialogs';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { FactFormModal } from './FactFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
};

type Division = { id: string; code: string; name: string };
type FactType = { id: string; code: string; name: string };

type FactRow = {
  id: string;
  value: string;
  factDate: string;
  employmentSource?: string | null;
  status: string;
  employee?: Emp | null;
  division?: Division | null;
  factType?: FactType | null;
};

const FILTER_KEYS = ['q', 'status'] as const;

const factListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.facts.v1',
  title: 'Факты',
  columns: [
    { key: 'employee', label: 'Сотрудник' },
    { key: 'division', label: 'Подразделение' },
    { key: 'factType', label: 'Тип' },
    { key: 'value', label: 'Значение факта' },
    { key: 'factDate', label: 'Дата' },
    { key: 'employmentSource', label: 'Источник занятости' },
    { key: 'status', label: 'Статус' },
  ],
  defaultColumns: [
    'employee',
    'division',
    'factType',
    'value',
    'factDate',
    'employmentSource',
    'status',
  ],
  defaultSearchKeys: ['employee', 'division', 'factType', 'value'],
  defaultSort: [{ key: 'factDate', dir: 'desc' }],
});

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return String(iso);
  }
}

function isActiveStatus(status?: string | null) {
  return !status || status === 'active';
}

function factCell(row: FactRow, key: string): string {
  switch (key) {
    case 'employee':
      return empName(row.employee);
    case 'division':
      return row.division?.name || '';
    case 'factType':
      return row.factType?.name || '';
    case 'value':
      return row.value || '';
    case 'factDate':
      return fmtDate(row.factDate);
    case 'employmentSource':
      return row.employmentSource || '';
    case 'status':
      return isActiveStatus(row.status) ? 'Активный' : row.status || 'Неактивный';
    default:
      return '';
  }
}

function FactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(factListPrefs);
  const q = filters.q;
  const statusFilter = filters.status;

  const [rows, setRows] = useState<FactRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(q || statusFilter));
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : factListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          empName(r.employee),
          r.division?.name,
          r.factType?.name,
          r.value,
          r.employmentSource,
          r.status,
          fmtDate(r.factDate),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (statusFilter === 'active') list = list.filter((r) => isActiveStatus(r.status));
    else if (statusFilter === 'inactive') {
      list = list.filter((r) => !isActiveStatus(r.status));
    }
    return list;
  }, [rows, q, statusFilter]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, factCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked =
    displayRows.some((r) => checked[r.id]) && !allPageChecked;

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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const facts = await apiFetch<FactRow[] | { items: FactRow[] }>(
        '/api/catalog/facts',
      );
      setRows(Array.isArray(facts) ? facts : facts.items || []);
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/facts?${qs}` : '/catalog/facts', { scroll: false });
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
      router.replace(qs ? `/catalog/facts?${qs}` : '/catalog/facts', {
        scroll: false,
      });
    }
  }

  async function runDelete(row: FactRow) {
    if (!(await confirm(`Удалить факт «${row.value}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/facts/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'delete' | 'activate' | 'deactivate') {
    const targets = displayRows.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные факты (${targets.length} шт.)?`))) {
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/facts/${row.id}`, { method: 'DELETE' });
          } else {
            const status = action === 'activate' ? 'active' : 'inactive';
            if (row.status === status) continue;
            await apiFetch(`/api/catalog/facts/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `facts-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = factCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="facts" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-chart-bar" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Факты</h1>
          <p className={shared.pageSubtitle}>
            Учёт производственных и прочих фактов по сотрудникам
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
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => router.push('/catalog/facts/import')}
          >
            <i className="fas fa-file-import" aria-hidden />
            Импорт
          </button>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активный' },
                  { value: 'inactive', label: 'Неактивный' },
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
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
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
                const active = isActiveStatus(row.status);
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
                          aria-label={`Выбрать ${row.value}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {empName(row.employee)}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              {active ? (
                                <span className={styles.statusActive}>Активный</span>
                              ) : (
                                <span className={styles.statusMuted}>
                                  {row.status || 'Неактивный'}
                                </span>
                              )}
                            </td>
                          );
                        }
                        return <td key={key}>{factCell(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void runDelete(row)}
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
            Показано <strong>{displayRows.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <FactFormModal
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

export default function FactsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <FactsPageInner />
    </Suspense>
  );
}
