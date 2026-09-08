'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { displayCode, storeCode } from '@/lib/nationality';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import shared from '../../../page-shared.module.css';

type Dict = { id: string; code: string; name: string; items?: DictItem[] };
type DictItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

const DICT_CODE = 'nationality';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'code', 'name', 'isActive'] as const;

const nationalityListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.nationality.v1',
  title: 'Национальность',
  columns: [
    { key: 'code', label: 'Код' },
    { key: 'name', label: 'Название' },
    { key: 'isActive', label: 'Статус' },
  ],
  defaultColumns: ['code', 'name'],
  defaultSearchKeys: ['code', 'name'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function nationalityCell(row: DictItem, key: string): string {
  switch (key) {
    case 'code':
      return displayCode(row.code);
    case 'name':
      return row.name || '';
    case 'isActive':
      return row.isActive === false ? 'Неактивный' : 'Активный';
    default:
      return '';
  }
}

function NationalityInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(nationalityListPrefs);
  const q = filters.q;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.code || filters.name || filters.isActive),
  );

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : nationalityListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    return rows.filter((r) => {
      const shown = displayCode(r.code);
      if (codeF && !shown.toLowerCase().includes(codeF) && !r.code.toLowerCase().includes(codeF)) {
        return false;
      }
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const blob = [shown, r.name, r.isActive === false ? 'неактивный' : 'активный']
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.code, filters.name, filters.isActive]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, nationalityCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return displayRows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [displayRows, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra');
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Национальность» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      setRows(
        [...(dict.items || [])].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      );
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
  }, [q, filters.code, filters.name, filters.isActive]);

  function openCreate() {
    setEditId(null);
    setCode('');
    setName('');
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    setEditId(row.id);
    setCode(displayCode(row.code));
    setName(row.name);
    setActive(row.isActive !== false);
    setMode('edit');
    setError('');
  }

  async function save() {
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    setSaving(true);
    setError('');
    try {
      const body = {
        code: storeCode(code, existing?.code),
        name: name.trim(),
        isActive: active,
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

  async function deleteIds(ids: string[], label?: string) {
    if (!dictId || !ids.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: label || `Удалить выбранные национальности (${ids.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of ids) {
        await apiFetch(
          `/api/settings/dictionaries/${dictId}/items/${id}/delete`,
          { method: 'POST' },
        );
      }
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/nationality?${qs}` : '/catalog/nationality', {
      scroll: false,
    });
  }

  function exportCsv() {
    downloadCsv(
      `nationality-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = nationalityCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav group={{ title: 'Национальность', siblings: [] }} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-flag" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Национальность</h1>
          <p className={shared.pageSubtitle}>
            Справочник национальностей
          </p>
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
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'name',
                label: 'Название',
                placeholder: 'Поиск...',
              },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          {selected.size > 0 ? (
            <button
              type="button"
              className={local.btnDanger}
              disabled={busy}
              onClick={() => void deleteIds(Array.from(selected))}
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
            aria-label="Поиск"
          />
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Предыдущая страница"
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            ›
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
            Обновить
          </button>
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
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
                    displayRows.length > 0 &&
                    displayRows.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(displayRows.map((r) => r.id)));
                  }}
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
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((row) => {
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
                        aria-label={`Выбрать ${row.name}`}
                      />
                    </td>
                    {visibleCols.map((key) => {
                      if (key === 'code') {
                        return <td key={key}>{displayCode(row.code)}</td>;
                      }
                      if (key === 'name') {
                        return (
                          <td key={key} className={styles.nameCell}>
                            <span className={styles.nameText}>{row.name}</span>
                            {row.isActive === false ? (
                              <span className={styles.statusMuted}>Неактивный</span>
                            ) : null}
                            {open ? (
                              <div
                                className={`${styles.inlineActions} ${styles.rowActions}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button type="button" onClick={() => openEdit(row)}>
                                  Изменить
                                </button>
                                <button
                                  type="button"
                                  className={styles.danger}
                                  disabled={busy}
                                  onClick={() =>
                                    void deleteIds([row.id], `Удалить «${row.name}»?`)
                                  }
                                >
                                  Удалить
                                </button>
                              </div>
                            ) : null}
                          </td>
                        );
                      }
                      if (key === 'isActive') {
                        return (
                          <td key={key}>
                            {row.isActive === false ? (
                              <span className={styles.statusMuted}>Неактивный</span>
                            ) : (
                              <span className={styles.statusActive}>Активный</span>
                            )}
                          </td>
                        );
                      }
                      return (
                        <td key={key}>{nationalityCell(row, key) || '—'}</td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode === 'create' || mode === 'edit'}
        title={
          mode === 'edit'
            ? 'Национальность (изменение)'
            : 'Национальность (создание)'
        }
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
          <label>Код</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>
            Название <span className={modal.req}>*</span>
          </label>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={modal.field}>
          <span>Статус</span>
          <label className={formStyles.toggleRow}>
            <button
              type="button"
              className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
              onClick={() => setActive((v) => !v)}
              aria-pressed={active}
            />
            <span>{active ? 'Активный' : 'Неактивный'}</span>
          </label>
        </div>
      </FormModal>
    </div>
  );
}

export default function NationalityPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <NationalityInner />
    </Suspense>
  );
}
