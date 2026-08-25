'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';
import formStyles from './form.module.css';

type DynamicObjectRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  sortOrder?: number;
  isActive?: boolean;
  fieldCount?: number;
};

type DynamicFieldRow = {
  id: string;
  objectCode?: string | null;
};

/** kind: entity = Объекты, fact = Факты */
export function DynamicObjectsPageInner({ kind }: { kind: 'entity' | 'fact' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';
  const basePath =
    kind === 'fact' ? '/catalog/dynamic-facts' : '/catalog/dynamic-objects';

  const [rows, setRows] = useState<DynamicObjectRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [saving, setSaving] = useState(false);

  const title = kind === 'fact' ? 'Факты' : 'Объекты';

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [objsRaw, fieldsRaw] = await Promise.all([
        apiFetch<DynamicObjectRow[] | { items: DynamicObjectRow[] }>(
          '/api/catalog/dynamic-objects',
        ),
        apiFetch<DynamicFieldRow[] | { items: DynamicFieldRow[] }>(
          '/api/catalog/dynamic-fields',
        ).catch(() => [] as DynamicFieldRow[]),
      ]);
      const objs = Array.isArray(objsRaw)
        ? objsRaw
        : Array.isArray((objsRaw as { items?: DynamicObjectRow[] }).items)
          ? (objsRaw as { items: DynamicObjectRow[] }).items
          : [];
      const fields = Array.isArray(fieldsRaw)
        ? fieldsRaw
        : Array.isArray((fieldsRaw as { items?: DynamicFieldRow[] }).items)
          ? (fieldsRaw as { items: DynamicFieldRow[] }).items
          : [];
      const counts = new Map<string, number>();
      for (const f of fields) {
        const c = (f.objectCode || '').trim();
        if (!c) continue;
        counts.set(c, (counts.get(c) || 0) + 1);
      }
      setRows(
        objs
          .filter((o) => (o.kind || 'entity') === kind)
          .map((o) => ({
            ...o,
            fieldCount: counts.get(o.code) || 0,
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [kind]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  function openCreate() {
    setEditId(null);
    setFormName('');
    setFormCode('');
    setPanel('create');
  }

  function openEdit(row: DynamicObjectRow) {
    setEditId(row.id);
    setFormName(row.name);
    setFormCode(row.code);
    setPanel('edit');
    setFocusId(row.id);
  }

  async function save() {
    if (!formName.trim()) {
      setError('Укажите название');
      return;
    }
    if (!formCode.trim()) {
      setError('Укажите код');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: formName.trim(),
        code: formCode.trim(),
        kind,
        isActive: true,
      };
      if (editId) {
        await apiFetch(`/api/catalog/dynamic-objects/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/dynamic-objects', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setPanel('none');
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(row: DynamicObjectRow) {
    if (!(await confirm(`Удалить объект «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/dynamic-objects/${row.id}`, {
        method: 'DELETE',
      });
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `${kind === 'fact' ? 'facts' : 'objects'}-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        [title.slice(0, -1)]: r.name,
        'Динамические поля': r.fieldCount ?? 0,
        Код: r.code,
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
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
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel !== 'none' ? (
        <div className={formStyles.inlineForm}>
          <h2 className={formStyles.inlineTitle}>
            {panel === 'edit' ? `${title.slice(0, -1)} (изменение)` : `${title.slice(0, -1)} (создание)`}
          </h2>
          <div className={formStyles.inlineGrid}>
            <label>
              Название <span className={formStyles.req}>*</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </label>
            <label>
              Код <span className={formStyles.req}>*</span>
              <input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                disabled={panel === 'edit'}
              />
            </label>
          </div>
          <div className={formStyles.inlineActions}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={formStyles.btnClose}
              onClick={() => {
                setPanel('none');
                setEditId(null);
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{kind === 'fact' ? 'Факт' : 'Объект'}</th>
              <th>Динамические поля</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className={styles.empty}>
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
                  <td className={styles.nameCell}>
                    <span className={styles.nameText}>{row.name}</span>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button type="button" onClick={() => openEdit(row)}>
                          Изменить
                        </button>
                        <Link
                          href={`/catalog/dynamic-fields?object=${encodeURIComponent(row.code)}`}
                        >
                          Поля
                        </Link>
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
                  <td>{row.fieldCount ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ObjectsSuspense({ kind }: { kind: 'entity' | 'fact' }) {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <DynamicObjectsPageInner kind={kind} />
    </Suspense>
  );
}

export default function DynamicObjectsPage() {
  return <ObjectsSuspense kind="entity" />;
}
