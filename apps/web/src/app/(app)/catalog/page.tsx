'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getSession } from '@/lib/api';
import { NAV_SECTIONS } from '@/lib/nav-registry';
import { filterNavItems, type MyAccess } from '@/lib/role-access';
import shared from '../../page-shared.module.css';
import styles from './catalog.module.css';

export default function CatalogIndexPage() {
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiFetch<MyAccess>('/api/settings/my-access')
      .then(setAccess)
      .catch(() => setAccess({ bypass: true, allowed: [] }));
  }, []);

  const sections = useMemo(() => {
    if (!access) return [];
    const role = getSession()?.user.role;
    const q = query.trim().toLowerCase();
    return NAV_SECTIONS.filter((s) => s.id !== 'home')
      .map((s) => ({
        ...s,
        groups: s.groups
          .map((g) => {
            const titleHit = !q || `${s.label} ${g.title}`.toLowerCase().includes(q);
            const items = filterNavItems(g.items, access, role).filter(
              (i) => i.href !== '/catalog' && (titleHit || i.label.toLowerCase().includes(q)),
            );
            return { ...g, items };
          })
          .filter((g) => g.items.length > 0),
      }))
      .filter((s) => s.groups.length > 0);
  }, [access, query]);

  const total = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0);

  return (
    <div className={shared.wrap}>
      <div className={shared.header}>
        <div>
          <h1 className={styles.title}>Каталог модулей</h1>
          <p className={shared.lead}>
            Все разделы HR HUB, доступные вашей роли, в одном списке — с теми же группами, что и в
            боковом меню.
          </p>
        </div>
        <label className={styles.search}>
          <i className="fas fa-search" aria-hidden />
          <span className={styles.srOnly}>Поиск модуля</span>
          <input
            type="search"
            value={query}
            placeholder="Поиск модуля…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {access === null ? (
        <p className={shared.muted}>Загрузка…</p>
      ) : total === 0 ? (
        <p className={shared.muted}>{query ? 'Ничего не найдено' : 'Нет доступных разделов для вашей роли'}</p>
      ) : (
        sections.map((s) => (
          <section key={s.id} className={styles.section} aria-labelledby={`catalog-${s.id}`}>
            <h2 id={`catalog-${s.id}`} className={styles.sectionTitle}>
              <i className={`fas ${s.faIcon}`} aria-hidden /> {s.label}
            </h2>
            <div className={styles.grid}>
              {s.groups.map((g) => (
                <div key={g.id} className={styles.card}>
                  {s.groups.length > 1 || g.title !== s.label ? (
                    <h3 className={styles.cardTitle}>{g.title}</h3>
                  ) : null}
                  <ul className={styles.list}>
                    {g.items.map((i) => (
                      <li key={i.id}>
                        <Link className={styles.link} href={i.href}>
                          <i className={`fas ${i.faIcon}`} aria-hidden />
                          {i.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
