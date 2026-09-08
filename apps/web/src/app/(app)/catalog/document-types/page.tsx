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
import local from './page.module.css';
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
  meta?: {
    isHireDocument?: boolean;
    isMandatory?: boolean;
  } | null;
};

const DICT_CODE = 'doc_types';

type Mode = 'list' | 'create' | 'edit' | 'view';

const documentTypesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.document-types.v1',
  title: 'Типы документов',
  columns: [
    { key: 'code', label: 'Код' },
    { key: 'name', label: 'Название' },
  ],
  defaultColumns: ['code', 'name'],
  defaultSearchKeys: ['code', 'name'],
  defaultSort: [{ key: 'name', dir: 'asc' }],
});

function displayName(row: DictItem) {
  let n = row.name;
  if (row.meta?.isHireDocument && !/\(по умолчанию\)/i.test(n)) {
    n = `${n} (по умолчанию)`;
  }
  return n;
}

function documentTypeCell(row: DictItem, key: string): string {
  switch (key) {
    case 'code':
      return row.code || '';
    case 'name':
      return displayName(row);
    default:
      return '';
  }
}

function DocumentTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useTablePrefs(documentTypesListPrefs);
  const q = searchParams?.get('q') || '';

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);

  const [mode, setMode] = useState<Mode>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<DictItem | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isHireDocument, setIsHireDocument] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : documentTypesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.code, r.name, displayName(r)].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, documentTypeCell),
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
        setError('Справочник «Типы документов» не найден');
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
    setCode('');
    setName('');
    setIsHireDocument(false);
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    setEditId(row.id);
    setCode(row.code);
    setName(row.name.replace(/\s*\(по умолчанию\)\s*$/i, ''));
    setIsHireDocument(Boolean(row.meta?.isHireDocument));
    setActive(row.isActive !== false);
    setMode('edit');
    setError('');
  }

  function openView(row: DictItem) {
    setViewRow(row);
    setMode('view');
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
        sortOrder: editId
          ? undefined
          : (rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1,
        isActive: active,
        meta: {
          isHireDocument,
          isMandatory: editId
            ? Boolean(rows.find((r) => r.id === editId)?.meta?.isMandatory)
            : false,
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

  async function patchMeta(
    row: DictItem,
    patch: { isHireDocument?: boolean; isMandatory?: boolean },
  ) {
    if (!dictId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/settings/dictionaries/${dictId}/items/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          meta: {
            isHireDocument:
              patch.isHireDocument ?? Boolean(row.meta?.isHireDocument),
            isMandatory: patch.isMandatory ?? Boolean(row.meta?.isMandatory),
          },
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function setHireSelected() {
    if (!dictId || !selected.size) return;
    setBusy(true);
    try {
      for (const id of selected) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            meta: {
              isHireDocument: true,
              isMandatory: Boolean(row.meta?.isMandatory),
            },
          }),
        });
      }
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!dictId || !selected.size) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные типы (${selected.size})?`,
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(row: DictItem) {
    if (!dictId) return;
    if (!(await confirm(`Удалить тип «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(
        `/api/settings/dictionaries/${dictId}/items/${row.id}/delete`,
        { method: 'POST' },
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/document-types?${qs}` : '/catalog/document-types',
      { scroll: false },
    );
  }

  function exportCsv() {
    downloadCsv(
      `document-types-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = documentTypeCell(r, k);
        return obj;
      }),
    );
  }

  const siblings = [
    {
      label: 'Исключения по документам при приеме',
      href: '/catalog/hire-document-exceptions',
    },
  ];

  if (mode === 'view' && viewRow) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: 'Тип документа (просмотр)',
            siblings: [{ label: 'Типы документов', href: '/catalog/document-types' }],
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
            <div className={local.sideTitle}>{viewRow.name}</div>
            <span
              className={
                viewRow.isActive === false
                  ? styles.statusMuted
                  : styles.statusActive
              }
            >
              {viewRow.isActive === false ? 'Неактивный' : 'Активный'}
            </span>
            <nav className={local.sideNav}>
              <button type="button" className={local.sideNavOn}>
                Основная информация
              </button>
            </nav>
          </aside>
          <div className={formStyles.card}>
            <h2 className={local.section}>Основная информация</h2>
            <div className={local.viewGrid}>
              <div className={formStyles.field}>
                <label>Код</label>
                <div className={local.readonly}>{viewRow.code || '—'}</div>
              </div>
              <div className={formStyles.field}>
                <label>Название</label>
                <div className={local.readonly}>{viewRow.name}</div>
              </div>
              <div className={formStyles.field}>
                <label>Документ при приеме</label>
                <div className={local.readonly}>
                  {viewRow.meta?.isHireDocument ? 'Да' : 'Нет'}
                </div>
              </div>
              <div className={formStyles.field}>
                <label>Обязательный</label>
                <div className={local.readonly}>
                  {viewRow.meta?.isMandatory ? 'Да' : 'Нет'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav group={{ title: 'Типы документов', siblings }} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-file-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Типы документов</h1>
          <p className={shared.pageSubtitle}>
            Справочник типов кадровых документов
          </p>
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
            className={local.btnOutline}
            disabled={!selected.size || busy}
            onClick={() => void setHireSelected()}
          >
            <i className="fas fa-file-signature" aria-hidden />
            Установить как документ при приеме
            {selected.size ? ` (${selected.size})` : ''}
          </button>
          <button
            type="button"
            className={local.btnDanger}
            disabled={!selected.size || busy}
            onClick={() => void deleteSelected()}
          >
            <i className="fas fa-trash-alt" aria-hidden />
            Удалить{selected.size ? ` (${selected.size})` : ''}
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
          <span className={styles.pagerMeta} title="Показано / всего">
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
                    displayRows.length > 0 &&
                    displayRows.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(displayRows.map((r) => r.id)));
                  }}
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
                  {visibleCols.map((key) => {
                    if (key === 'code') {
                      return <td key={key}>{row.code}</td>;
                    }
                    if (key === 'name') {
                      return (
                        <td key={key} className={styles.nameCell}>
                          <span className={styles.nameText}>{displayName(row)}</span>
                          {open ? (
                            <div
                              className={`${styles.inlineActions} ${styles.rowActions}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button type="button" onClick={() => openView(row)}>
                                Просмотреть
                              </button>
                              <button type="button" onClick={() => openEdit(row)}>
                                Изменить
                              </button>
                              <button
                                type="button"
                                disabled={busy || row.meta?.isMandatory}
                                onClick={() =>
                                  void patchMeta(row, { isMandatory: true })
                                }
                              >
                                Сделать обязательным
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
                      <td key={key}>{documentTypeCell(row, key) || '—'}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode === 'create' || mode === 'edit'}
        title={
          mode === 'edit'
            ? 'Тип документа (изменение)'
            : 'Тип документа (создание)'
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
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={modal.field}>
          <span>Документ при приеме</span>
          <label className={formStyles.toggleRow}>
            <button
              type="button"
              className={`${formStyles.toggle} ${isHireDocument ? formStyles.toggleOn : ''}`}
              onClick={() => setIsHireDocument((v) => !v)}
            />
            <span>{isHireDocument ? 'Да' : 'Нет'}</span>
          </label>
        </div>
        <div className={modal.field}>
          <span>Статус</span>
          <label className={formStyles.toggleRow}>
            <button
              type="button"
              className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
              onClick={() => setActive((v) => !v)}
            />
            <span>{active ? 'Активный' : 'Неактивный'}</span>
          </label>
        </div>
      </FormModal>
    </div>
  );
}

export default function DocumentTypesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <DocumentTypesPageInner />
    </Suspense>
  );
}
