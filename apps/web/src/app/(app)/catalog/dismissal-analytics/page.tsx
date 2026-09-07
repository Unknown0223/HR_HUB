'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import shared from '../../../page-shared.module.css';
import styles from './page.module.css';

type NamedCount = { label: string; count: number; id?: string | null };
type Flow = { reason: string; destination: string; count: number };

type Dashboard = {
  title: string;
  kpis: {
    dismissals: number;
    avgTenureYears: number;
    avgAge: number;
    avgSalary: number;
  };
  byDivision: NamedCount[];
  byPosition: NamedCount[];
  bySource: NamedCount[];
  flows: Flow[];
  value: NamedCount[];
  salaryLevel: NamedCount[];
  tenure: NamedCount[];
};

const SKY = '#cbe6fa';
const FLOW_COLORS = [
  '#0a85e2',
  '#0e9f6e',
  '#6366f1',
  '#7c3aed',
  '#e11d48',
  '#d97706',
  '#0ea5e9',
  '#14b8a6',
  '#a855f7',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
];

function fmtMoney(n: number) {
  if (!n) return '0';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  if (!n) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function HBarChart({
  items,
  maxItems = 14,
}: {
  items: NamedCount[];
  maxItems?: number;
}) {
  const rows = items.slice(0, maxItems);
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) {
    return <div className={styles.chartEmpty} />;
  }
  return (
    <div className={styles.hBars}>
      {rows.map((r) => (
        <div key={r.label} className={styles.hRow}>
          <span className={styles.hLabel} title={r.label}>
            {r.label}
          </span>
          <div className={styles.hTrack}>
            <div
              className={styles.hFill}
              style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
            />
            <span className={styles.hCount}>{r.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function VBarChart({
  items,
  showZero = true,
}: {
  items: NamedCount[];
  showZero?: boolean;
}) {
  const visible = showZero ? items : items.filter((i) => i.count > 0);
  const max = Math.max(1, ...visible.map((r) => r.count));
  if (!visible.length) {
    return <div className={styles.chartEmpty} />;
  }
  return (
    <div className={styles.vBars}>
      {visible.map((r) => {
        const h = r.count > 0 ? Math.max(4, (r.count / max) * 100) : 0;
        return (
          <div key={r.label} className={styles.vCol}>
            <span className={styles.vCount}>{r.count}</span>
            <div className={styles.vTrack}>
              {h > 0 ? (
                <div className={styles.vFill} style={{ height: `${h}%` }} />
              ) : (
                <div className={styles.vZero} />
              )}
            </div>
            <span className={styles.vLabel}>{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Verifix-style Sankey: labels left of nodes, thick ribbons → destination band */
function FlowChart({ flows }: { flows: Flow[] }) {
  const uid = useId().replace(/:/g, '');
  const top = flows.slice(0, 18);
  if (!top.length) {
    return <div className={styles.chartEmpty} />;
  }

  const reasons = [...new Set(top.map((f) => f.reason))];
  const dests = [...new Set(top.map((f) => f.destination))];
  const reasonTotals = new Map<string, number>();
  const destTotals = new Map<string, number>();
  for (const f of top) {
    reasonTotals.set(f.reason, (reasonTotals.get(f.reason) || 0) + f.count);
    destTotals.set(f.destination, (destTotals.get(f.destination) || 0) + f.count);
  }

  const rowH = 22;
  const padTop = 28;
  const W = 560;
  const H = padTop + Math.max(reasons.length, dests.length) * rowH + 16;
  const labelW = 168;
  const nodeW = 10;
  const rightBand = 118;
  const leftNodeX = labelW + 6;
  const rightNodeX = W - rightBand - 4;

  function stackY(
    keys: string[],
    totals: Map<string, number>,
  ): Map<string, { y: number; h: number }> {
    const total = Math.max(
      1,
      keys.reduce((s, k) => s + (totals.get(k) || 0), 0),
    );
    const usable = H - padTop - 12;
    const map = new Map<string, { y: number; h: number }>();
    let y = padTop;
    for (const k of keys) {
      const share = (totals.get(k) || 0) / total;
      const h = Math.max(10, share * usable);
      map.set(k, { y, h });
      y += h + 3;
    }
    return map;
  }

  const reasonGeom = stackY(reasons, reasonTotals);
  const destGeom = stackY(dests, destTotals);
  const maxFlow = Math.max(1, ...top.map((f) => f.count));

  // Track offset within each node for ribbon stacking
  const reasonOff = new Map(reasons.map((r) => [r, 0]));
  const destOff = new Map(dests.map((d) => [d, 0]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.sankey} role="img">
      <defs>
        {FLOW_COLORS.map((c, i) => (
          <linearGradient
            key={i}
            id={`${uid}-g${i}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor={c} stopOpacity="0.85" />
            <stop offset="100%" stopColor={c} stopOpacity="0.35" />
          </linearGradient>
        ))}
      </defs>

      <text x={4} y={16} className={styles.sankeyHead}>
        Причины увольнений
      </text>
      <text x={rightNodeX + 8} y={16} className={styles.sankeyHead}>
        Куда ушёл
      </text>

      {top.map((f, i) => {
        const rg = reasonGeom.get(f.reason)!;
        const dg = destGeom.get(f.destination)!;
        const rh = Math.max(2, (f.count / maxFlow) * Math.min(rg.h, 14));
        const dh = rh;
        const ro = reasonOff.get(f.reason) || 0;
        const dout = destOff.get(f.destination) || 0;
        reasonOff.set(f.reason, ro + rh + 1);
        destOff.set(f.destination, dout + dh + 1);
        const y1 = rg.y + Math.min(ro, Math.max(0, rg.h - rh));
        const y2 = dg.y + Math.min(dout, Math.max(0, dg.h - dh));
        const x1 = leftNodeX + nodeW;
        const x2 = rightNodeX;
        const mid = (x1 + x2) / 2;
        const c = FLOW_COLORS[i % FLOW_COLORS.length];
        return (
          <path
            key={`${f.reason}-${f.destination}-${i}`}
            d={`M ${x1} ${y1}
                C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}
                L ${x2} ${y2 + dh}
                C ${mid} ${y2 + dh}, ${mid} ${y1 + rh}, ${x1} ${y1 + rh}
                Z`}
            fill={`url(#${uid}-g${i % FLOW_COLORS.length})`}
            stroke={c}
            strokeWidth={0.4}
            opacity={0.9}
          />
        );
      })}

      {reasons.map((r, i) => {
        const g = reasonGeom.get(r)!;
        return (
          <g key={`r-${r}`}>
            <text
              x={labelW - 4}
              y={g.y + g.h / 2 + 3}
              textAnchor="end"
              className={styles.sankeyLabel}
            >
              {r.length > 28 ? `${r.slice(0, 26)}…` : r}
            </text>
            <rect
              x={leftNodeX}
              y={g.y}
              width={nodeW}
              height={g.h}
              rx={2}
              fill={FLOW_COLORS[i % FLOW_COLORS.length]}
            />
          </g>
        );
      })}

      {dests.map((d) => {
        const g = destGeom.get(d)!;
        return (
          <g key={`d-${d}`}>
            <rect
              x={rightNodeX}
              y={g.y}
              width={rightBand}
              height={g.h}
              rx={3}
              fill={SKY}
            />
            <text
              x={rightNodeX + rightBand / 2}
              y={g.y + g.h / 2 + 4}
              textAnchor="middle"
              className={styles.sankeyDest}
            >
              {d.length > 18 ? `${d.slice(0, 16)}…` : d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DismissalDashboardInner() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      const res = await apiFetch<Dashboard>(
        `/api/catalog/analytics/dismissal-dashboard${q ? `?${q}` : ''}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Увольнений',
        value: fmtNum(data.kpis.dismissals),
        icon: 'fa-user-minus',
        tone: styles.kpiDanger,
      },
      {
        label: 'Стаж работы, лет',
        value: fmtNum(data.kpis.avgTenureYears),
        icon: 'fa-hourglass-half',
        tone: styles.kpiAccent,
      },
      {
        label: 'Средний возраст',
        value: fmtNum(data.kpis.avgAge),
        icon: 'fa-user-clock',
        tone: styles.kpiViolet,
      },
      {
        label: 'Средний оклад',
        value: fmtMoney(data.kpis.avgSalary),
        icon: 'fa-wallet',
        tone: styles.kpiOk,
      },
    ];
  }, [data]);

  const sourceItems = data?.bySource.filter((s) => s.label !== 'Нет информации') ?? [];

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="dismissal-analytics" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeIncident}`}>
          <i className="fas fa-user-minus" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Причины увольнений</h1>
          <p className={shared.pageSubtitle}>
            Аналитика выбытия персонала: подразделения, должности, стаж и направления ухода
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <button
            type="button"
            className={`${styles.filterBtn} ${filtersOpen ? styles.filterBtnActive : ''}`}
            title="Фильтр по периоду"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <i className="fas fa-sliders-h" aria-hidden />
            Фильтр
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className={styles.filterPanel}>
          <label>
            Период с
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Период по
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className={styles.applyBtn} onClick={() => void load()}>
            Применить
          </button>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Сбросить
          </button>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && !data ? <p className={styles.loading}>Загрузка…</p> : null}

      {data ? (
        <>
          <div className={styles.kpiRow}>
            {kpis.map((k) => (
              <div key={k.label} className={`${styles.kpi} ${k.tone}`}>
                <div className={styles.kpiIcon}>
                  <i className={`fas ${k.icon}`} aria-hidden />
                </div>
                <div className={styles.kpiText}>
                  <div className={styles.kpiValue}>{k.value}</div>
                  <div className={styles.kpiLabel}>{k.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.gridTop}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Увольнения по подразделениям</h2>
                  <p className={styles.cardSub}>Топ подразделений по числу увольнений</p>
                </div>
                <span className={styles.cardCount}>{data.byDivision.length}</span>
              </div>
              <HBarChart items={data.byDivision} />
            </section>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Источник найма</h2>
                  <p className={styles.cardSub}>Откуда пришёл сотрудник</p>
                </div>
              </div>
              {sourceItems.length ? (
                <HBarChart items={sourceItems} maxItems={8} />
              ) : (
                <div className={styles.chartEmpty} />
              )}
            </section>
            <section className={`${styles.card} ${styles.cardFlow}`}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Причина → направление ухода</h2>
                  <p className={styles.cardSub}>Потоки увольнений по причинам</p>
                </div>
              </div>
              <FlowChart flows={data.flows} />
            </section>
          </div>

          <div className={styles.gridBottom}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Увольнения по должностям</h2>
                  <p className={styles.cardSub}>Топ должностей за период</p>
                </div>
                <span className={styles.cardCount}>{data.byPosition.length}</span>
              </div>
              <HBarChart items={data.byPosition} maxItems={16} />
            </section>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Ценность сотрудника</h2>
                  <p className={styles.cardSub}>Распределение по оценке</p>
                </div>
              </div>
              <VBarChart items={data.value} />
            </section>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Уровень зарплаты</h2>
                  <p className={styles.cardSub}>Распределение по диапазонам</p>
                </div>
              </div>
              <VBarChart items={data.salaryLevel} />
            </section>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Стаж работы</h2>
                  <p className={styles.cardSub}>Сколько отработали до ухода</p>
                </div>
              </div>
              <VBarChart items={data.tenure} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function DismissalAnalyticsPage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Загрузка…</p>}>
      <DismissalDashboardInner />
    </Suspense>
  );
}
