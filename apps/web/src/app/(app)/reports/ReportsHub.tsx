'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getSession } from '@/lib/api';
import {
  REPORTS,
  REPORT_CATEGORIES,
  RECENT_REPORTS_KEY,
  type ReportCategoryId,
  type ReportDefinition,
} from '@/lib/reports-registry';
import { filterNavItems, type MyAccess } from '@/lib/role-access';
import styles from './reports-hub.module.css';

const CATEGORY_IDS = REPORT_CATEGORIES.map((c) => c.id);

function normalize(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е');
}

function matches(r: ReportDefinition, q: string) {
  if (!q) return true;
  const hay = normalize([r.title, r.description, ...(r.keywords ?? [])].join(' '));
  return normalize(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function ReportCard({ report }: { report: ReportDefinition }) {
  return (
    <li>
      <Link href={report.href} className={styles.card}>
        <span className={styles.cardIcon} aria-hidden>
          <i className={`fas ${report.faIcon}`} />
        </span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>{report.title}</span>
          <span className={styles.cardDesc}>{report.description}</span>
        </span>
      </Link>
    </li>
  );
}

export function ReportsHub({
  category,
  onCategory,
  query,
  onQuery,
}: {
  category: string;
  onCategory: (next: string) => void;
  query: string;
  onQuery: (next: string) => void;
}) {
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    apiFetch<MyAccess>('/api/settings/my-access')
      .then(setAccess)
      .catch(() => setAccess({ bypass: true, allowed: [] }));
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_REPORTS_KEY) || '[]');
      if (Array.isArray(raw)) setRecentIds(raw.filter((x): x is string => typeof x === 'string'));
    } catch {
      /* storage unavailable or corrupt */
    }
  }, []);

  const visible = useMemo(
    () => filterNavItems(REPORTS, access, getSession()?.user.role),
    [access],
  );

  const activeCategory = (CATEGORY_IDS as string[]).includes(category)
    ? (category as ReportCategoryId)
    : null;
  const q = query.trim();

  const filtered = visible.filter(
    (r) => (!activeCategory || r.category === activeCategory) && matches(r, q),
  );

  const recent = recentIds
    .map((id) => visible.find((r) => r.id === id))
    .filter((r): r is ReportDefinition => !!r)
    .slice(0, 6);

  const counts = new Map<ReportCategoryId, number>();
  for (const r of visible) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Отчёты</h1>
        <p className={styles.subtitle}>
          Все отчёты системы: кадры, посещаемость, зарплата, финансы и аналитика
        </p>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <i className="fas fa-search" aria-hidden />
          <span className={styles.srOnly}>Поиск отчёта</span>
          <input
            type="search"
            value={query}
            placeholder="Поиск по названию или описанию…"
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        <div className={styles.chips} role="group" aria-label="Категории">
          <button
            type="button"
            className={!activeCategory ? styles.chipActive : styles.chip}
            aria-pressed={!activeCategory}
            onClick={() => onCategory('')}
          >
            Все <span className={styles.chipCount}>{visible.length}</span>
          </button>
          {REPORT_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
            <button
              key={c.id}
              type="button"
              className={activeCategory === c.id ? styles.chipActive : styles.chip}
              aria-pressed={activeCategory === c.id}
              onClick={() => onCategory(activeCategory === c.id ? '' : c.id)}
            >
              <i className={`fas ${c.faIcon}`} aria-hidden /> {c.label}{' '}
              <span className={styles.chipCount}>{counts.get(c.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {!q && !activeCategory && recent.length > 0 ? (
        <section className={styles.group} aria-labelledby="reports-recent">
          <h2 id="reports-recent" className={styles.groupTitle}>
            <i className="fas fa-history" aria-hidden /> Недавно открытые
          </h2>
          <ul className={styles.grid}>
            {recent.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </ul>
        </section>
      ) : null}

      {access === null ? (
        <p className={styles.empty}>Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>
          {visible.length === 0 ? 'Нет доступных отчётов для вашей роли' : 'Ничего не найдено'}
        </p>
      ) : (
        REPORT_CATEGORIES.map((c) => {
          const items = filtered.filter((r) => r.category === c.id);
          if (!items.length) return null;
          return (
            <section key={c.id} className={styles.group} aria-labelledby={`reports-${c.id}`}>
              <h2 id={`reports-${c.id}`} className={styles.groupTitle}>
                <i className={`fas ${c.faIcon}`} aria-hidden /> {c.label}
                <span className={styles.groupCount}>{items.length}</span>
              </h2>
              <ul className={styles.grid}>
                {items.map((r) => (
                  <ReportCard key={r.id} report={r} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
