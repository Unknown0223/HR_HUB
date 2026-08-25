'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import extra from './page.module.css';

type Dict = {
  id: string;
  code: string;
  name: string;
  items?: DictItem[];
};

type IndicatorMeta = {
  shortName?: string;
  description?: string;
  groupCode?: string;
  groupName?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

type DictItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: IndicatorMeta | null;
};

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

const DICT_CODE = 'indicators';
const GROUP_DICT_CODE = 'indicator_groups';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'code', 'group', 'isActive'] as const;

function toIdentifier(name: string) {
  return name.replace(/\s+/g, '').replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '');
}

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

function groupOf(row: DictItem) {
  return row.meta?.groupName || row.meta?.groupCode || 'Без группы';
}

function IndicatorsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const groupFilter = filters.group;

  const [dictId, setDictId] = useState<string | null>(null);
  const [groups, setGroups] = useState<DictItem[]>([]);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.name || filters.code || filters.group || filters.isActive),
  );
  const [page, setPage] = useState(1);

  const [mode, setMode] = useState<Mode>('list');
  const [viewTab, setViewTab] = useState<ViewTab>('main');
  const [editId, setEditId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<DictItem | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [historyQ, setHistoryQ] = useState('');

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identTouched, setIdentTouched] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const nameF = (filters.name || '').trim().toLowerCase();
      const codeF = (filters.code || '').trim().toLowerCase();
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (codeF && !(r.code || '').toLowerCase().includes(codeF)) return false;
      if (groupFilter && (r.meta?.groupCode || '') !== groupFilter) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const blob = [r.name, r.code, r.meta?.shortName, r.meta?.description, groupOf(r)]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, groupFilter, filters.name, filters.code, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filtered, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra');
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      const gdict = (list || []).find((d) => d.code === GROUP_DICT_CODE);
      if (!dict) {
        setError('Справочник «Показатели» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      const gitems = [...(gdict?.items || [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru'),
      );
      setGroups(gitems);
      const items = [...(dict.items || [])].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name, 'ru'),
      );
      setRows(items);
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
    setPage(1);
  }, [q, groupFilter, filters.name, filters.code, filters.isActive]);

  function resetForm() {
    setName('');
    setShortName('');
    setIdentifier('');
    setGroupCode(groups[0]?.code || '');
    setDescription('');
    setActive(true);
    setIdentTouched(false);
    setError('');
  }

  function openCreate() {
    setEditId(null);
    resetForm();
    setMode('create');
  }

  function fillFrom(row: DictItem) {
    setEditId(row.id);
    setName(row.name);
    setShortName(row.meta?.shortName || '');
    setIdentifier(row.code);
    setGroupCode(row.meta?.groupCode || '');
    setDescription(row.meta?.description || '');
    setActive(row.isActive !== false);
    setIdentTouched(true);
    setError('');
  }

  function openEdit(row: DictItem) {
    fillFrom(row);
    setMode('edit');
  }

  async function openView(row: DictItem) {
    setViewRow(row);
    setViewTab('main');
    setHistory([]);
    setHistoryQ('');
    setMode('view');
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

  function currentGroupName() {
    return groups.find((g) => g.code === groupCode)?.name || '';
  }

  async function save() {
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const ident = (identifier.trim() || toIdentifier(name)).slice(0, 80);
    if (!ident) {
      setError('Укажите идентификатор');
      return;
    }
    if (!groupCode) {
      setError('Укажите группу показателей');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        code: ident,
        name: name.trim(),
        sortOrder: editId
          ? undefined
          : (rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1,
        isActive: active,
        meta: {
          shortName: shortName.trim(),
          description: description.trim(),
          groupCode,
          groupName: currentGroupName(),
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
        message: `Удалить выбранные показатели (${selected.size})?`,
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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/indicators?${qs}` : '/catalog/indicators', {
      scroll: false,
    });
  }

  function exportCsv() {
    downloadCsv(
      `indicators-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        'Краткое название': r.meta?.shortName || '',
        Идентификатор: r.code,
        Группа: groupOf(r),
        Описание: r.meta?.description || '',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  const histFiltered = useMemo(() => {
    const qq = historyQ.trim().toLowerCase();
    if (!qq) return history;
    return history.filter((h) =>
      [eventLabel(h.action), h.meta?.userName, h.meta?.name, h.meta?.code]
        .join(' ')
        .toLowerCase()
        .includes(qq),
    );
  }, [history, historyQ]);

  function renderForm(title: string) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title,
            siblings: [],
          }}
        />
        <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={formStyles.btnClose}
            onClick={() => setMode('list')}
          >
            Закрыть
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={formStyles.card} style={{ maxWidth: 720 }}>
          <div className={formStyles.field}>
            <label>
              Название <span className={formStyles.req}>*</span>
            </label>
            <input
              value={name}
              autoFocus
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (!identTouched) setIdentifier(toIdentifier(v));
              }}
            />
          </div>
          <div className={formStyles.field}>
            <label>Краткое название</label>
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
            />
          </div>
          <div className={formStyles.field}>
            <label>
              Идентификатор <span className={formStyles.req}>*</span>
            </label>
            <input
              value={identifier}
              onChange={(e) => {
                setIdentTouched(true);
                setIdentifier(e.target.value);
              }}
            />
          </div>
          <div className={formStyles.field}>
            <label>
              Группа показателей <span className={formStyles.req}>*</span>
            </label>
            <select
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
            >
              <option value="">Поиск...</option>
              {groups.map((g) => (
                <option key={g.id} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className={formStyles.statusBlock}>
            <span className={formStyles.fieldLabel}>Статус</span>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                onClick={() => setActive((v) => !v)}
                aria-pressed={active}
              />
              <span>Активный</span>
            </label>
          </div>
          <div className={formStyles.field}>
            <label>Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create' || mode === 'edit') {
    return renderForm(
      mode === 'edit' ? 'Показатель (изменение)' : 'Показатель (создание)',
    );
  }

  if (mode === 'view' && viewRow) {
    const meta = viewRow.meta || {};
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: 'Показатель (просмотр)',
            siblings: [],
          }}
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
              {viewRow.name}
              {viewRow.sortOrder ? ` (${viewRow.sortOrder})` : ''}
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
                  <label>Название</label>
                  <div className={local.readonly}>{viewRow.name}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Идентификатор</label>
                  <div className={local.readonly}>{viewRow.code || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Краткое название</label>
                  <div className={local.readonly}>{meta.shortName || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Группа показателей</label>
                  <div className={local.readonly}>
                    {meta.groupName || meta.groupCode || '—'}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Описание</label>
                  <div className={local.readonly}>{meta.description || '—'}</div>
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
                      <th>Название</th>
                      <th>Идентификатор</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histFiltered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      histFiltered.map((h) => (
                        <tr key={h.id}>
                          <td>{fmtDateTime(h.createdAt)}</td>
                          <td>{h.meta?.userName || '—'}</td>
                          <td>{eventLabel(h.action)}</td>
                          <td>{h.meta?.name || viewRow.name}</td>
                          <td>{h.meta?.code || viewRow.code}</td>
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
          />
        </td>
        <td className={styles.nameCell}>
          <span className={styles.nameText}>{row.name}</span>
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
        <td>{row.code}</td>
        <td>{row.meta?.description || ''}</td>
      </tr>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Показатели', siblings: [] }} />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'code',
                label: 'Идентификатор',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'group',
                label: 'Группа показателей',
                options: groups.map((g) => ({ value: g.code, label: g.name })),
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
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            Excel
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
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
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
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
              <th>Название</th>
              <th>Идентификатор</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {paged.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IndicatorsPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <IndicatorsPageInner />
    </Suspense>
  );
}
