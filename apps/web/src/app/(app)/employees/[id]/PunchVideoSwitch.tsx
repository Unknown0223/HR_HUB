'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/** Per-employee video punch. The company switch on «Видео-отметка» must also be on. */
export function PunchVideoSwitch({ employeeId }: { employeeId: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: { id: string; enabled: boolean }[] }>(
      `/api/settings/punch-video/staff?employeeId=${encodeURIComponent(employeeId)}`,
    )
      .then((res) => {
        if (!cancelled) setOn(res.items.find((i) => i.id === employeeId)?.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function toggle(next: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/settings/punch-video/staff', {
        method: 'PUT',
        body: JSON.stringify({ employeeIds: [employeeId], enabled: next }),
      });
      setOn(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: '0 0 14px' }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 650 }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>Видео-отметка с телефона</span>
      </label>
      <p style={{ margin: '4px 0 0 24px', color: 'var(--ink-muted)', fontSize: 13 }}>
        Включено — этот сотрудник отмечает приход и уход коротким видео. Общий выключатель: Настройки → Видео-отметка.
      </p>
      {error ? <p style={{ margin: '6px 0 0', color: 'var(--danger)' }}>{error}</p> : null}
    </div>
  );
}
