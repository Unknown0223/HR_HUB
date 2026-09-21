import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { round2, eachUtcDate, planNormHours } from './catalog-hours.util';

describe('catalog-hours util', () => {
  it('round2 to 2 decimals', () => {
    assert.equal(round2(1.234), 1.23);
    assert.equal(round2(1.235), 1.24);
  });

  it('eachUtcDate inclusive range', () => {
    const days = eachUtcDate(
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 0, 3)),
    );
    assert.equal(days.length, 3);
  });

  it('planNormHours subtracts lunch for 8h+', () => {
    assert.equal(planNormHours('09:00', '18:00'), 8);
    assert.equal(planNormHours('09:00', '13:00'), 4);
  });
});
