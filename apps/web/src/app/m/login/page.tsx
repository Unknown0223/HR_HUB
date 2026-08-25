'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL, apiFetch, getSession, setSession, Session } from '@/lib/api';
import styles from '../mobile.module.css';

export default function MobileLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('employee@demo.local');
  const [password, setPassword] = useState('Demo1234!');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace('/m');
  }, [router]);

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
      router.replace('/m');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirish amalga oshmadi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.auth}>
      <div className={styles.authBar}>
        <i className="fas fa-chevron-left" aria-hidden style={{ opacity: 0.6 }} />
        Profil qo‘shish
      </div>

      <form className={styles.authBody} onSubmit={onSubmit}>
        <div className={styles.field}>
          <i className="far fa-user" aria-hidden />
          <div className={styles.fieldStack}>
            <span>Login@kompaniya</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="login@kompaniyani kiriting"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <i className="fas fa-lock" aria-hidden />
          <div className={styles.fieldStack}>
            <span>Parol</span>
            <input
              className={styles.input}
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="button"
            className={styles.eye}
            onClick={() => setReveal((v) => !v)}
            aria-label="Parolni ko‘rsatish"
          >
            <i className={reveal ? 'fas fa-eye' : 'fas fa-eye-slash'} aria-hidden />
          </button>
        </div>

        <div className={styles.field}>
          <i className="fas fa-cloud" aria-hidden />
          <div className={styles.fieldStack}>
            <span>Server manzil</span>
            <input className={styles.input} value={API_URL} readOnly />
          </div>
          <i className="fas fa-server" aria-hidden style={{ opacity: 0.6 }} />
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.primaryBtn} type="submit" disabled={loading}>
          {loading ? 'Kirilmoqda…' : 'Kirish'}
        </button>

        <div className={styles.orRow}>YOKI</div>

        <a className={styles.secondaryBtn} href="/">
          Veb versiyaga o‘tish
        </a>

        <p className={styles.hint}>
          Demo: <code>employee@demo.local</code> / <code>Demo1234!</code>
        </p>
      </form>
    </div>
  );
}
