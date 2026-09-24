'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import shared from '@/app/page-shared.module.css';
import arena from '../page.module.css';

type JoinRow = {
  id: string;
  status: string;
  inviteCode: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  telegramUsername?: string | null;
  pinfl?: string | null;
  photoUrl?: string | null;
  createdAt: string;
};

type InviteResult = {
  inviteCode: string;
  deepLink: string;
  botUsername: string;
};

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'invited' | 'all';

function fio(r: JoinRow) {
  return [r.lastName, r.firstName, r.middleName].filter(Boolean).join(' ') || '—';
}

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function statusLabel(s: string) {
  switch (s) {
    case 'pending':
      return 'Ожидает';
    case 'approved':
      return 'Подтверждена';
    case 'rejected':
      return 'Отклонена';
    case 'invited':
      return 'Invite';
    default:
      return s;
  }
}

export default function EmployeeJoinRequestsPage() {
  const lightbox = usePhotoLightbox();
  const [status, setStatus] = useState<{
    enabled: boolean;
    botUsername: string | null;
  } | null>(null);
  const [rows, setRows] = useState<JoinRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [q, setQ] = useState('');
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tabFor, setTabFor] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const st = await apiFetch<{ enabled: boolean; botUsername: string | null }>(
        '/api/telegram/status',
      );
      setStatus(st);
      let list: JoinRow[];
      if (filter === 'all') {
        const [a, b, c, d] = await Promise.all([
          apiFetch<JoinRow[]>('/api/telegram/join-requests?status=pending'),
          apiFetch<JoinRow[]>('/api/telegram/join-requests?status=approved'),
          apiFetch<JoinRow[]>('/api/telegram/join-requests?status=rejected'),
          apiFetch<JoinRow[]>('/api/telegram/join-requests?status=invited'),
        ]);
        const map = new Map<string, JoinRow>();
        for (const arr of [a, b, c, d]) {
          for (const r of Array.isArray(arr) ? arr : []) map.set(r.id, r);
        }
        list = [...map.values()].sort(
          (x, y) =>
            new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
        );
      } else {
        list = await apiFetch<JoinRow[]>(
          `/api/telegram/join-requests?status=${encodeURIComponent(filter)}`,
        );
        if (!Array.isArray(list)) list = [];
      }
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const blob = [
        fio(r),
        r.phone,
        r.pinfl,
        r.telegramUsername,
        r.inviteCode,
        r.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, q]);

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
      setError(e instanceof Error ? e.message : 'Не удалось создать ссылку');
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    const tabNumber = (tabFor[id] || '').trim();
    if (!tabNumber) {
      setError('Укажите табельный номер для подтверждения');
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
      setError(e instanceof Error ? e.message : 'Ошибка подтверждения');
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    if (!window.confirm('Отклонить заявку?')) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/telegram/join-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отклонения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={arena.wrap}>
      {lightbox.node}
      <PageSubnav groupKey="employees" />

      <div className={arena.toolbar}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            Заявки из Telegram
          </h1>
          <p className={shared.muted} style={{ margin: '6px 0 0' }}>
            Проверка анкет с фото и ПИНФЛ ·{' '}
            <Link href="/employees" className={shared.link}>
              ← Сотрудники
            </Link>
            {' · '}
            <Link href="/settings/telegram" className={shared.link}>
              Настройки бота
            </Link>
            {status?.enabled ? (
              <>
                {' · '}
                <span className={shared.badgeOk}>@{status.botUsername}</span>
              </>
            ) : (
              <>
                {' · '}
                <span className={shared.badgeWarn}>Бот выключен</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={arena.filterBand}>
        <input
          className={arena.search}
          placeholder="Поиск: ФИО, телефон, ПИНФЛ, @user…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 14 }}
        />
        <select
          className={arena.toolBtn}
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          style={{ minHeight: 40, height: 40, padding: '0 12px', cursor: 'pointer' }}
        >
          <option value="pending">Ожидают</option>
          <option value="approved">Подтверждённые</option>
          <option value="rejected">Отклонённые</option>
          <option value="invited">Invite (пустые)</option>
          <option value="all">Все</option>
        </select>
        <button
          type="button"
          className={shared.btn}
          disabled={busy || !status?.enabled}
          onClick={() => void createInvite()}
        >
          {busy ? '…' : 'Invite-ссылка'}
        </button>
        <button
          type="button"
          className={shared.btnGhost}
          disabled={busy || loading}
          onClick={() => void load()}
        >
          Обновить
        </button>
      </div>

      {invite ? (
        <p className={shared.muted} style={{ margin: '0 0 8px' }}>
          Ссылка:{' '}
          <a href={invite.deepLink} target="_blank" rel="noreferrer" className={shared.link}>
            {invite.deepLink}
          </a>
        </p>
      ) : null}

      {error ? <p className={shared.error}>{error}</p> : null}

      {loading ? (
        <p className={shared.muted}>Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className={shared.muted}>Заявок нет.</p>
      ) : (
        <div className={shared.tableCard}>
          <table className={shared.dataTable}>
            <thead>
              <tr>
                <th>Фото</th>
                <th>ФИО</th>
                <th>Telegram</th>
                <th>Телефон</th>
                <th>ПИНФЛ</th>
                <th>Статус</th>
                <th>Создано</th>
                <th>Таб. №</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const src = mediaSrc(r.photoUrl);
                const pending = r.status === 'pending';
                return (
                  <tr key={r.id}>
                    <td>
                      {src ? (
                        <PhotoThumb
                          src={src}
                          alt={fio(r)}
                          slides={[{ src, caption: fio(r) }]}
                          lightbox={lightbox}
                          width={40}
                          height={40}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{fio(r)}</td>
                    <td>
                      {r.telegramUsername ? `@${r.telegramUsername}` : '—'}
                    </td>
                    <td>{r.phone || '—'}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {r.pinfl || '—'}
                    </td>
                    <td>
                      <span
                        className={
                          r.status === 'pending'
                            ? shared.badgeWarn
                            : r.status === 'approved'
                              ? shared.badgeOk
                              : shared.badge
                        }
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDt(r.createdAt)}</td>
                    <td>
                      {pending ? (
                        <input
                          className={arena.search}
                          style={{
                            width: 96,
                            minWidth: 96,
                            height: 32,
                            padding: '0 8px',
                            boxShadow: 'none',
                          }}
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {pending ? (
                        <div className={shared.rowActions} style={{ gap: 6 }}>
                          <button
                            type="button"
                            className={shared.btnSuccess}
                            disabled={busy}
                            onClick={() => void approve(r.id)}
                          >
                            Подтвердить
                          </button>
                          <button
                            type="button"
                            className={shared.btnGhost}
                            disabled={busy}
                            onClick={() => void reject(r.id)}
                          >
                            Отклонить
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
