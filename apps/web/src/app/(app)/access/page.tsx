'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getSession } from '@/lib/api';
import type { AccessSummary } from '@/lib/access';
import { NAV_SECTIONS } from '@/lib/nav-registry';
import { filterNavItems, type MyAccess } from '@/lib/role-access';
import styles from './access.module.css';

const DESCRIPTIONS: Record<string, string> = {
  'access-grants': 'Доступ сотрудников к оргструктуре и КПЭ, ограничения профиля, сроки и история',
  users: 'Учётные записи веб-системы, роли и зоны видимости пользователей',
  roles: 'Роли и их назначение пользователям',
  'role-access': 'Какие разделы меню доступны каждой роли',
  'mobile-access': 'Доступ сотрудников к мобильному приложению',
  audit: 'Журнал действий пользователей, включая изменения доступов',
};

export default function AccessHubPage() {
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [summary, setSummary] = useState<AccessSummary | null>(null);

  useEffect(() => {
    apiFetch<MyAccess>('/api/settings/my-access')
      .then(setAccess)
      .catch(() => setAccess({ bypass: true, allowed: [] }));
    apiFetch<AccessSummary>('/api/access/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const items = useMemo(() => {
    const section = NAV_SECTIONS.find((s) => s.id === 'access');
    const all = (section?.groups ?? []).flatMap((g) => g.items).filter((i) => i.href !== '/access');
    return filterNavItems(all, access, getSession()?.user.role);
  }, [access]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <h1 className={styles.title}>Доступы</h1>
          <p className={styles.subtitle}>
            Пользователи, роли, права и доступы сотрудников — в одном месте
          </p>
        </div>
      </header>

      {summary ? (
        <div className={styles.stats}>
          <Link href="/access/employees?grantStatus=active" className={styles.stat}>
            <span className={styles.statValue}>{summary.employeesWithAccess}</span>
            <span className={styles.statLabel}>Сотрудников с доступами</span>
          </Link>
          <Link href="/access/employees?grantStatus=expiring" className={styles.stat}>
            <span className={styles.statValue}>{summary.expiring}</span>
            <span className={styles.statLabel}>Истекают в ближайшие дни</span>
          </Link>
          <Link href="/access/employees?grantStatus=expired" className={styles.stat}>
            <span className={styles.statValue}>{summary.expired}</span>
            <span className={styles.statLabel}>Истёкшие, требуют решения</span>
          </Link>
        </div>
      ) : null}

      {access === null ? (
        <p className={styles.empty}>Загрузка…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Нет доступных разделов для вашей роли</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className={styles.card}>
                <span className={styles.cardIcon} aria-hidden>
                  <i className={`fas ${item.faIcon}`} />
                </span>
                <span className={styles.cardText}>
                  <span className={styles.cardTitle}>{item.label}</span>
                  {DESCRIPTIONS[item.id] ? <span className={styles.cardDesc}>{DESCRIPTIONS[item.id]}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
