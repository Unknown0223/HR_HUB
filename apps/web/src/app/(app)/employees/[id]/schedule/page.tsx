'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type ScheduleSettings = {
  year?: number;
  weekPattern?: '6/1' | '5/1' | '5/2';
  graceOutMinutes?: number;
  autoProdCalendar?: boolean;
  intervalType?: string;
  trackMarksSchedule?: boolean;
  hourly?: boolean;
  freeTime?: boolean;
  trackLate?: boolean;
  trackEarly?: boolean;
  trackAbsent?: boolean;
  byLocation?: boolean;
  advancedLateEarly?: boolean;
  delayMode?: 'allowed' | 'strict';
  lateInGraceZone?: boolean;
  addAttendanceInGrace?: boolean;
  dayNormHours?: number;
  yearGrid?: Record<string, string>;
};

type EmpSchedule = {
  id: string;
  firstName: string;
  lastName: string;
  schedule?: {
    id: string;
    name: string;
    code?: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    isActive?: boolean;
    settings?: ScheduleSettings | null;
  } | null;
};

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function dayKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isOffPattern(date: Date, pattern: string) {
  const d = date.getDay();
  if (pattern === '6/1') return d === 0;
  return d === 0 || d === 6;
}

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  return Math.max(0, Math.round((mins / 60) * 10) / 10);
}

function buildGrid(year: number, pattern: string, norm: number) {
  const grid: Record<string, string> = {};
  const n = String(norm);
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(year, mi, d);
      grid[dayKey(year, mi, d)] = isOffPattern(dt, pattern) ? 'В' : n;
    }
  }
  return grid;
}

export default function EmployeeSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<EmpSchedule | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [active, setActive] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [graceIn, setGraceIn] = useState('10');
  const [graceOut, setGraceOut] = useState('0');
  const [weekPattern, setWeekPattern] = useState<'6/1' | '5/1' | '5/2'>('6/1');
  const [dayNorm, setDayNorm] = useState('8');
  const [yearGrid, setYearGrid] = useState<Record<string, string>>({});
  const [autoProd, setAutoProd] = useState(true);
  const [intervalType, setIntervalType] = useState('first_in_first_out');
  const [advanced, setAdvanced] = useState(true);
  const [delayMode, setDelayMode] = useState<'allowed' | 'strict'>('allowed');
  const [flags, setFlags] = useState({
    marks: true,
    hourly: false,
    free: true,
    late: true,
    early: true,
    absent: true,
    byLoc: false,
    lateInZone: false,
    addDiff: true,
  });

  function applyFromSchedule(s: NonNullable<EmpSchedule['schedule']>) {
    const st = s.settings ?? {};
    setName(s.name || '');
    setCode(s.code || '');
    setStartTime(s.startTime || '09:00');
    setEndTime(s.endTime || '18:00');
    setGraceIn(String(s.graceMinutes ?? 10));
    setGraceOut(String(st.graceOutMinutes ?? 0));
    setActive(s.isActive !== false);
    setYear(String(st.year ?? new Date().getFullYear()));
    setWeekPattern(st.weekPattern ?? '6/1');
    setDayNorm(String(st.dayNormHours ?? 8));
    setAutoProd(st.autoProdCalendar !== false);
    setIntervalType(st.intervalType ?? 'first_in_first_out');
    setAdvanced(st.advancedLateEarly !== false);
    setDelayMode(st.delayMode ?? 'allowed');
    setFlags({
      marks: st.trackMarksSchedule !== false,
      hourly: !!st.hourly,
      free: st.freeTime !== false,
      late: st.trackLate !== false,
      early: st.trackEarly !== false,
      absent: st.trackAbsent !== false,
      byLoc: !!st.byLocation,
      lateInZone: !!st.lateInGraceZone,
      addDiff: st.addAttendanceInGrace !== false,
    });
    const y = st.year ?? new Date().getFullYear();
    const pattern = st.weekPattern ?? '6/1';
    const norm = st.dayNormHours ?? 8;
    setYearGrid(st.yearGrid ?? buildGrid(y, pattern, norm));
  }

  useEffect(() => {
    apiFetch<EmpSchedule>(`/api/employees/${id}`)
      .then((data) => {
        setRow(data);
        if (data.schedule) applyFromSchedule(data.schedule);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [id]);

  const y = Number(year) || new Date().getFullYear();
  const dayHours = useMemo(() => hoursBetween(startTime, endTime), [startTime, endTime]);
  const normNum = Number(dayNorm) || 8;

  const monthStats = useMemo(() => {
    return MONTHS.map((_, mi) => {
      let days = 0;
      let hours = 0;
      const dim = new Date(y, mi + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const key = dayKey(y, mi, d);
        const mark = yearGrid[key] ?? '';
        if (mark && mark !== 'В') {
          days += 1;
          const h = Number(mark);
          hours += Number.isFinite(h) ? h : dayHours;
        }
      }
      return { days, hours };
    });
  }, [y, yearGrid, dayHours]);

  function settingsPayload(): ScheduleSettings {
    return {
      year: y,
      weekPattern,
      graceOutMinutes: Number(graceOut) || 0,
      autoProdCalendar: autoProd,
      intervalType,
      trackMarksSchedule: flags.marks,
      hourly: flags.hourly,
      freeTime: flags.free,
      trackLate: flags.late,
      trackEarly: flags.early,
      trackAbsent: flags.absent,
      byLocation: flags.byLoc,
      advancedLateEarly: advanced,
      delayMode,
      lateInGraceZone: flags.lateInZone,
      addAttendanceInGrace: flags.addDiff,
      dayNormHours: normNum,
      yearGrid,
    };
  }

  async function save() {
    if (!row?.schedule?.id) {
      setError('У сотрудника нет графика');
      return;
    }
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await apiFetch(`/api/attendance/schedules/${row.schedule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          startTime,
          endTime,
          graceMinutes: Number(graceIn) || 0,
          isActive: active,
          settings: settingsPayload(),
        }),
      });
      setSaved('Сохранено — правила применяются к отметкам (опоздание / ранний уход / выходной)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    if (!row?.schedule?.id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<{
        id: string;
        settings?: ScheduleSettings;
      }>(`/api/attendance/schedules/${row.schedule.id}/fill`, {
        method: 'POST',
        body: JSON.stringify({
          year: y,
          weekPattern,
          dayNormHours: normNum,
        }),
      });
      const grid = updated.settings?.yearGrid ?? buildGrid(y, weekPattern, normNum);
      setYearGrid(grid);
      setSaved(`Заполнено за ${y} г. по шаблону ${weekPattern}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setBusy(false);
    }
  }

  function toggleCell(mi: number, day: number) {
    const dim = new Date(y, mi + 1, 0).getDate();
    if (day > dim) return;
    const key = dayKey(y, mi, day);
    setYearGrid((g) => {
      const cur = g[key];
      const next = { ...g };
      if (!cur || cur === 'В') next[key] = String(normNum);
      else next[key] = 'В';
      return next;
    });
  }

  function changeNorm() {
    const v = window.prompt('Норма часов в рабочий день', dayNorm);
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    setDayNorm(String(n));
    setYearGrid((g) => {
      const next: Record<string, string> = {};
      for (const [k, val] of Object.entries(g)) {
        next[k] = val === 'В' ? 'В' : String(n);
      }
      return next;
    });
  }

  if (!row && !error) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSave}
            disabled={busy || !row?.schedule?.id}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={styles.btnClose}
            onClick={() => router.push(`/employees/${id}`)}
          >
            Закрыть
          </button>
        </div>
        <h1 className={styles.title}>Обычный график работы (изменение)</h1>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.ok}>{saved}</p> : null}

      {!row?.schedule ? (
        <div className={styles.card}>
          <p className={styles.muted}>График не назначен.</p>
          <Link href={`/employees/${id}`}>← К карточке сотрудника</Link>
        </div>
      ) : (
        <>
          <div className={styles.formGrid}>
            <div className={styles.col}>
              <div className={styles.field}>
                <label>
                  Название <span className={styles.req}>*</span>
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>
                  Год <span className={styles.req}>*</span>
                </label>
                <input value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Код</label>
                <input value={code} readOnly />
              </div>
              <div className={styles.toggleRow}>
                <span>Статус</span>
                <button
                  type="button"
                  className={`${styles.toggle} ${active ? styles.toggleOn : ''}`}
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                />
                <span>Активный</span>
              </div>
              <div className={styles.field}>
                <label>Шаблон недели</label>
                <select
                  value={weekPattern}
                  onChange={(e) =>
                    setWeekPattern(e.target.value as '6/1' | '5/1' | '5/2')
                  }
                >
                  <option value="6/1">6/1 (вс — выходной)</option>
                  <option value="5/1">5/1 (сб+вс — выходной)</option>
                  <option value="5/2">5/2 (сб+вс — выходной)</option>
                </select>
              </div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Начало смены</label>
                  <input value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label>Конец смены</label>
                  <input value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            </div>

            <div className={styles.col}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={autoProd}
                  onChange={(e) => setAutoProd(e.target.checked)}
                />
                Автоматическое обновление по производственному календарю
              </label>
              <div className={styles.field}>
                <label>Тип расчета интервала</label>
                <select
                  value={intervalType}
                  onChange={(e) => setIntervalType(e.target.value)}
                >
                  <option value="first_in_first_out">
                    Первый приход и первый уход
                  </option>
                  <option value="first_in_last_out">
                    Первый приход и последний уход
                  </option>
                </select>
              </div>
              <div className={styles.checkRow}>
                {(
                  [
                    ['marks', 'Расписание отметок'],
                    ['hourly', 'Часовые ставки'],
                    ['free', 'Свободное время'],
                    ['late', 'Поздний приход'],
                    ['early', 'Ранний уход'],
                    ['absent', 'Отсутствие'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags[k]}
                      onChange={(e) =>
                        setFlags((f) => ({ ...f, [k]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.byLoc}
                  onChange={(e) =>
                    setFlags((f) => ({ ...f, byLoc: e.target.checked }))
                  }
                />
                Считать факты по локациям
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => setAdvanced(e.target.checked)}
                />
                Расширенные настройки позднего прихода и раннего ухода
              </label>
              {advanced ? (
                <>
                  <div className={styles.radioRow}>
                    <span>Учет задержки</span>
                    <label className={styles.check}>
                      <input
                        type="radio"
                        checked={delayMode === 'allowed'}
                        onChange={() => setDelayMode('allowed')}
                      />
                      Дозволено
                    </label>
                    <label className={styles.check}>
                      <input
                        type="radio"
                        checked={delayMode === 'strict'}
                        onChange={() => setDelayMode('strict')}
                      />
                      Строго
                    </label>
                  </div>
                  <p className={styles.hint}>
                    Укажите дозволенное время опоздания или раннего ухода. При
                    расчёте учитывается начало/конец смены.
                  </p>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label>Приход</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          value={graceIn}
                          onChange={(e) => setGraceIn(e.target.value)}
                          style={{ maxWidth: 72 }}
                        />
                        <span className={styles.hint}>минут</span>
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label>Уход</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          value={graceOut}
                          onChange={(e) => setGraceOut(e.target.value)}
                          style={{ maxWidth: 72 }}
                        />
                        <span className={styles.hint}>минут</span>
                      </div>
                    </div>
                  </div>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags.lateInZone}
                      onChange={(e) =>
                        setFlags((f) => ({ ...f, lateInZone: e.target.checked }))
                      }
                    />
                    Считать опоздание в дозволенной зоне
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags.addDiff}
                      onChange={(e) =>
                        setFlags((f) => ({ ...f, addDiff: e.target.checked }))
                      }
                    />
                    Добавлять явку сотруднику в границах дозволенного времени
                    опоздания
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <div className={styles.gridCard}>
            <div className={styles.gridTools}>
              <button
                type="button"
                className={styles.toolBtn}
                disabled={busy}
                onClick={() => void fill()}
              >
                Заполнить
              </button>
              <button type="button" className={styles.toolBtn} onClick={changeNorm}>
                Изменить норму
              </button>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <th>Месяц</th>
                    <th>Дней</th>
                    <th>Часов</th>
                    {Array.from({ length: 31 }, (_, i) => (
                      <th key={i + 1}>{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, mi) => {
                    const dim = new Date(y, mi + 1, 0).getDate();
                    return (
                      <tr key={m}>
                        <td className={styles.monthCell}>{m}</td>
                        <td>{monthStats[mi].days}</td>
                        <td>{monthStats[mi].hours}</td>
                        {Array.from({ length: 31 }, (_, i) => {
                          const day = i + 1;
                          if (day > dim) return <td key={day} />;
                          const key = dayKey(y, mi, day);
                          const mark = yearGrid[key] ?? '';
                          return (
                            <td
                              key={day}
                              className={mark === 'В' ? styles.offCell : styles.workCell}
                              onClick={() => toggleCell(mi, day)}
                              title="Клик: рабочий ↔ выходной"
                            >
                              {mark}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
