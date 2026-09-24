'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import shared from '@/app/page-shared.module.css';

type InviteResult = {
  inviteCode: string;
  deepLink: string;
  botUsername: string;
};

type TgStatus = {
  enabled: boolean;
  botUsername: string | null;
};

type Props = {
  /** Close the employees-page slide-down panel */
  onClose?: () => void;
};

export function TelegramJoinPanel({ onClose }: Props) {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [pending, setPending] = useState(0);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const st = await apiFetch<TgStatus>('/api/telegram/status');
      setStatus(st);
      if (st.enabled) {
        const list = await apiFetch<{ id: string; status: string }[]>(
          '/api/telegram/join-requests?status=pending',
        );
        setPending(Array.isArray(list) ? list.length : 0);
      } else {
        setPending(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить Telegram');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const res = await apiFetch<InviteResult>('/api/telegram/invites', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInvite(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать ссылку');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!invite?.deepLink) return;
    try {
      await navigator.clipboard.writeText(invite.deepLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      {/* One toolbar row — no duplicate nav */}
      <div
        className={shared.rowActions}
        style={{
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          className={shared.rowActions}
          style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <strong style={{ fontSize: 14 }}>Telegram</strong>
          {!status?.enabled ? (
            <span className={shared.badgeWarn}>Бот выключен</span>
          ) : (
            <span className={shared.badgeOk}>
              @{status.botUsername || '—'}
              {pending > 0 ? ` · ${pending}` : ''}
            </span>
          )}
        </div>

        <div
          className={shared.rowActions}
          style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <button
            type="button"
            className={shared.btn}
            disabled={busy || !status?.enabled}
            onClick={() => void createInvite()}
          >
            {busy ? '…' : 'Invite-ссылка'}
          </button>
          <Link href="/employees/join-requests" className={shared.btnSecondary}>
            Заявки{pending > 0 ? ` (${pending})` : ''}
          </Link>
          <Link href="/settings/telegram" className={shared.btnGhost}>
            Настройки
          </Link>
          <button
            type="button"
            className={shared.btnGhost}
            disabled={busy}
            onClick={() => void load()}
            title="Обновить статус"
          >
            Обновить
          </button>
          {onClose ? (
            <button type="button" className={shared.btnGhost} onClick={onClose}>
              Закрыть
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className={shared.error} style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}

      {invite ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border, #e3e9f1)',
            background: 'var(--surface-subtle, #f2f5f9)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span className={shared.muted} style={{ fontSize: 12 }}>
            Ссылка:
          </span>
          <a
            href={invite.deepLink}
            target="_blank"
            rel="noreferrer"
            className={shared.link}
            style={{ wordBreak: 'break-all', flex: '1 1 200px' }}
          >
            {invite.deepLink}
          </a>
          <button
            type="button"
            className={shared.btnSecondary}
            onClick={() => void copyLink()}
          >
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
