import { DayStatus } from '@prisma/client';

export function round2(h: number) {
  return Math.round(h * 100) / 100;
}

export function numDec(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function eachUtcDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function planNormHours(start: string, end: string) {
  const parse = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => Number(x) || 0);
    return h * 60 + m;
  };
  let mins = parse(end) - parse(start);
  if (mins <= 0) mins += 24 * 60;
  if (mins >= 8 * 60) mins -= 60;
  return round2(mins / 60);
}

export function creditedOnTimeHours(
  firstIn: Date,
  lastOut: Date,
  planStart: string,
  planEnd: string,
  countLunch: boolean,
) {
  const day = new Date(firstIn);
  day.setHours(0, 0, 0, 0);
  const parse = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => Number(x) || 0);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const planS = parse(planStart);
  const planE = parse(planEnd);
  const winStart = firstIn > planS ? firstIn : planS;
  const winEnd = lastOut < planE ? lastOut : planE;
  if (winEnd.getTime() <= winStart.getTime()) return 0;
  let mins = (winEnd.getTime() - winStart.getTime()) / 60000;
  if (countLunch) {
    const lunchS = parse('13:00');
    const lunchE = parse('14:00');
    const overlapMs = Math.max(
      0,
      Math.min(winEnd.getTime(), lunchE.getTime()) -
        Math.max(winStart.getTime(), lunchS.getTime()),
    );
    mins -= overlapMs / 60000;
  }
  return Math.max(0, mins / 60);
}

export function hoursBefore(firstIn: Date, planStart: string) {
  const day = new Date(firstIn);
  day.setHours(0, 0, 0, 0);
  const [h, m] = planStart.split(':').map((x) => Number(x) || 0);
  const planS = new Date(day);
  planS.setHours(h, m, 0, 0);
  if (firstIn.getTime() >= planS.getTime()) return 0;
  return (planS.getTime() - firstIn.getTime()) / 3600000;
}

export function hoursAfter(lastOut: Date, planEnd: string) {
  const day = new Date(lastOut);
  day.setHours(0, 0, 0, 0);
  const [h, m] = planEnd.split(':').map((x) => Number(x) || 0);
  const planE = new Date(day);
  planE.setHours(h, m, 0, 0);
  if (lastOut.getTime() <= planE.getTime()) return 0;
  return (lastOut.getTime() - planE.getTime()) / 3600000;
}

export type DayHours = {
  workDate: Date;
  status: DayStatus;
  plannedHours: number;
  onTimeHours: number;
  outsideHours: number;
  workedHours: number;
  overtimeHours: number;
  beforeHours: number;
  afterHours: number;
};

export type HourTargets = {
  plannedHours: number | null;
  onTimeHours: number | null;
  outsideHours: number | null;
  workedHours: number | null;
  overtimeHours: number | null;
  beforeHours: number | null;
  afterHours: number | null;
};

export function scaleDailyHoursToTargets(days: DayHours[], target: HourTargets): DayHours[] {
  const keys = [
    'plannedHours',
    'onTimeHours',
    'outsideHours',
    'workedHours',
    'overtimeHours',
    'beforeHours',
    'afterHours',
  ] as const;

  const sums: Record<(typeof keys)[number], number> = {
    plannedHours: 0,
    onTimeHours: 0,
    outsideHours: 0,
    workedHours: 0,
    overtimeHours: 0,
    beforeHours: 0,
    afterHours: 0,
  };
  for (const d of days) {
    for (const k of keys) sums[k] += d[k];
  }

  return days.map((d) => {
    const next = { ...d };
    for (const k of keys) {
      const t = target[k];
      if (t == null) continue;
      if (sums[k] > 0.0001) {
        next[k] = round2((d[k] / sums[k]) * t);
      } else {
        const workDays = days.filter((x) => x.status !== DayStatus.day_off).length;
        next[k] = workDays > 0 ? round2(t / workDays) : round2(t);
      }
    }
    return next;
  });
}
