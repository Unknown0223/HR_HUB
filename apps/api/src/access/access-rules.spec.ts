import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canGrantType, checkGrantInput, grantStatus, grantStatusWhere } from './access-rules';

const NOW = new Date('2026-10-01T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe('grantStatus', () => {
  it('derives revoked / expired / expiring / active', () => {
    assert.equal(grantStatus({ isActive: false, expiresAt: day(30) }, NOW), 'revoked');
    assert.equal(grantStatus({ isActive: true, expiresAt: day(-1) }, NOW), 'expired');
    assert.equal(grantStatus({ isActive: true, expiresAt: NOW }, NOW), 'expired');
    assert.equal(grantStatus({ isActive: true, expiresAt: day(3) }, NOW), 'expiring');
    assert.equal(grantStatus({ isActive: true, expiresAt: day(60) }, NOW), 'active');
    assert.equal(grantStatus({ isActive: true, expiresAt: null }, NOW), 'active');
  });

  it('active filter excludes expired rows', () => {
    assert.deepEqual(grantStatusWhere('active', NOW), {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
    });
    assert.deepEqual(grantStatusWhere('expired', NOW), { isActive: true, expiresAt: { lte: NOW } });
  });
});

describe('canGrantType', () => {
  it('global types need tenant or platform admin', () => {
    assert.equal(canGrantType('hr', 'org_full'), false);
    assert.equal(canGrantType('hr', 'kpe_full'), false);
    assert.equal(canGrantType('tenant_admin', 'org_full'), true);
    assert.equal(canGrantType('platform_admin', 'kpe_full'), true);
  });

  it('managers and employees cannot grant; read-only types are never granted here', () => {
    assert.equal(canGrantType('manager', 'org_custom'), false);
    assert.equal(canGrantType('employee', 'profile_flag'), false);
    assert.equal(canGrantType('hr', 'org_custom'), true);
    assert.equal(canGrantType('tenant_admin', 'location'), false);
    assert.equal(canGrantType('tenant_admin', 'reports_to'), false);
  });
});

describe('checkGrantInput', () => {
  it('normalises global resources to *', () => {
    const r = checkGrantInput({ accessType: 'org_full', resource: 'x' }, 'tenant_admin', NOW);
    assert.deepEqual(r, { ok: true, accessType: 'org_full', resource: '*', expiresAt: null });
  });

  it('rejects unknown types, flags and missing divisions', () => {
    assert.equal(checkGrantInput({ accessType: 'root' }, 'tenant_admin', NOW).ok, false);
    assert.equal(checkGrantInput({ accessType: 'profile_flag', resource: 'nope' }, 'hr', NOW).ok, false);
    assert.equal(checkGrantInput({ accessType: 'org_custom', resource: ' ' }, 'hr', NOW).ok, false);
  });

  it('allows expiry only for org/kpe types and only in the future', () => {
    const past = checkGrantInput(
      { accessType: 'org_custom', resource: 'd1', expiresAt: day(-1).toISOString() },
      'hr',
      NOW,
    );
    assert.equal(past.ok, false);
    const flag = checkGrantInput(
      { accessType: 'profile_flag', resource: 'marks_blocked', expiresAt: day(5).toISOString() },
      'hr',
      NOW,
    );
    assert.equal(flag.ok, false);
    const ok = checkGrantInput(
      { accessType: 'org_subordinate', resource: 'd1', expiresAt: day(5).toISOString() },
      'hr',
      NOW,
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.ok && ok.expiresAt?.toISOString(), day(5).toISOString());
  });
});
