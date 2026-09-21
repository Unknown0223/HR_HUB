import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules mirrored from FinanceCatalogService (no DB). */
function canPostSettlement(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'matched') {
    return { ok: false, message: 'Settlement already matched' };
  }
  if (status === 'closed') {
    return { ok: false, message: 'Closed settlement cannot be posted' };
  }
  return { ok: true };
}

function canCloseSettlement(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'closed') {
    return { ok: false, message: 'Settlement already closed' };
  }
  if (status === 'open') {
    return { ok: false, message: 'Settlement must be matched before closing' };
  }
  return { ok: true };
}

function canSendPayment(
  status: string,
): { ok: true } | { ok: false } {
  if (status === 'open' || status === 'new') return { ok: true };
  return { ok: false };
}

function canPayPayment(status: string): { ok: true } | { ok: false } {
  if (status === 'sent') return { ok: true };
  return { ok: false };
}

describe('finance lifecycle rules', () => {
  it('settlement post/close gates', () => {
    assert.equal(canPostSettlement('matched').ok, false);
    assert.equal(canPostSettlement('closed').ok, false);
    assert.deepEqual(canPostSettlement('open'), { ok: true });
    assert.equal(canCloseSettlement('open').ok, false);
    assert.deepEqual(canCloseSettlement('matched'), { ok: true });
  });

  it('payment order send then pay', () => {
    assert.deepEqual(canSendPayment('open'), { ok: true });
    assert.equal(canSendPayment('sent').ok, false);
    assert.deepEqual(canPayPayment('sent'), { ok: true });
    assert.equal(canPayPayment('open').ok, false);
  });
});
