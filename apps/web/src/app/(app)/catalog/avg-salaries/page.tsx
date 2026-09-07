'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  displayMoney,
  formatMoney,
  gradeLabel,
  parseMoney,
  positionLabel,
  type AvgSalaryMeta,
} from '@/lib/avg-salaries';
import { SearchLookup } from './SearchLookup';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import extra from './page.module.css';
import shared from '../../../page-shared.module.css';

type Dict = {
  id: string;
  code: string;
  name: string;
  items?: DictItem[];
};

type DictItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: AvgSalaryMeta | null;
};

type Opt = { id: string; label: string };

type AuditRow = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  meta?: { userName?: string; name?: string; code?: string } | null;
};

type Mode = 'list' | 'create' | 'edit' | 'view';
type ViewTab = 'main' | 'history';

const DICT_CODE = 'avg_salary';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'positionId', 'gradeId', 'isActive'] as const;

function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

function eventLabel(action: string) {
  if (action === 'dictionary.item.create') return 'Создан';
  if (action === 'dictionary.item.update') return 'Изменен';
  if (action === 'dictionary.item.delete') return 'Удален';
  return action;
}

function AvgSalariesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.positionId || filters.gradeId || filters.isActive),
  );

  const [mode, setMode] = useState<Mode>('list');
  const [viewTab, setViewTab] = useState<ViewTab>('main');
  const [editId, setEditId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<DictItem | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [historyQ, setHistoryQ] = useState('');

  const [positionId, setPositionId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [valueFrom, setValueFrom] = useState('');
  const [valueTo, setValueTo] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const posF = filters.positionId;
    const gradeF = filters.gradeId;
    return rows.filter((r) => {
      if (posF && r.meta?.positionId !== posF) return false;
      if (gradeF && r.meta?.gradeId !== gradeF) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const blob = [
        positionLabel(r.name, r.meta),
        gradeLabel(r.meta),
        displayMoney(r.meta?.valueFrom),
        displayMoney(r.meta?.valueTo),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.positionId, filters.gradeId, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filtered, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lookups] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra'),
        apiFetch<{ positions?: Opt[]; grades?: Opt[] }>('/api/catalog/lookups'),
      ]);
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Средние зарплаты» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      const items = [...(dict.items || [])].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          positionLabel(a.name, a.meta).localeCompare(
            positionLabel(b.name, b.meta),
            'ru',
          ),
      );
      setRows(items);
      setPositions(lookups.positions || []);
      setGrades(lookups.grades || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
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
    setPage(1);
  }, [q, filters.positionId, filters.gradeId, filters.isActive]);

  function resetForm() {
    setPositionId('');
    setGradeId('');
    setValueFrom('');
    setValueTo('');
    setError('');
  }

  function openCreate() {
    setEditId(null);
    resetForm();
    setMode('create');
  }

  function fillForm(row: DictItem) {
    setEditId(row.id);
    setPositionId(row.meta?.positionId || '');
    setGradeId(row.meta?.gradeId || '');
    setValueFrom(
      row.meta?.valueFrom != null ? String(row.meta.valueFrom) : '',
    );
    setValueTo(row.meta?.valueTo != null ? String(row.meta.valueTo) : '');
    setError('');
  }

  function openEdit(row: DictItem) {
    fillForm(row);
    setMode('edit');
  }

  async function openView(row: DictItem) {
    setViewRow(row);
    setViewTab('main');
    setHistoryQ('');
    setMode('view');
    await loadHistory(row.id);
  }

  async function loadHistory(id: string) {
    try {
      const logs = await apiFetch<AuditRow[]>(
        `/api/settings/audit?entity=DictionaryItem&entityId=${encodeURIComponent(id)}`,
      );
      setHistory(Array.isArray(logs) ? logs : []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (mode === 'view' && viewTab === 'history' && viewRow) {
      void loadHistory(viewRow.id);
    }
  }, [mode, viewTab, viewRow]);

  async function save() {
    if (!dictId) return;
    const pos = positions.find((p) => p.id === positionId);
    if (!positionId || !pos) {
      setError('Укажите должность');
      return;
    }
    const from = parseMoney(valueFrom);
    if (from == null) {
      setError('Укажите значение «От»');
      return;
    }
    const to = parseMoney(valueTo);
    if (valueTo.trim() && to == null) {
      setError('Значение «До» должно быть числом');
      return;
    }
    if (to != null && to < from) {
      setError('Значение «До» не может быть меньше «От»');
      return;
    }
    const grade = grades.find((g) => g.id === gradeId);
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    setSaving(true);
    setError('');
    try {
      const body = {
        code:
          existing?.code ||
          `AS_${Date.now().toString(36).toUpperCase()}`,
        name: pos.label,
        isActive: true,
        meta: {
          positionId: pos.id,
          positionName: pos.label,
          gradeId: grade?.id || '',
          gradeName: grade?.label || '',
          valueFrom: from,
          valueTo: to,
        },
      };
      if (editId) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!dictId || !selected.size) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные средние зарплаты (${selected.size})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of selected) {
        await apiFetch(
          `/api/settings/dictionaries/${dictId}/items/${id}/delete`,
          { method: 'POST' },
        );
      }
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка группового удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `avg-salaries-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Должность: positionLabel(r.name, r.meta),
        Разряд: gradeLabel(r.meta),
        От: r.meta?.valueFrom ?? '',
        До: r.meta?.valueTo ?? '',
      })),
    );
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/avg-salaries?${qs}` : '/catalog/avg-salaries', {
      scroll: false,
    });
  }

  const histFiltered = useMemo(() => {
    const qq = historyQ.trim().toLowerCase();
    if (!qq) return history;
    return history.filter((h) => {
      const blob = [
        eventLabel(h.action),
        h.meta?.userName,
        h.meta?.name,
        h.meta?.code,
        fmtDateTime(h.createdAt),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [history, historyQ]);

  function renderFormModal() {
    const open = mode === 'create' || mode === 'edit';
    const title =
      mode === 'edit'
        ? 'Средняя зарплата (изменение)'
        : 'Средняя зарплата (создание)';
    return (
      <FormModal
        open={open}
        title={title}
        width="md"
        onClose={() => {
          setMode('list');
          setError('');
        }}
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => {
                setMode('list');
                setError('');
              }}
            >
              Закрыть
            </button>
          </>
        }
      >
        {error ? <p className={modal.error}>{error}</p> : null}
        <div className={modal.field}>
          <label>
            Должность <span className={modal.req}>*</span>
          </label>
          <SearchLookup
            value={positionId}
            options={positions}
            onChange={setPositionId}
          />
        </div>
        <div className={modal.field}>
          <label>Разряд</label>
          <SearchLookup
            value={gradeId}
            options={grades}
            placeholder="Поиск"
            allowClear
            onChange={setGradeId}
          />
        </div>
        <div className={modal.row2}>
          <div className={modal.field}>
            <label>
              От <span className={modal.req}>*</span>
            </label>
            <input
              value={valueFrom}
              inputMode="decimal"
              onChange={(e) => setValueFrom(e.target.value)}
            />
          </div>
          <div className={modal.field}>
            <label>До</label>
            <input
              value={valueTo}
              inputMode="decimal"
              onChange={(e) => setValueTo(e.target.value)}
            />
          </div>
        </div>
      </FormModal>
    );
  }

  if (mode === 'view' && viewRow) {
    const meta = viewRow.meta || {};
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{ title: 'Средняя зарплата (просмотр)', siblings: [] }}
        />
        <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => openEdit(viewRow)}
          >
            Изменить
          </button>
          <button
            type="button"
            className={formStyles.btnClose}
            onClick={() => setMode('list')}
          >
            Закрыть
          </button>
        </div>
        <div className={local.viewLayout}>
          <aside className={local.side}>
            <div className={extra.sideName}>
              {positionLabel(viewRow.name, meta)}
            </div>
            <span
              className={
                viewRow.isActive === false ? extra.badgeOff : extra.badge
              }
            >
              {viewRow.isActive === false ? 'Неактивный' : 'Активный'}
            </span>
            <nav className={local.sideNav}>
              <button
                type="button"
                className={viewTab === 'main' ? local.sideNavOn : undefined}
                onClick={() => setViewTab('main')}
              >
                Основная информация
              </button>
              <button
                type="button"
                className={viewTab === 'history' ? local.sideNavOn : undefined}
                onClick={() => setViewTab('history')}
              >
                История изменений
              </button>
            </nav>
          </aside>
          {viewTab === 'main' ? (
            <div className={formStyles.card}>
              <h2 className={local.section}>Основная информация</h2>
              <div className={local.viewGrid}>
                <div className={formStyles.field}>
                  <label>Должность</label>
                  <div className={local.readonly}>
                    {positionLabel(viewRow.name, meta)}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Разряд</label>
                  <div className={local.readonly}>
                    {gradeLabel(meta) || '—'}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>От</label>
                  <div className={local.readonly}>
                    {displayMoney(meta.valueFrom)}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>До</label>
                  <div className={local.readonly}>
                    {displayMoney(meta.valueTo)}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Изменил</label>
                  <div className={local.readonly}>{meta.updatedBy || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Создал</label>
                  <div className={local.readonly}>
                    {meta.createdBy || 'System'}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Дата изменения</label>
                  <div className={local.readonly}>
                    {fmtDateTime(meta.updatedAt)}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Дата создания</label>
                  <div className={local.readonly}>
                    {fmtDateTime(meta.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={formStyles.card} style={{ minHeight: 280 }}>
              <h2 className={local.section}>История изменений</h2>
              <div className={extra.historyTools}>
                <input
                  className={styles.search}
                  placeholder="Поиск..."
                  value={historyQ}
                  onChange={(e) => setHistoryQ(e.target.value)}
                />
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Дата и время события</th>
                      <th>Пользователь</th>
                      <th>Событие</th>
                      <th>Должность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histFiltered.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      histFiltered.map((h) => (
                        <tr key={h.id}>
                          <td>{fmtDateTime(h.createdAt)}</td>
                          <td>{h.meta?.userName || '—'}</td>
                          <td>{eventLabel(h.action)}</td>
                          <td>
                            {h.meta?.name ||
                              positionLabel(viewRow.name, viewRow.meta)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderRow(row: DictItem) {
    const open = focusId === row.id;
    return (
      <tr
        key={row.id}
        className={open ? styles.rowSelected : undefined}
        onClick={() => setFocusId(open ? null : row.id)}
        style={{ cursor: 'pointer' }}
      >
        <td onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={(e) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
            aria-label={`Выбрать ${positionLabel(row.name, row.meta)}`}
          />
        </td>
        <td className={styles.nameCell}>
          <span className={styles.nameText}>
            {positionLabel(row.name, row.meta)}
          </span>
          {open ? (
            <div
              className={`${styles.inlineActions} ${styles.rowActions}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => void openView(row)}>
                Просмотреть
              </button>
              <button type="button" onClick={() => openEdit(row)}>
                Изменить
              </button>
            </div>
          ) : null}
        </td>
        <td>{gradeLabel(row.meta) || '—'}</td>
        <td>{formatMoney(row.meta?.valueFrom) || '—'}</td>
        <td>{formatMoney(row.meta?.valueTo) || '—'}</td>
      </tr>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Средние зарплаты', siblings: [] }} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-money-bill-wave" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Средние зарплаты</h1>
          <p className={shared.pageSubtitle}>
            Диапазоны средних зарплат по должностям и разрядам
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
              {
                type: 'select',
                key: 'positionId',
                label: 'Должность',
                options: positions.map((p) => ({
                  value: p.id,
                  label: p.label,
                })),
              },
              {
                type: 'select',
                key: 'gradeId',
                label: 'Разряд',
                options: grades.map((g) => ({
                  value: g.id,
                  label: g.label,
                })),
              },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          {selected.size > 0 ? (
            <button
              type="button"
              className={local.btnDanger}
              disabled={busy}
              onClick={() => void deleteSelected()}
            >
              Удалить {selected.size}
            </button>
          ) : null}
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
            title="Excel"
            aria-label="Экспорт Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
          </button>
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

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((r) => r.id)));
                  }}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Должность</th>
              <th>Разряд</th>
              <th>От</th>
              <th>До</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {paged.map(renderRow)}
          </tbody>
        </table>
      </div>
      {renderFormModal()}
    </div>
  );
}

export default function AvgSalariesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <AvgSalariesPageInner />
    </Suspense>
  );
}
