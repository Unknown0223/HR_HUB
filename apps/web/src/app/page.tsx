'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, setSession, Session } from '@/lib/api';
import { SeasonalBackdrop } from '@/components/SeasonalBackdrop';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLFormElement>(null);

  // Shakes the card in place: remounting it would replay the fade-in of every field,
  // and a throttled tab can leave them stuck at opacity 0.
  function shakeCard() {
    const card = cardRef.current;
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    card.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 450, easing: 'linear' },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<Session>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(data);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить вход. Проверьте данные.');
      shakeCard();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.scene}>
      <SeasonalBackdrop mode="login" />

      <div className={styles.stage}>
        <header className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M9.2 11.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M4.2 18.2c.5-2.4 2.4-3.8 5-3.8s4.5 1.4 5 3.8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M16.2 8.6l1.2 1.2 2.4-2.6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            <span className={styles.brandTitle}>Worklyn</span>
            <span className={styles.brandTag}>Давомат · GPS · Кадры</span>
          </span>
        </header>

        <form
          ref={cardRef}
          className={styles.card}
          onSubmit={onSubmit}
          noValidate
        >
          <h1 className={styles.title}>Добро пожаловать!</h1>
          <p className={styles.subtitle}>Введите почту и пароль, которые выдала HR-служба</p>

          <label className={`${styles.field} ${email ? styles.filled : ''}`}>
            <span className={styles.iconTile} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.floatLabel}>Электронная почта</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.uz"
                required
                autoComplete="username"
                disabled={loading}
              />
            </span>
            {email ? <span className={styles.okMark} aria-hidden="true" /> : null}
          </label>

          <label className={`${styles.field} ${password ? styles.filled : ''}`}>
            <span className={styles.iconTile} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.floatLabel}>Пароль</span>
              <input
                className={styles.input}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </span>
            <button
              type="button"
              className={styles.eye}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" x2="22" y1="2" y2="22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </label>

          <div className={styles.options}>
            <label className={styles.remember}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Запомнить сессию</span>
            </label>
            <button
              type="button"
              className={styles.forgot}
              onClick={() =>
                setError('Для сброса пароля обратитесь к системному администратору вашей организации.')
              }
            >
              Забыли пароль?
            </button>
          </div>

          {error ? (
            <div className={styles.error} role="alert">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" className={styles.submit} disabled={loading}>
            <span className={styles.sweep} aria-hidden="true" />
            {loading ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Проверка…</span>
              </>
            ) : (
              <>
                <span>Войти</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          <Link href="/m" className={styles.portal}>
            Мобильный портал сотрудника
          </Link>
        </form>
      </div>
    </main>
  );
}
