'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  EMPLOYMENT_SOURCE_TYPES,
  parseSourceType,
  sourceTypeLabel,
  type EmploymentSourceType,
} from '@/lib/employment-sources';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import extra from './page.module.css';

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
  meta?: { sourceType?: string } | null;
};

const DICT_CODE = 'employment_sources';
const FILTER_KEYS = ['q', 'sourceType', 'isActive'] as const;

function slugCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
    .slice(0, 32);
}

function EmploymentSourcesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const typeFilter = filters.sourceType;
  const activeFilter = filters.isActive;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(typeFilter || activeFilter),
  );

  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] =
    useState<EmploymentSourceType>('hire_and_dismissal');
  const [sortOrder, setSortOrder] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const kind = parseSourceType(r.meta);
      if (typeFilter && kind !== typeFilter) return false;
      if (activeFilter === '1' && r.isActive === false) return false;
      if (activeFilter === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const blob = [r.name, sourceTypeLabel(kind)].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, typeFilter, activeFilter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Dict[]>(
        '/api/settings/dictionaries?kind=extra',
      );
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Источники занятости» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
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

  function openCreate() {
    setEditId(null);
    setName('');
    setSourceType('hire_and_dismissal');
    setSortOrder(
      String((rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1),
    );
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    setEditId(row.id);
    setName(row.name);
    setSourceType(parseSourceType(row.meta));
    setSortOrder(row.sortOrder != null ? String(row.sortOrder) : '');
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
    setSaving(true);
    setError('');
    try {
      const existing = editId ? rows.find((r) => r.id === editId) : null;
      const body = {
        code: existing?.code || slugCode(name) || `SRC_${Date.now()}`,
        name: name.trim(),
        sortOrder: sortOrder.trim() === '' ? 0 : Number(sortOrder) || 0,
        isActive: active,
        meta: { sourceType },
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
      setMode('none');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(row: DictItem) {
    if (!dictId) return;
    if (!(await confirm(`Удалить источник занятости «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(
        `/api/settings/dictionaries/${dictId}/items/${row.id}/delete`,
        { method: 'POST' },
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      if (focusId === row.id) setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!dictId || !selected.size) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные источники (${selected.size})?`,
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
      `employment-sources-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        'Вид источника': sourceTypeLabel(parseSourceType(r.meta)),
        'Порядковый номер': r.sortOrder ?? '',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/employment-sources?${qs}` : '/catalog/employment-sources',
      { scroll: false },
    );
  }

  function renderSourceRow(row: DictItem) {
    const open = focusId === row.id;
    const kind = parseSourceType(row.meta);
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
            onChange={(e) => toggleOne(row.id, e.target.checked)}
            aria-label={`Выбрать ${row.name}`}
          />
        </td>
        <td className={styles.nameCell}>
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
                onClick={() => void runDelete(row)}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </td>
        <td>
          <span className={extra.typeChip}>{sourceTypeLabel(kind)}</span>
        </td>
      </tr>
    );
  }

  if (mode !== 'none') {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title:
              mode === 'edit'
                ? 'Источник занятости (изменение)'
                : 'Источник занятости (создание)',
            siblings: [],
          }}
        />
        <div className={formStyles.page}>
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
              onClick={() => setMode('none')}
            >
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={`${formStyles.card} ${formStyles.cardForm}`}>
            <div className={formStyles.field}>
              <label>
                Название <span className={formStyles.req}>*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className={formStyles.field}>
              <span className={formStyles.fieldLabel}>Вид источника</span>
              <div className={formStyles.radioRow} role="radiogroup">
                {EMPLOYMENT_SOURCE_TYPES.map((opt) => (
                  <label key={opt.value} className={formStyles.radio}>
                    <input
                      type="radio"
                      name="sourceType"
                      checked={sourceType === opt.value}
                      onChange={() => setSourceType(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className={`${formStyles.field} ${formStyles.sortField}`}>
              <label>Порядковый номер</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Источники занятости',
          siblings: [],
        }}
      />

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
              {
                type: 'select',
                key: 'sourceType',
                label: 'Вид источника',
                options: EMPLOYMENT_SOURCE_TYPES.map((o) => ({
                  value: o.value,
                  label: o.label,
                })),
              },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
            ]}
          />
          {selected.size > 0 ? (
            <button
              type="button"
              className={extra.btnDanger}
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
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Название</th>
              <th>Вид источника</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => renderSourceRow(row))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EmploymentSourcesPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <EmploymentSourcesPageInner />
    </Suspense>
  );
}
