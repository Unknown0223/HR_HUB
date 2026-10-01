import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayMetrics, type DayMetricsInput } from './day-metrics';

const hm = (h: number, m = 0) => h * 60 + m;
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 1, h - 5, m));

function input(over: Partial<DayMetricsInput>): DayMetricsInput {
  return {
    startMin: hm(9),
    endMin: hm(18),
    inMin: null,
    outMin: null,
    firstInAt: null,
    lastOutAt: null,
    isLate: false,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    workedHours: null,
    overtimeHours: null,
    viewingToday: false,
    nowMin: hm(12),
    ...over,
  };
}

const came = (h: number, m = 0) => ({ inMin: hm(h, m), firstInAt: at(h, m) });
const left = (h: number, m = 0) => ({ outMin: hm(h, m), lastOutAt: at(h, m) });

describe('dayMetrics', () => {
  it('has no figures without marks', () => {
    const m = dayMetrics(input({}));
    assert.deepEqual(
      [m.lateMin, m.earlyLeaveMin, m.workedMin, m.overtimeMin, m.onSite],
      [null, null, null, null, false],
    );
  });

  it('on-time full day: zero late/early, worked = out - in', () => {
    const m = dayMetrics(input({ ...came(8, 55), ...left(18, 0) }));
    assert.equal(m.lateMin, 0);
    assert.equal(m.earlyLeaveMin, 0);
    assert.equal(m.overtimeMin, 0);
    assert.equal(m.workedMin, 9 * 60 + 5);
    assert.equal(m.earlyOut, false);
  });

  it('late arrival without stored minutes falls back to in - shift start', () => {
    const m = dayMetrics(input({ ...came(9, 40), isLate: true }));
    assert.equal(m.lateMin, 40);
  });

  it('stored engine minutes win over arithmetic', () => {
    const m = dayMetrics(
      input({ ...came(9, 40), ...left(17, 0), isLate: true, lateMinutes: 25, earlyLeaveMinutes: 50 }),
    );
    assert.equal(m.lateMin, 25);
    assert.equal(m.earlyLeaveMin, 50);
  });

  it('early leave beyond the 5 minute tolerance', () => {
    assert.equal(dayMetrics(input({ ...came(9), ...left(17, 56) })).earlyLeaveMin, 0);
    const m = dayMetrics(input({ ...came(9), ...left(17, 30) }));
    assert.equal(m.earlyOut, true);
    assert.equal(m.earlyLeaveMin, 30);
  });

  it('overtime after shift end, posted timesheet hours win', () => {
    assert.equal(dayMetrics(input({ ...came(9), ...left(19, 15) })).overtimeMin, 75);
    const m = dayMetrics(input({ ...came(9), ...left(19, 15), workedHours: 8, overtimeHours: 1.5 }));
    assert.equal(m.workedMin, 480);
    assert.equal(m.overtimeMin, 90);
  });

  it('still at work today: worked counts up to now', () => {
    const m = dayMetrics(input({ ...came(9), viewingToday: true, nowMin: hm(12, 30) }));
    assert.equal(m.onSite, true);
    assert.equal(m.workedMin, 210);
    assert.equal(m.earlyLeaveMin, null);
  });

  it('past day without a departure mark: worked unknown, not on site', () => {
    const m = dayMetrics(input({ ...came(9) }));
    assert.equal(m.onSite, false);
    assert.equal(m.workedMin, null);
  });

  it('night shift does not invent late/early/overtime from minute-of-day math', () => {
    const m = dayMetrics(
      input({ startMin: hm(20), endMin: hm(8), ...came(21), ...left(7), isLate: true }),
    );
    assert.equal(m.lateMin, 0);
    assert.equal(m.overtimeMin, 0);
  });
});
