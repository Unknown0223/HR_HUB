'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { FormModal } from '@/components/FormModal';
import fm from '@/components/form-modal.module.css';
import styles from './auth-modals.module.css';

type Step = 'login' | 'code' | 'done';

function errorText(err: unknown) {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Слишком много попыток. Попробуйте через 15 минут.';
  const msg = err instanceof Error ? err.message : '';
  if (/kod|код/i.test(msg)) return 'Неверный или просроченный код';
  return msg || 'Не удалось выполнить запрос';
}

/**
 * Forgot password: a 6-digit code goes to the linked Telegram chat and/or the account's e-mail.
 * The first step never says whether the account exists or which channel was used.
 */
export function ForgotPasswordModal({
  open,
  initialLogin,
  onClose,
  onDone,
}: {
  open: boolean;
  initialLogin: string;
  onClose: () => void;
  onDone: (login: string) => void;
}) {
  const [step, setStep] = useState<Step>('login');
  const [login, setLogin] = useState(initialLogin);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('login');
      setLogin(initialLogin);
      setCode('');
      setPassword('');
      setConfirm('');
      setError('');
    }
  }, [open, initialLogin]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy || login.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim() }),
      });
      setStep('code');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) return setError('Введите 6-значный код');
    if (password.length < 8) return setError('Пароль: минимум 8 символов');
    if (password !== confirm) return setError('Пароли не совпадают');
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim(), code: code.trim(), newPassword: password }),
      });
      setStep('done');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    step === 'login' ? (
      <>
        <button type="button" className={fm.btnGhost} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={fm.btnPrimary} disabled={busy || login.trim().length < 3} onClick={() => requestCode()}>
          Получить код
        </button>
      </>
    ) : step === 'code' ? (
      <>
        <button type="button" className={fm.btnGhost} disabled={busy} onClick={() => requestCode()}>
          Отправить код снова
        </button>
        <button type="button" className={fm.btnPrimary} disabled={busy} onClick={() => reset()}>
          Сменить пароль
        </button>
      </>
    ) : (
      <button type="button" className={fm.btnPrimary} onClick={() => onDone(login.trim())}>
        Войти
      </button>
    );

  return (
    <FormModal open={open} title="Восстановление пароля" onClose={onClose} width="sm" footer={footer}>
      {error ? <div className={fm.error}>{error}</div> : null}
      {step === 'login' ? (
        <form className={fm.fields} onSubmit={requestCode}>
          <p className={styles.lead}>
            Код придёт в Telegram-бот Worklyn (если аккаунт привязан) и на почту, указанную в вашей карточке.
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
      ) : step === 'code' ? (
        <form className={fm.fields} onSubmit={reset}>
          <p className={styles.lead}>
            Если аккаунт найден и к нему привязан Telegram или почта, мы отправили 6-значный код. Он действует
            10 минут. Не сообщайте его никому.
          </p>
          <label className={fm.field}>
            <span>Код</span>
            <input
              className={styles.codeInput}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              autoFocus
              disabled={busy}
            />
          </label>
          <label className={fm.field}>
            <span>Новый пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className={fm.field}>
            <span>Повторите пароль</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <p className={styles.hint}>
            Не приходит код? Попросите HR указать почту в карточке или привяжите Telegram после входа.
          </p>
          <button type="submit" hidden />
        </form>
      ) : (
        <div className={styles.wait}>
          <p className={styles.lead}>
            Пароль изменён. Все прежние сеансы завершены — войдите с новым паролем.
          </p>
        </div>
      )}
    </FormModal>
  );
}
