'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, setSession, Session } from '@/lib/api';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('Demo1234!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setEmail('admin@demo.local');
    setPassword('Demo1234!');
    setError('');
  }

  return (
    <main className={styles.container}>
      <section className={styles.atmospherePanel} aria-label="О платформе HR HUB">
        <div className={styles.atmosphereContentTop}>
          <div className={styles.brandHeader}>
            <div className={styles.brandIconWrap} aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8V6a2 2 0 0 1 2-2h2" />
                <path d="M4 16v2a2 2 0 0 0 2 2h2" />
                <path d="M16 4h2a2 2 0 0 1 2 2v2" />
                <path d="M16 20h2a2 2 0 0 0 2-2v-2" />
                <circle cx="12" cy="11" r="3" />
                <path d="M8 18a4 4 0 0 1 8 0" />
              </svg>
            </div>
            <div className={styles.brandNameGroup}>
              <div className={styles.brandTitle}>
                HR HUB<span className={styles.brandTitleHighlight}>.</span>
              </div>
              <span className={styles.brandTagline}>Кадровый учет и биометрия Face ID</span>
            </div>
          </div>
        </div>

        <div className={styles.atmosphereContentMiddle}>
          <div className={styles.productBadge}>
            <span className={styles.badgePulse} aria-hidden="true" />
            <span>Центральная Азия • Multi-tenant Cloud</span>
          </div>
          <h1 className={styles.storyHeading}>
            Биометрический контроль и учет времени без погрешностей
          </h1>
          <p className={styles.storySubheading}>
            Синхронизация терминалов Hikvision Face ID, фиксация проходов сотрудников и
            автоматизированный табель для филиальных сетей любого масштаба.
          </p>
        </div>

        <div className={styles.atmosphereContentBottom}>
          <div className={styles.terminalStatusLine}>
            <span className={styles.liveIndicator} aria-hidden="true" />
            <span>Шлюз терминалов Hikvision · Ташкент, UTC+5</span>
          </div>
          <div className={styles.legalNotice}>
            Обработка биометрических данных защищена сквозным шифрованием
          </div>
        </div>
      </section>

      <section className={styles.formPanel} aria-label="Форма авторизации">
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <span className={styles.formKicker}>Панель администратора</span>
            <h2 className={styles.formTitle}>Вход в систему</h2>
            <p className={styles.formSubtitle}>
              Введите корпоративную почту и пароль для доступа к вашей компании
            </p>
          </div>

          {error ? (
            <div className={styles.errorAlert} role="alert">
              <svg
                className={styles.errorIcon}
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>{error}</div>
            </div>
          ) : null}

          <form className={styles.loginForm} onSubmit={onSubmit} noValidate>
            <div className={styles.fieldGroup}>
              <label htmlFor="emailInput" className={styles.label}>
                Электронная почта
              </label>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon} aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  id="emailInput"
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.uz"
                  required
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="passwordInput" className={styles.label}>
                  Пароль
                </label>
                <button
                  type="button"
                  className={styles.forgotLink}
                  onClick={() =>
                    setError(
                      'Для сброса пароля обратитесь к системному администратору вашей организации.',
                    )
                  }
                >
                  Забыли пароль?
                </button>
              </div>
              <div className={styles.inputWrapper}>
                <span className={styles.inputIcon} aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="passwordInput"
                  className={`${styles.input} ${styles.inputWithToggle}`}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.togglePasswordBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className={styles.optionsRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Запомнить сессию</span>
              </label>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>Вход в систему...</span>
                </>
              ) : (
                <>
                  <span>Войти</span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className={styles.demoHintBox}>
            <div className={styles.demoHintText}>
              Демо-доступ:{' '}
              <span className={styles.demoCredentials}>admin@demo.local</span> /{' '}
              <span className={styles.demoCredentials}>Demo1234!</span>
            </div>
            <button type="button" className={styles.demoAutoFillBtn} onClick={fillDemo}>
              Заполнить
            </button>
          </div>

          <div className={styles.mobilePortalRow}>
            <Link href="/m" className={styles.mobilePortalLink}>
              Мобильный портал сотрудника →
            </Link>
          </div>

          <div className={styles.footerMeta}>HR HUB • Uzbekistan & Central Asia</div>
        </div>
      </section>
    </main>
  );
}
