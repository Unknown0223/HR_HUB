'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type PeriodRow = {
  year: number;
  hired: number;
  dismissed: number;
  total: number;
  headStart: number;
  headEnd: number;
  ssch: number;
  turnover: number;
};

type GroupRow = {
  id: string | null;
  label: string;
  hired: number;
  dismissed: number;
  headEnd: number;
  turnover: number;
};

type DualCount = { label: string; prev: number; curr: number };

type Dashboard = {
  title: string;
  year: number;
  prevYear: number;
  groupBy: string;
  kpis: {
    currentHeadcount: number;
    headStart: number;
    headStartChange: number;
    headEnd: number;
    headEndChange: number;
    hired: number;
    hiredChange: number;
    dismissed: number;
    dismissedChange: number;
    turnover: number;
    turnoverChange: number;
    ssch: number;
    sschChange: number;
  };
  byPeriod: PeriodRow[];
  byGroup: GroupRow[];
  dismissalReasons: DualCount[];
  tenure: DualCount[];
};

const BLUE = '#5b7fb7';
const BLUE_LIGHT = '#8eacd4';
const ORANGE = '#e08a5d';

function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 && !Number.isInteger(n) ? Math.min(digits, 2) : 0,
  });
}

function Change({ value }: { value: number }) {
  if (!value) return null;
  const up = value > 0;
  return (
    <span className={up ? styles.changeUp : styles.changeDown}>
      <span className={styles.changeArrow}>{up ? '▲' : '▼'}</span>
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function PeriodChart({ rows }: { rows: PeriodRow[] }) {
  const W = 420;
  const H = 280;
  const pad = { t: 28, r: 16, b: 36, l: 16 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const midY = pad.t + ch * 0.55;
  const maxUp = Math.max(1, ...rows.map((r) => Math.max(r.hired, r.total, r.headStart)));
  const maxDown = Math.max(1, ...rows.map((r) => r.dismissed));
  const n = Math.max(1, rows.length);
  const slot = cw / n;
  const barW = Math.min(36, slot * 0.42);

  const upH = (v: number) => (v / maxUp) * (midY - pad.t - 8);
  const downH = (v: number) => (v / maxDown) * (H - pad.b - midY - 8);

  const turnoverPts = rows.map((r, i) => {
    const x = pad.l + slot * i + slot / 2;
    const maxT = Math.max(1, ...rows.map((x) => x.turnover));
    const y = midY - (r.turnover / maxT) * (midY - pad.t - 20);
    return { x, y, r };
  });

  const lineD = turnoverPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
      <line x1={pad.l} y1={midY} x2={W - pad.r} y2={midY} stroke="#e4e6ef" strokeWidth={1} />
      {rows.map((r, i) => {
        const cx = pad.l + slot * i + slot / 2;
        const hHire = upH(r.hired);
        const hTot = upH(r.headStart);
        const hDis = downH(r.dismissed);
        return (
          <g key={r.year}>
            <rect
              x={cx - barW / 2}
              y={midY - hHire}
              width={barW}
              height={hHire}
              fill={BLUE}
              rx={1}
            >
              <title>{`Принято: ${r.hired}`}</title>
            </rect>
            {hTot > hHire + 2 ? (
              <rect
                x={cx - barW / 2}
                y={midY - hTot}
                width={barW}
                height={hTot - hHire}
                fill={BLUE_LIGHT}
                rx={1}
              >
                <title>{`Всего (начало): ${r.headStart}`}</title>
              </rect>
            ) : null}
            <rect
              x={cx - barW / 2}
              y={midY}
              width={barW}
              height={hDis}
              fill={ORANGE}
              rx={1}
            >
              <title>{`Уволено: ${r.dismissed}`}</title>
            </rect>
            {r.hired > 0 ? (
              <text x={cx} y={midY - hHire - 4} textAnchor="middle" className={styles.chartLabel}>
                {r.hired}
              </text>
            ) : null}
            {r.dismissed > 0 ? (
              <text
                x={cx}
                y={midY + hDis + 12}
                textAnchor="middle"
                className={styles.chartLabel}
              >
                {r.dismissed}
              </text>
            ) : null}
            <text x={cx} y={H - 10} textAnchor="middle" className={styles.chartAxis}>
              {r.year}
            </text>
          </g>
        );
      })}
      <path d={lineD} fill="none" stroke={ORANGE} strokeWidth={2} />
      {turnoverPts.map((p) => (
        <rect
          key={p.r.year}
          x={p.x - 3}
          y={p.y - 3}
          width={6}
          height={6}
          fill={ORANGE}
        >
          <title>{`Текучесть: ${p.r.turnover}%`}</title>
        </rect>
      ))}
    </svg>
  );
}

function GroupChart({ rows }: { rows: GroupRow[] }) {
  if (!rows.length) return <div className={styles.empty} />;
  const W = Math.max(480, rows.length * 48);
  const H = 280;
  const pad = { t: 36, r: 12, b: 90, l: 12 };
  const cw = W - pad.l - pad.r;
  const midY = pad.t + (H - pad.t - pad.b) * 0.55;
  const maxUp = Math.max(1, ...rows.map((r) => Math.max(r.hired, r.headEnd)));
  const maxDown = Math.max(1, ...rows.map((r) => r.dismissed));
  const slot = cw / rows.length;
  const barW = Math.min(22, slot * 0.55);

  return (
    <div className={styles.scrollChart}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={styles.chartSvgFixed}>
        <line x1={pad.l} y1={midY} x2={W - pad.r} y2={midY} stroke="#e4e6ef" />
        {rows.map((r, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const hHire = (r.hired / maxUp) * (midY - pad.t - 8);
          const hDis = (r.dismissed / maxDown) * (H - pad.b - midY - 8);
          return (
            <g key={r.label + i}>
              <rect
                x={cx - barW / 2}
                y={midY - hHire}
                width={barW}
                height={Math.max(0, hHire)}
                fill={BLUE}
              >
                <title>{`${r.label}\nПринято: ${r.hired}`}</title>
              </rect>
              <rect
                x={cx - barW / 2}
                y={midY}
                width={barW}
                height={Math.max(0, hDis)}
                fill={ORANGE}
              >
                <title>{`${r.label}\nУволено: ${r.dismissed}`}</title>
              </rect>
              {r.turnover > 0 ? (
                <text
                  x={cx}
                  y={midY - hHire - 6}
                  textAnchor="middle"
                  className={styles.chartLabelTiny}
                >
                  {r.turnover}%
                </text>
              ) : null}
              <text
                x={cx}
                y={H - 8}
                textAnchor="end"
                transform={`rotate(-70 ${cx} ${H - 8})`}
                className={styles.chartAxisTiny}
              >
                {r.label.length > 16 ? `${r.label.slice(0, 14)}…` : r.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ReasonBars({
  rows,
  prevYear,
  year,
}: {
  rows: DualCount[];
  prevYear: number;
  year: number;
}) {
  if (!rows.length) return <div className={styles.empty} />;
  const max = Math.max(1, ...rows.flatMap((r) => [r.prev, r.curr]));
  return (
    <div className={styles.reasonList}>
      <div className={styles.reasonLegend}>
        <span>
          <i style={{ background: BLUE_LIGHT }} /> {prevYear}
        </span>
        <span>
          <i style={{ background: BLUE }} /> {year}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className={styles.reasonRow}>
          <span className={styles.reasonLabel} title={r.label}>
            {r.label}
          </span>
          <div className={styles.reasonBars}>
            <div className={styles.reasonBarTrack}>
              <div
                className={styles.reasonBarPrev}
                style={{ width: `${(r.prev / max) * 100}%` }}
              />
              {r.prev > 0 ? <span>{r.prev}</span> : null}
            </div>
            <div className={styles.reasonBarTrack}>
              <div
                className={styles.reasonBarCurr}
                style={{ width: `${(r.curr / max) * 100}%` }}
              />
              {r.curr > 0 ? <span>{r.curr}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TenureBars({
  rows,
  prevYear,
  year,
}: {
  rows: DualCount[];
  prevYear: number;
  year: number;
}) {
  if (!rows.length) return <div className={styles.empty} />;
  const max = Math.max(1, ...rows.flatMap((r) => [r.prev, r.curr]));
  return (
    <div className={styles.tenureWrap}>
      <div className={styles.reasonLegend}>
        <span>
          <i style={{ background: BLUE_LIGHT }} /> {prevYear}
        </span>
        <span>
          <i style={{ background: BLUE }} /> {year}
        </span>
      </div>
      <div className={styles.tenureBars}>
        {rows.map((r) => (
          <div key={r.label} className={styles.tenureCol}>
            <div className={styles.tenurePair}>
              <div className={styles.tenureStack}>
                <span className={styles.vCount}>{r.prev}</span>
                <div
                  className={styles.tenureFillPrev}
                  style={{ height: `${(r.prev / max) * 100}%` }}
                />
              </div>
              <div className={styles.tenureStack}>
                <span className={styles.vCount}>{r.curr}</span>
                <div
                  className={styles.tenureFillCurr}
                  style={{ height: `${(r.curr / max) * 100}%` }}
                />
              </div>
            </div>
            <span className={styles.tenureLabel}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonnelChangesInner() {
  const searchParams = useSearchParams();
  const initialGroup =
    searchParams.get('groupBy') === 'position' || searchParams.get('groupBy') === 'staff'
      ? 'position'
      : 'division';
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [groupBy, setGroupBy] = useState<'division' | 'position'>(initialGroup);
  const [periodType, setPeriodType] = useState<'year' | 'quarter' | 'month'>('year');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        year: String(year),
        groupBy,
      });
      const res = await apiFetch<Dashboard>(
        `/api/catalog/analytics/personnel-changes?${qs}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpiCards = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      {
        label: 'Текущая численность на сегодняшний день',
        value: `${fmt(k.currentHeadcount)} чел.`,
      },
      {
        label: 'Общая численность (начало периода)',
        value: `${fmt(k.headStart)} чел.`,
        change: k.headStartChange,
      },
      {
        label: 'Общая численность (конец периода)',
        value: `${fmt(k.headEnd)} чел.`,
        change: k.headEndChange,
      },
      {
        label: 'Принято',
        value: `${fmt(k.hired)} чел.`,
        change: k.hiredChange,
      },
      {
        label: 'Уволено',
        value: `${fmt(k.dismissed)} чел.`,
        change: k.dismissedChange,
      },
      {
        label: 'Текучесть',
        value: `${fmt(k.turnover, 2)}%`,
        change: k.turnoverChange,
      },
      {
        label: 'ССЧ',
        value: `${fmt(k.ssch, 2)} чел.`,
        change: k.sschChange,
      },
    ];
  }, [data]);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <PageSubnav groupKey="personnel-changes" />
        <div className={styles.headTools}>
          <button
            type="button"
            className={styles.filterIcon}
            title="Фильтр"
            aria-label="Фильтр"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="#f1c40f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path d="M4 6l5 6v5l6 3v-8l5-6H4z" fill="#f1c40f" opacity="0.35" />
            </svg>
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <aside className={styles.filterPanel}>
          <h3>Фильтр</h3>
          <label>
            Тип периода
            <div className={styles.radioRow}>
              {(
                [
                  ['year', 'Год'],
                  ['quarter', 'Квартал'],
                  ['month', 'Месяц'],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className={styles.radio}>
                  <input
                    type="radio"
                    checked={periodType === v}
                    onChange={() => setPeriodType(v)}
                  />
                  {l}
                </label>
              ))}
            </div>
          </label>
          <label>
            Год
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </label>
          <label>
            Группировка
            <div className={styles.radioRow}>
              <label className={styles.radio}>
                <input
                  type="radio"
                  checked={groupBy === 'division'}
                  onChange={() => setGroupBy('division')}
                />
                По подразделениям
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  checked={groupBy === 'position'}
                  onChange={() => setGroupBy('position')}
                />
                По должностям
              </label>
            </div>
          </label>
          <button type="button" className={styles.applyBtn} onClick={() => void load()}>
            Обновить
          </button>
        </aside>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && !data ? <p className={styles.loading}>Загрузка…</p> : null}

      {data ? (
        <>
          <div className={styles.kpiRow}>
            {kpiCards.map((c) => (
              <div key={c.label} className={styles.kpi}>
                <div className={styles.kpiLabel}>{c.label}</div>
                <div className={styles.kpiValue}>{c.value}</div>
                {'change' in c && c.change != null ? <Change value={c.change} /> : null}
              </div>
            ))}
          </div>

          <div className={styles.grid}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>Численность по периодам</h2>
              </div>
              <div className={styles.legend}>
                <span>
                  <i style={{ background: BLUE_LIGHT }} /> Всего
                </span>
                <span>
                  <i style={{ background: BLUE }} /> Принято
                </span>
                <span>
                  <i style={{ background: ORANGE }} /> Уволено
                </span>
                <span>
                  <i className={styles.legendLine} style={{ background: ORANGE }} /> Текучесть
                </span>
              </div>
              <PeriodChart rows={data.byPeriod} />
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2>
                  Численность по{' '}
                  {data.groupBy === 'position' ? 'должностям' : 'подразделениям'}
                </h2>
              </div>
              <div className={styles.legend}>
                <span>
                  <i style={{ background: BLUE }} /> Принято
                </span>
                <span>
                  <i style={{ background: ORANGE }} /> Уволено
                </span>
              </div>
              <GroupChart rows={data.byGroup} />
            </section>

            <div className={styles.rightCol}>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2>Причины увольнений</h2>
                </div>
                <ReasonBars
                  rows={data.dismissalReasons}
                  prevYear={data.prevYear}
                  year={data.year}
                />
              </section>
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2>Стаж работы по годам</h2>
                </div>
                <TenureBars
                  rows={data.tenure}
                  prevYear={data.prevYear}
                  year={data.year}
                />
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function PersonnelChangesPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Загрузка…</p>}>
      <PersonnelChangesInner />
    </Suspense>
  );
}
