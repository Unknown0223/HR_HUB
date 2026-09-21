import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Router kind → report method mapping (mirror of fetchAnalytics). */
const ANALYTICS_KINDS = [
  'division-stats',
  'year-summary',
  'staffing',
  'gender',
  'attendance-overview',
  'fot',
  'payroll-grouped',
] as const;

describe('reports catalog slice', () => {
  it('exposes core analytics kinds', () => {
    assert.ok(ANALYTICS_KINDS.includes('staffing'));
    assert.ok(ANALYTICS_KINDS.includes('fot'));
    assert.equal(ANALYTICS_KINDS.length >= 5, true);
  });

  it('kind names are kebab-case', () => {
    for (const k of ANALYTICS_KINDS) {
      assert.match(k, /^[a-z]+(-[a-z]+)*$/);
    }
  });
});
