'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import MobileFrame from '../_components/MobileFrame';
import styles from '../mobile.module.css';
import { uzDate } from '../_lib/mobile';

type NewsItem = {
  id: string;
  code: string;
  title: string;
  body: string | null;
  publishedAt: string | null;
};

type Notification = {
  id: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export default function MobileNewsPage() {
  const [tab, setTab] = useState<'news' | 'notifications'>('news');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [n, notif] = await Promise.all([
        apiFetch<NewsItem[]>('/api/mobile/v1/news'),
        apiFetch<Notification[]>('/api/mobile/v1/notifications'),
      ]);
      setNews(n);
      setNotifications(notif);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAll() {
    try {
      await apiFetch('/api/mobile/v1/notifications/read-all', { method: 'PATCH' });
      load();
    } catch {
      /* keep the list usable */
    }
  }

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <MobileFrame title="Yangiliklar" subtitle="Kompaniya lentasi" bell unread={unread}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.btnRow}>
        <button
          type="button"
          className={tab === 'news' ? styles.primaryBtn : styles.ghostBtn}
          onClick={() => setTab('news')}
        >
          Lenta
        </button>
        <button
          type="button"
          className={tab === 'notifications' ? styles.primaryBtn : styles.ghostBtn}
          onClick={() => setTab('notifications')}
        >
          Bildirishnoma{unread ? ` (${unread})` : ''}
        </button>
      </div>

      {tab === 'news' ? (
        news.length ? (
          news.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>
                  <i className="far fa-newspaper" aria-hidden />
                  {item.title}
                </span>
              </div>
              {item.body ? (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--m-ink-muted)' }}>
                  {item.body}
                </p>
              ) : null}
              {item.publishedAt ? (
                <p className={styles.hint} style={{ textAlign: 'left' }}>
                  {uzDate(item.publishedAt)}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className={styles.empty}>Yangiliklar yo‘q</p>
        )
      ) : notifications.length ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>
              <i className="far fa-bell" aria-hidden />
              Bildirishnomalar
            </span>
            {unread ? (
              <button
                type="button"
                className={styles.cardLink}
                onClick={markAll}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                Barchasini o‘qish
              </button>
            ) : null}
          </div>
          <ul className={styles.rowList}>
            {notifications.map((n) => (
              <li key={n.id}>
                <div className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>{n.title}</strong>
                    <small>{n.body ?? uzDate(n.createdAt)}</small>
                  </span>
                  {!n.readAt ? (
                    <span className={`${styles.pill} ${styles.pillDanger}`}>Yangi</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className={styles.empty}>Bildirishnomalar yo‘q</p>
      )}
    </MobileFrame>
  );
}
