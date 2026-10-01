export type DayMetricsInput = {
  /** Schedule start/end in minutes of the org day. */
  startMin: number;
  endMin: number;
  /** First in / last out in minutes of the org day (null = no such mark). */
  inMin: number | null;
  outMin: number | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  isLate: boolean;
  /** Stored by the attendance engine; 0 means "not computed / none". */
  lateMinutes: number;
  earlyLeaveMinutes: number;
  /** Posted timesheet values (hours) win over mark arithmetic. */
  workedHours: number | null;
  overtimeHours: number | null;
  viewingToday: boolean;
  nowMin: number;
};

export type DayMetrics = {
  lateMin: number | null;
  earlyLeaveMin: number | null;
  workedMin: number | null;
  overtimeMin: number | null;
  onSite: boolean;
  earlyOut: boolean;
};

/** Leaving more than this many minutes before the shift end counts as early leave. */
export const EARLY_LEAVE_TOLERANCE_MIN = 5;

const hoursToMin = (h: number | null) => (h == null ? null : Math.round(h * 60));

/** Per-employee day figures for the dashboard attendance table. */
export function dayMetrics(i: DayMetricsInput): DayMetrics {
  // Night shifts cross midnight: minute-of-day arithmetic against the plan is meaningless.
  const dayShift = i.endMin > i.startMin;
  const earlyOut = i.outMin != null && i.outMin + EARLY_LEAVE_TOLERANCE_MIN < i.endMin;
  const m: DayMetrics = {
    lateMin: null,
    earlyLeaveMin: null,
    workedMin: null,
    overtimeMin: null,
    onSite: false,
    earlyOut,
  };

  if (i.firstInAt && i.inMin != null) {
    m.lateMin =
      i.lateMinutes > 0
        ? i.lateMinutes
        : i.isLate && dayShift
          ? Math.max(0, i.inMin - i.startMin)
          : 0;
    m.onSite = !i.lastOutAt && i.viewingToday;
    m.workedMin =
      hoursToMin(i.workedHours) ??
      (i.lastOutAt
        ? Math.max(0, Math.round((i.lastOutAt.getTime() - i.firstInAt.getTime()) / 60000))
        : m.onSite
          ? Math.max(0, i.nowMin - i.inMin)
          : null);
  }

  if (i.lastOutAt && i.outMin != null) {
    m.earlyLeaveMin =
      i.earlyLeaveMinutes > 0
        ? i.earlyLeaveMinutes
        : earlyOut && dayShift
          ? i.endMin - i.outMin
          : 0;
    m.overtimeMin =
      hoursToMin(i.overtimeHours) ?? (dayShift ? Math.max(0, i.outMin - i.endMin) : 0);
  }

  return m;
}
