'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import modal from '@/components/form-modal.module.css';

type JoinRow = {
  id: string;
  status: string;
  inviteCode: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  telegramUsername?: string | null;
  pinfl?: string | null;
  createdAt: string;
};

type InviteResult = {
  inviteCode: string;
  deepLink: string;
  botUsername: string;
  instructions?: string;
};

export function TelegramJoinPanel() {
  const [status, setStatus] = useState<{ enabled: boolean; botUsername: string | null } | null>(
    null,
  );
  const [rows, setRows] = useState<JoinRow[]>([]);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tabFor, setTabFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const st = await apiFetch<{ enabled: boolean; botUsername: string | null }>(
        '/api/telegram/status',
      );
      setStatus(st);
      if (st.enabled) {
        const list = await apiFetch<JoinRow[]>('/api/telegram/join-requests');
        setRows(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Telegram status xato');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<InviteResult>('/api/telegram/invites', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInvite(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite yaratilmadi');
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    const tabNumber = (tabFor[id] || '').trim();
    if (!tabNumber) {
      setError('Tasdiqlash uchun tab. № kiriting');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/telegram/join-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ tabNumber }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve xato');
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/telegram/join-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject xato');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>
        Telegram orqali qo‘shilish
      </h2>
      <p style={{ margin: '0 0 0.75rem', color: '#605e5c', fontSize: '0.9rem' }}>
        Xodimga bot havolasini yuboring — FIO/telefon/PINFL keladi, HR tasdiqlaydi.
        {!status?.enabled ? (
          <>
            {' '}
            Hozir bot o‘chiq: API da <code>TELEGRAM_BOT_TOKEN</code> va{' '}
            <code>TELEGRAM_BOT_USERNAME</code> sozlang.
          </>
        ) : (
          <>
            {' '}
            Bot: <strong>@{status.botUsername}</strong>
          </>
        )}
      </p>
      {error ? <p className={modal.error}>{error}</p> : null}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={modal.btnPrimary}
          disabled={busy || !status?.enabled}
          onClick={() => void createInvite()}
        >
          {busy ? '…' : 'Invite havola yaratish'}
        </button>
        <button
          type="button"
          className={modal.btnGhost}
          disabled={busy}
          onClick={() => void load()}
        >
          Yangilash
        </button>
      </div>
      {invite ? (
        <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
          Havola:{' '}
          <a href={invite.deepLink} target="_blank" rel="noreferrer">
            {invite.deepLink}
          </a>
        </p>
      ) : null}
      {rows.length ? (
        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr>
                <th align="left">FIO</th>
                <th align="left">TG</th>
                <th align="left">Tel</th>
                <th align="left">Status</th>
                <th align="left">Tab №</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {[r.lastName, r.firstName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td>{r.telegramUsername ? `@${r.telegramUsername}` : '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.status === 'pending' ? (
                      <input
                        style={{ width: 80 }}
                        value={tabFor[r.id] || ''}
                        onChange={(e) =>
                          setTabFor((m) => ({ ...m, [r.id]: e.target.value }))
                        }
                        placeholder="0001"
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className={modal.btnPrimary}
                          disabled={busy}
                          onClick={() => void approve(r.id)}
                        >
                          Tasdiq
                        </button>{' '}
                        <button
                          type="button"
                          className={modal.btnGhost}
                          disabled={busy}
                          onClick={() => void reject(r.id)}
                        >
                          Rad
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
