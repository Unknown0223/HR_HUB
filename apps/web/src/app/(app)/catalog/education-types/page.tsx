'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
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
};

const DICT_CODE = 'edu';

const educationTypesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.education-types.v1',
  title: 'Виды образования',
  columns: [
    { key: 'code', label: 'Код' },
    { key: 'name', label: 'Название' },
  ],
  defaultColumns: ['code', 'name'],
  defaultSearchKeys: ['code', 'name'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function educationTypeCell(row: DictItem, key: string): string {
  switch (key) {
    case 'code':
      return row.code || '';
    case 'name':
      return row.name || '';
    default:
      return '';
  }
}

function EducationTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useTablePrefs(educationTypesListPrefs);
  const q = searchParams?.get('q') || '';

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);

  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : educationTypesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.code, r.name, String(r.sortOrder ?? '')]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, educationTypeCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=core');
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Виды образования» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      const items = [...(dict.items || [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'),
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
    setCode('');
    setName('');
    setSortOrder(String((rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1));
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    setEditId(row.id);
    setCode(row.code);
    setName(row.name);
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
      const body = {
        code:
          code.trim() ||
          name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
            .slice(0, 32),
        name: name.trim(),
        sortOrder: sortOrder.trim() === '' ? 0 : Number(sortOrder) || 0,
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
    if (!(await confirm(`Удалить вид образования «${row.name}»?`))) return;
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
    setSelected(new Set(displayRows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function exportCsv() {
    downloadCsv(
      `education-types-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = educationTypeCell(r, k);
        return obj;
      }),
    );
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/education-types?${qs}` : '/catalog/education-types',
      { scroll: false },
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav
        group={{
          title: 'Виды образования',
          siblings: [
            {
              label: 'Учебные заведения',
              href: '/catalog/institutions',
            },
            {
              label: 'Специальности',
              href: '/catalog/specialties',
            },
          ],
        }}
      />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-graduation-cap" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Виды образования</h1>
          <p className={shared.pageSubtitle}>
            Справочник видов образования сотрудников
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
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
                    displayRows.length > 0 && displayRows.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => toggleAll(e.target.checked)}
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
                  нет данных
                </td>
              </tr>
            ) : null}
            {displayRows.map((row) => {
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
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                      aria-label={`Выбрать ${row.name}`}
                    />
                  </td>
                  {visibleCols.map((key) => {
                    if (key === 'code') {
                      return <td key={key}>{row.code}</td>;
                    }
                    if (key === 'name') {
                      return (
                        <td key={key} className={styles.nameCell}>
                          <span className={styles.nameText}>{row.name}</span>
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
                      );
                    }
                    return (
                      <td key={key}>{educationTypeCell(row, key) || '—'}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode !== 'none'}
        title={
          mode === 'edit'
            ? 'Вид образования (изменение)'
            : 'Вид образования (создание)'
        }
        width="md"
        onClose={() => {
          setMode('none');
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
                setMode('none');
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
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>Порядковый номер</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
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

export default function EducationTypesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <EducationTypesPageInner />
    </Suspense>
  );
}
