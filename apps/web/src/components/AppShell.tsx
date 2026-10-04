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
import { I18nProvider, LANGS, useI18n } from '@/lib/i18n';
import { SidebarNav } from './SidebarNav';
import styles from './shell.module.css';
import sb from './sidebar.module.css';

const COMPACT_KEY = 'hrhub.sidebar.compact';
const OPEN_KEY = 'hrhub.sidebar.open';

function storeOpenSections(ids: NavSectionId[]) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

const BOTTOM_SHORTCUTS: { section: NavSectionId; label: string }[] = [
  { section: 'home', label: 'Главная' },
  { section: 'employees', label: 'Сотрудники' },
  { section: 'attendance', label: 'Посещаемость' },
  { section: 'reports', label: 'Отчёты' },
];

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Администратор платформы',
  tenant_admin: 'Администратор',
  hr: 'HR-менеджер',
  manager: 'Руководитель',
  employee: 'Сотрудник',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
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
  /** Accordion: at most one section is expanded; the current page's section opens itself. */
  const [openSections, setOpenSections] = useState<NavSectionId[]>([]);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const profileWrapRef = useRef<HTMLDivElement>(null);
  const canOpenSettings = !access || access.bypass || isHrefAllowed('/settings', '', access.allowed, false);

  useEffect(() => {
    if (!profileOpen) return;
    function onDown(e: MouseEvent) {
      if (!profileWrapRef.current?.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [profileOpen]);

  useLayoutEffect(() => {
    try {
      setCompact(localStorage.getItem(COMPACT_KEY) === '1');
      const stored: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        const known = new Set<string>(NAV_SECTIONS.map((s) => s.id));
        const ids = stored.filter((id): id is NavSectionId => known.has(id));
        setOpenSections((prev) => (prev.length ? prev : ids.slice(-1)));
      }
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
      .catch((e: unknown) => {
        // Network errors and 5xx (e.g. API redeploy) keep the local session.
        const status = (e as { status?: number } | null)?.status;
        if (status !== 401 && status !== 403) return;
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

  const updateOpenSections = useCallback(
    (fn: (prev: NavSectionId[]) => NavSectionId[]) => {
      setOpenSections((prev) => {
        const next = fn(prev);
        if (next !== prev) storeOpenSections(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!activeSectionId) return;
    updateOpenSections((prev) =>
      prev.length === 1 && prev[0] === activeSectionId ? prev : [activeSectionId],
    );
  }, [activeSectionId, updateOpenSections]);

  const isSectionOpen = useCallback(
    (id: NavSectionId) => openSections.includes(id),
    [openSections],
  );

  const setCompactStored = useCallback((next: boolean) => {
    setCompact(next);
    try {
      localStorage.setItem(COMPACT_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleNavSection = useCallback(
    (id: NavSectionId) => {
      if (compact) {
        setCompactStored(false);
        updateOpenSections(() => [id]);
        return;
      }
      updateOpenSections((prev) => (prev.includes(id) ? [] : [id]));
    },
    [compact, setCompactStored, updateOpenSections],
  );

  const collapseAllSections = useCallback(
    () => updateOpenSections(() => []),
    [updateOpenSections],
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

  function toggleScreenMode(closeMenu = true) {
    const next: ThemeMode = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    applyTheme(next);
    if (closeMenu) setProfileOpen(false);
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
      setPwdMsg(t('Введите текущий пароль'));
      return;
    }
    if (pwdForm.next.length < 8) {
      setPwdMsg(t('Новый пароль должен быть не короче 8 символов'));
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdMsg(t('Пароли не совпадают'));
      return;
    }
    setPwdBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwdForm.current, newPassword: pwdForm.next }),
      });
      setPwdForm({ current: '', next: '', confirm: '' });
      setPwdMsg(t('Пароль обновлён'));
      setTimeout(closePasswordModal, 900);
    } catch (err) {
      setPwdMsg(err instanceof Error && err.message ? err.message : t('Не удалось изменить пароль'));
    } finally {
      setPwdBusy(false);
    }
  }

  if (!session) {
    return <div className={styles.loading}>{t('Загрузка…')}</div>;
  }

  const visibleSections: NavSection[] = NAV_SECTIONS.map((sec) => ({
    ...sec,
    groups: sec.groups
      .map((g) => ({ ...g, items: filterNavItems(g.items, access, session.user.role) }))
      .filter((g) => g.items.length > 0),
  })).filter((sec) => sec.groups.length > 0);

  const expandedCount = visibleSections.filter(
    (sec) => openSections.includes(sec.id) && sec.groups.flatMap((g) => g.items).length > 1,
  ).length;

  const bottomShortcuts = BOTTOM_SHORTCUTS.flatMap((s) => {
    const first = visibleSections.find((v) => v.id === s.section)?.groups[0]?.items[0];
    return first ? [{ ...s, href: first.href }] : [];
  });

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        {t('К основному содержимому')}
      </a>
      <header className={styles.topNav} data-no-print>
        <div className={styles.topNavInner}>
          <button
            ref={menuBtnRef}
            type="button"
            className={sb.menuBtn}
            aria-label={t('Меню')}
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

          <nav className={sb.crumbs} aria-label={t('Хлебные крошки')}>
            {activeSection ? (
              <>
                <span className={sb.crumbSection}>{t(activeSection.label)}</span>
                <span className={sb.crumbSep} aria-hidden>
                  /
                </span>
              </>
            ) : null}
            <span className={sb.crumbPage} aria-current="page">
              {t(pageTitle)}
            </span>
          </nav>

          <div className={styles.topRight}>
            <div className={styles.topTools}>
            <button
              type="button"
              className={styles.iconBtn}
              title={themeMode === 'light' ? t('Тёмная тема') : t('Светлая тема')}
              aria-label={themeMode === 'light' ? t('Тёмная тема') : t('Светлая тема')}
              aria-pressed={themeMode === 'dark'}
              onClick={() => toggleScreenMode()}
            >
              <i className={`fas ${themeMode === 'light' ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.langBtn}`}
              title={t('Язык интерфейса')}
              aria-label={t('Язык интерфейса')}
              onClick={() => setLang(lang === 'ru' ? 'uz' : 'ru')}
            >
              {LANGS.find((l) => l.id === lang)?.short}
            </button>
            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.iconBtn}
                title={t('Поиск')}
                aria-label={t('Поиск')}
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
                    <span>{t('Глобальный поиск')}</span>
                  </div>
                  <div className={styles.searchBox}>
                    <input
                      autoFocus
                      type="search"
                      className={styles.searchInput}
                      placeholder={t('Сотрудник, физлицо, подразделение…')}
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  </div>
                  <div className={styles.searchBody}>
                    {searchBusy ? (
                      <div className={styles.dropEmpty}>{t('Поиск…')}</div>
                    ) : !searchRes || searchQ.trim().length < 1 ? (
                      <div className={styles.dropEmpty}>{t('Введите запрос')}</div>
                    ) : !searchRes.employees.length &&
                      !searchRes.persons.length &&
                      !searchRes.divisions.length ? (
                      <div className={styles.dropEmpty}>{t('Ничего не найдено')}</div>
                    ) : (
                      <>
                        {searchRes.employees.length ? (
                          <div className={styles.searchGroup}>
                            <div className={styles.searchGroupTitle}>{t('Сотрудники')}</div>
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
                            <div className={styles.searchGroupTitle}>{t('Физические лица')}</div>
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
                            <div className={styles.searchGroupTitle}>{t('Подразделения')}</div>
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
                title={t('Уведомления')}
                aria-label={t('Уведомления')}
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
                    <span>{t('Уведомления')} ({notifications.length})</span>
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
                          {t('Прочитать все')}
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
                          {t('Очистить')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div className={styles.dropEmpty}>{t('Нет уведомлений')}</div>
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
                              {new Date(n.createdAt).toLocaleString(lang === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
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
                            title={t('Удалить')}
                            aria-label={t('Удалить уведомление')}
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

            <div className={styles.profileWrap} ref={profileWrapRef}>
              <button
                type="button"
                className={styles.profileBtn}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifyOpen(false);
                  setSearchOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-label={t('Профиль')}
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
                    <span className={styles.profileMenuAvatar}>
                      {initials(session.user.fullName)}
                    </span>
                    <div className={styles.profileMenuWho}>
                      <strong title={session.user.fullName}>{session.user.fullName}</strong>
                      {session.user.email ? (
                        <span title={session.user.email}>{session.user.email}</span>
                      ) : null}
                      <div className={styles.profileMenuChips}>
                        <span className={styles.profileChipRole}>
                          {t(ROLE_LABEL[session.user.role] ?? session.user.role)}
                        </span>
                        {session.tenant?.name ? (
                          <span className={styles.profileChip} title={session.tenant.name}>
                            <i className="fas fa-building" aria-hidden />
                            {session.tenant.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.profileMenuSection}>{t('Аккаунт')}</div>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.dropItem}
                    onClick={() => {
                      setProfileOpen(false);
                      setPwdOpen(true);
                      setPwdMsg('');
                    }}
                  >
                    <i className="fas fa-key" aria-hidden />
                    {t('Изменить пароль')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.dropItem}
                    onClick={() => {
                      setProfileOpen(false);
                      setScreenLocked(true);
                    }}
                  >
                    <i className="fas fa-lock" aria-hidden />
                    {t('Блокировка экрана')}
                  </button>
                  {canOpenSettings ? (
                    <Link
                      href="/settings"
                      role="menuitem"
                      className={styles.dropItemLink}
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="fas fa-cog" aria-hidden />
                      {t('Настройки системы')}
                    </Link>
                  ) : null}

                  <div className={styles.profileMenuSection}>{t('Интерфейс')}</div>
                  <div className={styles.profilePrefRow}>
                    <div className={styles.segmented} role="group" aria-label={t('Режим экрана')}>
                      {(['light', 'dark'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={themeMode === mode}
                          className={themeMode === mode ? styles.segmentedOn : undefined}
                          onClick={() => {
                            if (themeMode !== mode) toggleScreenMode(false);
                          }}
                        >
                          <i className={`fas ${mode === 'light' ? 'fa-sun' : 'fa-moon'}`} aria-hidden />
                          {mode === 'light' ? t('Светлый') : t('Тёмный')}
                        </button>
                      ))}
                    </div>
                    <div className={styles.segmented} role="group" aria-label={t('Язык интерфейса')}>
                      {LANGS.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          aria-pressed={lang === l.id}
                          title={l.label}
                          className={lang === l.id ? styles.segmentedOn : undefined}
                          onClick={() => setLang(l.id)}
                        >
                          {l.short}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.profileMenuSep} />
                  <button type="button" role="menuitem" className={styles.logout} onClick={logout}>
                    <i className="fas fa-sign-out-alt" aria-hidden />
                    {t('Выйти')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.logoutDanger}
                    title={t('Удалит сохранённые на этом компьютере настройки таблиц, фильтры и шаблоны')}
                    onClick={() => {
                      if (
                        window.confirm(
                          t('Выйти и удалить с этого компьютера сохранённые настройки таблиц, фильтры и шаблоны?'),
                        )
                      ) {
                        logoutForgetDevice();
                      }
                    }}
                  >
                    <i className="fas fa-unlink" aria-hidden />
                    {t('Выйти и забыть устройство')}
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
            <span className={styles.lockHint}>{t('Экран заблокирован')}</span>
            <button
              type="button"
              className={styles.lockUnlock}
              onClick={() => setScreenLocked(false)}
            >
              {t('Разблокировать')}
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
              <h2 id="pwd-title">{t('Изменить пароль')}</h2>
              <button
                type="button"
                className={styles.pwdClose}
                aria-label={t('Закрыть')}
                onClick={closePasswordModal}
              >
                ×
              </button>
            </div>
            <label className={styles.pwdField}>
              <span>{t('Текущий пароль')}</span>
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
              <span>{t('Новый пароль')}</span>
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
              <span>{t('Подтверждение')}</span>
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
                {t('Отмена')}
              </button>
              <button type="submit" className={styles.pwdSave} disabled={pwdBusy}>
                {t('Сохранить')}
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
            aria-label={t('Закрыть меню')}
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="app-nav-drawer"
            className={sb.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={t('Навигация')}
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
                aria-label={t('Закрыть меню')}
                onClick={() => setMobileOpen(false)}
              >
                <i className="fas fa-times" aria-hidden />
              </button>
            </div>
            <nav className={sb.navScroll} aria-label={t('Основная навигация')}>
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
          <div className={sb.sidebarHead}>
            {!compact ? (
              <>
                <span className={sb.sidebarHeadTitle}>{t('Разделы')}</span>
                <button
                  type="button"
                  className={sb.headTool}
                  disabled={!expandedCount}
                  title={t('Закрыть все разделы')}
                  aria-label={t('Закрыть все разделы')}
                  onClick={collapseAllSections}
                >
                  <i className="fas fa-compress-alt" aria-hidden />
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={compact ? sb.railToggleWide : sb.headTool}
              aria-pressed={compact}
              title={compact ? t('Развернуть меню') : t('Свернуть меню до иконок')}
              aria-label={compact ? t('Развернуть меню') : t('Свернуть меню до иконок')}
              onClick={() => setCompactStored(!compact)}
            >
              <i className={`fas ${compact ? 'fa-angle-double-right' : 'fa-angle-double-left'}`} aria-hidden />
            </button>
          </div>
          <nav className={sb.navScroll} aria-label={t('Основная навигация')}>
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

      <nav className={sb.bottomBar} aria-label={t('Быстрые разделы')} data-no-print>
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
              <span>{t(s.label)}</span>
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
          <span>{t('Ещё')}</span>
        </button>
      </nav>
    </div>
  );
}

/** Lives outside the Suspense boundary so the photo is in the server HTML and survives the session load. */
function ShellBackdrop() {
  const pathname = usePathname() ?? '';
  return <SeasonalBackdrop mode="app" section={findNavSection(pathname)} />;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ShellBackdrop />
      <Suspense fallback={<div className={styles.loading}>Загрузка…</div>}>
        <AppShellInner>{children}</AppShellInner>
      </Suspense>
    </I18nProvider>
  );
}
