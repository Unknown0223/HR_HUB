'use client';

import styles from './range-calendar.module.css';

export type YmdRange = { from: string; to: string };

const DAY_MS = 86_400_000;

export const ymdToMs = (ymd: string) =>
  Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
export const msToYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDaysYmd = (ymd: string, n: number) => msToYmd(ymdToMs(ymd) + n * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((ymdToMs(b) - ymdToMs(a)) / DAY_MS);
export const fmtYmd = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;
export const monthStartYmd = (ymd: string) => `${ymd.slice(0, 7)}-01`;
export function addMonthsYmd(month01: string, n: number) {
  const d = new Date(Date.UTC(Number(month01.slice(0, 4)), Number(month01.slice(5, 7)) - 1 + n, 1));
  return msToYmd(d.getTime());
}
export const monthEndYmd = (month01: string) => addDaysYmd(addMonthsYmd(month01, 1), -1);
export function localTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = {
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
};
const WEEK = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
};

const inRange = (d: string, r?: YmdRange | null) => !!r && d >= r.from && d <= r.to;

export function RangeCalendar({
  view,
  onViewChange,
  months = 2,
  range,
  secondary,
  counts,
  today = localTodayYmd(),
  lang = 'ru',
  onDayClick,
  onDayHover,
}: {
  /** First visible month, `YYYY-MM-01`. */
  view: string;
  onViewChange: (next: string) => void;
  months?: 1 | 2;
  /** Main highlighted range (accent colour). */
  range?: YmdRange | null;
  /** Second highlighted range (warm colour), e.g. a copy target. */
  secondary?: YmdRange | null;
  /** Per-day badge numbers keyed by `YYYY-MM-DD`. */
  counts?: Record<string, number>;
  today?: string;
  lang?: 'ru' | 'uz';
  onDayClick: (ymd: string) => void;
  onDayHover?: (ymd: string | null) => void;
}) {
  const shown = Array.from({ length: months }, (_, i) => addMonthsYmd(view, i));

  return (
    <div className={styles.cal} onMouseLeave={() => onDayHover?.(null)}>
      {shown.map((month, idx) => {
        const lead = (new Date(ymdToMs(month)).getUTCDay() + 6) % 7;
        const total = daysBetween(month, addMonthsYmd(month, 1));
        const cells: Array<string | null> = [
          ...Array.from({ length: lead }, () => null),
          ...Array.from({ length: total }, (_, d) => addDaysYmd(month, d)),
        ];
        return (
          <div key={month} className={styles.month}>
            <div className={styles.head}>
              {idx === 0 ? (
                <button
                  type="button"
                  className={styles.nav}
                  aria-label={lang === 'uz' ? 'Oldingi oy' : 'Предыдущий месяц'}
                  onClick={() => onViewChange(addMonthsYmd(view, -1))}
                >
                  <i className="fas fa-chevron-left" aria-hidden />
                </button>
              ) : (
                <span className={styles.navSpacer} />
              )}
              <span className={styles.title}>
                {MONTHS[lang][Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
              </span>
              {idx === shown.length - 1 ? (
                <button
                  type="button"
                  className={styles.nav}
                  aria-label={lang === 'uz' ? 'Keyingi oy' : 'Следующий месяц'}
                  onClick={() => onViewChange(addMonthsYmd(view, 1))}
                >
                  <i className="fas fa-chevron-right" aria-hidden />
                </button>
              ) : (
                <span className={styles.navSpacer} />
              )}
            </div>
            <div className={styles.grid}>
              {WEEK[lang].map((w, i) => (
                <span key={w} className={`${styles.wd} ${i >= 5 ? styles.weekend : ''}`}>
                  {w}
                </span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={`e${i}`} />;
                const inMain = inRange(d, range);
                const inSec = inRange(d, secondary);
                const n = counts?.[d] ?? 0;
                const cls = [
                  styles.day,
                  inMain ? styles.inMain : '',
                  inMain && d === range!.from ? styles.mainStart : '',
                  inMain && d === range!.to ? styles.mainEnd : '',
                  inSec ? styles.inSec : '',
                  inSec && d === secondary!.from ? styles.secStart : '',
                  inSec && d === secondary!.to ? styles.secEnd : '',
                  d === today ? styles.today : '',
                  i % 7 >= 5 ? styles.weekend : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={d}
                    type="button"
                    className={cls}
                    onClick={() => onDayClick(d)}
                    onMouseEnter={() => onDayHover?.(d)}
                    title={n ? `${d.slice(8, 10)}.${d.slice(5, 7)} · ${n}` : undefined}
                  >
                    <span className={styles.num}>{Number(d.slice(8, 10))}</span>
                    {n ? <span className={styles.badge}>{n > 99 ? '99+' : n}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
