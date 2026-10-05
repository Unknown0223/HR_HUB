'use client';

import { useEffect, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import shared from '../../../page-shared.module.css';

type SmtpSettings = {
  isActive: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
  envFallback: boolean;
  effectiveSource: 'integration' | 'env' | 'none';
};

const SOURCE_LABEL: Record<SmtpSettings['effectiveSource'], string> = {
  integration: 'настройки этой страницы',
  env: 'переменные окружения сервера (SMTP_*)',
  none: 'не настроено — коды уходят только в Telegram',
};

/** Mail server for password-reset codes. The password is write-only: the API never returns it. */
export default function SmtpSettingsPage() {
  const [data, setData] = useState<SmtpSettings | null>(null);
  const [form, setForm] = useState({ isActive: true, host: '', port: 587, secure: false, user: '', from: '' });
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function apply(s: SmtpSettings) {
    setData(s);
    setForm({ isActive: s.isActive, host: s.host, port: s.port, secure: s.secure, user: s.user, from: s.from });
    setPassword('');
  }

  useEffect(() => {
    apiFetch<SmtpSettings>('/api/mail/settings')
      .then(apply)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const s = await apiFetch<SmtpSettings>('/api/mail/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          port: Number(form.port) || 587,
          ...(password ? { password } : {}),
        }),
      });
      apply(s);
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сохранить не удалось');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError('');
    setOk('');
    try {
      await apiFetch('/api/mail/settings/test', { method: 'POST', body: JSON.stringify({ to: testTo.trim() }) });
      setOk(`Тестовое письмо отправлено на ${testTo.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Письмо не отправлено');
    } finally {
      setTesting(false);
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className={shared.wrap}>
      <PageSubnav groupKey="settings" />
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Почта (SMTP)</h1>
          <p className={styles.subtitle}>
            Сервер для писем с кодом восстановления пароля. Код также приходит в Telegram-бот, если аккаунт привязан.
          </p>
        </div>
      </div>

      {!data && !error ? <p className={styles.empty}>Загрузка…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.subtitle}>{ok}</p> : null}

      {data ? (
        <div className={formStyles.formCard || styles.panel}>
          <label className={formStyles.checkRow || styles.row}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />{' '}
            Использовать эти настройки
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px', gap: 12, marginTop: 12 }}>
            <div className={formStyles.field || styles.field}>
              <label>SMTP-сервер</label>
              <input
                className={formStyles.input}
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
                placeholder="smtp.gmail.com"
                autoComplete="off"
              />
            </div>
            <div className={formStyles.field || styles.field}>
              <label>Порт</label>
              <input
                className={formStyles.input}
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => {
                  const port = Number(e.target.value);
                  setForm((f) => ({ ...f, port, secure: port === 465 ? true : port === 587 ? false : f.secure }));
                }}
              />
            </div>
          </div>

          <label className={formStyles.checkRow || styles.row} style={{ marginTop: 10 }}>
            <input type="checkbox" checked={form.secure} onChange={(e) => set('secure', e.target.checked)} /> SSL/TLS
            сразу (обычно порт 465; для 587 — выключено, используется STARTTLS)
          </label>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Логин</label>
            <input
              className={formStyles.input}
              value={form.user}
              onChange={(e) => set('user', e.target.value)}
              placeholder="noreply@company.uz"
              autoComplete="off"
            />
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Пароль{data.hasPassword ? ' (сохранён — оставьте пустым, чтобы не менять)' : ''}</label>
            <input
              className={formStyles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={data.hasPassword ? '••••••••' : 'пароль приложения'}
              autoComplete="new-password"
            />
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Отправитель</label>
            <input
              className={formStyles.input}
              value={form.from}
              onChange={(e) => set('from', e.target.value)}
              placeholder="Worklyn <noreply@company.uz>"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void save()}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 20 }}>
            <label>Проверка: отправить тестовое письмо</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className={formStyles.input}
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@company.uz"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={testing || !testTo.includes('@')}
                onClick={() => void sendTest()}
              >
                {testing ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </div>

          <p className={styles.subtitle} style={{ marginTop: 16 }}>
            Сейчас используется: {SOURCE_LABEL[data.effectiveSource]}
          </p>
        </div>
      ) : null}
    </div>
  );
}
