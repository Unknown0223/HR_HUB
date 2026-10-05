'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { FormModal } from '@/components/FormModal';
import fm from '@/components/form-modal.module.css';
import styles from './telegram-connect.module.css';

export type TelegramStatus = {
  configured: boolean;
  botUsername: string | null;
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  snoozedUntil: string | null;
  promptDue: boolean;
};

type Link = { url: string; botUsername: string; expiresAt: string };

const DISMISSED_KEY = 'worklyn_tg_prompt_dismissed';
const POLL_MS = 3000;

/**
 * Connect / manage the account's Telegram bot link. The deep link is single-use and expires in
 * 10 minutes, so it is created when the dialog opens and refreshed if it went stale.
 */
export function TelegramConnectDialog({
  mode,
  initial,
  onClose,
  onSnooze,
}: {
  mode: 'prompt' | 'manage';
  initial?: TelegramStatus | null;
  onClose: () => void;
  onSnooze?: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<TelegramStatus | null>(initial ?? null);
  const [link, setLink] = useState<Link | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const linkedJustNow = useRef(false);

  const loadStatus = useCallback(async () => {
    const s = await apiFetch<TelegramStatus>('/api/telegram/me');
    setStatus(s);
    return s;
  }, []);

  const makeLink = useCallback(async () => {
    try {
      const l = await apiFetch<Link>('/api/telegram/me/link', { method: 'POST' });
      setLink(l);
      return l;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось создать ссылку'));
      return null;
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      try {
        const s = initial ?? (await loadStatus());
        if (s.configured && !s.linked) await makeLink();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('Не удалось загрузить данные'));
      }
    })();
  }, [initial, loadStatus, makeLink, t]);

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const s = await apiFetch<TelegramStatus>('/api/telegram/me');
        if (stopped) return;
        if (s.linked) {
          linkedJustNow.current = true;
          setStatus(s);
          setWaiting(false);
        }
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [waiting]);

  async function openBot(e: React.MouseEvent<HTMLAnchorElement>) {
    setError('');
    if (!link || Date.parse(link.expiresAt) - Date.now() < 30_000) {
      e.preventDefault();
      const fresh = await makeLink();
      if (fresh) window.open(fresh.url, '_blank', 'noopener,noreferrer');
    }
    setWaiting(true);
  }

  async function snooze() {
    setBusy(true);
    try {
      await apiFetch('/api/telegram/me/snooze', { method: 'POST' });
      onSnooze?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/telegram/me', { method: 'DELETE' });
      const s = await loadStatus();
      if (s.configured) await makeLink();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Не удалось отключить'));
    } finally {
      setBusy(false);
    }
  }

  const linked = status?.linked;
  const footer = linked ? (
    <>
      {mode === 'manage' && !linkedJustNow.current ? (
        <button type="button" className={fm.btnGhost} disabled={busy} onClick={() => void unlink()}>
          {t('Отключить')}
        </button>
      ) : null}
      <button type="button" className={fm.btnPrimary} onClick={onClose}>
        {t('Готово')}
      </button>
    </>
  ) : status && !status.configured ? (
    <button type="button" className={fm.btnGhost} onClick={onClose}>
      {t('Закрыть')}
    </button>
  ) : (
    <>
      {mode === 'prompt' ? (
        <button type="button" className={fm.btnGhost} disabled={busy} onClick={() => void snooze()}>
          {t('Напомнить позже')}
        </button>
      ) : (
        <button type="button" className={fm.btnGhost} onClick={onClose}>
          {t('Закрыть')}
        </button>
      )}
      <a
        className={`${fm.btnPrimary} ${styles.goBtn}`}
        href={link?.url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!link}
        onClick={(e) => void openBot(e)}
      >
        <TelegramGlyph />
        {t('Перейти в Telegram-бот')}
      </a>
    </>
  );

  return (
    <FormModal open title={t('Telegram-бот Worklyn')} onClose={onClose} width="sm" footer={footer}>
      {error ? <div className={fm.error}>{error}</div> : null}
      <div className={styles.hero}>
        <span className={linked ? styles.iconOk : styles.icon} aria-hidden>
          {linked ? <i className="fas fa-check" /> : <TelegramGlyph size={30} />}
        </span>
        {!status ? (
          <p className={styles.muted}>{t('Загрузка…')}</p>
        ) : linked ? (
          <>
            <h3 className={styles.heading}>{t('Telegram подключён')}</h3>
            <p className={styles.text}>
              {status.username ? `@${status.username} · ` : ''}
              {t('уведомления, отметки прихода и ухода и сообщения безопасности приходят в бот')}
              {status.botUsername ? ` @${status.botUsername}` : ''}.
            </p>
          </>
        ) : !status.configured ? (
          <>
            <h3 className={styles.heading}>{t('Бот ещё не настроен')}</h3>
            <p className={styles.text}>{t('Администратор должен указать токен бота в Настройки → Telegram.')}</p>
          </>
        ) : (
          <>
            <h3 className={styles.heading}>{t('Подключите Telegram')}</h3>
            <ul className={styles.list}>
              <li>{t('Каждая отметка прихода и ухода — сразу в Telegram')}</li>
              <li>{t('Все уведомления системы и сообщения безопасности')}</li>
              <li>{t('Вход без пароля и восстановление пароля через бот')}</li>
            </ul>
            {waiting ? (
              <p className={styles.waiting}>
                <span className={styles.pulse} aria-hidden /> {t('Нажмите «Start» в боте — окно обновится само')}
              </p>
            ) : (
              <p className={styles.muted}>
                {t('Ссылка одноразовая и действует 10 минут. Пароль в боте вводить не нужно.')}
              </p>
            )}
          </>
        )}
      </div>
    </FormModal>
  );
}

/** Centered invitation after sign-in while the account has no bot link (snoozable for 3 days). */
export function TelegramPrompt() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === '1') return;
    } catch {
      /* storage unavailable */
    }
    const timer = window.setTimeout(() => {
      apiFetch<TelegramStatus>('/api/telegram/me')
        .then((s) => {
          if (!s.promptDue) return;
          setStatus(s);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!open) return null;
  return (
    <TelegramConnectDialog
      mode="prompt"
      initial={status}
      onClose={() => {
        try {
          sessionStorage.setItem(DISMISSED_KEY, '1');
        } catch {
          /* storage unavailable */
        }
        setOpen(false);
      }}
    />
  );
}

function TelegramGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}
