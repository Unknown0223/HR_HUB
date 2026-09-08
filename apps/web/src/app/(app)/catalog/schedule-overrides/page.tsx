'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
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
import { IndividualScheduleFormModal } from './IndividualScheduleFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

export type ScheduleKind =
  | 'ordinary'
  | 'hourly'
  | 'advanced'
  | 'multi_shift'
  | 'advanced_multi_shift';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'Почасовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k.label]),
);

const FILTER_KEYS = ['q', 'status', 'kind', 'from', 'to'] as const;

const scheduleOverridesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.schedule-overrides.v1',
  title: 'Индивидуальные графики',
  columns: [
    { key: 'documentDate', label: 'Дата' },
    { key: 'number', label: 'Номер' },
    { key: 'month', label: 'Месяц' },
    { key: 'kind', label: 'Тип графика' },
    { key: 'division', label: 'Подразделение' },
    { key: 'lines', label: 'Строк' },
    { key: 'status', label: 'Статус' },
  ],
  defaultColumns: [
    'documentDate',
    'number',
    'month',
    'kind',
    'division',
    'lines',
    'status',
  ],
  defaultSearchKeys: ['number', 'kind', 'division', 'month'],
  defaultSort: [{ key: 'documentDate', dir: 'desc' }],
  searchableKeys: ['number', 'kind', 'division', 'month', 'status'],
});

type DocRow = {
  id: string;
  status: string;
  kind: ScheduleKind | string;
  documentDate: string;
  number?: string | null;
  month: string;
  divisionId?: string | null;
  note?: string | null;
  verified?: boolean;
  division?: { id: string; name: string; code: string } | null;
  lines?: Array<{ id: string }>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtMonth(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function statusLabel(row: DocRow) {
  if (row.status === 'posted') return { text: 'Проведён', cls: styles.badgePosted };
  if (row.status === 'cancelled') return { text: 'Отменён', cls: styles.badgeCancelled };
  return { text: 'Черновик', cls: styles.badgeDraft };
}

function cellOf(row: DocRow, key: string): string {
  switch (key) {
    case 'documentDate':
      return fmtDate(row.documentDate);
    case 'number':
      return row.number || '';
    case 'month':
      return fmtMonth(row.month);
    case 'kind':
      return KIND_LABEL[row.kind] || row.kind;
    case 'division':
      return row.division?.name || '';
    case 'lines':
      return String(row.lines?.length ?? 0);
    case 'status':
      return statusLabel(row).text;
    default:
      return '';
  }
}

function IndividualSchedulesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(scheduleOverridesListPrefs);
  const q = filters.q;

  const [rows, setRows] = useState<DocRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<ScheduleKind>('ordinary');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<DocRow[]>('/api/catalog/schedule-overrides');
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
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const create = searchParams.get('create') === '1';
    const edit = searchParams.get('edit');
    if (create || edit) {
      const rawKind = searchParams.get('kind') || 'ordinary';
      setCreateKind(
        (KINDS.some((k) => k.kind === rawKind) ? rawKind : 'ordinary') as ScheduleKind,
      );
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) =>
        [r.number, KIND_LABEL[r.kind] || r.kind, r.division?.name, r.note, fmtMonth(r.month)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(qq),
      );
    }
    if (filters.status) list = list.filter((r) => r.status === filters.status);
    if (filters.kind) list = list.filter((r) => r.kind === filters.kind);
    if (filters.from) {
      list = list.filter((r) => String(r.documentDate).slice(0, 10) >= filters.from);
    }
    if (filters.to) {
      list = list.filter((r) => String(r.documentDate).slice(0, 10) <= filters.to);
    }
    return list;
  }, [rows, q, filters.status, filters.kind, filters.from, filters.to]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : scheduleOverridesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

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
    router.replace(qs ? `/catalog/schedule-overrides?${qs}` : '/catalog/schedule-overrides', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setCreateKind('ordinary');
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (
      searchParams.get('create') === '1' ||
      searchParams.get('edit') ||
      searchParams.get('kind')
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('edit');
      params.delete('kind');
      const qs = params.toString();
      router.replace(
        qs ? `/catalog/schedule-overrides?${qs}` : '/catalog/schedule-overrides',
        { scroll: false },
      );
    }
  }

  async function remove(row: DocRow) {
    if (row.status === 'posted') {
      setError('Проведённый документ нельзя удалить');
      return;
    }
    if (!(await confirm('Удалить документ?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/schedule-overrides/${row.id}`, { method: 'DELETE' });
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

  async function runAction(row: DocRow, action: 'post' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/schedule-overrides/${row.id}/${action}`, {
        method: 'POST',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка операции');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'post' | 'cancel' | 'delete') {
    const targets = filtered.filter((r) => checked[r.id]);
    if (!targets.length) return;
    const label =
      action === 'post' ? 'Провести' : action === 'cancel' ? 'Отменить' : 'Удалить';
    if (!(await confirm(`${label} выбранные документы (${targets.length} шт.)?`))) return;

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            if (row.status === 'posted') {
              failed += 1;
              continue;
            }
            await apiFetch(`/api/catalog/schedule-overrides/${row.id}`, {
              method: 'DELETE',
            });
          } else {
            await apiFetch(`/api/catalog/schedule-overrides/${row.id}/${action}`, {
              method: 'POST',
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
      `individual-schedules-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <PageSubnav groupKey="schedule-overrides" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-user-clock" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Индивидуальные графики</h1>
          <p className={shared.pageSubtitle}>
            Документы индивидуальных графиков работы сотрудников по месяцам
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
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateRange', fromKey: 'from', toKey: 'to', label: 'Дата документа' },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'posted', label: 'Проведён' },
                  { value: 'cancelled', label: 'Отменён' },
                ],
              },
              {
                type: 'select',
                key: 'kind',
                label: 'Тип графика',
                options: KINDS.map((k) => ({ value: k.kind, label: k.label })),
              },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
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
          <button
            type="button"
            className={styles.iconBtn}
            disabled={loading}
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
            className={`${styles.bulkBtn} ${styles.bulkOk}`}
            disabled={busy}
            onClick={() => void runBulk('post')}
          >
            <i className="fas fa-check" aria-hidden />
            Провести
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('cancel')}
          >
            <i className="fas fa-ban" aria-hidden />
            Отменить
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
                    disabled={!displayRows.length}
                    aria-label="Выбрать все"
                  />
                </th>
                {visibleCols.map((key) => (
                  <th key={key}>{prefs.labelOf(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !displayRows.length ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && !displayRows.length ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const st = statusLabel(row);
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
                          aria-label={`Выбрать документ ${row.number || row.id}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'documentDate') {
                          return (
                            <td key={key} className={styles.codeCell}>
                              {fmtDate(row.documentDate)}
                            </td>
                          );
                        }
                        if (key === 'number') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {row.number || '—'}
                            </td>
                          );
                        }
                        if (key === 'month') {
                          return (
                            <td key={key} className={styles.monthCell}>
                              {fmtMonth(row.month)}
                            </td>
                          );
                        }
                        if (key === 'kind') {
                          return <td key={key}>{KIND_LABEL[row.kind] || row.kind}</td>;
                        }
                        if (key === 'division') {
                          return <td key={key}>{row.division?.name || '—'}</td>;
                        }
                        if (key === 'lines') {
                          return (
                            <td key={key} className={styles.numCell}>
                              {row.lines?.length ?? 0}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
                              <span className={st.cls}>{st.text}</span>
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
                            <Link href={`/catalog/schedule-overrides/${row.id}`}>
                              <i className="fas fa-table" aria-hidden />
                              Открыть график
                            </Link>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openEdit(row.id)}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'posted' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'cancel')}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отменить проведение
                              </button>
                            ) : null}
                            {row.status !== 'posted' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void remove(row)}
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

      <IndividualScheduleFormModal
        open={modalOpen}
        editId={editId}
        initialKind={createKind}
        onClose={closeModal}
        onSaved={(id, openDoc) => {
          closeModal();
          if (openDoc && id) router.push(`/catalog/schedule-overrides/${id}`);
          else void load();
        }}
      />
    </div>
  );
}

export default function IndividualSchedulesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <IndividualSchedulesInner />
    </Suspense>
  );
}
