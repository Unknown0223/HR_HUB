'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type DayRow = {
  day: string;
  dayType: string;
  name: string;
  replacementDay: string;
};

type Totals = {
  workDays: number;
  dayOffs: number;
  holidays: number;
  shortDays: number;
  workHours: number;
  byMonth?: { month: number; workDays: number; workHours: number }[];
};

type Calendar = {
  id: string;
  name: string;
  code: string;
  year: number;
  weekendDays: number[] | unknown;
  preHolidayHours?: string | null;
  holidayHours?: string | null;
  dailyAttendance: string;
  monthlyLimit: boolean;
  dailyLimit: boolean;
  isActive: boolean;
  totals?: Totals | null;
  days?: Array<{
    day: string;
    dayType: string;
    name?: string | null;
    replacementDay?: string | null;
  }>;
};

const WEEKDAYS = [
  { v: 1, l: 'Пн' },
  { v: 2, l: 'Вт' },
  { v: 3, l: 'Ср' },
  { v: 4, l: 'Чт' },
  { v: 5, l: 'Пт' },
  { v: 6, l: 'Сб' },
  { v: 0, l: 'Вс' },
];

const DAY_TYPES = [
  { v: 'holiday', l: 'Праздник' },
  { v: 'day_off', l: 'Выходной' },
  { v: 'transfer', l: 'Перенос' },
  { v: 'short_day', l: 'Предпраздничный' },
  { v: 'workday', l: 'Рабочий' },
];

function isoDate(v?: string | null) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export function ProductionCalendarForm({ calendarId }: { calendarId?: string }) {
  const router = useRouter();
  const isNew = !calendarId;
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [weekend, setWeekend] = useState<number[]>([0, 6]);
  const [preHoliday, setPreHoliday] = useState('');
  const [holidayHours, setHolidayHours] = useState('');
  const [dailyAtt, setDailyAtt] = useState('08:00');
  const [monthlyLimit, setMonthlyLimit] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(false);
  const [days, setDays] = useState<DayRow[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<Calendar>(`/api/attendance/production-calendars/${calendarId}`)
      .then((row) => {
        setName(row.name);
        setCode(row.code || '');
        setYear(String(row.year));
        setWeekend(
          Array.isArray(row.weekendDays) ? (row.weekendDays as number[]) : [0, 6],
        );
        setPreHoliday(row.preHolidayHours || '');
        setHolidayHours(row.holidayHours || '');
        setDailyAtt(row.dailyAttendance || '08:00');
        setMonthlyLimit(!!row.monthlyLimit);
        setDailyLimit(!!row.dailyLimit);
        setDays(
          (row.days || []).map((d) => ({
            day: isoDate(d.day),
            dayType: d.dayType || 'holiday',
            name: d.name || '',
            replacementDay: isoDate(d.replacementDay),
          })),
        );
        setTotals(row.totals || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [calendarId, isNew]);

  function toggleWeekend(v: number) {
    setWeekend((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort(),
    );
  }

  function addDay() {
    setDays((prev) => [
      ...prev,
      {
        day: `${year}-01-01`,
        dayType: 'holiday',
        name: '',
        replacementDay: '',
      },
    ]);
  }

  function removeSelected() {
    if (selectedDay == null) return;
    setDays((prev) => prev.filter((_, i) => i !== selectedDay));
    setSelectedDay(null);
  }

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || undefined,
        year: Number(year) || new Date().getFullYear(),
        weekendDays: weekend,
        preHolidayHours: preHoliday || undefined,
        holidayHours: holidayHours || undefined,
        dailyAttendance: dailyAtt,
        monthlyLimit,
        dailyLimit,
        days: days
          .filter((d) => d.day)
          .map((d) => ({
            day: d.day,
            dayType: d.dayType,
            name: d.name || undefined,
            replacementDay: d.replacementDay || undefined,
          })),
      };
      if (isNew) {
        const created = await apiFetch<Calendar>('/api/attendance/production-calendars', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setTotals(created.totals || null);
        router.replace(`/catalog/production-calendars/${created.id}`);
        setSaved('Сохранено');
      } else {
        const updated = await apiFetch<Calendar>(
          `/api/attendance/production-calendars/${calendarId}`,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
        setTotals(updated.totals || null);
        setSaved('Сохранено');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    if (isNew) {
      setError('Сначала сохраните календарь');
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<Calendar>(
        `/api/attendance/production-calendars/${calendarId}/recalculate`,
        { method: 'POST' },
      );
      setTotals(updated.totals || null);
      setSaved('Пересчитано');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>
          Производственный календарь ({isNew ? 'создание' : 'изменение'})
        </h1>
        <div className={styles.actions}>
          <button type="button" className={styles.btnSave} disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
          <Link href="/catalog/production-calendars" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.ok}>{saved}</p> : null}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <h2>Основная информация</h2>
            <div className={styles.field}>
              <label>
                Название <span className={styles.req}>*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Код</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>
                Год <span className={styles.req}>*</span>
              </label>
              <input value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </section>

          <section className={styles.section}>
            <h2>Еженедельные факты</h2>
            <div className={styles.field}>
              <label>Выходные дни</label>
              <div className={styles.weekRow}>
                {WEEKDAYS.map((w) => (
                  <label key={w.v} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={weekend.includes(w.v)}
                      onChange={() => toggleWeekend(w.v)}
                    />
                    {w.l}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label>Предпраздничные часы</label>
              <input
                value={preHoliday}
                onChange={(e) => setPreHoliday(e.target.value)}
                placeholder="07:00"
              />
            </div>
            <div className={styles.field}>
              <label>Праздничные часы</label>
              <input
                value={holidayHours}
                onChange={(e) => setHolidayHours(e.target.value)}
                placeholder="00:00"
              />
            </div>
            <div className={styles.field}>
              <label>Ежедневная явка</label>
              <input value={dailyAtt} onChange={(e) => setDailyAtt(e.target.value)} />
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.checked)}
              />
              Месячный лимит
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.checked)}
              />
              Дневной лимит
            </label>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Праздничные и выходные дни</h2>
              <div className={styles.inlineActions}>
                <button type="button" className={styles.toolBtn} onClick={addDay}>
                  Добавить
                </button>
                <button
                  type="button"
                  className={styles.toolBtn}
                  disabled={selectedDay == null}
                  onClick={removeSelected}
                >
                  Удалить
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>День</th>
                    <th>Тип дня</th>
                    <th>Название</th>
                    <th>Заменяющий день</th>
                  </tr>
                </thead>
                <tbody>
                  {!days.length ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : null}
                  {days.map((d, i) => (
                    <tr
                      key={i}
                      className={selectedDay === i ? styles.rowSelected : undefined}
                      onClick={() => setSelectedDay(i)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedDay === i}
                          onChange={() => setSelectedDay(selectedDay === i ? null : i)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={d.day}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, day: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={d.dayType}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, dayType: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {DAY_TYPES.map((t) => (
                            <option key={t.v} value={t.v}>
                              {t.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={d.name}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={d.replacementDay}
                          onChange={(e) =>
                            setDays((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? { ...x, replacementDay: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <h2>Общие итоги</h2>
            <button
              type="button"
              className={styles.toolBtn}
              disabled={busy}
              onClick={() => void recalculate()}
            >
              Пересчитать
            </button>
          </div>
          {!totals ? (
            <div className={styles.sideEmpty}>
              <div className={styles.sideIcon}>📊</div>
              <p>Вы можете увидеть общую информацию здесь</p>
            </div>
          ) : (
            <dl className={styles.totals}>
              <div>
                <dt>Рабочих дней</dt>
                <dd>{totals.workDays}</dd>
              </div>
              <div>
                <dt>Выходных</dt>
                <dd>{totals.dayOffs}</dd>
              </div>
              <div>
                <dt>Праздников</dt>
                <dd>{totals.holidays}</dd>
              </div>
              <div>
                <dt>Сокращённых</dt>
                <dd>{totals.shortDays}</dd>
              </div>
              <div>
                <dt>Рабочих часов</dt>
                <dd>{totals.workHours}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}
