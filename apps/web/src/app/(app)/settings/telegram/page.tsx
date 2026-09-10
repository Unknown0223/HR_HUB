'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import shared from '../../../page-shared.module.css';

type Integration = {
  id: string;
  name: string;
  isActive: boolean;
  config?: Record<string, unknown> | null;
};

type TelegramCfg = {
  sys: 'telegram';
  botToken?: string;
  botUsername?: string;
  webhookSecret?: string;
  publicApiUrl?: string;
  webhookUrl?: string;
};

type TgStatus = {
  enabled: boolean;
  botUsername: string | null;
  source?: string;
  hasWebhookSecret?: boolean;
  publicApiUrl?: string | null;
  webhookPath?: string;
};

function asTelegramConfig(raw: unknown): TelegramCfg {
  const c =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    sys: 'telegram',
    botToken: String(c.botToken || c.token || ''),
    botUsername: String(c.botUsername || c.username || '').replace(/^@/, ''),
    webhookSecret: String(c.webhookSecret || ''),
    publicApiUrl: String(c.publicApiUrl || '').replace(/\/$/, ''),
    webhookUrl: String(c.webhookUrl || ''),
  };
}

export default function TelegramSettingsPage() {
  const [row, setRow] = useState<Integration | null>(null);
  const [cfg, setCfg] = useState<TelegramCfg>({ sys: 'telegram' });
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, st] = await Promise.all([
        apiFetch<Integration[]>('/api/settings/integrations'),
        apiFetch<TgStatus>('/api/telegram/status').catch(() => null),
      ]);
      const found =
        (list || []).find((i) => asTelegramConfig(i.config).sys === 'telegram') ||
        (list || []).find((i) => i.name.toLowerCase().includes('telegram'));
      if (!found) {
        setError('Интеграция Telegram Bot не найдена — обновите страницу');
        setRow(null);
        return;
      }
      setRow(found);
      setCfg(asTelegramConfig(found.config));
      setEnabled(found.isActive);
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!row) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const token = (cfg.botToken || '').trim();
      const updated = await apiFetch<Integration>(
        `/api/settings/integrations/${row.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            isActive: enabled && Boolean(token),
            config: {
              sys: 'telegram',
              botToken: token,
              botUsername: (cfg.botUsername || '').trim().replace(/^@/, ''),
              webhookSecret: (cfg.webhookSecret || '').trim(),
              publicApiUrl: (cfg.publicApiUrl || '').trim().replace(/\/$/, ''),
              webhookUrl: cfg.webhookUrl || undefined,
            },
          }),
        },
      );
      setRow(updated);
      setCfg(asTelegramConfig(updated.config));
      setEnabled(updated.isActive);
      setOk('Сохранено');
      const st = await apiFetch<TgStatus>('/api/telegram/status');
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сохранить не удалось');
    } finally {
      setSaving(false);
    }
  }

  async function registerWebhook() {
    setWebhookBusy(true);
    setError('');
    setOk('');
    try {
      // Persist first so API reads token from integration
      await save();
      const res = await apiFetch<{
        ok: boolean;
        webhookUrl: string;
        botUsername?: string | null;
      }>('/api/telegram/setup-webhook', {
        method: 'POST',
        body: JSON.stringify({
          publicApiUrl: (cfg.publicApiUrl || '').trim() || undefined,
        }),
      });
      setOk(`Webhook зарегистрирован: ${res.webhookUrl}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Webhook xato');
    } finally {
      setWebhookBusy(false);
    }
  }

  return (
    <div className={shared.wrap}>
      <PageSubnav groupKey="settings" />
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Telegram Bot</h1>
          <p className={styles.subtitle}>
            Xodimlarni bot orqali qo‘shish: token, webhook va yuz rasmi
          </p>
        </div>
      </div>

      {loading ? <p className={styles.empty}>Загрузка…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.subtitle}>{ok}</p> : null}

      {!loading && row ? (
        <div className={formStyles.formCard || styles.panel}>
          <label className={formStyles.checkRow || styles.row}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Интеграция включена
          </label>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Bot token (от @BotFather)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className={formStyles.input}
                type={showToken ? 'text' : 'password'}
                value={cfg.botToken || ''}
                onChange={(e) => setCfg((c) => ({ ...c, botToken: e.target.value }))}
                placeholder="123456:ABC..."
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Bot username</label>
            <input
              className={formStyles.input}
              value={cfg.botUsername || ''}
              onChange={(e) => setCfg((c) => ({ ...c, botUsername: e.target.value }))}
              placeholder="HRHUBBot"
            />
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Webhook secret (рекомендуется)</label>
            <input
              className={formStyles.input}
              type="password"
              value={cfg.webhookSecret || ''}
              onChange={(e) =>
                setCfg((c) => ({ ...c, webhookSecret: e.target.value }))
              }
              placeholder="случайная строка"
              autoComplete="off"
            />
          </div>

          <div className={formStyles.field || styles.field} style={{ marginTop: 12 }}>
            <label>Публичный API URL</label>
            <input
              className={formStyles.input}
              value={cfg.publicApiUrl || ''}
              onChange={(e) =>
                setCfg((c) => ({ ...c, publicApiUrl: e.target.value }))
              }
              placeholder="https://hr-hubapi-production.up.railway.app"
            />
            <p className={styles.subtitle} style={{ marginTop: 6 }}>
              Webhook: {(cfg.publicApiUrl || '…').replace(/\/$/, '')}
              /api/telegram/webhook
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={webhookBusy || !(cfg.botToken || '').trim()}
              onClick={() => void registerWebhook()}
            >
              {webhookBusy ? 'Webhook…' : 'Зарегистрировать webhook'}
            </button>
            <Link href="/employees?panel=telegram" className={styles.btnSecondary}>
              Заявки сотрудников
            </Link>
          </div>

          {status ? (
            <p className={styles.subtitle} style={{ marginTop: 16 }}>
              Статус: {status.enabled ? 'включён' : 'выключен'}
              {status.botUsername ? ` · @${status.botUsername}` : ''}
              {status.source ? ` · источник: ${status.source}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
