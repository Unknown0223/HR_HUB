'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch, getAccessToken, getSession, setMediaAccessToken, setSession, Session } from '@/lib/api';
import {
  NAV_SECTIONS,
  findActiveNavItem,
  findNavSection,
  hrefMatchScore,
  type NavSection,
  type NavSectionId,
} from '@/lib/nav-registry';
import { findReport, rememberRecentReport } from '@/lib/reports-registry';
import { SeasonalBackdrop } from '@/components/SeasonalBackdrop';
import {
  filterNavItems,
  isHrefAllowed,
  type MyAccess,
} from '@/lib/role-access';
import { CATALOG_SIBLING_KEY, FORM_SIBLINGS } from '@/lib/form-siblings';
import { applyTheme, storedTheme, type ThemeMode } from '@/lib/theme';
import { SidebarNav } from './SidebarNav';
import styles from './shell.module.css';
import sb from './sidebar.module.css';

const COMPACT_KEY = 'hrhub.sidebar.compact';

const BOTTOM_SHORTCUTS: { section: NavSectionId; label: string }[] = [
  { section: 'home', label: 'Главная' },
  { section: 'employees', label: 'Сотрудники' },
  { section: 'attendance', label: 'Посещаемость' },
  { section: 'reports', label: 'Отчёты' },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const router = useRouter();
  const [session, setLocal] = useState<Session | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [screenLocked, setScreenLocked] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
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
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  /** Accordion: at most one section is expanded; it follows the current page. */
  const [openSection, setOpenSection] = useState<NavSectionId | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    try {
      setCompact(localStorage.getItem(COMPACT_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
    const theme = storedTheme();
    document.documentElement.dataset.theme = theme;
    setThemeMode(theme);
  }, []);

  // Sync session from localStorage before first paint — do not wait on /auth/me.
  useLayoutEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/');
      return;
    }
    setLocal(s);

    const meP = apiFetch<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      tenantId: string | null;
      catalogRoleIds?: string[];
      tenant: { id: string; code: string; name: string } | null;
    }>('/api/auth/me');

    const mediaP = getAccessToken()
      ? Promise.resolve(null)
      : apiFetch<{ accessToken: string }>('/api/auth/media-token').catch(() => null);

    const accessP = apiFetch<MyAccess>('/api/settings/my-access').catch(() => ({
      bypass: true,
      allowed: [] as string[],
    }));

    void Promise.all([meP, mediaP, accessP])
      .then(([me, media, myAccess]) => {
        const next: Session = {
          user: {
            id: me.id,
            email: me.email,
            fullName: me.fullName,
            role: me.role,
            tenantId: me.tenantId,
            catalogRoleIds: me.catalogRoleIds || [],
          },
          tenant: me.tenant ?? s.tenant,
        };
        setSession(next);
        setLocal(next);
        setAccess(myAccess);
        if (media?.accessToken) setMediaAccessToken(media.accessToken);
      })
      .catch(() => {
        setSession(null);
        router.replace('/');
      });
  }, [router]);

  // Block routes the user is not granted (admins / unconfigured roles bypass).
  useEffect(() => {
    if (!session || !access || access.bypass) return;
    if (isHrefAllowed(pathname, search, access.allowed, false)) return;
    router.replace('/dashboard');
  }, [session, access, pathname, search, router]);

  useEffect(() => {
    setProfileOpen(false);
    setNotifyOpen(false);
    setSearchOpen(false);
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

  // Warm common routes after shell is up (soft-nav feels instant).
  useEffect(() => {
    if (!session) return;
    const paths = ['/dashboard', '/employees', '/positions', '/news'];
    for (const p of paths) {
      try {
        router.prefetch(p);
      } catch {
        /* ignore */
      }
    }
  }, [session, router]);

  // Defer notifications so list-page fetches win the first network slot.
  useEffect(() => {
    if (!session) return;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      void loadNotifications();
      intervalId = setInterval(() => void loadNotifications(), 60_000);
    };

    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(start, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(start, 600);
    }

    return () => {
      if (idleId !== undefined && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setProfileOpen(false);
        setNotifyOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Drawer: move focus in on open, back to the menu button on close; lock page scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    drawerCloseRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const menuBtn = menuBtnRef.current;
    return () => {
      document.body.style.overflow = prevOverflow;
      menuBtn?.focus();
    };
  }, [mobileOpen]);

  const activeItem = useMemo(() => findActiveNavItem(pathname, search), [pathname, search]);
  const activeReport = useMemo(() => findReport(pathname, search), [pathname, search]);

  useEffect(() => {
    if (activeReport) rememberRecentReport(activeReport.id);
  }, [activeReport]);
  const activeSectionId = useMemo(() => findNavSection(pathname, search), [pathname, search]);
  const activeSection = NAV_SECTIONS.find((s) => s.id === activeSectionId) ?? null;

  useEffect(() => {
    setOpenSection(activeSectionId);
  }, [activeSectionId]);

  const isSectionOpen = useCallback((id: NavSectionId) => openSection === id, [openSection]);

  const toggleNavSection = useCallback(
    (id: NavSectionId) => {
      if (compact) {
        setCompact(false);
        try {
          localStorage.setItem(COMPACT_KEY, '0');
        } catch {
          /* storage unavailable */
        }
        setOpenSection(id);
        return;
      }
      setOpenSection((prev) => (prev === id ? null : id));
    },
    [compact],
  );

  function toggleCompact() {
    setCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COMPACT_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }

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
        return { title: 'Политика доплат (создание)', siblings: [] };
      }
      if (parts[2]) {
        return { title: 'Политика доплат (изменение)', siblings: [] };
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
    if (activeReport) return activeReport.title;
    if (activeItem) {
      const params = new URLSearchParams(search.replace(/^\?/, ''));
      const primary = hrefMatchScore(activeItem.href, pathname, params);
      const viaAlias = (activeItem.aliases ?? []).some(
        (a) => hrefMatchScore(a, pathname, params) > primary,
      );
      if (!viaAlias || !siblingGroup?.title) return activeItem.label;
    }
    if (siblingGroup?.title) return siblingGroup.title;
    if (pathname.includes('/reports/')) return 'Отчёт по сотруднику';
    if (pathname.includes('/documents/')) return 'Документ сотрудника';
    if (pathname.match(/\/employees\/[^/]+\/schedule/))
      return 'Обычный график работы (изменение)';
    if (pathname.startsWith('/employees/')) return 'Сотрудник';
    return 'HR HUB';
  }, [pathname, search, activeItem, activeReport, siblingGroup]);

  function logout() {
    void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
    setLocal(null);
    setProfileOpen(false);
    router.replace('/');
  }

  function logoutForgetDevice() {
    void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
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
    const next: ThemeMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    applyTheme(next);
    setProfileOpen(false);
  }

  function closePasswordModal() {
    setPwdOpen(false);
    setPwdForm({ current: '', next: '', confirm: '' });
    setPwdMsg('');
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (pwdBusy) return;
    setPwdMsg('');
    if (!pwdForm.current) {
      setPwdMsg('Введите текущий пароль');
      return;
    }
    if (pwdForm.next.length < 8) {
      setPwdMsg('Новый пароль должен быть не короче 8 символов');
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdMsg('Пароли не совпадают');
      return;
    }
    setPwdBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwdForm.current, newPassword: pwdForm.next }),
      });
      setPwdForm({ current: '', next: '', confirm: '' });
      setPwdMsg('Пароль обновлён');
      setTimeout(closePasswordModal, 900);
    } catch (err) {
      setPwdMsg(err instanceof Error && err.message ? err.message : 'Не удалось изменить пароль');
    } finally {
      setPwdBusy(false);
    }
  }

  if (!session) {
    return <div className={styles.loading}>Загрузка…</div>;
  }

  const visibleSections: NavSection[] = NAV_SECTIONS.map((sec) => ({
    ...sec,
    groups: sec.groups
      .map((g) => ({ ...g, items: filterNavItems(g.items, access, session.user.role) }))
      .filter((g) => g.items.length > 0),
  })).filter((sec) => sec.groups.length > 0);

  const bottomShortcuts = BOTTOM_SHORTCUTS.flatMap((s) => {
    const first = visibleSections.find((v) => v.id === s.section)?.groups[0]?.items[0];
    return first ? [{ ...s, href: first.href }] : [];
  });

  return (
    <div className={styles.shell}>
      <SeasonalBackdrop mode="app" section={activeSectionId} />
      <a className={styles.skipLink} href="#main-content">
        К основному содержимому
      </a>
      <header className={styles.topNav} data-no-print>
        <div className={styles.topNavInner}>
          <button
            ref={menuBtnRef}
            type="button"
            className={sb.menuBtn}
            aria-label="Меню"
            aria-expanded={mobileOpen}
            aria-controls="app-nav-drawer"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <i className="fas fa-bars" aria-hidden />
          </button>

          <Link href="/dashboard" className={styles.brandLink}>
            <span className={styles.brandMark} aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 10h.01" />
                <path d="M15 10h.01" />
                <path d="M12 2a8 8 0 0 0-8 8v1.5a2.5 2.5 0 0 0 2.5 2.5H9l3 5 3-5h2.5A2.5 2.5 0 0 0 20 11.5V10a8 8 0 0 0-8-8z" />
                <path d="M8 21h8" />
              </svg>
            </span>
            <span className={styles.brandText}>
              <strong>HR HUB</strong>
              <small>{session.tenant?.name ?? 'Platform'}</small>
            </span>
          </Link>

          <nav className={sb.crumbs} aria-label="Хлебные крошки">
            {activeSection ? (
              <>
                <span className={sb.crumbSection}>{activeSection.label}</span>
                <span className={sb.crumbSep} aria-hidden>
                  /
                </span>
              </>
            ) : null}
            <span className={sb.crumbPage} aria-current="page">
              {pageTitle}
            </span>
          </nav>

          <div className={styles.topRight}>
            <div className={styles.topTools}>
            <button
              type="button"
              className={styles.iconBtn}
              title={themeMode === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              aria-label={themeMode === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
              aria-pressed={themeMode === 'dark'}
              onClick={toggleScreenMode}
            >
              <i className={`fas ${themeMode === 'light' ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
            </button>
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
                title="Уведомления"
                aria-label="Уведомления"
                aria-expanded={notifyOpen}
                onClick={() => {
                  setNotifyOpen((v) => !v);
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
                    <div className={styles.dropHeadActions}>
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
                      {notifications.length > 0 ? (
                        <button
                          type="button"
                          className={styles.dropHeadBtnDanger}
                          onClick={async () => {
                            await apiFetch('/api/me/notifications', {
                              method: 'DELETE',
                            });
                            setNotifications([]);
                            setUnreadCount(0);
                          }}
                        >
                          Очистить
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div className={styles.dropEmpty}>Нет уведомлений</div>
                  ) : (
                    <div className={styles.notifyList}>
                      {notifications.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          className={
                            n.readAt ? styles.notifyRow : styles.notifyRowUnread
                          }
                        >
                          <Link
                            href={n.href || '#'}
                            className={
                              n.readAt
                                ? styles.notifyItem
                                : styles.notifyItemUnread
                            }
                            onClick={async () => {
                              setNotifyOpen(false);
                              if (!n.readAt) {
                                try {
                                  await apiFetch(
                                    `/api/me/notifications/${n.id}/read`,
                                    { method: 'PATCH' },
                                  );
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
                          <button
                            type="button"
                            className={styles.notifyDismiss}
                            title="Удалить"
                            aria-label="Удалить уведомление"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try {
                                await apiFetch(`/api/me/notifications/${n.id}`, {
                                  method: 'DELETE',
                                });
                                setNotifications((prev) =>
                                  prev.filter((x) => x.id !== n.id),
                                );
                                if (!n.readAt) {
                                  setUnreadCount((c) => Math.max(0, c - 1));
                                }
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            </div>

            <div className={styles.profileWrap}>
              <button
                type="button"
                className={styles.profileBtn}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifyOpen(false);
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
                    href="mailto:support@hrhub.local?subject=Отзыв%20HR%20HUB"
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
                    href="/m"
                    className={styles.dropItemLink}
                    onClick={() => setProfileOpen(false)}
                  >
                    <i className="fas fa-mobile-alt" aria-hidden />
                    Мобильная версия
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
          onClick={closePasswordModal}
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
                onClick={closePasswordModal}
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
              <button type="button" onClick={closePasswordModal}>
                Отмена
              </button>
              <button type="submit" className={styles.pwdSave} disabled={pwdBusy}>
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
            className={sb.backdrop}
            aria-label="Закрыть меню"
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="app-nav-drawer"
            className={sb.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Навигация"
            data-no-print
          >
            <div className={sb.drawerHead}>
              <div>
                <strong>HR HUB</strong>
                <small>{session.tenant?.name ?? 'Platform'}</small>
              </div>
              <button
                ref={drawerCloseRef}
                type="button"
                className={sb.drawerClose}
                aria-label="Закрыть меню"
                onClick={() => setMobileOpen(false)}
              >
                <i className="fas fa-times" aria-hidden />
              </button>
            </div>
            <nav className={sb.navScroll} aria-label="Основная навигация">
              <SidebarNav
                idPrefix="drawer-nav"
                sections={visibleSections}
                activeSectionId={activeSectionId}
                activeItemId={activeItem?.id ?? null}
                isOpen={isSectionOpen}
                onToggle={toggleNavSection}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
          </aside>
        </>
      ) : null}

      <div className={sb.body}>
        <aside className={compact ? sb.sidebarCompact : sb.sidebar} data-no-print>
          <nav className={sb.navScroll} aria-label="Основная навигация">
            <SidebarNav
              idPrefix="side-nav"
              sections={visibleSections}
              activeSectionId={activeSectionId}
              activeItemId={activeItem?.id ?? null}
              isOpen={isSectionOpen}
              onToggle={toggleNavSection}
              compact={compact}
            />
          </nav>
          <div className={sb.sidebarFoot}>
            <button
              type="button"
              className={sb.collapseBtn}
              aria-pressed={compact}
              title={compact ? 'Развернуть меню' : 'Свернуть меню'}
              onClick={toggleCompact}
            >
              <i className={`fas ${compact ? 'fa-angle-double-right' : 'fa-angle-double-left'}`} aria-hidden />
              <span>Свернуть меню</span>
            </button>
          </div>
        </aside>

        <div className={sb.content}>
          <main
            id="main-content"
            className={styles.main}
            onClick={() => {
              setProfileOpen(false);
              setNotifyOpen(false);
              setSearchOpen(false);
            }}
          >
            {children}
          </main>
        </div>
      </div>

      <nav className={sb.bottomBar} aria-label="Быстрые разделы" data-no-print>
        {bottomShortcuts.map((s) => {
          const active = !mobileOpen && activeSectionId === s.section;
          return (
            <Link
              key={s.section}
              href={s.href}
              className={active ? sb.bottomActive : sb.bottomItem}
              aria-current={active ? 'page' : undefined}
            >
              <i className={`fas ${NAV_SECTIONS.find((n) => n.id === s.section)?.faIcon ?? 'fa-circle'}`} aria-hidden />
              <span>{s.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={mobileOpen ? sb.bottomActive : sb.bottomItem}
          aria-expanded={mobileOpen}
          aria-controls="app-nav-drawer"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <i className="fas fa-ellipsis-h" aria-hidden />
          <span>Ещё</span>
        </button>
      </nav>
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
