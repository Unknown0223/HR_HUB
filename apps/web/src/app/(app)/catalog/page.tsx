'use client';

import Link from 'next/link';
import { CATALOG_NAV } from '@/lib/catalog-nav';
import styles from '../../page-shared.module.css';

export default function CatalogIndexPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.h1}>To‘liq katalog</h1>
          <p className={styles.lead}>
            Каталог модулей HR HUB (паритет экранов Verifix).
          </p>
        </div>
      </div>
      <div className={styles.grid}>
        {CATALOG_NAV.map((g) => (
          <div key={g.label} className={styles.card}>
            <h2>{g.label}</h2>
            <p>{g.items.length} modul</p>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem', fontSize: 13 }}>
              {g.items.slice(0, 8).map((i) => (
                <li key={i.href + i.label}>
                  <Link className={styles.link} href={i.href}>
                    {i.label}
                  </Link>
                </li>
              ))}
              {g.items.length > 8 && (
                <li className={styles.muted}>+{g.items.length - 8} ta yana (sidebar)</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
