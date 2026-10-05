'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiFetch, type Session } from '@/lib/api';
import { FormModal } from '@/components/FormModal';
import fm from '@/components/form-modal.module.css';
import styles from './auth-modals.module.css';

type Start = { requestId: string; code: number; expiresAt: string };
type Poll = { status: 'pending' | 'denied' | 'expired' } | ({ status: 'approved' } & Session);

const POLL_MS = 2000;

function errorText(err: unknown) {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Слишком много попыток. Попробуйте позже.';
  return err instanceof Error ? err.message : 'Не удалось отправить запрос';
}

/**
 * «Sign in with Telegram»: the bot shows three numbers in the linked chat and the user taps the
 * one displayed here. The server answers the same way for unknown or unlinked accounts.
 */
export function TelegramLoginModal({
  open,
  initialLogin,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  initialLogin: string;
  onClose: () => void;
  onSignedIn: (session: Session) => void;
}) {
  const [login, setLogin] = useState(initialLogin);
  const [request, setRequest] = useState<Start | null>(null);
  const [outcome, setOutcome] = useState<'denied' | 'expired' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  useEffect(() => {
    if (open) {
      setLogin(initialLogin);
      setRequest(null);
      setOutcome(null);
      setError('');
    }
  }, [open, initialLogin]);

  useEffect(() => {
    if (!open || !request || outcome) return;
    let stopped = false;
    const expiresAt = Date.parse(request.expiresAt);
    const tick = async () => {
      if (stopped) return;
      setNow(Date.now());
      if (Date.now() > expiresAt + POLL_MS) {
        setOutcome('expired');
        return;
      }
      try {
        const res = await apiFetch<Poll>('/api/auth/telegram/poll', {
          method: 'POST',
          body: JSON.stringify({ requestId: request.requestId }),
        });
        if (stopped) return;
        if (res.status === 'approved') {
          stopped = true;
          const { status: _status, ...session } = res;
          signedIn.current(session);
          return;
        }
        if (res.status === 'denied' || res.status === 'expired') {
          setOutcome(res.status);
          return;
        }
      } catch (err) {
        if (!stopped) setError(errorText(err));
      }
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    let timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [open, request, outcome]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (busy || login.trim().length < 3) return;
    setBusy(true);
    setError('');
    setOutcome(null);
    try {
      const res = await apiFetch<Start>('/api/auth/telegram/start', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim() }),
      });
      setNow(Date.now());
      setRequest(res);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const secondsLeft = request ? Math.max(0, Math.ceil((Date.parse(request.expiresAt) - now) / 1000)) : 0;
  const waiting = request && !outcome;

  return (
    <FormModal
      open={open}
      title="Вход через Telegram"
      onClose={onClose}
      width="sm"
      footer={
        <>
          <button type="button" className={fm.btnGhost} onClick={onClose}>
            Отмена
          </button>
          {!waiting ? (
            <button type="button" className={fm.btnPrimary} disabled={busy || login.trim().length < 3} onClick={() => send()}>
              {request ? 'Отправить снова' : 'Отправить запрос'}
            </button>
          ) : null}
        </>
      }
    >
      {error ? <div className={fm.error}>{error}</div> : null}
      {!request ? (
        <form className={fm.fields} onSubmit={send}>
          <p className={styles.lead}>
            Введите логин — бот Worklyn пришлёт в привязанный Telegram запрос на вход. Пароль вводить не нужно.
          </p>
          <label className={fm.field}>
            <span>Логин или почта</span>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={busy}
            />
          </label>
        </form>
      ) : waiting ? (
        <div className={styles.wait}>
          <p className={styles.lead}>Откройте Telegram-бот Worklyn и нажмите это число:</p>
          <div className={styles.code} aria-live="polite">
            {request.code}
          </div>
          <p className={styles.timer}>
            <span className={styles.pulse} aria-hidden /> Ожидаем подтверждения · {secondsLeft} сек
          </p>
          <p className={styles.hint}>
            Если сообщение не пришло, аккаунт ещё не привязан к боту. Войдите по паролю — Worklyn предложит
            подключить Telegram.
          </p>
        </div>
      ) : (
        <div className={styles.wait}>
          <p className={styles.lead}>
            {outcome === 'denied'
              ? 'Вход отклонён в Telegram. Если это были вы — отправьте запрос снова и выберите правильное число.'
              : 'Время запроса истекло. Отправьте запрос снова.'}
          </p>
        </div>
      )}
    </FormModal>
  );
}
