import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePayroll } from './payroll-summary';

describe('summarizePayroll', () => {
  it('splits accruals and withholdings and computes the amount due', () => {
    const r = summarizePayroll(
      [
        { type: 'base', amount: 5_000_000 },
        { type: 'bonus', amount: '750000.50', description: 'Iyun KPI' },
        { type: 'penalty', amount: -120_000 },
        { type: 'deduction', amount: 80_000 },
      ],
      [1_000_000],
    );
    assert.deepEqual(
      r.accruals.map((a) => [a.label, a.amount]),
      [
        ['Oklad', 5_000_000],
        ['Iyun KPI', 750_000.5],
      ],
    );
    assert.deepEqual(
      r.withholdings.map((w) => [w.label, w.amount]),
      [
        ['Jarima', 120_000],
        ['Ushlab qolish', 80_000],
      ],
    );
    assert.deepEqual(r.totals, {
      accrued: 5_750_000.5,
      withheld: 200_000,
      advances: 1_000_000,
      due: 4_550_000.5,
    });
  });

  it('uses advance lines when no paid advance records exist', () => {
    const r = summarizePayroll(
      [
        { type: 'base', amount: 3_000_000 },
        { type: 'advance', amount: 500_000 },
      ],
      [],
    );
    assert.equal(r.accruals.length, 1);
    assert.equal(r.totals.advances, 500_000);
    assert.equal(r.totals.due, 2_500_000);
  });

  it('prefers paid advance records over advance lines to avoid double counting', () => {
    const r = summarizePayroll(
      [
        { type: 'base', amount: 3_000_000 },
        { type: 'advance', amount: 500_000 },
      ],
      [500_000],
    );
    assert.equal(r.totals.advances, 500_000);
    assert.equal(r.totals.due, 2_500_000);
  });

  it('returns zeros for an empty period', () => {
    const r = summarizePayroll([], []);
    assert.deepEqual(r.totals, { accrued: 0, withheld: 0, advances: 0, due: 0 });
  });
});
