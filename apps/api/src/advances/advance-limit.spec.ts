import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceCommentError, resolveAdvanceLimit, type AdvanceLimitRule } from './advance-limit';

const rule = (p: Partial<AdvanceLimitRule>): AdvanceLimitRule => ({
  id: p.id ?? 'r',
  name: p.name ?? 'rule',
  maxAmount: p.maxAmount ?? 1_000_000,
  roles: p.roles ?? [],
  employeeIds: p.employeeIds ?? [],
  reason: p.reason ?? null,
  isActive: p.isActive ?? true,
});

describe('resolveAdvanceLimit', () => {
  const rules = [
    rule({ id: 'all', maxAmount: 500_000 }),
    rule({ id: 'staff', roles: ['employee'], maxAmount: 1_000_000 }),
    rule({ id: 'staff-strict', roles: ['employee', 'manager'], maxAmount: 800_000 }),
    rule({ id: 'vip', employeeIds: ['e1'], maxAmount: 3_000_000 }),
    rule({ id: 'off', employeeIds: ['e2'], maxAmount: 10, isActive: false }),
  ];

  it('prefers an employee rule over role and everyone rules', () => {
    assert.equal(resolveAdvanceLimit(rules, { employeeId: 'e1', role: 'employee' })?.id, 'vip');
  });

  it('takes the smallest cap among matching role rules', () => {
    const r = resolveAdvanceLimit(rules, { employeeId: 'e2', role: 'employee' });
    assert.deepEqual([r?.id, r?.scope], ['staff-strict', 'role']);
  });

  it('falls back to the everyone rule, or none', () => {
    assert.equal(resolveAdvanceLimit(rules, { employeeId: 'e3', role: 'hr' })?.scope, 'all');
    assert.equal(resolveAdvanceLimit([], { employeeId: 'e3', role: 'hr' }), null);
  });
});

describe('advanceCommentError', () => {
  const limit = { id: 'x', name: 'x', maxAmount: 1_000_000, reason: null, scope: 'all' as const };

  it('needs no comment at or below the cap', () => {
    assert.equal(advanceCommentError(1_000_000, '', limit), null);
    assert.equal(advanceCommentError(5_000_000, '', null), null);
  });

  it('requires a real comment above the cap', () => {
    assert.ok(advanceCommentError(1_000_001, '  ok ', limit));
    assert.equal(advanceCommentError(1_000_001, 'Davolanish uchun', limit), null);
  });
});
