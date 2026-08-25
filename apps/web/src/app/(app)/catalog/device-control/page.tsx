'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import styles from './page.module.css';

type Device = {
  id: string;
  name: string;
  serialNumber: string;
  adapterType: string;
  host?: string | null;
  status: string;
  lastSeenAt?: string | null;
  isActive: boolean;
  location?: { id: string; name: string } | null;
};

type Action = 'heartbeat' | 'sync' | 'sync_clock' | 'pull_events' | 'open_door' | 'reboot';

const ACTIONS: { id: Action; label: string; danger?: boolean }[] = [
  { id: 'heartbeat', label: 'Проверить связь' },
  { id: 'sync', label: 'Синхронизировать' },
  { id: 'sync_clock', label: 'Синхронизировать часы' },
  { id: 'pull_events', label: 'Забрать события' },
  { id: 'open_door', label: 'Открыть дверь', danger: true },
  { id: 'reboot', label: 'Перезагрузить', danger: true },
];

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU');
}

function statusLabel(status: string, isActive: boolean) {
  if (!isActive) return 'Неактивный';
  const s = status.toLowerCase();
  if (s === 'online') return 'В сети';
  if (s === 'offline') return 'Не в сети';
  if (s === 'new' || s === 'registered') return 'Новое';
  return status;
}

export default function DeviceControlPage() {
  const [rows, setRows] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Device[]>('/api/attendance/devices');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.name, d.serialNumber, d.host, d.location?.name, d.adapterType]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  async function run(device: Device, action: Action) {
    const meta = ACTIONS.find((a) => a.id === action);
    if (meta?.danger) {
      const ok = await confirm({
        title: meta.label,
        message: `${meta.label} — «${device.name}»?`,
        variant: 'danger',
        confirmText: 'Да',
        cancelText: 'Нет',
      });
      if (!ok) return;
    }
    setBusyId(device.id);
    setBusyAction(action);
    try {
      const res = await apiFetch<{ ok?: boolean; message?: string }>(
        `/api/attendance/devices/${device.id}/remote`,
        { method: 'POST', body: JSON.stringify({ action }) },
      );
      setNotes((prev) => ({
        ...prev,
        [device.id]: { ok: res.ok !== false, text: res.message || 'Готово' },
      }));
      if (action === 'heartbeat' || action === 'sync') await load();
    } catch (e) {
      setNotes((prev) => ({
        ...prev,
        [device.id]: { ok: false, text: e instanceof Error ? e.message : 'Ошибка команды' },
      }));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="device-control" />
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Поиск по устройству, IP, локации..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className={styles.refresh} disabled={loading} onClick={() => void load()}>
          Обновить
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Устройство</th>
              <th>Локация</th>
              <th>Статус</th>
              <th>Последний сеанс</th>
              <th>Управление</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Нет устройств. Добавьте их в разделе «Устройства».
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const online = d.isActive && d.status.toLowerCase() === 'online';
                const note = notes[d.id];
                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/catalog/devices/${d.id}`} className={styles.name}>
                        {d.name}
                      </Link>
                      <div className={styles.meta}>
                        {d.serialNumber}
                        {d.host ? ` · ${d.host}` : ''}
                      </div>
                      {note ? (
                        <div className={note.ok ? styles.noteOk : styles.noteErr}>{note.text}</div>
                      ) : null}
                    </td>
                    <td>{d.location?.name || '—'}</td>
                    <td>
                      <span className={online ? styles.online : styles.offline}>
                        {statusLabel(d.status, d.isActive)}
                      </span>
                    </td>
                    <td>{fmtDt(d.lastSeenAt)}</td>
                    <td>
                      <div className={styles.actions}>
                        {ACTIONS.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={a.danger ? styles.btnDanger : styles.btn}
                            disabled={busyId === d.id}
                            onClick={() => void run(d, a.id)}
                          >
                            {busyId === d.id && busyAction === a.id ? '…' : a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
