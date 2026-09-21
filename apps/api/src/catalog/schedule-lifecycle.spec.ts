import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules for schedule/timesheet docs (no DB). */
function canPostDoc(
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

function canCancelDoc(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'cancelled') {
    return { ok: false, message: 'already cancelled' };
  }
  return { ok: true };
}

function canBulkShiftAction(action: string): boolean {
  return ['cancel', 'complete', 'delete', 'plan'].includes(action);
}

describe('schedule / timesheet lifecycle rules', () => {
  it('post rejects posted / cancelled', () => {
    assert.equal(canPostDoc('posted').ok, false);
    assert.equal(canPostDoc('cancelled').ok, false);
    assert.deepEqual(canPostDoc('draft'), { ok: true });
  });

  it('cancel rejects already cancelled', () => {
    assert.equal(canCancelDoc('cancelled').ok, false);
    assert.deepEqual(canCancelDoc('posted'), { ok: true });
    assert.deepEqual(canCancelDoc('draft'), { ok: true });
  });

  it('bulk shift actions whitelist', () => {
    assert.equal(canBulkShiftAction('cancel'), true);
    assert.equal(canBulkShiftAction('plan'), true);
    assert.equal(canBulkShiftAction('archive'), false);
  });
});
