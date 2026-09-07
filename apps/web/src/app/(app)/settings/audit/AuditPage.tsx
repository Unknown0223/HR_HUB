'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../../catalog/absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

type AuditRow = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await apiFetch<AuditRow[]>('/api/settings/audit'));
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
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.action, r.entity, r.entityId, r.createdAt].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="settings-admin" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-history" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Аудит</h1>
          <p className={shared.pageSubtitle}>Журнал действий в системе</p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <input
            className={styles.search}
            type="search"
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск по журналу"
          />
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>{filtered.length}</span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
            disabled={loading}
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Время</th>
              <th>Действие</th>
              <th>Сущность</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((a) => (
              <tr key={a.id}>
                <td>{String(a.createdAt).replace('T', ' ').slice(0, 19)}</td>
                <td>{a.action}</td>
                <td>{a.entity ?? '—'}</td>
                <td>
                  <code style={{ fontSize: 11 }}>{a.entityId?.slice(0, 8) ?? '—'}</code>
                </td>
              </tr>
            ))}
            {!loading && paged.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Пусто
                </td>
              </tr>
            ) : null}
            {loading && paged.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </button>
          <span className={styles.pagerMeta}>
            {pageSafe} / {pageCount}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={pageSafe >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Вперёд
          </button>
        </div>
      ) : null}
    </div>
  );
}
