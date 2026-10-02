import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyLateAllowance, excusedLeft, normalizeLatenessRules } from './late-allowance';

const rules = { excusedEnabled: true, excusedPerMonth: 3, excusedMaxMinutes: 60 };

describe('applyLateAllowance', () => {
  it('excuses the first N late days up to the minute cap, in date order', () => {
    const days = [
      { date: '2026-10-09', status: 'late', lateMinutes: 10 },
      { date: '2026-10-01', status: 'late', lateMinutes: 20 },
      { date: '2026-10-02', status: 'on_time', lateMinutes: 0 },
      { date: '2026-10-05', status: 'late', lateMinutes: 90 },
      { date: '2026-10-06', status: 'late', lateMinutes: 60 },
      { date: '2026-10-07', status: 'late', lateMinutes: 5 },
    ];
    const r = applyLateAllowance(days, rules);
    assert.deepEqual(
      r.map((d) => [d.date, d.lateExcused, d.fullDay]),
      [
        ['2026-10-09', false, false],
        ['2026-10-01', true, true],
        ['2026-10-02', false, true],
        ['2026-10-05', false, false],
        ['2026-10-06', true, true],
        ['2026-10-07', true, true],
      ],
    );
    assert.equal(excusedLeft(r, rules), 0);
  });

  it('resets the allowance every month', () => {
    const r = applyLateAllowance(
      [
        { date: '2026-09-30', status: 'late', lateMinutes: 5 },
        { date: '2026-10-01', status: 'late', lateMinutes: 5 },
      ],
      { ...rules, excusedPerMonth: 1 },
    );
    assert.deepEqual(
      r.map((d) => d.lateExcused),
      [true, true],
    );
  });

  it('keeps late days full when the rule is off', () => {
    const off = { ...rules, excusedEnabled: false };
    const r = applyLateAllowance([{ date: '2026-10-01', status: 'late', lateMinutes: 200 }], off);
    assert.deepEqual([r[0].lateExcused, r[0].fullDay], [false, true]);
    assert.equal(excusedLeft(r, off), null);
  });
});

describe('normalizeLatenessRules', () => {
  it('fills defaults and clamps numbers', () => {
    assert.deepEqual(normalizeLatenessRules({ excusedPerMonth: 99, excusedMaxMinutes: -5 }), {
      excusedEnabled: false,
      excusedPerMonth: 31,
      excusedMaxMinutes: 1,
      notifyTerminalArrival: true,
    });
  });
});
