'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type Row = {
  id: string;
  code: string;
  name: string;
  openTime: string | null;
  closeTime: string | null;
  status: 'mode_not_set' | 'not_on_schedule' | 'on_schedule';
  statusLabel: string;
};

type Dashboard = {
  title: string;
  date: string;
  summary: {
    total: number;
    modeNotSet: number;
    notOnSchedule: number;
    onSchedule: number;
    notOpened: number;
  };
  rows: Row[];
  filters: {
    divisionGroups: { id: string; label: string }[];
    schedules: { id: string; label: string }[];
  };
};

const ORANGE = '#e8a87c';
const BEIGE = '#d4c4a8';
const GREEN = '#7dcea0';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Donut({
  total,
  modeNotSet,
  notOnSchedule,
  onSchedule,
}: {
  total: number;
  modeNotSet: number;
  notOnSchedule: number;
  onSchedule: number;
}) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const parts = [
    { n: notOnSchedule, color: ORANGE, label: 'Не по графику' },
    { n: modeNotSet, color: BEIGE, label: 'Режим не задан' },
    { n: onSchedule, color: GREEN, label: 'По графику' },
  ].filter((p) => p.n > 0);
  const sum = Math.max(1, parts.reduce((s, p) => s + p.n, 0));
  let offset = 0;

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 200 200" className={styles.donut}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#f0f2f5" strokeWidth="28" />
        {parts.map((p) => {
          const len = (p.n / sum) * c;
          const el = (
            <circle
              key={p.label}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="28"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="100" y="96" textAnchor="middle" className={styles.donutNum}>
          {total}
        </text>
        <text x="100" y="116" textAnchor="middle" className={styles.donutSub}>
          подразделений
        </text>
      </svg>
      <div className={styles.donutLegend}>
        {notOnSchedule > 0 ? (
          <div>
            <i style={{ background: ORANGE }} /> Не по графику: {notOnSchedule}
          </div>
        ) : null}
        {modeNotSet > 0 ? (
          <div>
            <i style={{ background: BEIGE }} /> Режим не задан: {modeNotSet}
          </div>
        ) : null}
        {onSchedule > 0 ? (
          <div>
            <i style={{ background: GREEN }} /> По графику: {onSchedule}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NotOpenedBar({ value, maxHint = 25 }: { value: number; maxHint?: number }) {
  const max = Math.max(maxHint, value, 1);
  return (
    <div className={styles.barBlock}>
      <div className={styles.barTitle}>Не открылись</div>
      <div className={styles.hBarRow}>
        <div className={styles.hBarTrack}>
          <div
            className={styles.hBarFill}
            style={{ width: `${(value / max) * 100}%` }}
          />
        </div>
        <span className={styles.hBarVal}>{value}</span>
      </div>
      <div className={styles.barAxis}>
        <span>0</span>
        <span>{Math.round(max / 2)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Row['status'] }) {
  const cls =
    status === 'not_on_schedule'
      ? styles.dotRed
      : status === 'on_schedule'
        ? styles.dotGreen
        : styles.dotGrey;
  return <span className={`${styles.dot} ${cls}`} />;
}

function DivisionStatsInner() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [groupId, setGroupId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      if (groupId) qs.set('divisionGroupId', groupId);
      if (scheduleId) qs.set('scheduleId', scheduleId);
      if (appliedQ.trim()) qs.set('q', appliedQ.trim());
      const res = await apiFetch<Dashboard>(
        `/api/catalog/analytics/division-stats?${qs}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupId, scheduleId, appliedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) =>
      `${r.name} ${r.code}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <PageSubnav groupKey="division-stats" />
        <button
          type="button"
          className={styles.filterIcon}
          title="Фильтр"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M4 6h16M7 12h10M10 18h4"
              stroke="#f1c40f"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M4 6l5 6v5l6 3v-8l5-6H4z" fill="#f1c40f" opacity="0.35" />
          </svg>
        </button>
      </div>

      <div className={styles.layout}>
        <aside className={styles.left}>
          {data ? (
            <>
              <Donut
                total={data.summary.total}
                modeNotSet={data.summary.modeNotSet}
                notOnSchedule={data.summary.notOnSchedule}
                onSchedule={data.summary.onSchedule}
              />
              <NotOpenedBar value={data.summary.notOpened} />
            </>
          ) : (
            <p className={styles.loading}>{loading ? 'Загрузка…' : '—'}</p>
          )}
        </aside>

        <section className={styles.center}>
          <div className={styles.tableToolbar}>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className={styles.pager}>
              {filteredRows.length} / {data?.summary.total ?? 0}
            </span>
            <button type="button" className={styles.refreshBtn} onClick={() => void load()}>
              Обновить
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Время открытия</th>
                  <th>Время закрытия</th>
                  <th>Состояние</th>
                </tr>
              </thead>
              <tbody>
                {loading && !filteredRows.length ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      Загрузка…
                    </td>
                  </tr>
                ) : null}
                {!loading && !filteredRows.length ? (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
                {filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/divisions?tab=divisions&q=${encodeURIComponent(r.code)}`} className={styles.nameLink}>
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.openTime || '—'}</td>
                    <td>{r.closeTime || '—'}</td>
                    <td>
                      <span className={styles.status}>
                        <StatusDot status={r.status} />
                        {r.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {filtersOpen ? (
          <aside className={styles.filterPanel}>
            <h3>Фильтр</h3>
            <label>
              Дата с
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label>
              Дата по
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label>
              Группы подразделений
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Все</option>
                {(data?.filters.divisionGroups || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Режимы работы
              <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
                <option value="">Все</option>
                {(data?.filters.schedules || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Поиск
              <input
                value={appliedQ}
                onChange={(e) => setAppliedQ(e.target.value)}
                placeholder="Название / код"
              />
            </label>
            <button type="button" className={styles.applyBtn} onClick={() => void load()}>
              Обновить
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function DivisionStatsPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Загрузка…</p>}>
      <DivisionStatsInner />
    </Suspense>
  );
}
