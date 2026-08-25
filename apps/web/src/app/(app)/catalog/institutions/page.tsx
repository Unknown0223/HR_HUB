'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';

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

const DICT_CODE = 'institutions';

function InstitutionsPageInner() {
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

  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.code, r.name].join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<Dict[]>('/api/settings/dictionaries?kind=core');
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Учебные заведения» не найден');
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
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    setEditId(row.id);
    setCode(row.code);
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
      };
      if (editId) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            code: body.code,
            name: body.name,
            isActive: body.isActive,
          }),
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
    if (!(await confirm(`Удалить учебное заведение «${row.name}»?`))) return;
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

  function exportCsv() {
    downloadCsv(
      `institutions-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Код: r.code,
        Название: r.name,
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/institutions?${qs}` : '/catalog/institutions',
      { scroll: false },
    );
  }

  if (mode !== 'none') {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title:
              mode === 'edit'
                ? 'Учебное заведение (изменение)'
                : 'Учебное заведение (создание)',
            siblings: [
              {
                label: 'Учебные заведения',
                href: '/catalog/institutions',
              },
            ],
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
          title: 'Учебные заведения',
          siblings: [
            {
              label: 'Виды образования',
              href: '/catalog/education-types',
            },
            {
              label: 'Специальности',
              href: '/catalog/specialties',
            },
          ],
        }}
      />

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
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                      aria-label={`Выбрать ${row.name}`}
                    />
                  </td>
                  <td>{row.code}</td>
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

export default function InstitutionsPage() {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <InstitutionsPageInner />
    </Suspense>
  );
}
