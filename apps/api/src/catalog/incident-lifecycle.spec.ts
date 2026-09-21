import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transitionIncidentStatus } from './incident-lifecycle';

describe('transitionIncidentStatus', () => {
  it('open → investigate / resolve / close', () => {
    assert.deepEqual(transitionIncidentStatus('open', 'investigate'), {
      ok: true,
      status: 'investigating',
      setResolvedAt: false,
    });
    assert.deepEqual(transitionIncidentStatus('open', 'resolve'), {
      ok: true,
      status: 'resolved',
      setResolvedAt: true,
    });
    assert.deepEqual(transitionIncidentStatus('open', 'close'), {
      ok: true,
      status: 'closed',
      setResolvedAt: false,
    });
  });

  it('resolved → close only', () => {
    assert.equal(transitionIncidentStatus('resolved', 'resolve').ok, false);
    assert.equal(transitionIncidentStatus('resolved', 'investigate').ok, false);
    assert.deepEqual(transitionIncidentStatus('resolved', 'close'), {
      ok: true,
      status: 'closed',
      setResolvedAt: false,
    });
  });

  it('closed is terminal', () => {
    assert.equal(transitionIncidentStatus('closed', 'resolve').ok, false);
    assert.equal(transitionIncidentStatus('closed', 'close').ok, false);
    assert.equal(transitionIncidentStatus('closed', 'investigate').ok, false);
  });
});
