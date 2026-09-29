'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { APP_TZ, ymdToday } from '@/lib/tz';
import {
  LiveMap,
  personTone,
  TRACK_COLORS,
  type ColoredTrack,
  type LivePerson,
  type TrackPath,
  type TrackPoint,
  type TrackPunch,
} from './LiveMap';
import styles from './page.module.css';

type Mark = {
  id: string;
  markType: string;
  markTypeLabel: string;
  occurredAt: string;
};

type TreeNode = { id: string; name: string; children?: TreeNode[] };
type DivisionInfo = { order: number; path: string };

type GroupBy = 'division' | 'location' | 'head' | 'position' | 'role' | 'none';
type Group = { key: string; label: string; sub?: string; members: LivePerson[] };

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'division', label: 'Подразделения' },
  { id: 'location', label: 'Филиалы' },
  { id: 'head', label: 'Руководители' },
  { id: 'position', label: 'Должности' },
  { id: 'role', label: 'Роли' },
  { id: 'none', label: 'Без группировки' },
];

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Администратор платформы',
  tenant_admin: 'Администраторы',
  hr: 'HR',
  manager: 'Руководители',
  employee: 'Сотрудники',
};

const GROUP_BY_STORAGE = 'gps-tracking.groupBy';
const LIVE_POLL_MS = 15_000;
const TRACK_POLL_MS = 30_000;
/** Routes drawn at once; more would be unreadable and costly to poll. */
const MAX_TRACKS = TRACK_COLORS.length;
const NO_POINTS: TrackPoint[] = [];
const NO_TRACK_COLOR = '#9ca3af';

function flattenTree(nodes: TreeNode[], parents: string[] = [], out = new Map<string, DivisionInfo>()) {
  for (const n of nodes) {
    out.set(n.id, { order: out.size, path: parents.join(' › ') });
    flattenTree(n.children ?? [], [...parents, n.name], out);
  }
  return out;
}

/** Groups keep the tracked phones only; one person may sit in several head groups (nested managers). */
function groupPeople(people: LivePerson[], by: GroupBy, divisions: Map<string, DivisionInfo>): Group[] {
  if (by === 'none') return [{ key: 'all', label: 'Все сотрудники', members: people }];
  const map = new Map<string, Group & { order: number }>();
  const add = (key: string, label: string, p: LivePerson, order = 0, sub?: string) => {
    const g = map.get(key) ?? { key, label, sub, order, members: [] };
    g.members.push(p);
    map.set(key, g);
  };
  for (const p of people) {
    if (by === 'division') {
      const info = p.divisionId ? divisions.get(p.divisionId) : undefined;
      if (p.divisionId) add(p.divisionId, p.division ?? '—', p, info?.order ?? 1e6, info?.path || undefined);
      else add('', 'Без подразделения', p, 1e9);
    } else if (by === 'location') {
      add(p.locationId ?? '', p.location ?? 'Без филиала', p, p.locationId ? 0 : 1e9);
    } else if (by === 'position') {
      add(p.positionId ?? '', p.position ?? 'Без должности', p, p.positionId ? 0 : 1e9);
    } else if (by === 'role') {
      add(p.role ?? '', p.role ? (ROLE_LABEL[p.role] ?? p.role) : 'Без учётной записи', p, p.role ? 0 : 1e9);
    } else if (!p.heads.length) {
      add('', 'Без руководителя', p, 1e9);
    } else {
      for (const h of p.heads) add(h.id, h.name, p);
    }
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ru'))
    .map(({ order: _order, ...g }) => g);
}

function personText(p: LivePerson) {
  return [p.fullName, p.tabNumber, p.position, p.division, p.location, ...p.heads.map((h) => h.name)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function trackKm(points: TrackPoint[]) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]);
  return m / 1000;
}

const REASON_LABEL: Record<string, string> = {
  working: 'Рабочее время',
  day_off: 'Выходной',
  holiday: 'Праздник',
  absence: 'Отпуск / отсутствие',
  before_start: 'До начала смены',
  after_end: 'После смены',
};

const STATE_LABEL: Record<string, string> = {
  no_permission: 'Нет разрешения на геолокацию',
  gps_off: 'GPS выключен',
};

function hm(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: APP_TZ });
}

function ago(iso?: string | null) {
  if (!iso) return 'нет данных';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `${Math.round(s / 3600)} ч назад`;
  return `${Math.round(s / 86400)} дн назад`;
}

function haversineM(a: TrackPoint, b: TrackPoint) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function Battery({ pct, charging }: { pct: number | null; charging: boolean | null }) {
  if (pct == null) return <span className={styles.batteryNone}>—</span>;
  const tone = pct < 20 ? styles.batteryLow : pct < 50 ? styles.batteryMid : styles.batteryOk;
  return (
    <span className={`${styles.battery} ${tone}`} title={charging ? 'Заряжается' : 'Батарея'}>
      <span className={styles.batteryShell}>
        <span className={styles.batteryFill} style={{ width: `${Math.max(6, pct)}%` }} />
      </span>
      {charging ? '⚡' : ''}
      {pct}%
    </span>
  );
}

function StatusBadge({ p }: { p: LivePerson }) {
  const tone = personTone(p);
  const problem = p.state ? STATE_LABEL[p.state] : undefined;
  if (problem) return <span className={`${styles.badge} ${styles.badgeWarn}`}>{problem}</span>;
  if (tone === 'live') return <span className={`${styles.badge} ${styles.badgeLive}`}>На связи · работает</span>;
  if (tone === 'idle')
    return <span className={`${styles.badge} ${styles.badgeIdle}`}>{REASON_LABEL[p.windowReason] ?? 'Вне смены'}</span>;
  return <span className={`${styles.badge} ${styles.badgeOff}`}>Не в сети</span>;
}

function Avatar({ src, name, tone, size = 44 }: { src: string | null; name: string; tone: string; size?: number }) {
  const ring = tone === 'live' ? styles.ringLive : tone === 'idle' ? styles.ringIdle : styles.ringOff;
  return (
    <span className={`${styles.avatarWrap} ${ring}`} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={styles.avatarImg} />
      ) : (
        <span className={styles.avatarInitials}>
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((s) => s[0])
            .join('')}
        </span>
      )}
      <span className={styles.avatarDot} />
    </span>
  );
}

function GroupPanel({
  people,
  tracks,
  kmOf,
  colorOf,
  photoOf,
  isToday,
  title,
  onFocus,
}: {
  people: LivePerson[];
  tracks: Record<string, TrackPoint[]>;
  kmOf: (id: string) => number;
  colorOf: (id: string) => string;
  photoOf: (p: LivePerson) => string | null;
  isToday: boolean;
  title: string;
  onFocus: (id: string) => void;
}) {
  const live = people.filter((p) => personTone(p) === 'live').length;
  const totalKm = people.reduce((s, p) => s + kmOf(p.employeeId), 0);
  const lowBattery = people.filter((p) => p.batteryPct != null && p.batteryPct < 20).length;
  return (
    <>
      <div className={styles.groupHead}>
        <strong>{title}</strong>
        <span>Выбрано сотрудников: {people.length}</span>
        {people.length > MAX_TRACKS ? (
          <span className={styles.groupNote}>
            Маршруты рисуются для первых {MAX_TRACKS}; остальные показаны на карте точкой.
          </span>
        ) : null}
      </div>
      <div className={styles.stats}>
        <div>
          <span>На смене сейчас</span>
          <b>
            {live} из {people.length}
          </b>
        </div>
        <div>
          <span>Пройдено {isToday ? 'сегодня' : 'за день'}</span>
          <b>{totalKm.toFixed(1)} км</b>
        </div>
        <div>
          <span>Не в сети</span>
          <b>{people.filter((p) => personTone(p) === 'off').length}</b>
        </div>
        <div>
          <span>Батарея &lt; 20%</span>
          <b>{lowBattery}</b>
        </div>
      </div>
      <h4 className={styles.sectionTitle}>Маршруты</h4>
      <div className={styles.groupList}>
        {people.map((p) => {
          const pts = tracks[p.employeeId] ?? NO_POINTS;
          return (
            <button key={p.employeeId} type="button" className={styles.groupRow} onClick={() => onFocus(p.employeeId)}>
              <span className={styles.swatch} style={{ background: colorOf(p.employeeId) }} />
              <Avatar src={photoOf(p)} name={p.fullName} tone={personTone(p)} size={34} />
              <span className={styles.groupRowBody}>
                <strong>{p.fullName}</strong>
                <span>
                  {kmOf(p.employeeId).toFixed(2)} км · {pts.length} точек · {ago(p.lastSeenAt)}
                </span>
              </span>
              <Battery pct={p.batteryPct} charging={p.charging} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function GpsTrackingInner() {
  const [people, setPeople] = useState<LivePerson[]>([]);
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('division');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [onlySelected, setOnlySelected] = useState(true);
  const [divisions, setDivisions] = useState<Map<string, DivisionInfo>>(() => new Map());
  const [date, setDate] = useState(() => ymdToday());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tracks, setTracks] = useState<Record<string, TrackPoint[]>>({});
  const [paths, setPaths] = useState<Record<string, TrackPath>>({});
  const [punches, setPunches] = useState<Record<string, TrackPunch[]>>({});
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const isToday = date === ymdToday();
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectionKey = selectedIds.join(',');
  const trackIds = selectedIds.slice(0, MAX_TRACKS);
  const trackKey = trackIds.join(',');

  const photoOf = useCallback((p: LivePerson) => mediaSrc(p.photoUrl), []);

  useEffect(() => {
    apiFetch<TreeNode[]>('/api/organization/divisions/tree')
      .then((tree) => setDivisions(flattenTree(tree)))
      .catch(() => setDivisions(new Map()));
    const saved = window.localStorage.getItem(GROUP_BY_STORAGE) as GroupBy | null;
    if (saved && GROUP_OPTIONS.some((o) => o.id === saved)) setGroupBy(saved);
  }, []);

  const changeGroupBy = (by: GroupBy) => {
    setGroupBy(by);
    setCollapsed(new Set());
    window.localStorage.setItem(GROUP_BY_STORAGE, by);
  };

  const toggleChecked = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const focusOne = (id: string) => setSelectedIds((prev) => (prev.length === 1 && prev[0] === id ? [] : [id]));
  const setMany = (ids: string[], on: boolean) =>
    setSelectedIds((prev) => {
      if (!on) return prev.filter((x) => !ids.includes(x));
      const next = [...prev];
      for (const id of ids) if (!next.includes(id)) next.push(id);
      return next;
    });
  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const loadLive = useCallback(async () => {
    try {
      const data = await apiFetch<LivePerson[]>('/api/tracking/live');
      setPeople(data);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }, []);

  const loadTracks = useCallback(async (ids: string[], d: string) => {
    try {
      const qs = `date=${encodeURIComponent(d)}`;
      const [results, detail] = await Promise.all([
        Promise.all(
          ids.map((id) =>
            apiFetch<{ points: TrackPoint[]; path?: TrackPath; punches?: TrackPunch[] }>(
              `/api/tracking/employees/${id}/track?${qs}`,
            )
              .then((t) => ({ id, points: t.points, path: t.path ?? null, punches: t.punches ?? [] }))
              .catch(() => ({ id, points: [] as TrackPoint[], path: null, punches: [] as TrackPunch[] })),
          ),
        ),
        ids.length === 1
          ? apiFetch<{ marks: Mark[] }>(`/api/attendance/gps-tracking/${ids[0]}?${qs}`).catch(() => ({ marks: [] }))
          : Promise.resolve({ marks: [] as Mark[] }),
      ]);
      setTracks(Object.fromEntries(results.map((r) => [r.id, r.points])));
      setPaths(Object.fromEntries(results.filter((r) => r.path).map((r) => [r.id, r.path!])));
      setPunches(Object.fromEntries(results.map((r) => [r.id, r.punches])));
      setMarks(detail.marks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  }, []);

  useEffect(() => {
    void loadLive();
    const timer = setInterval(() => void loadLive(), LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [loadLive]);

  useEffect(() => {
    const ids = trackKey ? trackKey.split(',') : [];
    if (!ids.length) {
      setTracks({});
      setPaths({});
      setPunches({});
      setMarks([]);
      return;
    }
    void loadTracks(ids, date);
    if (!isToday) return;
    const timer = setInterval(() => void loadTracks(ids, date), TRACK_POLL_MS);
    return () => clearInterval(timer);
  }, [trackKey, date, isToday, loadTracks]);

  const sortedPeople = useMemo(() => {
    const rank = { live: 0, idle: 1, off: 2 } as const;
    return [...people].sort(
      (a, b) => rank[personTone(a)] - rank[personTone(b)] || a.fullName.localeCompare(b.fullName, 'ru'),
    );
  }, [people]);

  const allGroups = useMemo(() => groupPeople(sortedPeople, groupBy, divisions), [sortedPeople, groupBy, divisions]);

  /** Search keeps a whole group when its name matches, otherwise only the matching people inside it. */
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allGroups;
    return allGroups
      .map((g) =>
        g.label.toLowerCase().includes(needle) ? g : { ...g, members: g.members.filter((p) => personText(p).includes(needle)) },
      )
      .filter((g) => g.members.length);
  }, [allGroups, q]);

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const out: LivePerson[] = [];
    for (const g of groups)
      for (const p of g.members)
        if (!seen.has(p.employeeId)) {
          seen.add(p.employeeId);
          out.push(p);
        }
    return out;
  }, [groups]);

  const counts = useMemo(() => {
    let live = 0;
    let idle = 0;
    let off = 0;
    for (const p of filtered) {
      const t = personTone(p);
      if (t === 'live') live++;
      else if (t === 'idle') idle++;
      else off++;
    }
    return { live, idle, off };
  }, [filtered]);

  const colorOf = (id: string) => {
    const i = selectedIds.indexOf(id);
    return i >= 0 && i < MAX_TRACKS ? TRACK_COLORS[i] : NO_TRACK_COLOR;
  };
  const coloredTracks = useMemo<ColoredTrack[]>(
    () =>
      (trackKey ? trackKey.split(',') : []).map((id, i) => ({
        employeeId: id,
        color: TRACK_COLORS[i],
        points: tracks[id] ?? NO_POINTS,
        path: paths[id] ?? null,
        punches: punches[id],
      })),
    [trackKey, tracks, paths, punches],
  );
  const kmOf = (id: string) => (paths[id] ? paths[id].distanceM / 1000 : trackKm(tracks[id] ?? NO_POINTS));
  const selectedPeople = useMemo(
    () =>
      selectedIds.map((id) => people.find((p) => p.employeeId === id)).filter((p): p is LivePerson => !!p),
    [selectedIds, people],
  );

  const mapFocused = onlySelected && selectedIds.length > 0;
  const mapPeople = mapFocused ? selectedPeople : filtered;

  const allVisibleChecked = filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.employeeId));
  const selectVisible = () =>
    setMany(
      filtered.map((p) => p.employeeId),
      !allVisibleChecked,
    );

  const selectionTitle = useMemo(() => {
    if (groupBy === 'none') return 'Выбранные сотрудники';
    const sel = new Set(selectedIds);
    const exact = allGroups.find(
      (g) => g.members.length === sel.size && g.members.every((p) => sel.has(p.employeeId)),
    );
    return exact ? exact.label : 'Выбранные сотрудники';
  }, [allGroups, groupBy, selectedIds]);

  const selected = selectedId ? (people.find((p) => p.employeeId === selectedId) ?? null) : null;
  const track = (selectedId && tracks[selectedId]) || NO_POINTS;
  const selectedPath = selectedId ? paths[selectedId] : undefined;
  const selectedPunchIds = new Set(((selectedId && punches[selectedId]) || []).map((p) => p.id));
  const distanceKm = useMemo(
    () => (selectedPath ? selectedPath.distanceM / 1000 : trackKm(track)),
    [selectedPath, track],
  );
  const lastPoint = track[track.length - 1];

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" titleOverride="GPS отслеживание" />

      <div className={styles.topbar}>
        <div className={styles.liveTag}>
          <span className={styles.liveDot} />
          Онлайн-мониторинг
          <span className={styles.liveSub}>
            обновление каждые 15 с{updatedAt ? ` · ${updatedAt.toLocaleTimeString('ru-RU')}` : ''}
          </span>
        </div>
        <div className={styles.counters}>
          <span className={`${styles.counter} ${styles.counterLive}`}>
            <b>{counts.live}</b> на смене
          </span>
          <span className={`${styles.counter} ${styles.counterIdle}`}>
            <b>{counts.idle}</b> вне смены
          </span>
          <span className={`${styles.counter} ${styles.counterOff}`}>
            <b>{counts.off}</b> не в сети
          </span>
        </div>
        <label className={styles.toggleField}>
          <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
          На карте только выбранные
        </label>
        <label className={styles.dateField}>
          <span>Маршрут за</span>
          <input type="date" value={date} max={ymdToday()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className={styles.btnPrimary} onClick={() => void loadLive()}>
          Обновить
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.board}>
        <aside className={styles.left}>
          <div className={styles.searchRow}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск: ФИО, таб. №, отдел, филиал, руководитель…"
            />
            <label className={styles.groupByRow}>
              <span>Группировать</span>
              <select value={groupBy} onChange={(e) => changeGroupBy(e.target.value as GroupBy)}>
                {GROUP_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.listTools}>
            <label className={styles.checkAll}>
              <input
                type="checkbox"
                checked={allVisibleChecked}
                disabled={!filtered.length}
                onChange={selectVisible}
              />
              {q.trim() ? `Все найденные (${filtered.length})` : `Выбрать всех (${filtered.length})`}
            </label>
            {selectedIds.length ? (
              <button type="button" className={styles.linkBtn} onClick={() => setSelectedIds([])}>
                Сбросить ({selectedIds.length})
              </button>
            ) : groupBy !== 'none' && groups.length > 1 ? (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() =>
                  setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.key)))
                }
              >
                {collapsed.size ? 'Развернуть все' : 'Свернуть все'}
              </button>
            ) : null}
          </div>
          <div className={styles.list}>
            {!filtered.length ? (
              <p className={styles.empty}>
                {q.trim()
                  ? 'Ничего не найдено.'
                  : 'Нет сотрудников с включённым отслеживанием. Сотрудник должен войти в мобильное приложение HR HUB и выдать разрешения.'}
              </p>
            ) : (
              groups.map((g) => {
                const ids = g.members.map((p) => p.employeeId);
                const picked = ids.filter((id) => selectedIds.includes(id)).length;
                const isCollapsed = collapsed.has(g.key) && groupBy !== 'none';
                const liveCount = g.members.filter((p) => personTone(p) === 'live').length;
                return (
                  <section key={`${groupBy}:${g.key}`} className={styles.grp}>
                    {groupBy !== 'none' ? (
                      <div
                        className={styles.grpHead}
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleCollapsed(g.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleCollapsed(g.key);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          className={styles.cardCheck}
                          checked={picked === ids.length}
                          ref={(el) => {
                            if (el) el.indeterminate = picked > 0 && picked < ids.length;
                          }}
                          aria-label={`Выбрать группу ${g.label}`}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => setMany(ids, picked < ids.length)}
                        />
                        <span className={`${styles.grpChevron} ${isCollapsed ? styles.grpChevronShut : ''}`}>▾</span>
                        <span className={styles.grpTitle}>
                          <strong>{g.label}</strong>
                          {g.sub ? <span>{g.sub}</span> : null}
                        </span>
                        <span className={styles.grpCount} title="На смене / всего">
                          {liveCount > 0 ? <em>{liveCount}</em> : null}
                          {g.members.length}
                        </span>
                      </div>
                    ) : null}
                    {isCollapsed
                      ? null
                      : g.members.map((p) => {
                          const tone = personTone(p);
                          const checked = selectedIds.includes(p.employeeId);
                          return (
                            <div
                              key={p.employeeId}
                              role="button"
                              tabIndex={0}
                              className={`${styles.card} ${groupBy !== 'none' ? styles.cardNested : ''} ${checked ? styles.cardActive : ''}`}
                              style={
                                checked && selectedIds.length > 1
                                  ? { boxShadow: `inset 4px 0 0 ${colorOf(p.employeeId)}` }
                                  : undefined
                              }
                              onClick={() => focusOne(p.employeeId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  focusOne(p.employeeId);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                className={styles.cardCheck}
                                checked={checked}
                                aria-label={`Выбрать ${p.fullName}`}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleChecked(p.employeeId)}
                              />
                              <Avatar src={photoOf(p)} name={p.fullName} tone={tone} />
                              <span className={styles.cardBody}>
                                <strong>{p.fullName}</strong>
                                <span>
                                  {[p.position, groupBy === 'division' ? p.location : p.division]
                                    .filter(Boolean)
                                    .join(' · ') || p.tabNumber}
                                </span>
                                <span className={styles.cardMeta}>
                                  <Battery pct={p.batteryPct} charging={p.charging} />
                                  <span>{ago(p.lastSeenAt)}</span>
                                </span>
                              </span>
                            </div>
                          );
                        })}
                  </section>
                );
              })
            )}
          </div>
        </aside>

        <div className={styles.mapPane}>
          <LiveMap
            people={mapPeople}
            photoOf={photoOf}
            selectedIds={selectedIds}
            tracks={coloredTracks}
            onSelect={focusOne}
            fitKey={mapFocused ? `sel:${selectionKey}` : 'all'}
          />
        </div>

        <aside className={styles.right}>
          {selectedPeople.length > 1 ? (
            <GroupPanel
              people={selectedPeople}
              tracks={tracks}
              kmOf={kmOf}
              colorOf={colorOf}
              photoOf={photoOf}
              isToday={isToday}
              title={selectionTitle}
              onFocus={focusOne}
            />
          ) : !selected ? (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>📍</span>
              <strong>Выберите сотрудника</strong>
              <span>
                на карте или в списке. Сгруппируйте список по подразделениям, филиалам, руководителям или ролям и
                отметьте галочкой целую группу или отдельных сотрудников, чтобы сравнить их маршруты на одной карте.
              </span>
            </div>
          ) : (
            <>
              <div className={styles.profile}>
                <Avatar src={photoOf(selected)} name={selected.fullName} tone={personTone(selected)} size={72} />
                <strong>{selected.fullName}</strong>
                <span>{[selected.position, selected.division].filter(Boolean).join(' · ') || '—'}</span>
                <StatusBadge p={selected} />
              </div>
              <div className={styles.stats}>
                <div>
                  <span>Батарея</span>
                  <Battery pct={selected.batteryPct} charging={selected.charging} />
                </div>
                <div>
                  <span>Последняя точка</span>
                  <b>{hm(selected.lastFixAt)}</b>
                </div>
                <div>
                  <span>Пройдено {isToday ? 'сегодня' : 'за день'}</span>
                  <b>{distanceKm.toFixed(2)} км</b>
                </div>
                <div>
                  <span>Точек</span>
                  <b>{track.length}</b>
                </div>
                <div>
                  <span>Точность</span>
                  <b>{selected.accuracy != null ? `±${Math.round(selected.accuracy)} м` : '—'}</b>
                </div>
                <div>
                  <span>Скорость</span>
                  <b>
                    {lastPoint?.speedMps != null ? `${Math.round(lastPoint.speedMps * 3.6)} км/ч` : '—'}
                  </b>
                </div>
              </div>
              <div className={styles.metaList}>
                <div>
                  <span>Связь</span>
                  <b>{ago(selected.lastSeenAt)}</b>
                </div>
                <div>
                  <span>Телефон</span>
                  <b>{selected.model || '—'}</b>
                </div>
                {selected.phone ? (
                  <div>
                    <span>Номер</span>
                    <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                  </div>
                ) : null}
              </div>
              {selectedPath?.stops.length ? (
                <>
                  <h4 className={styles.sectionTitle}>Остановки</h4>
                  <div className={styles.stopList}>
                    {selectedPath.stops.map((s) => (
                      <div key={s.from}>
                        <b>
                          {hm(s.from)}–{hm(s.to)}
                        </b>
                        <span>{s.minutes >= 60 ? `${Math.floor(s.minutes / 60)} ч ${s.minutes % 60} мин` : `${s.minutes} мин`}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <h4 className={styles.sectionTitle}>Отметки</h4>
              <div className={styles.timeline}>
                {!marks.length ? (
                  <p className={styles.empty}>Нет отметок</p>
                ) : (
                  marks.map((m) => (
                    <div key={m.id} className={styles.tlItem}>
                      <span
                        className={
                          m.markType === 'in' ? styles.tlIn : m.markType === 'out' ? styles.tlOut : styles.tlMark
                        }
                      />
                      <div>
                        <strong>{hm(m.occurredAt)}</strong>
                        <div>
                          {m.markTypeLabel}
                          {selectedPunchIds.has(m.id) ? <span className={styles.tlGeo}>с телефона · на карте</span> : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function GpsTrackingPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <GpsTrackingInner />
    </Suspense>
  );
}
