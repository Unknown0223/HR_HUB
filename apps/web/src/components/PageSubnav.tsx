'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FORM_SIBLINGS, type SiblingGroup } from '@/lib/form-siblings';
import styles from './page-subnav.module.css';

function linkActive(pathname: string, search: string, href: string) {
  const [path, qs] = href.split('?');
  if (pathname !== path) {
    return false;
  }
  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (!qs) {
    if (path === '/employees') {
      const tab = current.get('tab');
      return !tab || tab === 'active' || tab === 'all';
    }
    if (path === '/divisions') {
      const tab = current.get('tab');
      return !tab || tab === 'divisions';
    }
    // Bare /catalog/devices must not look active when ?filter=new is set
    if (path === '/catalog/devices') {
      return current.get('filter') !== 'new';
    }
    return true;
  }
  const want = new URLSearchParams(qs);
  for (const [k, v] of want.entries()) {
    if (current.get(k) !== v) return false;
  }
  return true;
}

function PageSubnavInner({
  groupKey,
  group,
  titleOverride,
}: {
  groupKey?: string;
  group?: SiblingGroup;
  titleOverride?: string;
}) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const resolved = group ?? (groupKey ? FORM_SIBLINGS[groupKey] : undefined);
  if (!resolved) return null;

  const title = titleOverride ?? resolved.title;

  // Keep current page in sibling pills (active state). Hide bar title when a
  // sibling already represents this page to avoid "Устройства | Устройства | …".
  const siblings = resolved.siblings;
  const titleCoveredBySibling = siblings.some((s) => {
    const path = s.href.split('?')[0];
    return path === pathname && s.label === title;
  });
  const showTitle = !titleCoveredBySibling;

  return (
    <div className={styles.bar} data-no-print>
      <div className={styles.inner}>
        <div className={styles.left}>
          {showTitle ? (
            <h1 className={styles.title}>
              <i className={`fas fa-bars ${styles.bars}`} aria-hidden />
              <span>{title}</span>
            </h1>
          ) : null}
          {siblings.length > 0 ? (
            <>
              {showTitle ? <span className={styles.sep} aria-hidden /> : null}
              <nav className={styles.links} aria-label="Связанные разделы">
                {siblings.map((s) => {
                  const active = linkActive(pathname, search, s.href);
                  return (
                    <Link
                      key={s.href + s.label}
                      href={s.href}
                      className={active ? styles.linkActive : styles.link}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </nav>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PageSubnav(props: {
  groupKey?: string;
  group?: SiblingGroup;
  titleOverride?: string;
}) {
  return (
    <Suspense fallback={null}>
      <PageSubnavInner {...props} />
    </Suspense>
  );
}
