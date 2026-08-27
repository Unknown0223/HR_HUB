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

function statusClass(status: string, isActive: boolean) {
  if (!isActive) return styles.stInactive;
  const s = status.toLowerCase();
  if (s === 'online') return styles.stOnline;
  if (s === 'offline') return styles.stOffline;
  if (s === 'new' || s === 'registered') return styles.stNew;
  return styles.stOffline;
}

const I = {
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  ),
};

export default function DeviceControlPage() {
  const [rows, setRows] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Device[]>('/api/attendance/devices');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const summary = useMemo(() => {
    let online = 0;
    let offline = 0;
    let inactive = 0;
    let neu = 0;
    for (const d of rows) {
      if (!d.isActive) {
        inactive += 1;
        continue;
      }
      const s = d.status.toLowerCase();
      if (s === 'online') online += 1;
      else if (s === 'new' || s === 'registered') neu += 1;
      else offline += 1;
    }
    return { total: rows.length, online, offline, inactive, neu };
  }, [rows]);

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
      if (action === 'heartbeat' || action === 'sync') await load(true);
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
    <div className={styles.page}>
      <PageSubnav groupKey="device-control" />

      <header className={styles.head}>
        <div className={styles.headInner}>
          <div>
            <span className={styles.kicker}>
              <span className={styles.livePulse} aria-hidden="true" />
              Главная · Удалённое управление устройствами
            </span>
            <h1 className={styles.h1}>Удалённое управление устройствами</h1>
            <p className={styles.headSub}>
              Терминалы Face ID и точки прохода: состояние и команды без выезда на объект.
            </p>
          </div>
          <div className={styles.headMetrics}>
            <div className={styles.headMetric}>
              <span className={`${styles.headMetricVal} ${styles.mNeutral}`}>{summary.total}</span>
              <span className={styles.headMetricLabel}>устройств</span>
            </div>
            <div className={styles.headMetric}>
              <span className={`${styles.headMetricVal} ${styles.mOnline}`}>{summary.online}</span>
              <span className={styles.headMetricLabel}>в сети</span>
            </div>
            <div className={styles.headMetric}>
              <span className={`${styles.headMetricVal} ${styles.mOffline}`}>{summary.offline}</span>
              <span className={styles.headMetricLabel}>не в сети</span>
            </div>
            <div className={styles.headMetric}>
              <span className={`${styles.headMetricVal} ${styles.mNew}`}>{summary.neu}</span>
              <span className={styles.headMetricLabel}>новые</span>
            </div>
            <div className={styles.headMetric}>
              <span className={`${styles.headMetricVal} ${styles.mInactive}`}>{summary.inactive}</span>
              <span className={styles.headMetricLabel}>неактивные</span>
            </div>
          </div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>{I.search}</span>
          <input
            className={styles.searchInput}
            placeholder="Поиск по устройству, IP, локации..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск устройства"
          />
        </div>
        <button
          type="button"
          className={`${styles.ghostBtn} ${refreshing ? styles.spin : ''}`}
          disabled={loading || refreshing}
          onClick={() => void load(true)}
        >
          {I.refresh}
          Обновить
        </button>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

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
                  <div className={styles.spinner} aria-hidden="true" />
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
                const note = notes[d.id];
                const isBusy = busyId === d.id;
                return (
                  <tr key={d.id} className={isBusy ? styles.rowBusy : undefined}>
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
                      <span className={`${styles.statusChip} ${statusClass(d.status, d.isActive)}`}>
                        {statusLabel(d.status, d.isActive)}
                      </span>
                    </td>
                    <td className={styles.mono}>{fmtDt(d.lastSeenAt)}</td>
                    <td>
                      <div className={styles.actions}>
                        {ACTIONS.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className={a.danger ? styles.btnDanger : styles.btn}
                            disabled={isBusy}
                            onClick={() => void run(d, a.id)}
                          >
                            {isBusy && busyAction === a.id ? '…' : a.label}
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
