import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules mirrored from GphCatalogService (no DB). */
function canActivate(isActive: boolean): { ok: true } | { ok: false } {
  if (isActive) return { ok: false };
  return { ok: true };
}

function canClose(isActive: boolean): { ok: true } | { ok: false } {
  if (!isActive) return { ok: false };
  return { ok: true };
}

function canPost(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'posted') {
    return { ok: false, message: 'GPH contract already posted' };
  }
  if (status === 'cancelled') {
    return { ok: false, message: 'Cancelled GPH contract cannot be posted' };
  }
  return { ok: true };
}

function canUnpost(status: string): { ok: true } | { ok: false } {
  if (status !== 'posted') return { ok: false };
  return { ok: true };
}

describe('gph lifecycle rules', () => {
  it('activate rejects already active', () => {
    assert.equal(canActivate(true).ok, false);
    assert.deepEqual(canActivate(false), { ok: true });
  });

  it('close rejects already closed', () => {
    assert.equal(canClose(false).ok, false);
    assert.deepEqual(canClose(true), { ok: true });
  });

  it('post rejects posted / cancelled', () => {
    assert.equal(canPost('posted').ok, false);
    assert.equal(canPost('cancelled').ok, false);
    assert.deepEqual(canPost('draft'), { ok: true });
  });

  it('unpost only from posted', () => {
    assert.equal(canUnpost('draft').ok, false);
    assert.deepEqual(canUnpost('posted'), { ok: true });
  });
});
