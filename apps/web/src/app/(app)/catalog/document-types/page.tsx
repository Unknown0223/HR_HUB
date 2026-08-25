'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from './page.module.css';

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

function displayName(row: DictItem) {
  let n = row.name;
  if (row.meta?.isHireDocument && !/\(по умолчанию\)/i.test(n)) {
    n = `${n} (по умолчанию)`;
  }
  return n;
}

function DocumentTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.code, r.name, displayName(r)].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

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
      filtered.map((r) => ({
        Код: r.code,
        Название: r.name,
        'Документ при приеме': r.meta?.isHireDocument ? 'Да' : 'Нет',
        Обязательный: r.meta?.isMandatory ? 'Да' : 'Нет',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
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

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title:
              mode === 'edit'
                ? 'Тип документа (изменение)'
                : 'Тип документа (создание)',
            siblings: [
              { label: 'Типы документов', href: '/catalog/document-types' },
            ],
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
        <div className={formStyles.card} style={{ maxWidth: 640 }}>
          <div className={formStyles.field}>
            <label>Код</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className={formStyles.field}>
            <label>
              Название <span className={formStyles.req}>*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={formStyles.statusBlock}>
            <span className={formStyles.fieldLabel}>Документ при приеме</span>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${isHireDocument ? formStyles.toggleOn : ''}`}
                onClick={() => setIsHireDocument((v) => !v)}
              />
              <span>{isHireDocument ? 'Да' : 'Нет'}</span>
            </label>
          </div>
          <div className={formStyles.statusBlock}>
            <span className={formStyles.fieldLabel}>Статус</span>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                onClick={() => setActive((v) => !v)}
              />
              <span>Активный</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Типы документов', siblings }} />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <button
            type="button"
            className={local.btnOutline}
            disabled={!selected.size || busy}
            onClick={() => void setHireSelected()}
          >
            Установить как документ при приеме
            {selected.size ? ` ${selected.size}` : ''}
          </button>
          <button
            type="button"
            className={local.btnDanger}
            disabled={!selected.size || busy}
            onClick={() => void deleteSelected()}
          >
            Удалить{selected.size ? ` ${selected.size}` : ''}
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
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((r) => r.id)));
                  }}
                />
              </th>
              <th>Код</th>
              <th>Название</th>
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
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
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
                  <td>{row.code}</td>
                  <td className={styles.nameCell}>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DocumentTypesPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <DocumentTypesPageInner />
    </Suspense>
  );
}
