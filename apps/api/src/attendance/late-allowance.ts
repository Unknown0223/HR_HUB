/**
 * Company lateness allowance: up to `excusedPerMonth` late arrivals a month, each no longer
 * than `excusedMaxMinutes` (counted after the schedule's grace minutes), still count as a
 * full working day. Any other late day is not full and can only be fixed by a timesheet
 * correction.
 */
export type LatenessRules = {
  excusedEnabled: boolean;
  excusedPerMonth: number;
  excusedMaxMinutes: number;
  /** In-app notice when a terminal records the employee's first arrival of the day. */
  notifyTerminalArrival: boolean;
};

export const DEFAULT_LATENESS_RULES: LatenessRules = {
  excusedEnabled: false,
  excusedPerMonth: 3,
  excusedMaxMinutes: 60,
  notifyTerminalArrival: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeLatenessRules(raw: unknown): LatenessRules {
  const p =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const d = DEFAULT_LATENESS_RULES;
  return {
    excusedEnabled:
      typeof p.excusedEnabled === 'boolean' ? p.excusedEnabled : d.excusedEnabled,
    excusedPerMonth: clampInt(p.excusedPerMonth, 0, 31, d.excusedPerMonth),
    excusedMaxMinutes: clampInt(p.excusedMaxMinutes, 1, 24 * 60, d.excusedMaxMinutes),
    notifyTerminalArrival:
      typeof p.notifyTerminalArrival === 'boolean'
        ? p.notifyTerminalArrival
        : d.notifyTerminalArrival,
  };
}

export type LateDayInput = {
  /** YYYY-MM-DD; the allowance resets every calendar month. */
  date: string;
  status: string;
  lateMinutes: number | null;
};

export type LateVerdict = {
  /** Late, but inside the monthly allowance. */
  lateExcused: boolean;
  /** False only for a late day outside the allowance while the rule is on. */
  fullDay: boolean;
};

/** The allowance is spent in date order within each month, whatever order `days` come in. */
export function applyLateAllowance<T extends LateDayInput>(
  days: T[],
  rules: Pick<LatenessRules, 'excusedEnabled' | 'excusedPerMonth' | 'excusedMaxMinutes'>,
): Array<T & LateVerdict> {
  const verdicts = new Map<T, LateVerdict>();
  const used = new Map<string, number>();
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of ordered) {
    if (day.status !== 'late') {
      verdicts.set(day, { lateExcused: false, fullDay: true });
      continue;
    }
    if (!rules.excusedEnabled) {
      verdicts.set(day, { lateExcused: false, fullDay: true });
      continue;
    }
    const month = day.date.slice(0, 7);
    const spent = used.get(month) ?? 0;
    const minutes = day.lateMinutes ?? 0;
    const excused = minutes <= rules.excusedMaxMinutes && spent < rules.excusedPerMonth;
    if (excused) used.set(month, spent + 1);
    verdicts.set(day, { lateExcused: excused, fullDay: excused });
  }
  return days.map((d) => ({ ...d, ...verdicts.get(d)! }));
}

/** How many excused late arrivals are still left this month after `days`. */
export function excusedLeft(
  days: Array<LateDayInput & LateVerdict>,
  rules: Pick<LatenessRules, 'excusedEnabled' | 'excusedPerMonth'>,
): number | null {
  if (!rules.excusedEnabled) return null;
  const used = days.filter((d) => d.lateExcused).length;
  return Math.max(0, rules.excusedPerMonth - used);
}
