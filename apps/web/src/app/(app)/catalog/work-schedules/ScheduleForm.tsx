'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ScheduleKind } from './page';
import styles from './form.module.css';

export type ScheduleSettings = {
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
  dayNormHours?: number;
  yearGrid?: Record<string, string>;
  maxWorkdayDuration?: string;
  dayShiftTime?: string;
  arrivalBeforeHours?: number;
  arrivalBeforeMinutes?: number;
  leaveAfterHours?: number;
  leaveAfterMinutes?: number;
  trackMarksHours?: number;
  trackMarksMinutes?: number;
  useNormAsDailyLimit?: boolean;
  groupMarksByTime?: boolean;
  disableFactCalc?: boolean;
  enableGpsMap?: boolean;
  markRestrictions?: boolean;
};

type ScheduleRow = {
  id: string;
  name: string;
  code: string;
  kind: ScheduleKind;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  isActive: boolean;
  settings?: ScheduleSettings | null;
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

const KIND_TITLE: Record<ScheduleKind, string> = {
  ordinary: 'Обычный график работы',
  hourly: 'Почасовой график работы',
  advanced: 'Продвинутый график работы',
  multi_shift: 'Многосменный график',
  advanced_multi_shift: 'Продвинутый многосменный график',
};

function dayKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isOff(date: Date, pattern: string) {
  const d = date.getDay();
  if (pattern === '6/1') return d === 0;
  return d === 0 || d === 6;
}

function buildGrid(year: number, pattern: string, norm: number, kind: ScheduleKind) {
  const grid: Record<string, string> = {};
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const off = isOff(new Date(year, mi, d), pattern);
      if (kind === 'advanced') grid[dayKey(year, mi, d)] = off ? 'R' : 'D';
      else grid[dayKey(year, mi, d)] = off ? 'В' : String(norm);
    }
  }
  return grid;
}

function emptyGrid(year: number, kind: ScheduleKind) {
  const grid: Record<string, string> = {};
  const fill =
    kind === 'advanced' ? 'R' : kind === 'hourly' || kind === 'multi_shift' ? '8' : 'В';
  for (let mi = 0; mi < 12; mi++) {
    const dim = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      grid[dayKey(year, mi, d)] = fill;
    }
  }
  return grid;
}

function isWorkCell(v: string) {
  if (!v || v === 'В' || v === 'R') return false;
  return true;
}

export function ScheduleForm({
  scheduleId,
  initialKind,
}: {
  scheduleId?: string;
  initialKind?: ScheduleKind;
}) {
  const router = useRouter();
  const isNew = !scheduleId;
  const [kind, setKind] = useState<ScheduleKind>(initialKind || 'ordinary');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [active, setActive] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [graceIn, setGraceIn] = useState('15');
  const [weekPattern, setWeekPattern] = useState<'6/1' | '5/1' | '5/2'>('5/2');
  const [dayNorm, setDayNorm] = useState('8');
  const [yearGrid, setYearGrid] = useState<Record<string, string>>({});
  const [autoProd, setAutoProd] = useState(false);
  const [intervalType, setIntervalType] = useState('first_in_first_out');
  const [maxWorkday, setMaxWorkday] = useState('12:00');
  const [dayShiftTime, setDayShiftTime] = useState('00:00');
  const [arrH, setArrH] = useState('0');
  const [arrM, setArrM] = useState('0');
  const [leaveH, setLeaveH] = useState('0');
  const [leaveM, setLeaveM] = useState('0');
  const [trackH, setTrackH] = useState('24');
  const [trackM, setTrackM] = useState('0');
  const [flags, setFlags] = useState({
    marks: false,
    hourly: false,
    free: true,
    late: true,
    early: true,
    absent: true,
    byLoc: false,
    advanced: false,
    useNormLimit: false,
    groupMarks: false,
    disableFact: false,
    gps: false,
    markRestrict: false,
  });

  const y = Number(year) || new Date().getFullYear();
  const normNum = Number(dayNorm) || 8;

  useEffect(() => {
    if (isNew) {
      setYearGrid(emptyGrid(y, kind));
      if (kind === 'multi_shift' || kind === 'advanced_multi_shift') setMaxWorkday('24:00');
      if (kind === 'hourly') setMaxWorkday('12:00');
      return;
    }
    setLoading(true);
    apiFetch<ScheduleRow>(`/api/attendance/schedules/${scheduleId}`)
      .then((row) => {
        const st = row.settings ?? {};
        setKind(row.kind || 'ordinary');
        setName(row.name);
        setCode(row.code || '');
        setActive(row.isActive !== false);
        setStartTime(row.startTime || '09:00');
        setEndTime(row.endTime || '18:00');
        setGraceIn(String(row.graceMinutes ?? 15));
        setYear(String(st.year ?? new Date().getFullYear()));
        setWeekPattern(st.weekPattern ?? '5/2');
        setDayNorm(String(st.dayNormHours ?? 8));
        setAutoProd(!!st.autoProdCalendar);
        setIntervalType(st.intervalType ?? 'first_in_first_out');
        setMaxWorkday(st.maxWorkdayDuration ?? '12:00');
        setDayShiftTime(st.dayShiftTime ?? '00:00');
        setArrH(String(st.arrivalBeforeHours ?? 0));
        setArrM(String(st.arrivalBeforeMinutes ?? 0));
        setLeaveH(String(st.leaveAfterHours ?? 0));
        setLeaveM(String(st.leaveAfterMinutes ?? 0));
        setTrackH(String(st.trackMarksHours ?? 24));
        setTrackM(String(st.trackMarksMinutes ?? 0));
        setFlags({
          marks: !!st.trackMarksSchedule,
          hourly: !!st.hourly,
          free: st.freeTime !== false,
          late: st.trackLate !== false,
          early: st.trackEarly !== false,
          absent: st.trackAbsent !== false,
          byLoc: !!st.byLocation,
          advanced: !!st.advancedLateEarly,
          useNormLimit: !!st.useNormAsDailyLimit,
          groupMarks: !!st.groupMarksByTime,
          disableFact: !!st.disableFactCalc,
          gps: !!st.enableGpsMap,
          markRestrict: !!st.markRestrictions,
        });
        setYearGrid(
          st.yearGrid ??
            emptyGrid(st.year ?? new Date().getFullYear(), row.kind || 'ordinary'),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const monthStats = useMemo(() => {
    return MONTHS.map((_, mi) => {
      let days = 0;
      let hours = 0;
      const dim = new Date(y, mi + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const mark = yearGrid[dayKey(y, mi, d)] ?? '';
        if (isWorkCell(mark)) {
          days += 1;
          const h = Number(mark);
          hours += Number.isFinite(h) ? h : normNum;
        }
      }
      return { days, hours: Math.round(hours * 10) / 10 };
    });
  }, [y, yearGrid, normNum]);

  function settingsPayload(): ScheduleSettings {
    return {
      year: y,
      weekPattern,
      autoProdCalendar: autoProd,
      intervalType,
      trackMarksSchedule: flags.marks,
      hourly: flags.hourly,
      freeTime: flags.free,
      trackLate: flags.late,
      trackEarly: flags.early,
      trackAbsent: flags.absent,
      byLocation: flags.byLoc,
      advancedLateEarly: flags.advanced,
      dayNormHours: normNum,
      yearGrid,
      maxWorkdayDuration: maxWorkday,
      dayShiftTime,
      arrivalBeforeHours: Number(arrH) || 0,
      arrivalBeforeMinutes: Number(arrM) || 0,
      leaveAfterHours: Number(leaveH) || 0,
      leaveAfterMinutes: Number(leaveM) || 0,
      trackMarksHours: Number(trackH) || 0,
      trackMarksMinutes: Number(trackM) || 0,
      useNormAsDailyLimit: flags.useNormLimit,
      groupMarksByTime: flags.groupMarks,
      disableFactCalc: flags.disableFact,
      enableGpsMap: flags.gps,
      markRestrictions: flags.markRestrict,
    };
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
        kind,
        startTime,
        endTime,
        graceMinutes: Number(graceIn) || 0,
        isActive: active,
        settings: settingsPayload(),
      };
      if (isNew) {
        const created = await apiFetch<ScheduleRow>('/api/attendance/schedules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.replace(`/catalog/work-schedules/${created.id}`);
        setSaved('Сохранено');
      } else {
        await apiFetch(`/api/attendance/schedules/${scheduleId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setSaved('Сохранено');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    if (isNew) {
      setYearGrid(buildGrid(y, weekPattern, normNum, kind));
      setSaved(`Заполнено за ${y} г. по шаблону ${weekPattern}`);
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<ScheduleRow>(
        `/api/attendance/schedules/${scheduleId}/fill`,
        {
          method: 'POST',
          body: JSON.stringify({ year: y, weekPattern, dayNormHours: normNum }),
        },
      );
      setYearGrid(
        updated.settings?.yearGrid ?? buildGrid(y, weekPattern, normNum, kind),
      );
      setSaved(`Заполнено за ${y} г.`);
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
      if (kind === 'advanced') {
        next[key] = cur === 'D' ? 'R' : 'D';
      } else if (!cur || cur === 'В') {
        next[key] = String(normNum);
      } else {
        next[key] = 'В';
      }
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
        if (val === 'В' || val === 'R' || val === 'D') next[k] = val;
        else next[k] = String(n);
      }
      return next;
    });
  }

  const showMaxDay = kind === 'hourly' || kind === 'multi_shift' || kind === 'advanced_multi_shift';
  const showShiftBuffers = kind === 'advanced' || kind === 'advanced_multi_shift';
  const showOrdinaryFlags = kind === 'ordinary' || kind === 'advanced';
  const showHourlyFlags = kind === 'hourly';
  const showMultiFlags =
    kind === 'multi_shift' || kind === 'advanced_multi_shift';

  if (loading) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>
          {KIND_TITLE[kind]} ({isNew ? 'создание' : 'изменение'})
        </h1>
        <div className={styles.actions}>
          <button type="button" className={styles.btnSave} disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
          <Link href="/catalog/work-schedules" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? <p className={styles.ok}>{saved}</p> : null}

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
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${active ? styles.toggleOn : ''}`}
              onClick={() => setActive((v) => !v)}
              aria-pressed={active}
            />
            <span>Активный</span>
          </div>
          {(kind === 'ordinary' || kind === 'advanced') && (
            <div className={styles.row2}>
              <div className={styles.field}>
                <label>Начало</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Окончание</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div className={styles.field}>
            <label>Шаблон недели</label>
            <select
              value={weekPattern}
              onChange={(e) => setWeekPattern(e.target.value as '6/1' | '5/1' | '5/2')}
            >
              <option value="5/2">5/2 (сб–вс)</option>
              <option value="6/1">6/1 (вс)</option>
              <option value="5/1">5/1</option>
            </select>
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
            <label>
              Тип расчета интервалов <span className={styles.req}>*</span>
            </label>
            <select value={intervalType} onChange={(e) => setIntervalType(e.target.value)}>
              <option value="first_in_first_out">Первый приход и первый уход</option>
              <option value="first_in_last_out">Первый приход и последний уход</option>
            </select>
          </div>

          {showMaxDay ? (
            <div className={styles.field}>
              <label>Максимальная продолжительность рабочего дня</label>
              <input value={maxWorkday} onChange={(e) => setMaxWorkday(e.target.value)} />
            </div>
          ) : null}

          {showShiftBuffers ? (
            <>
              <div className={styles.field}>
                <label>Время смены дня</label>
                <input value={dayShiftTime} onChange={(e) => setDayShiftTime(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Учитывать приходы за (часов, минут) до смены</label>
                <div className={styles.row2}>
                  <input value={arrH} onChange={(e) => setArrH(e.target.value)} />
                  <input value={arrM} onChange={(e) => setArrM(e.target.value)} />
                </div>
              </div>
              <div className={styles.field}>
                <label>Исключать уходы за (часов, минут) после смены</label>
                <div className={styles.row2}>
                  <input value={leaveH} onChange={(e) => setLeaveH(e.target.value)} />
                  <input value={leaveM} onChange={(e) => setLeaveM(e.target.value)} />
                </div>
              </div>
              {kind === 'advanced' ? (
                <div className={styles.field}>
                  <label>Отслеживать отметки в течение (часов, минут)</label>
                  <div className={styles.row2}>
                    <input value={trackH} onChange={(e) => setTrackH(e.target.value)} />
                    <input value={trackM} onChange={(e) => setTrackM(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {showHourlyFlags ? (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.useNormLimit}
                  onChange={(e) => setFlags((f) => ({ ...f, useNormLimit: e.target.checked }))}
                />
                Использовать значение нормы в качестве дневного лимита отработки
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.byLoc}
                  onChange={(e) => setFlags((f) => ({ ...f, byLoc: e.target.checked }))}
                />
                Считать факты по локациям
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.groupMarks}
                  onChange={(e) => setFlags((f) => ({ ...f, groupMarks: e.target.checked }))}
                />
                Группировать отметки по времени
              </label>
            </>
          ) : null}

          {(showOrdinaryFlags || showMultiFlags) && !showHourlyFlags ? (
            <div className={styles.checkCol}>
              {kind === 'ordinary' || kind === 'advanced' ? (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={flags.marks}
                    onChange={(e) => setFlags((f) => ({ ...f, marks: e.target.checked }))}
                  />
                  Расписание отметок
                </label>
              ) : null}
              {kind === 'ordinary' || kind === 'advanced' ? (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={flags.hourly}
                    onChange={(e) => setFlags((f) => ({ ...f, hourly: e.target.checked }))}
                  />
                  Часовая ставка
                </label>
              ) : null}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.free}
                  onChange={(e) => setFlags((f) => ({ ...f, free: e.target.checked }))}
                />
                Свободное время
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.late}
                  onChange={(e) => setFlags((f) => ({ ...f, late: e.target.checked }))}
                />
                Поздний приход
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.early}
                  onChange={(e) => setFlags((f) => ({ ...f, early: e.target.checked }))}
                />
                Ранний уход
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.absent}
                  onChange={(e) => setFlags((f) => ({ ...f, absent: e.target.checked }))}
                />
                Отсутствие
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.byLoc}
                  onChange={(e) => setFlags((f) => ({ ...f, byLoc: e.target.checked }))}
                />
                Считать факты по локациям
              </label>
              {kind === 'advanced' ? (
                <>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags.disableFact}
                      onChange={(e) =>
                        setFlags((f) => ({ ...f, disableFact: e.target.checked }))
                      }
                    />
                    Отключить расчет фактов
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags.gps}
                      onChange={(e) => setFlags((f) => ({ ...f, gps: e.target.checked }))}
                    />
                    Включить карту GPS
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={flags.markRestrict}
                      onChange={(e) =>
                        setFlags((f) => ({ ...f, markRestrict: e.target.checked }))
                      }
                    />
                    Ограничения отметок
                  </label>
                </>
              ) : null}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flags.advanced}
                  onChange={(e) => setFlags((f) => ({ ...f, advanced: e.target.checked }))}
                />
                Расширенные настройки позднего прихода и раннего ухода
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.gridCard}>
        <div className={styles.gridTools}>
          <button type="button" className={styles.toolBtn} disabled={busy} onClick={() => void fill()}>
            Заполнить
          </button>
          <button type="button" className={styles.toolBtn} onClick={changeNorm}>
            Изменить норму
          </button>
        </div>
        <div className={styles.yearScroll}>
          <table className={styles.yearTable}>
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
              {MONTHS.map((mName, mi) => {
                const dim = new Date(y, mi + 1, 0).getDate();
                const st = monthStats[mi];
                return (
                  <tr key={mName}>
                    <td className={styles.monthCell}>{mName}</td>
                    <td>{st.days}</td>
                    <td>{st.hours}</td>
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      if (day > dim) return <td key={day} className={styles.blank} />;
                      const key = dayKey(y, mi, day);
                      const val = yearGrid[key] ?? '';
                      const off = !isWorkCell(val);
                      return (
                        <td key={day}>
                          <button
                            type="button"
                            className={`${styles.cell} ${off ? styles.cellOff : styles.cellOn}`}
                            onClick={() => toggleCell(mi, day)}
                          >
                            {val}
                          </button>
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
    </div>
  );
}
