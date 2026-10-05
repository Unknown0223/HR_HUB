import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickKioskIdentity } from './kiosk-identify';

describe('pickKioskIdentity', () => {
  const t = 0.45;

  it('accepts a single clear winner', () => {
    const r = pickKioskIdentity(
      [
        { employeeId: 'a', score: 0.31 },
        { employeeId: 'b', score: 0.72 },
        { employeeId: 'c', score: 0.4 },
      ],
      t,
    );
    assert.equal(r.status, 'match');
    assert.equal(r.best?.employeeId, 'b');
  });

  it('refuses when nobody reaches the threshold', () => {
    const r = pickKioskIdentity([{ employeeId: 'a', score: 0.44 }], t);
    assert.equal(r.status, 'unknown');
    assert.equal(pickKioskIdentity([], t).status, 'unknown');
  });

  it('refuses a near tie between two teammates', () => {
    const r = pickKioskIdentity(
      [
        { employeeId: 'a', score: 0.61 },
        { employeeId: 'b', score: 0.58 },
      ],
      t,
    );
    assert.equal(r.status, 'ambiguous');
  });

  it('accepts a close runner-up that is below the threshold', () => {
    const r = pickKioskIdentity(
      [
        { employeeId: 'a', score: 0.47 },
        { employeeId: 'b', score: 0.44 },
      ],
      t,
    );
    assert.equal(r.status, 'match');
    assert.equal(r.best?.employeeId, 'a');
  });
});
