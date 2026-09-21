import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules mirrored from HrChangesCatalogService (no DB). */
function canPostNameWage(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'posted') {
    return { ok: false, message: 'already posted' };
  }
  if (status === 'cancelled') {
    return { ok: false, message: 'cancelled cannot be posted' };
  }
  return { ok: true };
}

function canCancelNameWage(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'posted') {
    return { ok: false, message: 'posted must reverse via unpost' };
  }
  if (status === 'cancelled') {
    return { ok: false, message: 'already cancelled' };
  }
  return { ok: true };
}

describe('hr changes lifecycle rules', () => {
  it('post rejects posted / cancelled', () => {
    assert.equal(canPostNameWage('posted').ok, false);
    assert.equal(canPostNameWage('cancelled').ok, false);
    assert.deepEqual(canPostNameWage('draft'), { ok: true });
  });

  it('cancel rejects posted / already cancelled', () => {
    assert.equal(canCancelNameWage('posted').ok, false);
    assert.equal(canCancelNameWage('cancelled').ok, false);
    assert.deepEqual(canCancelNameWage('draft'), { ok: true });
  });
});
