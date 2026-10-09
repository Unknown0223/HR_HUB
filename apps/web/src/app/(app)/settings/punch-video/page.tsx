'use client';

import { useEffect, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import formStyles from '../../catalog/report-templates/form.module.css';
import shared from '../../../page-shared.module.css';

type Settings = { enabled: boolean; codeRequired: boolean; chatId: string };

/** Photo punch stays as it is. These switches add a 5–10s dual-camera video punch. */
export default function PunchVideoSettingsPage() {
  const [form, setForm] = useState<Settings>({ enabled: false, codeRequired: true, chatId: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Settings>('/api/settings/punch-video')
      .then((s) => setForm(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const s = await apiFetch<Settings>('/api/settings/punch-video', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setForm(s);
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сохранить не удалось');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={shared.wrap}>
      <PageSubnav groupKey="settings" />
      <div className={shared.pageHeader}>
        <div>
          <h1 className={shared.pageTitle}>Видео-отметка</h1>
          <p className={shared.pageSubtitle}>
            Сотрудник снимает 5–10 секунд сразу с передней и задней камеры. Фото-отметка при этом остаётся.
          </p>
        </div>
      </div>
      {loading ? <p className={shared.muted}>Загрузка…</p> : null}
      {error ? <p className={shared.error}>{error}</p> : null}
      {ok ? <p className={formStyles.ok} style={{ marginBottom: 12 }}>{ok}</p> : null}
      {!loading ? (
        <div className={formStyles.card} style={{ maxWidth: 720 }}>
          <label className={formStyles.check}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Видео-отметка в приложении
          </label>
          <label className={formStyles.check}>
            <input
              type="checkbox"
              checked={form.codeRequired}
              disabled={!form.enabled}
              onChange={(e) => setForm({ ...form, codeRequired: e.target.checked })}
            />
            Сотрудник называет дневной код (100–999) в видео
          </label>
          <div className={formStyles.field}>
            <label>Telegram-канал или группа (chat id)</label>
            <input
              value={form.chatId}
              onChange={(e) => setForm({ ...form, chatId: e.target.value })}
              placeholder="-1001234567890"
              autoComplete="off"
            />
            <p className={shared.hint} style={{ margin: '6px 0 0' }}>
              Бот должен быть администратором. Пусто — видео сохраняется, в Telegram не уходит.
            </p>
          </div>
          <button type="button" className={shared.btn} disabled={saving} onClick={() => void save()}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      ) : null}
      {!loading ? <StaffPicker /> : null}
    </div>
  );
}

type Staff = { id: string; fullName: string; tabNumber: string; login: string; enabled: boolean };

function StaffPicker() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Staff[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<{ items: Staff[] }>(`/api/settings/punch-video/staff?q=${encodeURIComponent(q)}`)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const selected = items.filter((i) => picked[i.id]).map((i) => i.id);

  async function applyOne(id: string, enabled: boolean) {
    setBusy(true);
    setMsg('');
    try {
      await apiFetch('/api/settings/punch-video/staff', {
        method: 'PUT',
        body: JSON.stringify({ employeeIds: [id], enabled }),
      });
      setItems((list) => list.map((i) => (i.id === id ? { ...i, enabled } : i)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function apply(enabled: boolean) {
    if (!selected.length) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await apiFetch<{ succeeded: number; failed: number }>('/api/settings/punch-video/staff', {
        method: 'PUT',
        body: JSON.stringify({ employeeIds: selected, enabled }),
      });
      setMsg(enabled ? `Включено: ${res.succeeded}` : `Выключено: ${res.succeeded}`);
      setPicked({});
      const r = await apiFetch<{ items: Staff[] }>(`/api/settings/punch-video/staff?q=${encodeURIComponent(q)}`);
      setItems(r.items);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={formStyles.card} style={{ maxWidth: 720, marginTop: 14 }}>
      <h2 className={formStyles.cardTitle}>Сотрудники с входом в приложение</h2>
      <p className={shared.hint}>
        Только те, у кого есть логин мобильного приложения. Отметка с терминала сюда не входит. Переключатель включает или выключает видео-отметку этому сотруднику.
      </p>
      <div className={formStyles.field}>
        <label>Поиск</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия или таб. номер" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" className={shared.btn} disabled={busy || !selected.length} onClick={() => void apply(true)}>
          Включить выбранным
        </button>
        <button type="button" className={shared.btnSecondary} disabled={busy || !selected.length} onClick={() => void apply(false)}>
          Выключить выбранным
        </button>
      </div>
      {msg ? <p className={shared.muted}>{msg}</p> : null}
      {!items.length ? <p className={shared.muted}>Нет сотрудников с логином приложения</p> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((i) => (
          <li key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={picked[i.id] === true}
              onChange={(e) => setPicked((p) => ({ ...p, [i.id]: e.target.checked }))}
              aria-label={i.fullName}
            />
            <span style={{ flex: 1 }}>
              {i.fullName}
              <span className={shared.muted}> · {i.login || i.tabNumber}</span>
            </span>
            <button
              type="button"
              className={i.enabled ? shared.btnSecondary : shared.btn}
              disabled={busy}
              onClick={() => void applyOne(i.id, !i.enabled)}
            >
              {i.enabled ? 'Выключить' : 'Включить'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
