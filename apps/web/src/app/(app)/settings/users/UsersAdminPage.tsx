'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { MultiLookup } from '@/app/(app)/catalog/cashboxes/MultiLookup';
import { apiFetch, getSession } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  TIMEZONES,
  asUserMeta,
  displayRole,
  initialsOf,
  loginOf,
  type AppUser,
  type UserMeta,
} from '@/lib/app-users';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../../catalog/cashboxes/page.module.css';
import ui from './page.module.css';

type Opt = { id: string; label: string };
type Dict = { id: string; code: string; name: string; items?: { id: string; name: string; isActive?: boolean }[] };

const PATH = '/settings/users';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'login', 'org', 'role', 'isActive'] as const;
const TZ_OPTS: Opt[] = TIMEZONES.map((t) => ({ id: t.id, label: t.label }));

const SIBLINGS = {
  title: 'Пользователи',
  siblings: [
    { label: 'Роли', href: '/settings/users/roles' },
    { label: 'Все пользователи', href: '/settings/users' },
  ],
};

function UsersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<AppUser[]>([]);
  const [orgs, setOrgs] = useState<Opt[]>([]);
  const [roles, setRoles] = useState<Opt[]>([]);
  const [tenantCode, setTenantCode] = useState('demo');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const photos = usePhotoLightbox();
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.name || filters.login || filters.org || filters.role || filters.isActive),
  );
  const [statusOpen, setStatusOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'view'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [managerId, setManagerId] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tashkent');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [managedBy, setManagedBy] = useState<'organization' | 'self'>('organization');
  const [photoUrl, setPhotoUrl] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [users, admin, org] = await Promise.all([
        apiFetch<AppUser[]>('/api/settings/users'),
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin'),
        apiFetch<{ tenant: { code: string } }>('/api/settings/org'),
      ]);
      setRows(users || []);
      setTenantCode((org.tenant?.code || 'demo').toLowerCase());
      const orgDict = (admin || []).find((d) => d.code === 'orgs');
      const roleDict = (admin || []).find((d) => d.code === 'app_roles');
      setOrgs(
        (orgDict?.items || [])
          .filter((i) => i.isActive !== false)
          .map((i) => ({ id: i.id, label: i.name })),
      );
      setRoles(
        (roleDict?.items || [])
          .filter((i) => i.isActive !== false)
          .map((i) => ({ id: i.id, label: i.name })),
      );
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
    return rows.filter((u) => {
      const m = asUserMeta(u.meta);
      if (filters.name && !u.fullName.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.login && !loginOf(u).toLowerCase().includes(filters.login.toLowerCase()))
        return false;
      if (filters.org && !(m.orgNames || []).some((n) => n.toLowerCase().includes(filters.org.toLowerCase())))
        return false;
      if (filters.role && !displayRole(u).toLowerCase().includes(filters.role.toLowerCase()))
        return false;
      if (filters.isActive === '1' && !u.isActive) return false;
      if (filters.isActive === '0' && u.isActive) return false;
      if (!qq) return true;
      return [u.fullName, loginOf(u), displayRole(u), ...(m.orgNames || []), m.phone, u.email]
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [rows, q, filters.name, filters.login, filters.org, filters.role, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filters.name, filters.login, filters.org, filters.role, filters.isActive]);

  const managerOpts: Opt[] = rows.map((u) => ({ id: u.id, label: u.fullName }));

  function fill(u?: AppUser) {
    const m = asUserMeta(u?.meta);
    setFullName(u?.fullName || '');
    setLogin(u ? loginOf(u) : '');
    setPassword('');
    setRoleIds(m.catalogRoleIds || []);
    setActive(u ? u.isActive : true);
    setOrgIds(m.orgIds || []);
    setManagerId(m.managerUserId || '');
    setTimezone(m.timezone || 'Asia/Tashkent');
    setCode(m.code || '');
    const ph = (m.phone || '').replace(/^\+?998/, '');
    setPhone(ph);
    setEmail(u?.email || '');
    setGender(m.gender === 'female' ? 'female' : 'male');
    setManagedBy(m.managedBy === 'self' ? 'self' : 'organization');
    setPhotoUrl(m.photoUrl || '');
  }

  function openCreate() {
    setEditId(null);
    fill();
    setMode('create');
    setError('');
  }

  function openEdit(u: AppUser) {
    setEditId(u.id);
    fill(u);
    setMode('edit');
    setError('');
  }

  function openView(u: AppUser) {
    setEditId(u.id);
    fill(u);
    setMode('view');
    setError('');
  }

  function buildMeta(): UserMeta {
    const selectedRoles = roles.filter((r) => roleIds.includes(r.id));
    const selectedOrgs = orgs.filter((o) => orgIds.includes(o.id));
    const mgr = rows.find((u) => u.id === managerId);
    const digits = phone.replace(/\D/g, '');
    return {
      login: login.trim().toLowerCase(),
      photoUrl: photoUrl || undefined,
      gender,
      managedBy,
      orgIds,
      orgNames: selectedOrgs.map((o) => o.label),
      managerUserId: managerId || undefined,
      managerName: mgr?.fullName,
      timezone,
      code: code.trim() || undefined,
      phone: digits ? `+998${digits}` : undefined,
      catalogRoleIds: roleIds,
      catalogRoleNames: selectedRoles.map((r) => r.label),
    };
  }

  async function save() {
    if (!fullName.trim()) {
      setError('Укажите Ф.И.О.');
      return;
    }
    if (!login.trim()) {
      setError('Укажите логин');
      return;
    }
    if (mode === 'create' && password.trim().length < 6) {
      setError('Пароль не менее 6 символов');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      isActive: active,
      meta: buildMeta(),
      ...(password.trim() ? { password: password.trim() } : {}),
    };
    try {
      if (editId) {
        await apiFetch(`/api/settings/users/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/settings/users', {
          method: 'POST',
          body: JSON.stringify({ ...body, password: password.trim() }),
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

  async function setActiveIds(ids: string[], isActive: boolean) {
    setBusy(true);
    setStatusOpen(false);
    try {
      for (const id of ids) {
        await apiFetch(`/api/settings/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive }),
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения статуса');
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[], label?: string) {
    const me = getSession()?.user.id;
    const drop = ids.filter((id) => id !== me);
    if (!drop.length) {
      setError('Нельзя удалить текущего пользователя');
      return;
    }
    if (
      !(await confirm({
        title: 'Удаление',
        message: label || `Удалить выбранных пользователей (${drop.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of drop) {
        await apiFetch(`/api/settings/users/${id}/delete`, { method: 'POST' });
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

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function onPhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  const locked = mode === 'view';
  const title =
    mode === 'create'
      ? 'Пользователь (создание)'
      : mode === 'edit'
        ? 'Пользователь (изменение)'
        : mode === 'view'
          ? 'Пользователь (просмотр)'
          : 'Пользователи';

  if (mode !== 'list') {
    return (
      <>
      <div className={styles.wrap}>
        <PageSubnav group={{ title, siblings: [] }} />
        <div className={formStyles.page}>
          <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
            {locked ? (
              <button
                type="button"
                className={styles.createBtn}
                onClick={() => {
                  const u = rows.find((r) => r.id === editId);
                  if (u) openEdit(u);
                }}
              >
                Изменить
              </button>
            ) : (
              <button
                type="button"
                className={formStyles.btnSave}
                disabled={saving}
                onClick={() => void save()}
              >
                Сохранить
              </button>
            )}
            <button type="button" className={formStyles.btnClose} onClick={() => setMode('list')}>
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={ui.layout}>
            <aside className={ui.side}>
              <div className={ui.avatar}>
                {photoUrl ? (
                  <PhotoThumb
                    src={mediaSrc(photoUrl) || photoUrl}
                    alt=""
                    lightbox={photos}
                    slides={[{ src: photoUrl, caption: fullName || 'Фото' }]}
                  />
                ) : (
                  initialsOf(fullName || '?')
                )}
                {!locked ? (
                  <>
                    <button
                      type="button"
                      className={ui.avatarBtn}
                      onClick={() => fileRef.current?.click()}
                      aria-label="Фото"
                    >
                      ✎
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => onPhoto(e.target.files?.[0])}
                    />
                  </>
                ) : null}
              </div>
              <div className={ui.radioCol}>
                <div className={ui.radioTitle}>Пол</div>
                <label>
                  <input
                    type="radio"
                    checked={gender === 'male'}
                    disabled={locked}
                    onChange={() => setGender('male')}
                  />
                  Мужской
                </label>
                <label>
                  <input
                    type="radio"
                    checked={gender === 'female'}
                    disabled={locked}
                    onChange={() => setGender('female')}
                  />
                  Женский
                </label>
              </div>
              <div className={ui.radioCol}>
                <div className={ui.radioTitle}>managed by</div>
                <label>
                  <input
                    type="radio"
                    checked={managedBy === 'organization'}
                    disabled={locked}
                    onChange={() => setManagedBy('organization')}
                  />
                  organization
                </label>
                <label>
                  <input
                    type="radio"
                    checked={managedBy === 'self'}
                    disabled={locked}
                    onChange={() => setManagedBy('self')}
                  />
                  self managed
                </label>
              </div>
            </aside>
            <div className={`${formStyles.card} ${formStyles.cardForm}`}>
              <div className={formStyles.layout}>
                <div>
                  <div className={formStyles.field}>
                    <label>
                      Ф.И.О. <span className={formStyles.req}>*</span>
                    </label>
                    <input
                      value={fullName}
                      disabled={locked}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className={formStyles.field}>
                    <label>
                      Логин <span className={formStyles.req}>*</span>
                    </label>
                    <div className={ui.loginWrap}>
                      <input
                        value={login}
                        disabled={locked}
                        onChange={(e) => setLogin(e.target.value)}
                      />
                      <span className={ui.loginSuffix}>@{tenantCode}</span>
                    </div>
                  </div>
                  <div className={formStyles.field}>
                    <label>
                      Пароль {mode === 'create' ? <span className={formStyles.req}>*</span> : null}
                    </label>
                    <div className={ui.pwdWrap}>
                      <input
                        type={showPwd ? 'text' : 'password'}
                        value={password}
                        disabled={locked}
                        placeholder={mode === 'edit' ? 'Оставьте пустым, чтобы не менять' : ''}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className={ui.pwdEye}
                        onClick={() => setShowPwd((v) => !v)}
                      >
                        ⌐
                      </button>
                    </div>
                  </div>
                  <div className={formStyles.field}>
                    <label>Роли</label>
                    {locked ? (
                      <div className={local.readonly}>
                        {roles.filter((r) => roleIds.includes(r.id)).map((r) => r.label).join(', ') || '—'}
                      </div>
                    ) : (
                      <MultiLookup value={roleIds} options={roles} onChange={setRoleIds} />
                    )}
                  </div>
                  <div className={formStyles.field}>
                    <label>Статус</label>
                    <label className={formStyles.toggleRow}>
                      <button
                        type="button"
                        className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                        disabled={locked}
                        onClick={() => setActive((v) => !v)}
                      />
                      <span>Активный</span>
                    </label>
                  </div>
                </div>
                <div>
                  <div className={formStyles.field}>
                    <label>Организации</label>
                    {locked ? (
                      <div className={local.readonly}>
                        {orgs.filter((o) => orgIds.includes(o.id)).map((o) => o.label).join(', ') || '—'}
                      </div>
                    ) : (
                      <MultiLookup value={orgIds} options={orgs} onChange={setOrgIds} />
                    )}
                  </div>
                  <div className={formStyles.field}>
                    <label>Руководитель</label>
                    {locked ? (
                      <div className={local.readonly}>
                        {managerOpts.find((m) => m.id === managerId)?.label || '—'}
                      </div>
                    ) : (
                      <SearchLookup
                        value={managerId}
                        options={managerOpts.filter((m) => m.id !== editId)}
                        allowClear
                        onChange={setManagerId}
                      />
                    )}
                  </div>
                  <div className={formStyles.field}>
                    <label>Часовой пояс</label>
                    {locked ? (
                      <div className={local.readonly}>
                        {TZ_OPTS.find((t) => t.id === timezone)?.label || timezone || '—'}
                      </div>
                    ) : (
                      <SearchLookup
                        value={timezone}
                        options={TZ_OPTS}
                        allowClear
                        onChange={setTimezone}
                      />
                    )}
                  </div>
                  <div className={formStyles.field}>
                    <label>Код</label>
                    <input value={code} disabled={locked} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  <div className={formStyles.field}>
                    <label>Телефон</label>
                    <div className={ui.phoneWrap}>
                      <span className={ui.phoneCode}>🇺🇿 +998</span>
                      <input
                        value={phone}
                        disabled={locked}
                        placeholder="91 234 56 78"
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={formStyles.field}>
                    <label>Email</label>
                    <input
                      value={email}
                      disabled={locked}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {photos.node}
      </>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={SIBLINGS} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={formStyles.btnSave} onClick={openCreate}>
            Создать
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
          {selected.size > 0 ? (
            <>
              <div className={extra.statusWrap}>
                <button
                  type="button"
                  className={extra.btnStatus}
                  disabled={busy}
                  onClick={() => setStatusOpen((v) => !v)}
                >
                  Изменить статус
                </button>
                {statusOpen ? (
                  <div className={extra.statusMenu}>
                    <button type="button" onClick={() => void setActiveIds(Array.from(selected), false)}>
                      Неактивный {selected.size}
                    </button>
                    <button type="button" onClick={() => void setActiveIds(Array.from(selected), true)}>
                      Активный {selected.size}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={local.btnDanger}
                disabled={busy}
                onClick={() => void deleteIds(Array.from(selected))}
              >
                Удалить {selected.size}
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') patchUrl({ q: searchDraft.trim() || null });
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'name', label: 'Ф.И.О.', placeholder: 'Поиск...' },
              { type: 'text', key: 'login', label: 'Логин', placeholder: 'Поиск...' },
              { type: 'text', key: 'org', label: 'Организации', placeholder: 'Поиск...' },
              { type: 'text', key: 'role', label: 'Роль', placeholder: 'Поиск...' },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                'users.csv',
                filtered.map((u) => {
                  const m = asUserMeta(u.meta);
                  return {
                    'Ф.И.О.': u.fullName,
                    Логин: loginOf(u),
                    Руководитель: m.managerName || '',
                    Организации: (m.orgNames || []).join('; '),
                    Роль: displayRole(u),
                    Статус: u.isActive ? 'Активный' : 'Неактивный',
                    Email: u.email,
                  };
                }),
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
              <th>Фото</th>
              <th>Ф.И.О.</th>
              <th>Логин</th>
              <th>Руководитель</th>
              <th>Прикрепленные организации</th>
              <th>Роль</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((u) => {
                const open = focusId === u.id;
                const m = asUserMeta(u.meta);
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
                    <td>
                      {m.photoUrl ? (
                        <PhotoThumb
                          className={ui.thumb}
                          src={mediaSrc(m.photoUrl) || m.photoUrl}
                          alt=""
                          lightbox={photos}
                          slides={rows
                            .map((u) => {
                              const meta = asUserMeta(u.meta);
                              return {
                                src: mediaSrc(meta.photoUrl) || '',
                                caption: u.fullName,
                              };
                            })
                            .filter((s) => s.src)}
                          index={Math.max(
                            0,
                            rows
                              .map((u) => mediaSrc(asUserMeta(u.meta).photoUrl) || '')
                              .filter(Boolean)
                              .findIndex((s) => s === (mediaSrc(m.photoUrl) || '')),
                          )}
                        />
                      ) : (
                        <span className={ui.thumb}>{initialsOf(u.fullName)}</span>
                      )}
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{u.fullName}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={() => openView(u)}>
                            Просмотреть
                          </button>
                          <button type="button" onClick={() => openEdit(u)}>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() => void deleteIds([u.id], `Удалить «${u.fullName}»?`)}
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setActiveIds([u.id], !u.isActive)}
                          >
                            {u.isActive ? 'Неактивный' : 'Активный'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>@{loginOf(u)}</td>
                    <td>{m.managerName || ''}</td>
                    <td>{(m.orgNames || []).join(', ')}</td>
                    <td>{displayRole(u)}</td>
                    <td>
                      <span className={u.isActive ? extra.badge : extra.badgeOff}>
                        {u.isActive ? 'Активный' : 'Неактивный'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {photos.node}
    </div>
  );
}

export function UsersAdminPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <UsersInner />
    </Suspense>
  );
}
