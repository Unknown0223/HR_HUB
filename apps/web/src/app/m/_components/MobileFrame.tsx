'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { getSession, Session } from '@/lib/api';
import styles from '../mobile.module.css';

const TABS = [
  { href: '/m', label: 'Asosiy', icon: 'fa-home' },
  { href: '/m/calendar', label: 'Kalendar', icon: 'fa-calendar-alt' },
  { href: '/m/news', label: 'Yangiliklar', icon: 'fa-newspaper' },
  { href: '/m/profile', label: 'Profil', icon: 'fa-user' },
];

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.bottomNav}>
      {TABS.map((tab) => {
        const active =
          tab.href === '/m' ? pathname === '/m' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? styles.navItemActive : styles.navItem}
          >
            <i className={`fas ${tab.icon}`} aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Screen chrome for /m: title bar (with optional back arrow), scroll body and
 * the 4-tab bar. Redirects to /m/login when there is no session.
 */
export default function MobileFrame({
  title,
  subtitle,
  back,
  bell,
  unread = 0,
  children,
  hideNav,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  bell?: boolean;
  unread?: number;
  children: ReactNode;
  hideNav?: boolean;
}) {
  const router = useRouter();
  // Client-only: seed from localStorage on first paint so we don't flash the
  // loading shell after soft navigations / screenshot harness reloads.
  const [session, setLocal] = useState<Session | null>(() =>
    typeof window === 'undefined' ? null : getSession(),
  );

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/m/login');
      return;
    }
    setLocal(s);
  }, [router]);

  if (!session) {
    return (
      <div className={styles.app}>
        <div className={styles.loading}>Yuklanmoqda…</div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerBack}>
          {back ? (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => router.push(back)}
              aria-label="Orqaga"
            >
              <i className="fas fa-chevron-left" aria-hidden />
            </button>
          ) : null}
          <div>
            <h1 className={back ? `${styles.title} ${styles.titleSm}` : styles.title}>
              {title}
            </h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </div>
        {bell ? (
          <Link href="/m/news" className={styles.bell} aria-label="Bildirishnomalar">
            <i className="far fa-bell" aria-hidden />
            {unread > 0 ? (
              <span className={styles.bellDot}>{unread > 99 ? '99+' : unread}</span>
            ) : null}
          </Link>
        ) : null}
      </header>

      <div className={styles.scroll}>{children}</div>

      {hideNav ? null : <BottomNav />}
    </div>
  );
}
