'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getSession, setSession, Session } from '@/lib/api';
import { MEGA_NAV, findSectionByPath } from '@/lib/mega-nav';
import { CATALOG_SIBLING_KEY, FORM_SIBLINGS } from '@/lib/form-siblings';
import styles from './shell.module.css';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function linkActive(pathname: string, search: string, href: string) {
  const [path, qs] = href.split('?');
  if (pathname !== path && !(path !== '/' && pathname.startsWith(path + '/'))) return false;
  if (!qs) return true;
  return search.includes(qs);
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const router = useRouter();
  const [session, setLocal] = useState<Session | null>(null);
  const [now, setNow] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [screenLocked, setScreenLocked] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState('');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [searchQ, setSearchQ] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchRes, setSearchRes] = useState<{
    employees: { id: string; label: string; href: string; status?: string }[];
    persons: { id: string; label: string; href: string }[];
    divisions: { id: string; label: string; href: string }[];
  } | null>(null);
  const [notifications, setNotifications] = useState<
    {
      id: string;
      title: string;
      body?: string | null;
      href?: string | null;
      readAt?: string | null;
      createdAt: string;
    }[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  /** Active category index inside multi-column mega (Verifix fly-out). */
  const [megaCatIdx, setMegaCatIdx] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaLeft, setMegaLeft] = useState(0);
  const [megaTop, setMegaTop] = useState(45);
  const tabBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const megaPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/');
      return;
    }
    setLocal(s);
  }, [router]);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString('ru-RU', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setProfileOpen(false);
    setNotifyOpen(false);
    setQuickOpen(false);
    setSearchOpen(false);
    setOpenId(null);
    setMobileOpen(false);
  }, [pathname, search]);

  const loadNotifications = useCallback(async () => {
    try {
      const rows = await apiFetch<
        {
          id: string;
          title: string;
          body?: string | null;
          href?: string | null;
          readAt?: string | null;
          createdAt: string;
        }[]
      >('/api/me/notifications');
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.readAt).length);
    } catch {
      /* ignore — shell stays usable offline */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    loadNotifications();
    const id = setInterval(loadNotifications, 60_000);
    return () => clearInterval(id);
  }, [session, loadNotifications]);

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    if (q.length < 1) {
      setSearchRes(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const res = await apiFetch<{
          employees: { id: string; label: string; href: string; status?: string }[];
          persons: { id: string; label: string; href: string }[];
          divisions: { id: string; label: string; href: string }[];
        }>(`/api/me/search?q=${encodeURIComponent(q)}`);
        setSearchRes(res);
      } catch {
        setSearchRes({ employees: [], persons: [], divisions: [] });
      } finally {
        setSearchBusy(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen]);

  const placeMega = useCallback((id: string) => {
    const btn = tabBtnRefs.current[id];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const top = Math.round(r.bottom);
    let left = Math.round(r.left);

    requestAnimationFrame(() => {
      const panel = megaPanelRef.current;
      const width = panel?.offsetWidth ?? 320;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      if (left > maxLeft) left = maxLeft;
      if (left < 8) left = 8;
      setMegaLeft(left);
      setMegaTop(top);
    });

    setMegaLeft(left);
    setMegaTop(top);
  }, []);

  useEffect(() => {
    if (!openId) return;
    placeMega(openId);
    function onResize() {
      if (openId) placeMega(openId);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [openId, megaCatIdx, placeMega]);

  useEffect(() => {
    if (!openId) {
      setMegaCatIdx(0);
      return;
    }
    const sec = MEGA_NAV.find((s) => s.id === openId);
    if (!sec) return;
    // Open the column that contains the current route, else first titled column.
    let best = 0;
    sec.columns.forEach((col, idx) => {
      if (col.items.some((item) => linkActive(pathname, search, item.href))) best = idx;
    });
    setMegaCatIdx(best);
  }, [openId, pathname, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      const header = document.querySelector(`.${styles.topNav}`);
      const inHeader = header?.contains(t);
      const inMega = megaPanelRef.current?.contains(t);
      if (!inHeader && !inMega) setOpenId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenId(null);
        setMobileOpen(false);
        setProfileOpen(false);
        setNotifyOpen(false);
        setQuickOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const activeSectionId = useMemo(
    () => findSectionByPath(pathname, search),
    [pathname, search],
  );

  const siblingGroup = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    // /catalog/grade-history/... → grade-history; /catalog/career-paths → career-paths
    if (parts[0] === 'catalog' && parts[1] === 'reports' && parts[2]) {
      const slug = parts[2];
      return (
        FORM_SIBLINGS[`reports-${slug}`] ??
        FORM_SIBLINGS[CATALOG_SIBLING_KEY[slug] ?? slug] ??
        FORM_SIBLINGS[slug]
      );
    }
    if (parts[0] === 'catalog' && parts[1]) {
      const slug = parts[1];
      const key = CATALOG_SIBLING_KEY[slug] ?? slug;
      return FORM_SIBLINGS[key] ?? FORM_SIBLINGS[slug];
    }
    if (parts[0] === 'positions') return FORM_SIBLINGS.positions;
    if (parts[0] === 'divisions') return FORM_SIBLINGS.divisions;
    if (parts[0] === 'settings' && parts[1] === 'users') {
      if (parts[2] === 'roles' && parts[3] === 'products') {
        return { title: 'Роли (прикрепление продуктов)', siblings: [] };
      }
      if (parts[2] === 'roles' && parts[3] === 'access') {
        return { title: 'Прикрепление доступов (действия)', siblings: [] };
      }
      if (parts[2] === 'roles') return FORM_SIBLINGS['app-roles'];
      return FORM_SIBLINGS['app-users'];
    }
    if (parts[0] === 'settings' && parts[1] === 'organizations')
      return FORM_SIBLINGS.organizations;
    if (parts[0] === 'settings' && parts[1] === 'countries') {
      if (parts[2] === 'history') return FORM_SIBLINGS['countries-history'];
      return FORM_SIBLINGS.countries;
    }
    if (parts[0] === 'settings' && parts[1] === 'banks') {
      if (parts[2] === 'import') return FORM_SIBLINGS['banks-import'];
      return FORM_SIBLINGS.banks;
    }
    if (parts[0] === 'settings' && parts[1] === 'quickstart') return FORM_SIBLINGS.quickstart;
    if (parts[0] === 'settings' && parts[1] === 'photos') return FORM_SIBLINGS.photos;
    if (parts[0] === 'settings' && parts[1] === 'person-docs') return FORM_SIBLINGS['person-docs'];
    if (parts[0] === 'settings' && parts[1] === 'artix') {
      if (parts.includes('import')) {
        return {
          title: 'Пользователи ARTIX (импорт)',
          siblings: [{ label: 'Пользователи', href: '/settings/artix/users' }],
        };
      }
      return FORM_SIBLINGS.artix;
    }
    if (parts[0] === 'settings' && parts[1] === 'iiko') return FORM_SIBLINGS.iiko;
    if (parts[0] === 'settings' && parts[1] === 'iiko-sales') return FORM_SIBLINGS['iiko-sales'];
    if (parts[0] === 'settings' && parts[1] === 'billz-sales')
      return FORM_SIBLINGS['billz-sales'];
    if (parts[0] === 'settings' && parts[1] === 'billz') return FORM_SIBLINGS.billz;
    if (parts[0] === 'payroll' && parts[1] === 'fine-policies') {
      if (parts[2] === 'new') {
        return { title: 'Политика штрафов (создание)', siblings: [] };
      }
      if (parts[2]) {
        return { title: 'Политика штрафов (изменение)', siblings: [] };
      }
      return FORM_SIBLINGS.policies;
    }
    if (parts[0] === 'payroll' && parts[1] === 'allowance-policies') {
      if (parts[2] === 'new') {
        return { title: 'Политики выплат (создание)', siblings: [] };
      }
      if (parts[2]) {
        return { title: 'Политики выплат (изменение)', siblings: [] };
      }
      return FORM_SIBLINGS['allowance-policies'];
    }
    if (parts[0] === 'payroll' && parts[1] === 'timesheets') {
      if (parts[2] === 'new') {
        return { title: 'Табель (создание)', siblings: [] };
      }
      if (parts[3] === 'edit') {
        return { title: 'Табель (изменение)', siblings: [] };
      }
      if (parts[2]) {
        return { title: 'Табель', siblings: [] };
      }
      return FORM_SIBLINGS.timesheet;
    }
    if (parts[0] === 'payroll' && parts[1] === 'accruals') {
      if (parts[2] === 'new') {
        return { title: 'Начисление (создание)', siblings: [] };
      }
      if (parts[3] === 'edit') {
        return { title: 'Начисление (изменение)', siblings: [] };
      }
      if (parts[3] === 'entries') {
        return { title: 'Проводки', siblings: [] };
      }
      if (parts[2]) {
        return { title: 'Начисление', siblings: [] };
      }
      return FORM_SIBLINGS.accruals;
    }
    if (parts[0] === 'employees') {
      if (search.includes('tab=dismissed')) return FORM_SIBLINGS['employees-dismissed'];
      if (search.includes('tab=gph')) return FORM_SIBLINGS['employees-gph'];
      return FORM_SIBLINGS.employees;
    }
    return undefined;
  }, [pathname, search]);

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/settings/users') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/settings/countries') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/settings/banks') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/settings/quickstart') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/settings/photos') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/settings/person-docs') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/payroll/fine-policies') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/payroll/allowance-policies') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/payroll/timesheets') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    if (pathname.startsWith('/payroll/accruals') && siblingGroup?.title) {
      return siblingGroup.title;
    }
    for (const sec of MEGA_NAV) {
      for (const col of sec.columns) {
        for (const item of col.items) {
          if (linkActive(pathname, search, item.href)) return item.label;
        }
      }
    }
    if (siblingGroup?.title) return siblingGroup.title;
    if (pathname.includes('/reports/')) return 'Отчёт по сотруднику';
    if (pathname.includes('/documents/')) return 'Документ сотрудника';
    if (pathname.match(/\/employees\/[^/]+\/schedule/))
      return 'Обычный график работы (изменение)';
    if (pathname.startsWith('/employees/')) return 'Сотрудник';
    return 'HR HUB';
  }, [pathname, search, siblingGroup]);

  function logout() {
    setSession(null);
    setLocal(null);
    setProfileOpen(false);
    router.replace('/');
  }

  function logoutForgetDevice() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    setSession(null);
    setLocal(null);
    setProfileOpen(false);
    router.replace('/');
  }

  function toggleScreenMode() {
    const next = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    document.documentElement.dataset.theme = next;
    setProfileOpen(false);
  }

  function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg('');
    if (pwdForm.next.length < 6) {
      setPwdMsg('Новый пароль должен быть не короче 6 символов');
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdMsg('Пароли не совпадают');
      return;
    }
    setPwdMsg('Пароль обновлён (демо)');
    setTimeout(() => {
      setPwdOpen(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      setPwdMsg('');
    }, 900);
  }

  function toggleSection(id: string) {
    setOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next) placeMega(next);
      return next;
    });
  }

  if (!session) {
    return <div className={styles.loading}>Загрузка…</div>;
  }

  const openSection = MEGA_NAV.find((s) => s.id === openId) ?? null;

  return (
    <div className={styles.shell}>
      <header className={styles.topNav} data-no-print>
        <div className={styles.topNavInner}>
          <button
            type="button"
            className={styles.burger}
            aria-label="Меню"
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen((v) => !v);
              setOpenId(null);
            }}
          >
            <span />
            <span />
            <span />
          </button>

          <Link href="/dashboard" className={styles.brandLink} onClick={() => setOpenId(null)}>
            <span className={styles.brandMark}>H</span>
            <span className={styles.brandText}>
              <strong>HR HUB</strong>
              <small>{session.tenant?.name ?? 'Platform'}</small>
            </span>
          </Link>

          <nav className={styles.topTabs} aria-label="Основные разделы">
            {MEGA_NAV.map((sec) => {
              const isOpen = openId === sec.id;
              const isRoute = !openId && activeSectionId === sec.id;
              return (
                <div
                  key={sec.id}
                  className={styles.tabWrap}
                  onMouseEnter={() => {
                    setOpenId(sec.id);
                    placeMega(sec.id);
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      tabBtnRefs.current[sec.id] = el;
                    }}
                    className={
                      isOpen
                        ? styles.topTabOpen
                        : isRoute
                          ? styles.topTabActive
                          : styles.topTab
                    }
                    aria-expanded={isOpen}
                    onClick={() => toggleSection(sec.id)}
                  >
                    {sec.label}
                  </button>
                </div>
              );
            })}
          </nav>

          <div className={styles.topRight}>
            <span className={styles.pill} title={session.tenant?.code ?? ''}>
              {now || '…'}
            </span>

            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Поиск"
                aria-label="Поиск"
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen((v) => !v);
                  setNotifyOpen(false);
                  setQuickOpen(false);
                  setProfileOpen(false);
                }}
              >
                <i className="fas fa-search" aria-hidden />
              </button>
              {searchOpen ? (
                <div className={`${styles.dropMenu} ${styles.searchModal}`} role="dialog">
                  <div className={styles.dropHead}>
                    <span>Глобальный поиск</span>
                  </div>
                  <div className={styles.searchBox}>
                    <input
                      autoFocus
                      type="search"
                      className={styles.searchInput}
                      placeholder="Сотрудник, физлицо, подразделение…"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  </div>
                  <div className={styles.searchBody}>
                    {searchBusy ? (
                      <div className={styles.dropEmpty}>Поиск…</div>
                    ) : !searchRes || searchQ.trim().length < 1 ? (
                      <div className={styles.dropEmpty}>Введите запрос</div>
                    ) : !searchRes.employees.length &&
                      !searchRes.persons.length &&
                      !searchRes.divisions.length ? (
                      <div className={styles.dropEmpty}>Ничего не найдено</div>
                    ) : (
                      <>
                        {searchRes.employees.length ? (
                          <div className={styles.searchGroup}>
                            <div className={styles.searchGroupTitle}>Сотрудники</div>
                            {searchRes.employees.map((e) => (
                              <Link
                                key={e.id}
                                href={e.href}
                                className={styles.searchHit}
                                onClick={() => setSearchOpen(false)}
                              >
                                <i className="fas fa-user" aria-hidden />
                                <span>{e.label}</span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                        {searchRes.persons.length ? (
                          <div className={styles.searchGroup}>
                            <div className={styles.searchGroupTitle}>Физические лица</div>
                            {searchRes.persons.map((p) => (
                              <Link
                                key={p.id}
                                href={p.href}
                                className={styles.searchHit}
                                onClick={() => setSearchOpen(false)}
                              >
                                <i className="fas fa-id-card" aria-hidden />
                                <span>{p.label}</span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                        {searchRes.divisions.length ? (
                          <div className={styles.searchGroup}>
                            <div className={styles.searchGroupTitle}>Подразделения</div>
                            {searchRes.divisions.map((d) => (
                              <Link
                                key={d.id}
                                href={d.href}
                                className={styles.searchHit}
                                onClick={() => setSearchOpen(false)}
                              >
                                <i className="fas fa-sitemap" aria-hidden />
                                <span>{d.label}</span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Быстрые действия"
                aria-label="Быстрые действия"
                aria-expanded={quickOpen}
                onClick={() => {
                  setQuickOpen((v) => !v);
                  setNotifyOpen(false);
                  setSearchOpen(false);
                  setProfileOpen(false);
                }}
              >
                <i className="fas fa-th" aria-hidden />
              </button>
              {quickOpen ? (
                <div className={styles.dropMenu} role="menu">
                  <Link
                    href="/catalog/hr-documents?action=create"
                    className={styles.dropItemLink}
                    onClick={() => setQuickOpen(false)}
                  >
                    <i className="fas fa-file-alt" aria-hidden />
                    Кадровый документ
                  </Link>
                  <Link
                    href="/employees?action=create"
                    className={styles.dropItemLink}
                    onClick={() => setQuickOpen(false)}
                  >
                    <i className="fas fa-user-plus" aria-hidden />
                    Новый сотрудник
                  </Link>
                  <Link
                    href="/attendance?tab=requests&scope=to_me"
                    className={styles.dropItemLink}
                    onClick={() => setQuickOpen(false)}
                  >
                    <i className="fas fa-tasks" aria-hidden />
                    Заявки на согласование
                  </Link>
                  <Link
                    href="/m"
                    className={styles.dropItemLink}
                    onClick={() => setQuickOpen(false)}
                  >
                    <i className="fas fa-mobile-alt" aria-hidden />
                    Мобильная версия
                  </Link>
                </div>
              ) : null}
            </div>

            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Уведомления"
                aria-label="Уведомления"
                aria-expanded={notifyOpen}
                onClick={() => {
                  setNotifyOpen((v) => !v);
                  setQuickOpen(false);
                  setSearchOpen(false);
                  setProfileOpen(false);
                  if (!notifyOpen) void loadNotifications();
                }}
              >
                <i className="far fa-bell" aria-hidden />
                {unreadCount > 0 ? (
                  <span className={styles.badgeDot}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                ) : null}
              </button>
              {notifyOpen ? (
                <div className={`${styles.dropMenu} ${styles.dropWide}`} role="menu">
                  <div className={styles.dropHead}>
                    <span>Уведомления ({notifications.length})</span>
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        className={styles.dropHeadBtn}
                        onClick={async () => {
                          await apiFetch('/api/me/notifications/read-all', {
                            method: 'PATCH',
                          });
                          await loadNotifications();
                        }}
                      >
                        Прочитать все
                      </button>
                    ) : null}
                  </div>
                  {notifications.length === 0 ? (
                    <div className={styles.dropEmpty}>Нет новых уведомлений</div>
                  ) : (
                    <div className={styles.notifyList}>
                      {notifications.slice(0, 20).map((n) => (
                        <Link
                          key={n.id}
                          href={n.href || '#'}
                          className={
                            n.readAt ? styles.notifyItem : styles.notifyItemUnread
                          }
                          onClick={async () => {
                            setNotifyOpen(false);
                            if (!n.readAt) {
                              try {
                                await apiFetch(`/api/me/notifications/${n.id}/read`, {
                                  method: 'PATCH',
                                });
                              } catch {
                                /* ignore */
                              }
                            }
                          }}
                        >
                          <strong>{n.title}</strong>
                          {n.body ? <span>{n.body}</span> : null}
                          <small>
                            {new Date(n.createdAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className={styles.profileWrap}>
              <button
                type="button"
                className={styles.profileBtn}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifyOpen(false);
                  setQuickOpen(false);
                  setSearchOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-label="Профиль"
                title={session.user.fullName}
              >
                <span className={styles.avatar}>{initials(session.user.fullName)}</span>
                <span className={styles.profileText}>
                  <span className={styles.userName}>{session.user.fullName}</span>
                  <span className={styles.userRole}>
                    {session.tenant?.name || session.user.email || ''}
                  </span>
                </span>
              </button>
              {profileOpen ? (
                <div className={styles.profileMenu} role="menu">
                  <div className={styles.profileMenuHead}>
                    <strong>{session.user.fullName}</strong>
                    <span>
                      {session.tenant?.name || session.user.email || 'Организация'}
                    </span>
                  </div>
                  <Link
                    href="/settings"
                    className={styles.dropItemLink}
                    onClick={() => setProfileOpen(false)}
                  >
                    <i className="fas fa-user" aria-hidden />
                    Профиль
                  </Link>
                  <a
                    className={styles.dropItemLink}
                    href="mailto:support@verifix.local?subject=Отзыв%20HR%20HUB"
                    onClick={() => setProfileOpen(false)}
                  >
                    <i className="fas fa-comment-dots" aria-hidden />
                    Оставить отзыв
                  </a>
                  <button
                    type="button"
                    className={styles.dropItem}
                    onClick={() => {
                      setProfileOpen(false);
                      setPwdOpen(true);
                      setPwdMsg('');
                    }}
                  >
                    <i className="fas fa-key" aria-hidden />
                    Изменить пароль
                  </button>
                  <Link
                    href="/catalog"
                    className={styles.dropItemLink}
                    onClick={() => setProfileOpen(false)}
                  >
                    <i className="fas fa-folder" aria-hidden />
                    Файлы
                  </Link>
                  <button
                    type="button"
                    className={styles.dropItem}
                    onClick={toggleScreenMode}
                  >
                    <i
                      className={`fas ${themeMode === 'light' ? 'fa-moon' : 'fa-sun'}`}
                      aria-hidden
                    />
                    Режим экрана
                    <span className={styles.dropHint}>
                      {themeMode === 'light' ? 'Светлый' : 'Тёмный'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.dropItem}
                    onClick={() => {
                      setProfileOpen(false);
                      setQuickOpen(true);
                    }}
                  >
                    <i className="fas fa-th" aria-hidden />
                    Панель быстрого доступа
                  </button>
                  <button
                    type="button"
                    className={styles.dropItem}
                    onClick={() => {
                      setProfileOpen(false);
                      setScreenLocked(true);
                    }}
                  >
                    <i className="fas fa-lock" aria-hidden />
                    Блокировка экрана
                  </button>
                  <div className={styles.profileMenuSep} />
                  <button type="button" className={styles.logout} onClick={logout}>
                    <i className="fas fa-sign-out-alt" aria-hidden />
                    Выйти
                  </button>
                  <button
                    type="button"
                    className={styles.logoutDanger}
                    onClick={logoutForgetDevice}
                  >
                    <i className="fas fa-unlink" aria-hidden />
                    Выйти и забыть устройство
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {screenLocked ? (
        <div className={styles.lockOverlay} role="dialog" aria-modal="true">
          <div className={styles.lockCard}>
            <span className={styles.lockAvatar}>{initials(session.user.fullName)}</span>
            <strong>{session.user.fullName}</strong>
            <span className={styles.lockHint}>Экран заблокирован</span>
            <button
              type="button"
              className={styles.lockUnlock}
              onClick={() => setScreenLocked(false)}
            >
              Разблокировать
            </button>
          </div>
        </div>
      ) : null}

      {pwdOpen ? (
        <div
          className={styles.pwdBackdrop}
          role="presentation"
          onClick={() => setPwdOpen(false)}
        >
          <form
            className={styles.pwdModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwd-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitPasswordChange}
          >
            <div className={styles.pwdHead}>
              <h2 id="pwd-title">Изменить пароль</h2>
              <button
                type="button"
                className={styles.pwdClose}
                aria-label="Закрыть"
                onClick={() => setPwdOpen(false)}
              >
                ×
              </button>
            </div>
            <label className={styles.pwdField}>
              <span>Текущий пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                value={pwdForm.current}
                onChange={(e) =>
                  setPwdForm((f) => ({ ...f, current: e.target.value }))
                }
              />
            </label>
            <label className={styles.pwdField}>
              <span>Новый пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdForm.next}
                onChange={(e) =>
                  setPwdForm((f) => ({ ...f, next: e.target.value }))
                }
              />
            </label>
            <label className={styles.pwdField}>
              <span>Подтверждение</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdForm.confirm}
                onChange={(e) =>
                  setPwdForm((f) => ({ ...f, confirm: e.target.value }))
                }
              />
            </label>
            {pwdMsg ? <p className={styles.pwdMsg}>{pwdMsg}</p> : null}
            <div className={styles.pwdActions}>
              <button type="button" onClick={() => setPwdOpen(false)}>
                Отмена
              </button>
              <button type="submit" className={styles.pwdSave}>
                Сохранить
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {mobileOpen ? (
        <>
          <button
            type="button"
            className={styles.mobileBackdrop}
            aria-label="Закрыть"
            onClick={() => setMobileOpen(false)}
          />
          <aside className={styles.mobileDrawer} data-no-print>
            <div className={styles.mobileDrawerHead}>
              <strong>HR HUB</strong>
              <button
                type="button"
                className={styles.mobileClose}
                aria-label="Закрыть"
                onClick={() => setMobileOpen(false)}
              >
                ×
              </button>
            </div>
            <nav className={styles.mobileNav}>
              {MEGA_NAV.map((sec) => (
                <div key={sec.id} className={styles.mobileSec}>
                  <div className={styles.mobileSecTitle}>{sec.label}</div>
                  {sec.columns.map((col, idx) => {
                    const items = col.items.filter(
                      (i) =>
                        i.badge !== 'platform' || session.user.role === 'platform_admin',
                    );
                    return (
                      <div key={col.title || `mcol-${idx}`}>
                        {col.title ? (
                          <div className={styles.mobileColTitle}>{col.title}</div>
                        ) : null}
                        <ul className={styles.mobileList}>
                          {items.map((item) => {
                            const active = linkActive(pathname, search, item.href);
                            return (
                              <li key={item.href + item.label}>
                                <Link
                                  href={item.href}
                                  className={
                                    active ? styles.mobileLinkActive : styles.mobileLink
                                  }
                                  onClick={() => setMobileOpen(false)}
                                >
                                  {item.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </>
      ) : null}

      {openSection ? (
        <div
          ref={megaPanelRef}
          className={styles.megaOpen}
          style={{ left: megaLeft, top: megaTop }}
          role="menu"
        >
          <div className={styles.megaInner}>
            {(() => {
              const titled = openSection.columns.filter((c) => c.title);
              const useFlyout = titled.length >= 2;
              const columns = openSection.columns;
              const catIdx = Math.min(megaCatIdx, Math.max(0, columns.length - 1));
              const activeCol = columns[catIdx] ?? columns[0];
              const flyItems = (activeCol?.items ?? []).filter(
                (i) =>
                  i.badge !== 'platform' || session.user.role === 'platform_admin',
              );

              if (useFlyout) {
                return (
                  <div className={styles.megaFlyout}>
                    <ul className={styles.megaCats} role="menu">
                      {columns.map((col, idx) => {
                        const isActive = idx === catIdx;
                        return (
                          <li key={col.title || `cat-${idx}`}>
                            <button
                              type="button"
                              className={
                                isActive ? styles.megaCatActive : styles.megaCat
                              }
                              onMouseEnter={() => setMegaCatIdx(idx)}
                              onFocus={() => setMegaCatIdx(idx)}
                            >
                              <span>{col.title || openSection.label}</span>
                              <span className={styles.megaCatChevron} aria-hidden>
                                ›
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className={styles.megaFlyPanel}>
                      <ul className={styles.megaList}>
                        {flyItems.map((item) => {
                          const active = linkActive(pathname, search, item.href);
                          return (
                            <li key={item.href + item.label}>
                              <Link
                                href={item.href}
                                className={
                                  active ? styles.megaLinkActive : styles.megaLink
                                }
                                onClick={() => setOpenId(null)}
                              >
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              }

              return (
                <div className={styles.megaGrid}>
                  {columns.map((col, idx) => {
                    const items = col.items.filter(
                      (i) =>
                        i.badge !== 'platform' ||
                        session.user.role === 'platform_admin',
                    );
                    return (
                      <div key={col.title || `col-${idx}`} className={styles.megaCol}>
                        {col.title ? (
                          <div className={styles.megaColTitle}>{col.title}</div>
                        ) : null}
                        <ul className={styles.megaList}>
                          {items.map((item) => {
                            const active = linkActive(pathname, search, item.href);
                            return (
                              <li key={item.href + item.label}>
                                <Link
                                  href={item.href}
                                  className={
                                    active ? styles.megaLinkActive : styles.megaLink
                                  }
                                  onClick={() => setOpenId(null)}
                                >
                                  {item.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {openId ? (
        <button
          type="button"
          className={styles.megaBackdrop}
          aria-label="Закрыть меню"
          onClick={() => setOpenId(null)}
        />
      ) : null}

      {pathname.startsWith('/settings') &&
      (!search.includes('tab=') ||
        search.includes('tab=main') ||
        /(?:^|[?&])tab=main(?:&|$)/.test(search.replace(/^\?/, ''))) ? null : (
        <div className={styles.crumbBar} data-no-print>
          <span className={styles.crumbSection}>
            {MEGA_NAV.find((s) => s.id === activeSectionId)?.label ?? 'HR HUB'}
          </span>
          <span className={styles.crumbSep}>/</span>
          <span className={styles.crumbPage}>{pageTitle}</span>
        </div>
      )}
      <main className={styles.main} onClick={() => {
        setProfileOpen(false);
        setNotifyOpen(false);
        setQuickOpen(false);
        setSearchOpen(false);
      }}>
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className={styles.loading}>Загрузка…</div>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
