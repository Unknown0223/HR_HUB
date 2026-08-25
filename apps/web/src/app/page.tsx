'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setSession, Session } from '@/lib/api';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroBrand}>HR HUB</h1>
        <p className={styles.heroLead}>
          Сотрудники, посещения и Face ID — единая multi-tenant платформа.
        </p>
        <div className={styles.heroMeta}>
          <span className={styles.chip}>Hikvision</span>
          <span className={styles.chip}>Multi-tenant</span>
          <span className={styles.chip}>Посещения → Табель</span>
        </div>
      </section>

      <section className={styles.side}>
        <div className={styles.panel}>
          <p className={styles.brand}>HR HUB</p>
          <h2 className={styles.title}>Вход</h2>
          <p className={styles.sub}>Войдите как tenant admin или platform.</p>
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className={styles.label}>
              Пароль
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>
          <p className={styles.hint}>
            Demo: <code>admin@demo.local</code> / <code>Demo1234!</code>
          </p>
          <p className={styles.hint}>
            <a href="/m">Мобильная версия (HR HUB Mobile)</a>
          </p>
        </div>
      </section>
    </main>
  );
}
