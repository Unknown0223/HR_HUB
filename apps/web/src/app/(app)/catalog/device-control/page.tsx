'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
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

const ACTIONS: {
  id: Action;
  label: string;
  short: string;
  danger?: boolean;
  icon: keyof typeof I;
}[] = [
  { id: 'heartbeat', label: 'Проверить связь', short: 'Связь', icon: 'pulse' },
  { id: 'sync', label: 'Синхронизировать', short: 'Синхр.', icon: 'sync' },
  { id: 'sync_clock', label: 'Синхронизировать часы', short: 'Часы', icon: 'clock' },
  { id: 'pull_events', label: 'Забрать события', short: 'События', icon: 'download' },
  { id: 'open_door', label: 'Открыть дверь', short: 'Дверь', danger: true, icon: 'door' },
  { id: 'reboot', label: 'Перезагрузить', short: 'Ребут', danger: true, icon: 'power' },
];

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU');
}

function fmtRelative(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return 'только что';
  if (sec < 60) return `${sec} сек назад`;
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  return fmtDt(iso);
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

function managementHint(status: string, isActive: boolean) {
  if (!isActive) return 'Активировать';
  const s = status.toLowerCase();
  if (s === 'online') return 'Удалённое управление';
  if (s === 'new' || s === 'registered') return 'Настроить';
  return 'Восстановить связь';
}

function metricValueClass(kind: 'total' | 'online' | 'offline' | 'new' | 'inactive') {
  if (kind === 'online') return styles.mOnline;
  if (kind === 'offline') return styles.mOffline;
  if (kind === 'new') return styles.mNew;
  if (kind === 'inactive') return styles.mInactive;
  return styles.mNeutral;
}

function metricIconBg(kind: 'total' | 'online' | 'offline' | 'new' | 'inactive') {
  if (kind === 'online') return styles.metricIconOnline;
  if (kind === 'offline') return styles.metricIconOffline;
  if (kind === 'new') return styles.metricIconNew;
  if (kind === 'inactive') return styles.metricIconInactive;
  return styles.metricIconTotal;
}

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(devices: Device[]) {
  const header = ['Название', 'Серийный номер', 'Хост', 'Локация', 'Статус', 'Активен', 'Последний сеанс'];
  const lines = devices.map((d) =>
    [
      d.name,
      d.serialNumber,
      d.host || '',
      d.location?.name || '',
      statusLabel(d.status, d.isActive),
      d.isActive ? 'да' : 'нет',
      fmtDt(d.lastSeenAt),
    ]
      .map((v) => escapeCsv(String(v)))
      .join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `device-control-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const I = {
  monitor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 8h.01" />
      <path d="M11 8h2" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  refresh: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  ),
  inbox: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  wifi: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h.01" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.859a10 10 0 0 1 14 0" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
  ),
  wifiOff: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.318" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <path d="m2 2 20 20" />
    </svg>
  ),
  settings: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  more: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  pulse: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  sync: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  door: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 4h3a2 2 0 0 1 2 2v14" />
      <path d="M2 20h3" />
      <path d="M13 20h9" />
      <path d="M10 12v.01" />
      <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" />
    </svg>
  ),
  power: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </svg>
  ),
  external: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
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
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }

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
      showToast(res.message || (res.ok !== false ? 'Готово' : 'Ошибка'));
      if (action === 'heartbeat' || action === 'sync') await load(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка команды');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  const metrics = [
    { label: 'Устройств', value: summary.total, kind: 'total' as const, icon: I.monitor },
    { label: 'В сети', value: summary.online, kind: 'online' as const, icon: I.wifi },
    { label: 'Не в сети', value: summary.offline, kind: 'offline' as const, icon: I.wifiOff },
    { label: 'Новые', value: summary.neu, kind: 'new' as const, icon: I.settings },
    { label: 'Неактивные', value: summary.inactive, kind: 'inactive' as const, icon: I.wifiOff },
  ];

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="device-control" />

      <header className={styles.header}>
        <span className={styles.iconBadge} aria-hidden="true">
          {I.monitor}
        </span>
        <div>
          <h1 className={styles.h1}>Удалённое управление устройствами</h1>
          <p className={styles.subtitle}>Терминалы Face ID, синхронизация и статусы</p>
        </div>
      </header>

      <div className={styles.metrics}>
        {metrics.map((m) => (
          <div key={m.label} className={styles.metricCard}>
            <div className={styles.metricTop}>
              <p className={styles.metricLabel}>{m.label}</p>
              <span className={`${styles.metricIconWrap} ${metricIconBg(m.kind)}`}>{m.icon}</span>
            </div>
            <p className={`${styles.metricValue} ${metricValueClass(m.kind)}`}>{m.value}</p>
          </div>
        ))}
      </div>

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
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={styles.toolBtn}
          disabled={loading || filtered.length === 0}
          onClick={() => downloadCsv(filtered)}
        >
          {I.download}
          CSV
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${refreshing ? styles.spin : ''}`}
          disabled={loading || refreshing}
          onClick={() => void load(true)}
          title="Обновить"
          aria-label="Обновить"
        >
          {I.refresh}
        </button>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.panel}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Устройство</th>
                <th>Локация</th>
                <th>Статус</th>
                <th>Последний сеанс</th>
                <th>Управление</th>
                <th className={styles.colExpand}>
                  <span className={styles.srOnly}>Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    <div className={styles.spinner} aria-hidden="true" />
                    Загрузка…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyState}>
                      <span className={styles.emptyIcon}>{I.inbox}</span>
                      <p className={styles.emptyTitle}>Нет устройств</p>
                      <p className={styles.emptyHint}>Добавьте их в разделе «Устройства»</p>
                      <Link href="/catalog/devices" className={styles.emptyLink}>
                        Перейти к устройствам {I.external}
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const isBusy = busyId === d.id;
                  const isOpen = expanded === d.id;
                  const online =
                    d.isActive && d.status.toLowerCase() === 'online';
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className={`${isBusy ? styles.rowBusy : ''} ${isOpen ? styles.rowOpen : ''}`}
                      >
                        <td>
                          <div className={styles.deviceCell}>
                            <span
                              className={`${styles.deviceIcon} ${online ? styles.deviceIconOn : styles.deviceIconOff}`}
                              aria-hidden
                            >
                              {I.terminal}
                            </span>
                            <div className={styles.deviceText}>
                              <Link href={`/catalog/devices/${d.id}`} className={styles.name}>
                                {d.name}
                              </Link>
                              <div className={styles.meta}>
                                {d.serialNumber}
                                {d.host ? ` · ${d.host}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.location}>{d.location?.name || '—'}</td>
                        <td>
                          <span className={`${styles.statusChip} ${statusClass(d.status, d.isActive)}`}>
                            {online ? <span className={styles.statusPulse} aria-hidden /> : null}
                            {statusLabel(d.status, d.isActive)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.mono} title={fmtDt(d.lastSeenAt)}>
                            {fmtRelative(d.lastSeenAt)}
                          </span>
                        </td>
                        <td>
                          <span className={styles.manageHint}>
                            {managementHint(d.status, d.isActive)}
                          </span>
                        </td>
                        <td className={styles.colExpand}>
                          <button
                            type="button"
                            className={`${styles.expandBtn} ${isOpen ? styles.expandBtnOpen : ''}`}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Скрыть команды' : 'Показать команды'}
                            onClick={() => setExpanded(isOpen ? null : d.id)}
                          >
                            {I.chevron}
                          </button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className={styles.expandRow}>
                          <td colSpan={6}>
                            <div className={styles.expandPanel}>
                              <div className={styles.expandHead}>
                                <span className={styles.expandTitle}>Команды · {d.name}</span>
                                <Link href={`/catalog/devices/${d.id}`} className={styles.expandLink}>
                                  Карточка устройства {I.external}
                                </Link>
                              </div>
                              <div className={styles.actionGrid}>
                                {ACTIONS.map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    className={
                                      a.danger ? styles.actionBtnDanger : styles.actionBtn
                                    }
                                    disabled={isBusy}
                                    onClick={() => void run(d, a.id)}
                                  >
                                    <span className={styles.actionIcon}>{I[a.icon]}</span>
                                    <span className={styles.actionLabel}>
                                      {isBusy && busyAction === a.id ? '…' : a.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.footer}>
          Показано <span className={styles.footerStrong}>{filtered.length}</span> из{' '}
          <span className={styles.footerStrong}>{rows.length}</span>
          {expanded ? (
            <span className={styles.footerHint}> · нажмите ▾ чтобы свернуть команды</span>
          ) : (
            <span className={styles.footerHint}> · нажмите ▾ у строки для команд</span>
          )}
        </div>
      </div>

      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
