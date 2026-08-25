'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDateTime } from '@/lib/currencies';
import {
  PRODUCTS,
  accessCatalog,
  asRoleMeta,
  asUserMeta,
  autoRoleCode,
  type AccessRow,
  type AppRole,
  type AppUser,
  type RoleMeta,
} from '@/lib/app-users';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../../catalog/cashboxes/page.module.css';
import ui from './page.module.css';

type Dict = { id: string; code: string; name: string; items?: AppRole[] };

const PATH = '/settings/users/roles';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'isActive'] as const;
const ACCESS_ROWS: AccessRow[] = accessCatalog();

const SIBLINGS = {
  title: 'Роли',
  siblings: [{ label: 'Пользователи', href: '/settings/users' }],
};

export type RolesSection = 'list' | 'products' | 'access';

function RolesInner({ section }: { section: RolesSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const selectedIds = (searchParams.get('ids') || '').split(',').filter(Boolean);

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<AppRole[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [grants, setGrants] = useState<Record<string, Record<string, boolean>>>({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(filters.name || filters.isActive));
  const [attachOpen, setAttachOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'view'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'main' | 'users' | 'forms' | 'products' | 'history'>('main');
  const [name, setName] = useState('');
  const [seq, setSeq] = useState('');
  const [active, setActive] = useState(true);
  const [productIds, setProductIds] = useState<string[]>(['verifix']);
  const [history, setHistory] = useState<
    { id: string; action: string; createdAt: string; meta?: { userName?: string } | null }[]
  >([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [admin, userList, access] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin'),
        apiFetch<AppUser[]>('/api/settings/users'),
        apiFetch<{ grants: Record<string, Record<string, boolean>> }>('/api/settings/role-access'),
      ]);
      const dict = (admin || []).find((d) => d.code === 'app_roles');
      if (!dict) {
        setError('Справочник «Роли» не найден');
        setDictId(null);
        setRows([]);
        return;
      }
      setDictId(dict.id);
      setRows(
        [...(dict.items || [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'),
        ),
      );
      setUsers(userList || []);
      setGrants(access.grants || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.name && !r.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      return r.name.toLowerCase().includes(qq);
    });
  }, [rows, q, filters.name, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filters.name, filters.isActive]);

  function userCount(roleId: string) {
    return users.filter((u) => (asUserMeta(u.meta).catalogRoleIds || []).includes(roleId)).length;
  }

  function formCount(roleId: string) {
    return Object.values(grants[roleId] || {}).filter(Boolean).length;
  }

  function fill(r?: AppRole) {
    setName(r?.name || '');
    setSeq(r?.sortOrder != null ? String(r.sortOrder) : '');
    setActive(r ? r.isActive !== false : true);
    setProductIds(asRoleMeta(r?.meta).products?.length ? asRoleMeta(r?.meta).products! : ['verifix']);
  }

  function openCreate() {
    setEditId(null);
    fill();
    setMode('create');
    setError('');
  }

  function openEdit(r: AppRole) {
    setEditId(r.id);
    fill(r);
    setMode('edit');
    setError('');
  }

  async function openView(r: AppRole) {
    setEditId(r.id);
    fill(r);
    setViewTab('main');
    setMode('view');
    setError('');
    try {
      const hist = await apiFetch<typeof history>(
        `/api/settings/audit?entity=DictionaryItem&entityId=${r.id}`,
      );
      setHistory(hist || []);
    } catch {
      setHistory([]);
    }
  }

  async function saveRole() {
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    const sortOrder = seq.trim() ? Number(seq) : existing?.sortOrder ?? rows.length + 1;
    const meta: RoleMeta = {
      ...asRoleMeta(existing?.meta),
      products: productIds,
    };
    setSaving(true);
    setError('');
    try {
      const body = {
        code: existing?.code || autoRoleCode(name),
        name: name.trim(),
        isActive: active,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        meta,
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
        message: label || `Удалить выбранные роли (${ids.length})?`,
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
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}/delete`, {
          method: 'POST',
        });
      }
      setSelected(new Set());
      setFocusId(null);
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function saveProducts() {
    if (!dictId) return;
    const ids = selectedIds.length ? selectedIds : Array.from(selected);
    if (!ids.length) {
      setError('Выберите роли');
      return;
    }
    setSaving(true);
    setError('');
    try {
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            meta: { ...asRoleMeta(row?.meta), products: productIds },
          }),
        });
      }
      setOk('Продукты сохранены');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    setSaving(true);
    setError('');
    setOk('');
    try {
      await apiFetch('/api/settings/role-access', {
        method: 'PATCH',
        body: JSON.stringify({ grants }),
      });
      setOk('Доступы сохранены');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const targetRoles = useMemo(() => {
    if (selectedIds.length) return rows.filter((r) => selectedIds.includes(r.id));
    return rows.filter((r) => r.isActive !== false);
  }, [rows, selectedIds]);

  const accessFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return ACCESS_ROWS;
    return ACCESS_ROWS.filter((r) => `${r.form} ${r.action}`.toLowerCase().includes(qq));
  }, [q]);

  const accessPageCount = Math.max(1, Math.ceil(accessFiltered.length / PAGE_SIZE));
  const accessPaged = accessFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (section === 'products') {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title: 'Роли (прикрепление продуктов)', siblings: [] }} />
        <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving}
            onClick={() => void saveProducts()}
          >
            Сохранить
          </button>
          <button type="button" className={formStyles.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {ok ? <p className={formStyles.ok}>{ok}</p> : null}
        <div className={ui.products}>
          {PRODUCTS.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={productIds.includes(p.id)}
                onChange={(e) =>
                  setProductIds((prev) =>
                    e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                  )
                }
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'access') {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title: 'Прикрепление доступов (действия)', siblings: [] }} />
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void saveAccess()}
            >
              Сохранить
            </button>
            <button type="button" className={formStyles.btnClose} onClick={() => router.push(PATH)}>
              Закрыть
            </button>
          </div>
          <div className={styles.rightTools}>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const params = new URLSearchParams(searchParams.toString());
                  if (searchDraft.trim()) params.set('q', searchDraft.trim());
                  else params.delete('q');
                  const qs = params.toString();
                  router.replace(qs ? `/settings/users/roles/access?${qs}` : '/settings/users/roles/access');
                }
              }}
            />
            <span className={styles.pagerMeta}>
              {accessFiltered.length} / {ACCESS_ROWS.length}
            </span>
            <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </button>
            <span className={styles.pagerMeta}>{Math.min(page, accessPageCount)}</span>
            <button
              type="button"
              className={styles.toolBtn}
              disabled={page >= accessPageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {ok ? <p className={formStyles.ok}>{ok}</p> : null}
        <div className={styles.tableWrap}>
          <table className={ui.matrix}>
            <thead>
              <tr>
                <th>Название формы</th>
                <th>Название действия</th>
                {targetRoles.map((r) => (
                  <th key={r.id}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accessPaged.map((row) => (
                <tr key={row.key}>
                  <td>{row.form}</td>
                  <td>{row.action}</td>
                  {targetRoles.map((r) => (
                    <td key={r.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(grants[r.id]?.[row.key])}
                        onChange={(e) =>
                          setGrants((prev) => ({
                            ...prev,
                            [r.id]: { ...(prev[r.id] || {}), [row.key]: e.target.checked },
                          }))
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mode !== 'list') {
    const viewRow = editId ? rows.find((r) => r.id === editId) : null;
    const meta = asRoleMeta(viewRow?.meta);
    if (mode === 'view' && viewRow) {
      return (
        <div className={styles.wrap}>
          <PageSubnav group={{ title: 'Роль (просмотр)', siblings: [] }} />
          <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
            <button type="button" className={styles.createBtn} onClick={() => openEdit(viewRow)}>
              Изменить
            </button>
            <button type="button" className={formStyles.btnClose} onClick={() => setMode('list')}>
              Закрыть
            </button>
          </div>
          <div className={local.viewLayout}>
            <aside className={local.side}>
              <div className={ui.sideName}>
                {viewRow.name} ({viewRow.code})
              </div>
              <span className={viewRow.isActive === false ? extra.badgeOff : extra.badge}>
                {viewRow.isActive === false ? 'Неактивный' : 'Активный'}
              </span>
              <nav className={local.sideNav}>
                {(
                  [
                    ['main', 'Основная информация'],
                    ['users', 'Пользователи'],
                    ['forms', 'Формы'],
                    ['products', 'Продукты'],
                    ['history', 'История изменений'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={viewTab === id ? local.sideNavOn : undefined}
                    onClick={() => setViewTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </aside>
            <div className={formStyles.card}>
              {viewTab === 'main' ? (
                <>
                  <h2 className={local.section}>Основная информация</h2>
                  <div className={local.viewGrid}>
                    <div className={formStyles.field}>
                      <label>Ф.И.О.</label>
                      <div className={local.readonly}>{viewRow.name}</div>
                    </div>
                    <div className={formStyles.field}>
                      <label>Порядковый номер</label>
                      <div className={local.readonly}>{String(viewRow.sortOrder ?? '')}</div>
                    </div>
                    <div className={formStyles.field}>
                      <label>Создал</label>
                      <div className={local.readonly}>{meta.createdBy || '—'}</div>
                    </div>
                    <div className={formStyles.field}>
                      <label>Изменил</label>
                      <div className={local.readonly}>{meta.updatedBy || '—'}</div>
                    </div>
                    <div className={formStyles.field}>
                      <label>Дата создания</label>
                      <div className={local.readonly}>{fmtDateTime(meta.createdAt) || '—'}</div>
                    </div>
                    <div className={formStyles.field}>
                      <label>Дата изменения</label>
                      <div className={local.readonly}>{fmtDateTime(meta.updatedAt) || '—'}</div>
                    </div>
                  </div>
                </>
              ) : null}
              {viewTab === 'users' ? (
                <div>
                  <h2 className={local.section}>Пользователи</h2>
                  {users
                    .filter((u) => (asUserMeta(u.meta).catalogRoleIds || []).includes(viewRow.id))
                    .map((u) => (
                      <div key={u.id} className={local.readonly} style={{ marginBottom: 6 }}>
                        {u.fullName}
                      </div>
                    ))}
                  {userCount(viewRow.id) === 0 ? <p className={styles.empty}>Нет данных</p> : null}
                </div>
              ) : null}
              {viewTab === 'forms' ? (
                <div>
                  <h2 className={local.section}>Формы</h2>
                  <p className={formStyles.muted}>Количество форм: {formCount(viewRow.id)}</p>
                </div>
              ) : null}
              {viewTab === 'products' ? (
                <div>
                  <h2 className={local.section}>Продукты</h2>
                  {(meta.products || []).map((p) => (
                    <div key={p} className={local.readonly} style={{ marginBottom: 6 }}>
                      {PRODUCTS.find((x) => x.id === p)?.label || p}
                    </div>
                  ))}
                </div>
              ) : null}
              {viewTab === 'history' ? (
                <div>
                  <h2 className={local.section}>История изменений</h2>
                  {history.length === 0 ? <p className={styles.empty}>Нет данных</p> : null}
                  {history.map((h) => (
                    <div key={h.id} className={local.readonly} style={{ marginBottom: 6 }}>
                      {fmtDateTime(h.createdAt)} — {h.meta?.userName || '—'} — {h.action}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: mode === 'edit' ? 'Роль (изменение)' : 'Роль (создание)',
            siblings: [],
          }}
        />
        <div className={formStyles.page}>
          <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void saveRole()}
            >
              Сохранить
            </button>
            <button type="button" className={formStyles.btnClose} onClick={() => setMode('list')}>
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={`${formStyles.card} ${formStyles.cardForm}`}>
            <div className={formStyles.field}>
              <label>
                Название <span className={formStyles.req}>*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={formStyles.field} style={{ maxWidth: 280 }}>
              <label>Порядковый номер</label>
              <input value={seq} onChange={(e) => setSeq(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label>Статус</label>
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
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={SIBLINGS} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
          {selected.size > 0 ? (
            <>
              <button
                type="button"
                className={local.btnDanger}
                disabled={busy}
                onClick={() => void deleteIds(Array.from(selected))}
              >
                Удалить {selected.size}
              </button>
              <button
                type="button"
                className={formStyles.btnSave}
                onClick={() =>
                  router.push(`${PATH}/products?ids=${Array.from(selected).join(',')}`)
                }
              >
                Прикрепить продукт для {selected.size} роли
              </button>
              <button
                type="button"
                className={formStyles.btnSave}
                onClick={() =>
                  router.push(`${PATH}/access?ids=${Array.from(selected).join(',')}`)
                }
              >
                Прикрепить доступ (действия) для {selected.size} роли
              </button>
            </>
          ) : null}
          <button type="button" className={formStyles.btnClose} onClick={() => router.push('/settings/users')}>
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const params = new URLSearchParams(searchParams.toString());
                if (searchDraft.trim()) params.set('q', searchDraft.trim());
                else params.delete('q');
                const qs = params.toString();
                router.replace(qs ? `${PATH}?${qs}` : PATH);
              }
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                'roles.csv',
                filtered.map((r) => ({
                  Название: r.name,
                  'Количество пользователей': userCount(r.id),
                  'Количество форм': formCount(r.id),
                  'Порядковый номер': r.sortOrder ?? '',
                  Статус: r.isActive === false ? 'Неактивный' : 'Активный',
                })),
              )
            }
          >
            Excel
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
          <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
            ↻
          </button>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th>Название</th>
              <th className={ui.num}>Количество пользователей</th>
              <th className={ui.num}>Количество форм</th>
              <th className={ui.num}>Порядковый номер</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((r) => {
                const open = focusId === r.id;
                return (
                  <tr
                    key={r.id}
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setFocusId(open ? null : r.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{r.name}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={() => void openView(r)}>
                            Просмотр
                          </button>
                          <button type="button" onClick={() => openEdit(r)}>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() => void deleteIds([r.id], `Удалить «${r.name}»?`)}
                          >
                            Удалить
                          </button>
                          <span className={ui.drop}>
                            <button type="button" onClick={() => setAttachOpen(attachOpen === r.id ? null : r.id)}>
                              Прикрепление ▾
                            </button>
                            {attachOpen === r.id ? (
                              <div className={ui.dropMenu}>
                                <button
                                  type="button"
                                  onClick={() => router.push(`${PATH}/products?ids=${r.id}`)}
                                >
                                  Продукты
                                </button>
                                <button
                                  type="button"
                                  onClick={() => router.push(`${PATH}/access?ids=${r.id}`)}
                                >
                                  Доступы (действия)
                                </button>
                              </div>
                            ) : null}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className={ui.num}>{userCount(r.id)}</td>
                    <td className={ui.num}>{formCount(r.id)}</td>
                    <td className={ui.num}>{r.sortOrder ?? ''}</td>
                    <td>
                      <span className={r.isActive === false ? extra.badgeOff : extra.badge}>
                        {r.isActive === false ? 'Неактивный' : 'Активный'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RolesAdminPage({ section }: { section: RolesSection }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <RolesInner section={section} />
    </Suspense>
  );
}
