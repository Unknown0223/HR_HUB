'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import {
  DEFAULT_ROLES,
  asArtixConfig,
  genCode,
  genPassword,
  newId,
  type ArtixConfig,
  type ArtixDivision,
  type ArtixError,
  type ArtixRole,
  type ArtixUser,
} from '@/lib/artix';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import extra from './page.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  webhookUrl?: string | null;
  config?: ArtixConfig | null;
};

type Opt = { id: string; label: string };

export type ArtixSection = 'settings' | 'divisions' | 'users' | 'errors' | 'roles';

const FILTER_KEYS = [
  'q',
  'name',
  'code',
  'division',
  'position',
  'role',
  'blocked',
  'from',
  'to',
  'status',
  'store',
] as const;

const NAV: { id: ArtixSection; href: string; label: string }[] = [
  { id: 'settings', href: '/settings/artix', label: 'Настройки' },
  { id: 'divisions', href: '/settings/artix/divisions', label: 'Подразделения' },
  { id: 'users', href: '/settings/artix/users', label: 'Пользователи' },
  { id: 'errors', href: '/settings/artix/errors', label: 'Журнал ошибок' },
];

export function ArtixPage({ section }: { section: ArtixSection }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <ArtixInner section={section} />
    </Suspense>
  );
}

function ArtixInner({ section }: { section: ArtixSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [row, setRow] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<ArtixConfig>({});
  const [enabled, setEnabled] = useState(false);
  const [lookups, setLookups] = useState<{
    employees: Opt[];
    divisions: Opt[];
    positions: Opt[];
    templates: Opt[];
  }>({ employees: [], divisions: [], positions: [], templates: [] });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [divModal, setDivModal] = useState(false);
  const [divDivisionId, setDivDivisionId] = useState('');
  const [divExternalId, setDivExternalId] = useState('');
  const [editDivId, setEditDivId] = useState<string | null>(null);
  const [userModal, setUserModal] = useState(false);
  const [userDraft, setUserDraft] = useState<Partial<ArtixUser>>({});
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const divisions = cfg.divisions || [];
  const users = cfg.users || [];
  const errorsList = cfg.errors || [];
  const roles = cfg.roles?.length ? cfg.roles : DEFAULT_ROLES;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lu] = await Promise.all([
        apiFetch<Integration[]>('/api/settings/integrations'),
        apiFetch<{
          employees?: Opt[];
          divisions?: Opt[];
          positions?: Opt[];
          clearanceTemplates?: Opt[];
        }>('/api/catalog/lookups'),
      ]);
      const found =
        (list || []).find((i) => asArtixConfig(i.config).sys === 'artix') ||
        (list || []).find((i) => i.name.toLowerCase().includes('artix'));
      if (!found) {
        setError('Интеграция ARTIX не найдена');
        setRow(null);
        return;
      }
      const next = asArtixConfig(found.config);
      setRow(found);
      setCfg(next);
      setEnabled(found.isActive);
      setDirty(false);
      setLookups({
        employees: lu.employees || [],
        divisions: lu.divisions || [],
        positions: lu.positions || [],
        templates: lu.clearanceTemplates || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(patch: {
    isActive?: boolean;
    webhookUrl?: string | null;
    config?: ArtixConfig;
  }) {
    if (!row) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const updated = await apiFetch<Integration>(
        `/api/settings/integrations/${row.id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      setRow(updated);
      setCfg(asArtixConfig(updated.config));
      setEnabled(updated.isActive);
      setDirty(false);
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function applySearch(path: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const filteredDivs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const extF = (filters.code || '').trim().toLowerCase();
    return divisions.filter((d) => {
      if (nameF && !d.divisionName.toLowerCase().includes(nameF)) return false;
      if (extF && !d.externalId.toLowerCase().includes(extF)) return false;
      if (!qq) return true;
      return `${d.divisionName} ${d.externalId}`.toLowerCase().includes(qq);
    });
  }, [divisions, q, filters.name, filters.code]);

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return users.filter((u) => {
      if (filters.name && !u.name.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.code && !u.code.toLowerCase().includes(filters.code.toLowerCase()))
        return false;
      if (filters.division && u.divisionId !== filters.division) return false;
      if (filters.position && u.positionId !== filters.position) return false;
      if (filters.role && !(u.roles || '').toLowerCase().includes(filters.role.toLowerCase()))
        return false;
      if (filters.blocked === '1' && !u.blocked) return false;
      if (filters.blocked === '0' && u.blocked) return false;
      if (!qq) return true;
      return [u.name, u.code, u.login, u.divisionName, u.positionName, u.roles]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [users, q, filters]);

  const filteredErrors = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return errorsList.filter((e) => {
      if (filters.from && e.createdAt.slice(0, 10) < filters.from) return false;
      if (filters.to && e.createdAt.slice(0, 10) > filters.to) return false;
      if (filters.status && e.status !== filters.status) return false;
      if (filters.store && !e.store.toLowerCase().includes(filters.store.toLowerCase()))
        return false;
      if (!qq) return true;
      return [e.createdAt, e.status, e.store, e.request, e.response]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [errorsList, q, filters.from, filters.to, filters.status, filters.store]);

  const filteredRoles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    return roles.filter((r) => {
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (!qq) return true;
      return r.name.toLowerCase().includes(qq);
    });
  }, [roles, q, filters.name]);

  async function saveSettings() {
    await persist({
      isActive: enabled,
      webhookUrl: cfg.soapUrl || null,
      config: {
        sys: 'artix',
        soapUrl: cfg.soapUrl,
        login: cfg.login,
        password: cfg.password,
        manualAttach: cfg.manualAttach,
        badgeTemplateIds: cfg.badgeTemplateIds,
        extraPositions: cfg.extraPositions,
      },
    });
  }

  async function saveDivisions(next: ArtixDivision[]) {
    await persist({ config: { divisions: next } });
  }

  async function saveUsers(next: ArtixUser[]) {
    await persist({ config: { users: next } });
  }

  async function saveRoles(next: ArtixRole[]) {
    await persist({ config: { roles: next } });
  }

  function shell(children: ReactNode) {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: 'Настройки ARTIX',
            siblings: [{ label: 'Список ролей ARTIX', href: '/settings/artix/roles' }],
          }}
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        {ok ? <p className={formStyles.ok}>{ok}</p> : null}
        <div className={extra.layout}>
          <aside className={extra.side}>
            {NAV.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={section === n.id ? extra.sideOn : extra.sideLink}
              >
                {n.label}
              </Link>
            ))}
          </aside>
          {children}
        </div>
      </div>
    );
  }

  function listTools(path: string, shown: number, total: number, onExcel: () => void) {
    return (
      <div className={styles.rightTools}>
        <input
          className={styles.search}
          placeholder="Поиск..."
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applySearch(path);
          }}
        />
        <FilterPanel
          inline
          urlSync
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          fields={
            section === 'divisions'
              ? [
                  { type: 'text', key: 'name', label: 'Подразделение', placeholder: 'Поиск...' },
                  {
                    type: 'text',
                    key: 'code',
                    label: 'Внешний ИД подразделения',
                    placeholder: 'Поиск...',
                  },
                ]
              : section === 'users'
                ? [
                    { type: 'text', key: 'name', label: 'Пользователь', placeholder: 'Поиск...' },
                    { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
                    {
                      type: 'select',
                      key: 'division',
                      label: 'Подразделение',
                      options: lookups.divisions.map((d) => ({
                        value: d.id,
                        label: d.label,
                      })),
                    },
                    {
                      type: 'select',
                      key: 'position',
                      label: 'Должность',
                      options: lookups.positions.map((p) => ({
                        value: p.id,
                        label: p.label,
                      })),
                    },
                    { type: 'text', key: 'role', label: 'Роли', placeholder: 'Поиск...' },
                    {
                      type: 'select',
                      key: 'blocked',
                      label: 'Заблокировано',
                      options: [
                        { value: '1', label: 'Да' },
                        { value: '0', label: 'Нет' },
                      ],
                    },
                  ]
                : section === 'errors'
                  ? [
                      {
                        type: 'dateRange',
                        fromKey: 'from',
                        toKey: 'to',
                        label: 'Дата создания',
                      },
                      { type: 'text', key: 'status', label: 'Состояние', placeholder: 'Поиск...' },
                      { type: 'text', key: 'store', label: 'Магазин', placeholder: 'Поиск...' },
                    ]
                  : [
                      {
                        type: 'text',
                        key: 'name',
                        label: 'Название',
                        placeholder: 'Поиск...',
                      },
                    ]
          }
        />
        <button type="button" className={styles.exportBtn} onClick={onExcel}>
          Excel
        </button>
        <span className={styles.pagerMeta}>
          {shown} / {total}
        </span>
        <button type="button" className={styles.toolBtn} onClick={() => void load()}>
          ↻
        </button>
      </div>
    );
  }

  if (loading && !row) {
    return shell(<p className={styles.empty}>Загрузка…</p>);
  }

  if (section === 'settings') {
    return shell(
      <div className={extra.card}>
        <div className={extra.cardHead}>
          <h2 className={extra.cardTitle}>Настройки</h2>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving || !dirty}
            onClick={() => void saveSettings()}
          >
            Сохранить
          </button>
        </div>
        <div className={extra.fields}>
          <div className={formStyles.statusBlock}>
            <label className={formStyles.toggleRow}>
              <button
                type="button"
                className={`${formStyles.toggle} ${enabled ? formStyles.toggleOn : ''}`}
                onClick={() => {
                  setEnabled((v) => !v);
                  setDirty(true);
                }}
                aria-pressed={enabled}
              />
              <span>{enabled ? 'Интеграция включена' : 'Интеграция отключена'}</span>
            </label>
          </div>
          {enabled ? (
            <>
              <div className={formStyles.field}>
                <label>
                  URL адрес SOAP сервиса <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={cfg.soapUrl || ''}
                  onChange={(e) => {
                    setCfg((c) => ({ ...c, soapUrl: e.target.value }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Логин <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={cfg.login || ''}
                  onChange={(e) => {
                    setCfg((c) => ({ ...c, login: e.target.value }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Пароль <span className={formStyles.req}>*</span>
                </label>
                <input
                  type="password"
                  value={cfg.password || ''}
                  onChange={(e) => {
                    setCfg((c) => ({ ...c, password: e.target.value }));
                    setDirty(true);
                  }}
                />
              </div>
              <div className={formStyles.statusBlock}>
                <label className={formStyles.toggleRow}>
                  <button
                    type="button"
                    className={`${formStyles.toggle} ${cfg.manualAttach ? formStyles.toggleOn : ''}`}
                    onClick={() => {
                      setCfg((c) => ({ ...c, manualAttach: !c.manualAttach }));
                      setDirty(true);
                    }}
                    aria-pressed={Boolean(cfg.manualAttach)}
                  />
                  <span>Ручное прикрепление сотрудников</span>
                </label>
              </div>
              <div className={formStyles.field}>
                <label>Шаблоны бейджей</label>
                <SearchLookup
                  value={(cfg.badgeTemplateIds || [])[0] || ''}
                  options={lookups.templates}
                  allowClear
                  onChange={(id) => {
                    setCfg((c) => ({
                      ...c,
                      badgeTemplateIds: id ? [id] : [],
                    }));
                    setDirty(true);
                  }}
                />
              </div>
              {(cfg.extraPositions || []).map((p, i) => (
                <div key={i} className={extra.extraPos}>
                  <input
                    value={p}
                    placeholder="Должность"
                    onChange={(e) => {
                      setCfg((c) => {
                        const next = [...(c.extraPositions || [])];
                        next[i] = e.target.value;
                        return { ...c, extraPositions: next };
                      });
                      setDirty(true);
                    }}
                  />
                  <button
                    type="button"
                    className={formStyles.btnClose}
                    onClick={() => {
                      setCfg((c) => ({
                        ...c,
                        extraPositions: (c.extraPositions || []).filter((_, j) => j !== i),
                      }));
                      setDirty(true);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={extra.addLink}
                onClick={() => {
                  setCfg((c) => ({
                    ...c,
                    extraPositions: [...(c.extraPositions || []), ''],
                  }));
                  setDirty(true);
                }}
              >
                + Добавить должность
              </button>
            </>
          ) : null}
        </div>
      </div>,
    );
  }

  if (section === 'divisions') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => {
                setEditDivId(null);
                setDivDivisionId('');
                setDivExternalId('');
                setDivModal(true);
              }}
            >
              Добавить
            </button>
            {selected.size > 0 ? (
              <button
                type="button"
                className={extra.btnDanger}
                disabled={saving}
                onClick={() => {
                  void confirm({
                    message: `Удалить выбранные подразделения (${selected.size})?`,
                    variant: 'danger',
                    confirmText: 'Удалить',
                  }).then((ok) => {
                    if (!ok) return;
                    void saveDivisions(divisions.filter((d) => !selected.has(d.id))).then(
                      () => setSelected(new Set()),
                    );
                  });
                }}
              >
                Удалить {selected.size}
              </button>
            ) : null}
          </div>
          {listTools('/settings/artix/divisions', filteredDivs.length, divisions.length, () =>
            downloadCsv(
              `artix-divisions.csv`,
              filteredDivs.map((d) => ({
                Подразделение: d.divisionName,
                'Внешний ИД подразделения': d.externalId,
              })),
            ),
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredDivs.length > 0 &&
                      filteredDivs.every((d) => selected.has(d.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filteredDivs.map((d) => d.id))
                          : new Set(),
                      )
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Подразделение</th>
                <th>Внешний ИД подразделения</th>
              </tr>
            </thead>
            <tbody>
              {filteredDivs.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredDivs.map((d) => {
                  const open = focusId === d.id;
                  return (
                    <tr
                      key={d.id}
                      className={open ? styles.rowSelected : undefined}
                      onClick={() => setFocusId(open ? null : d.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(d.id);
                              else next.delete(d.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className={styles.nameCell}>
                        <span className={styles.nameText}>{d.divisionName}</span>
                        {open ? (
                          <div
                            className={`${styles.inlineActions} ${styles.rowActions}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setEditDivId(d.id);
                                setDivDivisionId(d.divisionId);
                                setDivExternalId(d.externalId);
                                setDivModal(true);
                              }}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() =>
                                void confirm({
                                  message: `Удалить «${d.divisionName}»?`,
                                  variant: 'danger',
                                  confirmText: 'Удалить',
                                }).then((ok) => {
                                  if (!ok) return;
                                  void saveDivisions(divisions.filter((x) => x.id !== d.id));
                                })
                              }
                            >
                              Удалить
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>{d.externalId}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {divModal ? (
          <div className={extra.overlay} onClick={() => setDivModal(false)}>
            <div className={extra.modal} onClick={(e) => e.stopPropagation()}>
              <h3 className={extra.modalTitle}>
                {editDivId ? 'Изменение подразделения' : 'Добавление подразделения'}
              </h3>
              <div className={formStyles.field}>
                <label>
                  Подразделение <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={divDivisionId}
                  options={lookups.divisions}
                  onChange={setDivDivisionId}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Внешний ИД подразделения <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={divExternalId}
                  onChange={(e) => setDivExternalId(e.target.value)}
                />
              </div>
              <div className={extra.modalFooter}>
                <button
                  type="button"
                  className={formStyles.btnSave}
                  disabled={saving}
                  onClick={() => {
                    const div = lookups.divisions.find((x) => x.id === divDivisionId);
                    if (!divDivisionId || !divExternalId.trim()) {
                      setError('Заполните обязательные поля');
                      return;
                    }
                    const payload = {
                      id: editDivId || newId(),
                      divisionId: divDivisionId,
                      divisionName: div?.label || '',
                      externalId: divExternalId.trim(),
                    };
                    const next = editDivId
                      ? divisions.map((x) => (x.id === editDivId ? payload : x))
                      : [...divisions, payload];
                    void saveDivisions(next).then(() => {
                      setDivModal(false);
                      setEditDivId(null);
                    });
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className={formStyles.btnClose}
                  onClick={() => setDivModal(false)}
                >
                  Отменить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>,
    );
  }

  if (section === 'users') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <div className={extra.searchWrap}>
              <button
                type="button"
                className={styles.createBtn}
                onClick={() => setAddOpen((v) => !v)}
              >
                Добавить ▾
              </button>
              {addOpen ? (
                <div className={extra.menu}>
                  <button
                    type="button"
                    className={extra.opt}
                    onClick={() => {
                      setAddOpen(false);
                      setUserDraft({
                        code: genCode(),
                        password: genPassword(),
                        blocked: false,
                      });
                      setEditUserId(null);
                      setUserModal(true);
                    }}
                  >
                    Добавить
                  </button>
                  <button
                    type="button"
                    className={extra.opt}
                    onClick={() => router.push('/settings/artix/users/import')}
                  >
                    Импорт
                  </button>
                </div>
              ) : null}
            </div>
            <Link href="/settings/artix/users/import" className={styles.exportBtn}>
              Импорт
            </Link>
            {selected.size > 0 ? (
              <button
                type="button"
                className={extra.btnDanger}
                disabled={saving}
                onClick={() => {
                  void confirm({
                    message: `Удалить выбранных пользователей (${selected.size})?`,
                    variant: 'danger',
                    confirmText: 'Удалить',
                  }).then((ok) => {
                    if (!ok) return;
                    void saveUsers(users.filter((u) => !selected.has(u.id))).then(() =>
                      setSelected(new Set()),
                    );
                  });
                }}
              >
                Удалить {selected.size}
              </button>
            ) : null}
          </div>
          {listTools('/settings/artix/users', filteredUsers.length, users.length, () =>
            downloadCsv(
              `artix-users.csv`,
              filteredUsers.map((u) => ({
                Пользователь: u.name,
                Код: u.code,
                Подразделение: u.divisionName || '',
                Должность: u.positionName || '',
                Роли: u.roles || '',
                Заблокировано: u.blocked ? 'Да' : 'Нет',
              })),
            ),
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredUsers.length > 0 &&
                      filteredUsers.every((u) => selected.has(u.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filteredUsers.map((u) => u.id))
                          : new Set(),
                      )
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Пользователь</th>
                <th>Код</th>
                <th>Подразделение</th>
                <th>Должность</th>
                <th>Роли</th>
                <th>Заблокировано</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const open = focusId === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={open ? styles.rowSelected : undefined}
                      onClick={() => setFocusId(open ? null : u.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(u.id);
                              else next.delete(u.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className={styles.nameCell}>
                        <span className={styles.nameText}>{u.name}</span>
                        {open ? (
                          <div
                            className={`${styles.inlineActions} ${styles.rowActions}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setEditUserId(u.id);
                                setUserDraft({ ...u });
                                setUserModal(true);
                              }}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void saveUsers(
                                  users.map((x) =>
                                    x.id === u.id ? { ...x, blocked: !x.blocked } : x,
                                  ),
                                )
                              }
                            >
                              {u.blocked ? 'Разблокировать' : 'Заблокировать'}
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={() =>
                                void confirm({
                                  message: `Удалить «${u.name}»?`,
                                  variant: 'danger',
                                  confirmText: 'Удалить',
                                }).then((ok) => {
                                  if (!ok) return;
                                  void saveUsers(users.filter((x) => x.id !== u.id));
                                })
                              }
                            >
                              Удалить
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td>{u.code}</td>
                      <td>{u.divisionName || '—'}</td>
                      <td>{u.positionName || '—'}</td>
                      <td>{u.roles || '—'}</td>
                      <td>{u.blocked ? 'Да' : 'Нет'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {userModal ? (
          <div className={extra.overlay} onClick={() => setUserModal(false)}>
            <div className={extra.modal} onClick={(e) => e.stopPropagation()}>
              <h3 className={extra.modalTitle}>
                {editUserId ? 'Изменение пользователя' : 'Добавление пользователя'}
              </h3>
              <div className={formStyles.field}>
                <label>Подразделение</label>
                <SearchLookup
                  value={userDraft.divisionId || ''}
                  options={lookups.divisions}
                  allowClear
                  onChange={(id) => {
                    const d = lookups.divisions.find((x) => x.id === id);
                    setUserDraft((u) => ({
                      ...u,
                      divisionId: id,
                      divisionName: d?.label,
                    }));
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>Должность</label>
                <SearchLookup
                  value={userDraft.positionId || ''}
                  options={lookups.positions}
                  allowClear
                  onChange={(id) => {
                    const p = lookups.positions.find((x) => x.id === id);
                    setUserDraft((u) => ({
                      ...u,
                      positionId: id,
                      positionName: p?.label,
                    }));
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>Роли</label>
                <SearchLookup
                  value={roles.find((r) => r.name === userDraft.roles)?.id || ''}
                  options={roles.map((r) => ({ id: r.id, label: r.name }))}
                  allowClear
                  onChange={(id) => {
                    const r = roles.find((x) => x.id === id);
                    setUserDraft((u) => ({ ...u, roles: r?.name || '' }));
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Пользователь <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={userDraft.employeeId || ''}
                  options={lookups.employees}
                  onChange={(id) => {
                    const e = lookups.employees.find((x) => x.id === id);
                    setUserDraft((u) => ({
                      ...u,
                      employeeId: id,
                      name: e?.label || '',
                    }));
                  }}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Код <span className={formStyles.req}>*</span>
                </label>
                <div className={extra.inputWithBtn}>
                  <input
                    value={userDraft.code || ''}
                    onChange={(e) => setUserDraft((u) => ({ ...u, code: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => setUserDraft((u) => ({ ...u, code: genCode() }))}
                  >
                    ↻
                  </button>
                </div>
              </div>
              <div className={formStyles.field}>
                <label>
                  Логин <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={userDraft.login || ''}
                  onChange={(e) => setUserDraft((u) => ({ ...u, login: e.target.value }))}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Пароль <span className={formStyles.req}>*</span>
                </label>
                <div className={extra.inputWithBtn}>
                  <input
                    value={userDraft.password || ''}
                    onChange={(e) =>
                      setUserDraft((u) => ({ ...u, password: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() =>
                      setUserDraft((u) => ({ ...u, password: genPassword() }))
                    }
                  >
                    ↻
                  </button>
                </div>
              </div>
              <div className={extra.modalFooter}>
                <button
                  type="button"
                  className={formStyles.btnSave}
                  disabled={saving}
                  onClick={() => {
                    if (
                      !userDraft.name ||
                      !userDraft.code ||
                      !userDraft.login ||
                      (!editUserId && !userDraft.password)
                    ) {
                      setError('Заполните обязательные поля');
                      return;
                    }
                    const payload: ArtixUser = {
                      id: editUserId || newId(),
                      employeeId: userDraft.employeeId,
                      userId: userDraft.userId,
                      name: userDraft.name,
                      code: userDraft.code,
                      login: userDraft.login,
                      password: userDraft.password,
                      divisionId: userDraft.divisionId,
                      divisionName: userDraft.divisionName,
                      positionId: userDraft.positionId,
                      positionName: userDraft.positionName,
                      roles: userDraft.roles,
                      blocked: userDraft.blocked || false,
                    };
                    const next = editUserId
                      ? users.map((x) => (x.id === editUserId ? payload : x))
                      : [...users, payload];
                    void saveUsers(next).then(() => {
                      setUserModal(false);
                      setEditUserId(null);
                    });
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className={formStyles.btnClose}
                  onClick={() => setUserModal(false)}
                >
                  Отменить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>,
    );
  }

  if (section === 'errors') {
    return shell(
      <div className={extra.card}>
        <div className={styles.toolbar}>
          <h2 className={extra.cardTitle} style={{ margin: 0 }}>
            Журнал ошибок
          </h2>
          {listTools('/settings/artix/errors', filteredErrors.length, errorsList.length, () =>
            downloadCsv(
              `artix-errors.csv`,
              filteredErrors.map((e) => ({
                'Дата создания': e.createdAt,
                Состояние: e.status,
                Магазин: e.store,
                Запрос: e.request,
                Ответ: e.response,
              })),
            ),
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата создания</th>
                <th>Состояние</th>
                <th>Магазин</th>
                <th>Запрос</th>
                <th>Ответ</th>
              </tr>
            </thead>
            <tbody>
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filteredErrors.map((e: ArtixError) => (
                  <tr key={e.id}>
                    <td>{e.createdAt}</td>
                    <td>{e.status}</td>
                    <td>{e.store}</td>
                    <td>{e.request}</td>
                    <td>{e.response}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>,
    );
  }

  return shell(
    <div className={extra.card}>
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              const name = window.prompt('Название роли');
              if (!name?.trim()) return;
              void saveRoles([...roles, { id: newId(), name: name.trim() }]);
            }}
          >
            Создать
          </button>
        </div>
        {listTools('/settings/artix/roles', filteredRoles.length, roles.length, () =>
          downloadCsv(
            `artix-roles.csv`,
            filteredRoles.map((r) => ({ Название: r.name })),
          ),
        )}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Название</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 ? (
              <tr>
                <td className={styles.empty}>Нет данных</td>
              </tr>
            ) : (
              filteredRoles.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>,
  );
}
