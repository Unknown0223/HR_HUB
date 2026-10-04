'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import styles from './profile-dialogs.module.css';

type SessionRow = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

type PrefRow = { id: string; label: string; hint: string; enabled: boolean };

/** Browser/app and OS, e.g. Chrome + Windows — enough to recognise one's own device. */
export function describeDevice(ua: string | null): { browser: string; os: string; mobile: boolean } {
  const s = ua ?? '';
  const os = /Android/i.test(s)
    ? 'Android'
    : /iPhone|iPad|iOS/i.test(s)
      ? 'iOS'
      : /Windows/i.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(s)
          ? 'macOS'
          : /Linux/i.test(s)
            ? 'Linux'
            : '';
  const app = /Dart\/|okhttp|hr_hub_mobile|Worklyn/i.test(s) && !/Mozilla/i.test(s);
  const browser = app
    ? 'Мобильное приложение'
    : /Edg\//.test(s)
      ? 'Edge'
      : /OPR\/|Opera/.test(s)
        ? 'Opera'
        : /YaBrowser/.test(s)
          ? 'Яндекс Браузер'
          : /Firefox\//.test(s)
            ? 'Firefox'
            : /Chrome\//.test(s)
              ? 'Chrome'
              : /Safari\//.test(s)
                ? 'Safari'
                : 'Неизвестное устройство';
  return { browser, os, mobile: app || os === 'Android' || os === 'iOS' };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} aria-label={t('Закрыть')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function SessionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await apiFetch<SessionRow[]>('/api/auth/sessions'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось загрузить сеансы'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось завершить сеанс'));
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy('others');
    try {
      await apiFetch('/api/auth/sessions/revoke-others', { method: 'POST' });
      setRows((prev) => prev?.filter((r) => r.current) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось завершить сеансы'));
    } finally {
      setBusy(null);
    }
  }

  const others = rows?.filter((r) => !r.current).length ?? 0;

  return (
    <Dialog
      title={t('Активные сеансы')}
      onClose={onClose}
      footer={
        <>
          <span className={styles.footerHint}>
            {t('Завершённый сеанс сразу выходит из системы на том устройстве')}
          </span>
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={!others || busy !== null}
            onClick={() => void revokeOthers()}
          >
            {t('Завершить все другие')}
          </button>
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {!rows ? (
        <p className={styles.muted}>{t('Загрузка…')}</p>
      ) : !rows.length ? (
        <p className={styles.muted}>{t('Нет данных о сеансах — они появятся после следующего входа')}</p>
      ) : (
        <ul className={styles.sessionList}>
          {rows.map((r) => {
            const device = describeDevice(r.userAgent);
            return (
              <li key={r.id} className={r.current ? styles.sessionCurrent : styles.session}>
                <span className={styles.sessionIcon}>
                  <i className={`fas ${device.mobile ? 'fa-mobile-alt' : 'fa-desktop'}`} aria-hidden />
                </span>
                <div className={styles.sessionInfo}>
                  <strong>
                    {[t(device.browser), device.os].filter(Boolean).join(' · ')}
                    {r.current ? <span className={styles.badge}>{t('Этот сеанс')}</span> : null}
                  </strong>
                  <span>
                    {t('Вход')}: {formatDateTime(r.createdAt)}
                    {r.ip ? ` · IP ${r.ip}` : ''}
                  </span>
                  <span>
                    {t('Активность')}: {formatDateTime(r.lastSeenAt)}
                  </span>
                </div>
                {!r.current ? (
                  <button
                    type="button"
                    className={styles.revokeBtn}
                    disabled={busy !== null}
                    onClick={() => void revoke(r.id)}
                  >
                    {t('Завершить')}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function NotificationPrefsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PrefRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<PrefRow[]>('/api/notifications/preferences')
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('Не удалось загрузить настройки')));
  }, [t]);

  async function toggle(id: string, enabled: boolean) {
    setError('');
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, enabled } : r)) ?? null);
    try {
      const next = await apiFetch<PrefRow[]>('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ [id]: enabled }),
      });
      setRows(next);
    } catch (e) {
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)) ?? null);
      setError(e instanceof Error ? e.message : t('Не удалось сохранить'));
    }
  }

  return (
    <Dialog
      title={t('Настройки уведомлений')}
      onClose={onClose}
      footer={
        <span className={styles.footerHint}>
          {t('Изменения сохраняются сразу. Системные уведомления приходят всегда.')}
        </span>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {!rows ? (
        <p className={styles.muted}>{t('Загрузка…')}</p>
      ) : (
        <ul className={styles.prefList}>
          {rows.map((r) => (
            <li key={r.id}>
              <label className={styles.pref}>
                <span className={styles.prefText}>
                  <strong>{t(r.label)}</strong>
                  <span>{t(r.hint)}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className={styles.switch}
                  checked={r.enabled}
                  onChange={(e) => void toggle(r.id, e.target.checked)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
