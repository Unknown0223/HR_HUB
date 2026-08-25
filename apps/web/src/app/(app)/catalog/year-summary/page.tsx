'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type MonthPoint = { month: number; label: string; count: number };
type TurnoverPoint = {
  month: number;
  label: string;
  hired: number;
  dismissed: number;
  turnoverPct: number;
};
type AgeRow = { label: string; count: number };
type ViolationPoint = {
  month: number;
  label: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
};
type PayPoint = { month: number; label: string; amount: number };
type NamedCount = { label: string; count: number };

type Dashboard = {
  title: string;
  year: number;
  prevYear: number;
  fetchedAt: string;
  months: string[];
  headcount: {
    current: number;
    prevYearEnd: number;
    yoyPercent: number;
    dynamics: MonthPoint[];
  };
  ageStructure: AgeRow[];
  gender: {
    male: number;
    female: number;
    other: number;
    total: number;
    malePct: number;
    femalePct: number;
  };
  turnover: {
    averagePct: number;
    dynamics: TurnoverPoint[];
  };
  attendanceViolations: {
    hasData: boolean;
    series: ViolationPoint[];
  };
  absenceReasons: NamedCount[];
  payroll: {
    hasData: boolean;
    payments: PayPoint[];
    accrued: number | null;
    withheld: number | null;
  };
  totals: { hired: number; dismissed: number };
  queries: Record<string, string>;
};

type WidgetId =
  | 'headcount'
  | 'age'
  | 'gender'
  | 'headKpi'
  | 'turnover'
  | 'turnoverKpi'
  | 'attendance'
  | 'absences'
  | 'payroll'
  | 'accrued'
  | 'withheld';

const TEAL = '#57c7af';
const RED = '#e8534a';
const ORANGE = '#f0c674';
const BLUE = '#4a90e2';
const PINK = '#f06292';

function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 && !Number.isInteger(n) ? Math.min(digits, 2) : 0,
  });
}

function agoRu(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5000) return 'Получено несколько секунд назад';
  if (ms < 60000) return `Получено ${Math.floor(ms / 1000)} сек. назад`;
  return `Получено ${Math.floor(ms / 60000)} мин. назад`;
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join(
    '\n',
  );
}

function LineChart({ points }: { points: MonthPoint[] }) {
  const W = 480;
  const H = 220;
  const pad = { t: 20, r: 16, b: 32, l: 40 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const vals = points.map((p) => p.count);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = Math.max(1, max - min);
  const n = Math.max(1, points.length);
  const xAt = (i: number) => pad.l + (n === 1 ? cw / 2 : (i / (n - 1)) * cw);
  const yAt = (v: number) => pad.t + ch - ((v - min) / span) * ch;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.count)}`)
    .join(' ');
  const ticks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + (span * i) / ticks;
        const y = yAt(v);
        return (
          <g key={i}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#eef0f4" />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#95a5a6">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <path d={d} fill="none" stroke={TEAL} strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={p.month} cx={xAt(i)} cy={yAt(p.count)} r={3.5} fill={TEAL} />
      ))}
      {points.map((p, i) => (
        <text
          key={`l-${p.month}`}
          x={xAt(i)}
          y={H - 10}
          textAnchor="middle"
          fontSize="10"
          fill="#95a5a6"
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function TurnoverChart({ points }: { points: TurnoverPoint[] }) {
  const W = 520;
  const H = 240;
  const pad = { t: 24, r: 44, b: 36, l: 36 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const maxBar = Math.max(1, ...points.map((p) => Math.max(p.hired, p.dismissed)));
  const maxT = Math.max(1, ...points.map((p) => p.turnoverPct));
  const n = Math.max(1, points.length);
  const slot = cw / n;
  const barW = Math.min(14, slot * 0.28);

  const barH = (v: number) => (v / maxBar) * (ch - 8);
  const tY = (v: number) => pad.t + ch - (v / maxT) * ch;
  const lineD = points
    .map((p, i) => {
      const x = pad.l + slot * i + slot / 2;
      return `${i === 0 ? 'M' : 'L'} ${x} ${tY(p.turnoverPct)}`;
    })
    .join(' ');

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.t + ch * (1 - f);
          return (
            <line key={f} x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#eef0f4" />
          );
        })}
        {points.map((p, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const hD = barH(p.dismissed);
          const hH = barH(p.hired);
          return (
            <g key={p.month}>
              <rect
                x={cx - barW - 2}
                y={pad.t + ch - hD}
                width={barW}
                height={hD}
                fill={RED}
                rx={1}
              />
              <rect
                x={cx + 2}
                y={pad.t + ch - hH}
                width={barW}
                height={hH}
                fill={TEAL}
                rx={1}
              />
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#95a5a6"
              >
                {p.label}
              </text>
            </g>
          );
        })}
        <path d={lineD} fill="none" stroke={ORANGE} strokeWidth={2} />
        {points.map((p, i) => {
          const x = pad.l + slot * i + slot / 2;
          return (
            <circle key={`t-${p.month}`} cx={x} cy={tY(p.turnoverPct)} r={3} fill={ORANGE} />
          );
        })}
        <text x={W - pad.r + 4} y={pad.t + 8} fontSize="9" fill="#95a5a6">
          %
        </text>
      </svg>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.swatch} style={{ background: RED }} /> Увольнение
        </span>
        <span>
          <i className={styles.swatch} style={{ background: TEAL }} /> Приём
        </span>
        <span>
          <i className={styles.swatch} style={{ background: ORANGE }} /> Текучесть, %
        </span>
      </div>
    </>
  );
}

function AreaChart({ points }: { points: ViolationPoint[] }) {
  const W = 520;
  const H = 220;
  const pad = { t: 16, r: 12, b: 32, l: 44 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.lateMinutes, p.earlyLeaveMinutes)),
  );
  const n = Math.max(1, points.length);
  const xAt = (i: number) => pad.l + (n === 1 ? cw / 2 : (i / (n - 1)) * cw);
  const yAt = (v: number) => pad.t + ch - (v / max) * ch;

  const areaPath = (key: 'lateMinutes' | 'earlyLeaveMinutes') => {
    if (!points.length) return '';
    const top = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p[key])}`)
      .join(' ');
    const last = xAt(points.length - 1);
    const first = xAt(0);
    const base = pad.t + ch;
    return `${top} L ${last} ${base} L ${first} ${base} Z`;
  };

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.t + ch * (1 - f);
          const v = Math.round(max * f);
          return (
            <g key={f}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#eef0f4" />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#95a5a6">
                {v}
              </text>
            </g>
          );
        })}
        <path d={areaPath('earlyLeaveMinutes')} fill="rgba(240,198,116,0.45)" />
        <path d={areaPath('lateMinutes')} fill="rgba(87,199,175,0.4)" />
        <path
          d={points
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.earlyLeaveMinutes)}`,
            )
            .join(' ')}
          fill="none"
          stroke={ORANGE}
          strokeWidth={1.5}
        />
        <path
          d={points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.lateMinutes)}`)
            .join(' ')}
          fill="none"
          stroke={TEAL}
          strokeWidth={1.5}
        />
        {points.map((p, i) => (
          <text
            key={p.month}
            x={xAt(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="10"
            fill="#95a5a6"
          >
            {p.label}
          </text>
        ))}
      </svg>
      <div className={styles.chartLegend}>
        <span>
          <i className={styles.swatch} style={{ background: ORANGE }} /> Ранние уходы
        </span>
        <span>
          <i className={styles.swatch} style={{ background: TEAL }} /> Опоздания
        </span>
      </div>
    </>
  );
}

function GenderDonut({
  male,
  female,
  malePct,
  femalePct,
}: {
  male: number;
  female: number;
  malePct: number;
  femalePct: number;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, male + female);
  const maleLen = (male / total) * c;
  const femaleLen = (female / total) * c;
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 140 140" className={styles.donut}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f0f2f5" strokeWidth="22" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={BLUE}
          strokeWidth="22"
          strokeDasharray={`${maleLen} ${c - maleLen}`}
          strokeDashoffset={0}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={PINK}
          strokeWidth="22"
          strokeDasharray={`${femaleLen} ${c - femaleLen}`}
          strokeDashoffset={-maleLen}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <i className={styles.swatch} style={{ background: BLUE }} />
          Мужчины {fmt(malePct, 2)}% ({male})
        </div>
        <div className={styles.legendRow}>
          <i className={styles.swatch} style={{ background: PINK }} />
          Женщины {fmt(femalePct, 2)}% ({female})
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className={styles.empty}>
      <svg
        className={styles.emptyIcon}
        width="72"
        height="56"
        viewBox="0 0 72 56"
        aria-hidden
      >
        <rect x="4" y="28" width="10" height="24" rx="2" fill="#d5d8dc" />
        <rect x="18" y="16" width="10" height="36" rx="2" fill="#d5d8dc" />
        <rect x="32" y="8" width="10" height="44" rx="2" fill="#d5d8dc" />
        <rect x="46" y="20" width="10" height="32" rx="2" fill="#d5d8dc" />
        <rect x="60" y="12" width="10" height="40" rx="2" fill="#d5d8dc" />
      </svg>
      <span>{message || 'Не было получено данных по этому запросу'}</span>
    </div>
  );
}

function EmptyKpi({ color }: { color: string }) {
  return (
    <div className={styles.emptyKpi}>
      <div className={styles.emptyKpiTitle} style={{ color }}>
        Нет данных
      </div>
      <div className={styles.emptyKpiHint}>
        Нет данных после фильтрации или данные отсутствуют за последний отрезок времени
      </div>
    </div>
  );
}

type TableSpec = { headers: string[]; rows: (string | number)[][] };

function WidgetCard({
  id,
  title,
  spanClass,
  children,
  table,
  sql,
  fetchedAt,
  onRefresh,
  toast,
}: {
  id: WidgetId;
  title: string;
  spanClass: string;
  children: ReactNode;
  table: TableSpec;
  sql?: string;
  fetchedAt?: string;
  onRefresh: () => void;
  toast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const [fullscreen, setFullscreen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShareOpen(false);
        setSaveOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const exportCsv = () => {
    downloadText(
      `${id}.csv`,
      toCsv(table.headers, table.rows),
      'text/csv;charset=utf-8',
    );
    toast('CSV сохранён');
    setOpen(false);
  };

  const exportExcel = () => {
    // Simple TSV that Excel opens
    const esc = (v: string | number) => String(v).replace(/\t/g, ' ');
    const body = [
      table.headers.map(esc).join('\t'),
      ...table.rows.map((r) => r.map(esc).join('\t')),
    ].join('\n');
    downloadText(`${id}.xls`, body, 'application/vnd.ms-excel');
    toast('Excel сохранён');
    setOpen(false);
  };

  const saveImage = async () => {
    const el = cardRef.current;
    if (!el) return;
    const svg = el.querySelector('svg');
    if (!svg) {
      toast('Нет диаграммы для сохранения');
      return;
    }
    const xml = new XMLSerializer().serializeToString(svg);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * 2 || 960;
    canvas.height = img.height * 2 || 440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Изображение сохранено');
    });
    setOpen(false);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?widget=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    } catch {
      toast('Не удалось скопировать');
    }
    setOpen(false);
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`${styles.card} ${spanClass} ${fullscreen ? styles.fullscreen : ''}`}
        data-widget={id}
      >
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label="Меню"
            onClick={() => {
              setOpen((v) => !v);
              setShareOpen(false);
              setSaveOpen(false);
            }}
          >
            ⋮
          </button>
        </div>
        {open ? (
          <div className={styles.menu} ref={menuRef}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                onRefresh();
                setOpen(false);
              }}
            >
              Обновить
              {fetchedAt ? (
                <span className={styles.menuHint}>{agoRu(fetchedAt)}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setFullscreen((v) => !v);
                setOpen(false);
              }}
            >
              {fullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setSqlOpen(true);
                setOpen(false);
              }}
              disabled={!sql}
            >
              Показать SQL-запрос
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMode((m) => (m === 'chart' ? 'table' : 'chart'));
                setOpen(false);
              }}
            >
              {mode === 'chart' ? 'Показать в виде таблицы' : 'Показать диаграмму'}
            </button>
            <div className={styles.menuSep} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setShareOpen((v) => !v);
                setSaveOpen(false);
              }}
            >
              Поделиться
            </button>
            {shareOpen ? (
              <div className={styles.submenu}>
                <button type="button" className={styles.menuSubBtn} onClick={copyLink}>
                  Скопировать ссылку в буфер обмена
                </button>
                <button
                  type="button"
                  className={styles.menuSubBtn}
                  onClick={() => {
                    const subject = encodeURIComponent(title);
                    const body = encodeURIComponent(
                      `${title}\n${window.location.href}`,
                    );
                    window.open(`mailto:?subject=${subject}&body=${body}`);
                    setOpen(false);
                  }}
                >
                  Поделиться диаграммой по email
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setSaveOpen((v) => !v);
                setShareOpen(false);
              }}
            >
              Сохранить
            </button>
            {saveOpen ? (
              <div className={styles.submenu}>
                <button type="button" className={styles.menuSubBtn} onClick={exportCsv}>
                  Экспорт в CSV
                </button>
                <button type="button" className={styles.menuSubBtn} onClick={exportExcel}>
                  Экспорт в Excel
                </button>
                <button type="button" className={styles.menuSubBtn} onClick={saveImage}>
                  Сохранить как изображение
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={styles.cardBody}>
          {mode === 'table' ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {table.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length ? (
                    table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={table.headers.length}>Нет данных</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            children
          )}
        </div>
      </article>
      {sqlOpen && sql ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3>SQL — {title}</h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSqlOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <pre>{sql}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function YearSummaryInner() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [draftYear, setDraftYear] = useState(year);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<Dashboard>(
        `/api/catalog/analytics/year-summary-dashboard?year=${year}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const ageMax = useMemo(
    () => Math.max(1, ...(data?.ageStructure.map((a) => a.count) || [1])),
    [data],
  );

  if (loading && !data) {
    return (
      <div className={styles.wrap}>
        <div className={styles.head}>
          <PageSubnav groupKey="year-summary" />
        </div>
        <div className={styles.loading}>Загрузка итогов года…</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <PageSubnav groupKey="year-summary" />
        <div className={styles.headTools}>
          <button
            type="button"
            className={styles.filterIcon}
            title="Фильтр"
            aria-label="Фильтр"
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
      </div>

      {filtersOpen ? (
        <aside className={styles.filterPanel}>
          <h3>Фильтр</h3>
          <label>
            Год
            <input
              type="number"
              min={2000}
              max={2100}
              value={draftYear}
              onChange={(e) => setDraftYear(Number(e.target.value) || draftYear)}
            />
          </label>
          <button
            type="button"
            className={styles.applyBtn}
            onClick={() => {
              setYear(draftYear);
              setFiltersOpen(false);
            }}
          >
            Применить
          </button>
        </aside>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {data ? (
        <div className={styles.grid}>
          <WidgetCard
            id="headcount"
            title="Динамика численности"
            spanClass={styles.span5}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.headcount}
            table={{
              headers: ['Месяц', 'Численность'],
              rows: data.headcount.dynamics.map((p) => [p.label, p.count]),
            }}
          >
            {data.headcount.dynamics.length ? (
              <LineChart points={data.headcount.dynamics} />
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="age"
            title="Возрастная структура"
            spanClass={styles.span3}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.age}
            table={{
              headers: ['Возраст', 'Кол-во'],
              rows: data.ageStructure.map((a) => [a.label, a.count]),
            }}
          >
            {data.ageStructure.some((a) => a.count > 0) ? (
              <div className={styles.hBars}>
                {data.ageStructure.map((a) => (
                  <div key={a.label} className={styles.hRow}>
                    <span className={styles.hLabel}>{a.label}</span>
                    <div className={styles.hTrack}>
                      <div
                        className={styles.hFill}
                        style={{
                          width: `${Math.max(2, (a.count / ageMax) * 100)}%`,
                        }}
                      />
                      <span className={styles.hCount}>{a.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="gender"
            title="Гендерный состав"
            spanClass={styles.span2}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.gender}
            table={{
              headers: ['Пол', 'Кол-во', '%'],
              rows: [
                ['Мужчины', data.gender.male, data.gender.malePct],
                ['Женщины', data.gender.female, data.gender.femalePct],
                ...(data.gender.other
                  ? [['Другое', data.gender.other, '']]
                  : []),
              ],
            }}
          >
            {data.gender.total ? (
              <GenderDonut
                male={data.gender.male}
                female={data.gender.female}
                malePct={data.gender.malePct}
                femalePct={data.gender.femalePct}
              />
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="headKpi"
            title="Численность"
            spanClass={styles.span2}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.headcount}
            table={{
              headers: ['Показатель', 'Значение'],
              rows: [
                ['Численность', data.headcount.current],
                [`К концу ${data.prevYear}, %`, data.headcount.yoyPercent],
              ],
            }}
          >
            <div className={styles.kpi}>
              <div className={styles.kpiValue}>{fmt(data.headcount.current)}</div>
              <div
                className={`${styles.kpiYoY} ${data.headcount.yoyPercent < 0 ? styles.neg : ''}`}
              >
                {data.headcount.yoyPercent >= 0 ? '+' : ''}
                {fmt(data.headcount.yoyPercent, 1)}% к концу {data.prevYear}
              </div>
            </div>
          </WidgetCard>

          <WidgetCard
            id="turnover"
            title="Динамика текучести кадров"
            spanClass={styles.span9}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.turnover}
            table={{
              headers: ['Месяц', 'Приём', 'Увольнение', 'Текучесть %'],
              rows: data.turnover.dynamics.map((p) => [
                p.label,
                p.hired,
                p.dismissed,
                p.turnoverPct,
              ]),
            }}
          >
            {data.turnover.dynamics.length ? (
              <TurnoverChart points={data.turnover.dynamics} />
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="turnoverKpi"
            title="Средняя текучесть"
            spanClass={styles.span3}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.turnover}
            table={{
              headers: ['Показатель', 'Значение'],
              rows: [['Средняя текучесть %', data.turnover.averagePct]],
            }}
          >
            <div className={styles.kpi}>
              <div className={styles.kpiValue}>{fmt(data.turnover.averagePct, 2)}%</div>
              <div className={styles.kpiSub}>Годовой показатель</div>
            </div>
          </WidgetCard>

          <WidgetCard
            id="attendance"
            title="Нарушения посещаемости"
            spanClass={styles.span8}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.attendance}
            table={{
              headers: ['Месяц', 'Опоздания (мин)', 'Ранние уходы (мин)'],
              rows: data.attendanceViolations.series.map((p) => [
                p.label,
                p.lateMinutes,
                p.earlyLeaveMinutes,
              ]),
            }}
          >
            {data.attendanceViolations.hasData ? (
              <AreaChart points={data.attendanceViolations.series} />
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="absences"
            title="Причины отсутствия"
            spanClass={styles.span4}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.absences}
            table={{
              headers: ['Причина', 'Кол-во'],
              rows: data.absenceReasons.map((r) => [r.label, r.count]),
            }}
          >
            {data.absenceReasons.length ? (
              <div className={styles.hBars}>
                {data.absenceReasons.slice(0, 8).map((r) => {
                  const max = Math.max(1, ...data.absenceReasons.map((x) => x.count));
                  return (
                    <div key={r.label} className={styles.hRow}>
                      <span className={styles.hLabel} title={r.label}>
                        {r.label.length > 8 ? `${r.label.slice(0, 8)}…` : r.label}
                      </span>
                      <div className={styles.hTrack}>
                        <div
                          className={styles.hFill}
                          style={{
                            width: `${Math.max(2, (r.count / max) * 100)}%`,
                            background: '#8eacd4',
                          }}
                        />
                        <span className={styles.hCount}>{r.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="payroll"
            title="ФОТ — выплаты"
            spanClass={styles.span4}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.payroll}
            table={{
              headers: ['Месяц', 'Сумма'],
              rows: data.payroll.payments.map((p) => [p.label, p.amount]),
            }}
          >
            {data.payroll.hasData &&
            data.payroll.payments.some((p) => p.amount !== 0) ? (
              <LineChart
                points={data.payroll.payments.map((p) => ({
                  month: p.month,
                  label: p.label,
                  count: p.amount,
                }))}
              />
            ) : (
              <EmptyState />
            )}
          </WidgetCard>

          <WidgetCard
            id="accrued"
            title={`Начислено за ${data.year}`}
            spanClass={styles.span4}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.payroll}
            table={{
              headers: ['Показатель', 'Значение'],
              rows: [
                [
                  'Начислено',
                  data.payroll.accrued != null ? data.payroll.accrued : 'Нет данных',
                ],
              ],
            }}
          >
            {data.payroll.accrued != null && data.payroll.hasData ? (
              <div className={styles.kpi}>
                <div className={`${styles.kpiValue} ${styles.teal}`}>
                  {fmt(data.payroll.accrued, 0)}
                </div>
                <div className={styles.kpiSub}>Сумма начислений</div>
              </div>
            ) : (
              <EmptyKpi color="#2ecc71" />
            )}
          </WidgetCard>

          <WidgetCard
            id="withheld"
            title={`Удержано за ${data.year}`}
            spanClass={styles.span4}
            fetchedAt={data.fetchedAt}
            onRefresh={load}
            toast={showToast}
            sql={data.queries.payroll}
            table={{
              headers: ['Показатель', 'Значение'],
              rows: [
                [
                  'Удержано',
                  data.payroll.withheld != null ? data.payroll.withheld : 'Нет данных',
                ],
              ],
            }}
          >
            {data.payroll.withheld != null && data.payroll.hasData ? (
              <div className={styles.kpi}>
                <div className={`${styles.kpiValue} ${styles.gold}`}>
                  {fmt(data.payroll.withheld, 0)}
                </div>
                <div className={styles.kpiSub}>Сумма удержаний</div>
              </div>
            ) : (
              <EmptyKpi color="#d4a017" />
            )}
          </WidgetCard>
        </div>
      ) : null}

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}

export default function YearSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.wrap}>
          <div className={styles.loading}>Загрузка…</div>
        </div>
      }
    >
      <YearSummaryInner />
    </Suspense>
  );
}
