import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules mirrored from ClearanceCatalogService (no DB). */
function canComplete(
  status: string,
  pendingCount: number,
): { ok: true } | { ok: false; message: string } {
  if (status === 'completed') {
    return { ok: false, message: 'Clearance already completed' };
  }
  if (status === 'cancelled') {
    return { ok: false, message: 'Cancelled clearance cannot be completed' };
  }
  if (pendingCount > 0) {
    return {
      ok: false,
      message: `Cannot complete: ${pendingCount} item(s) still pending`,
    };
  }
  return { ok: true };
}

function canCancel(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'completed') {
    return { ok: false, message: 'Completed clearance cannot be cancelled' };
  }
  if (status === 'cancelled') {
    return { ok: false, message: 'Clearance already cancelled' };
  }
  return { ok: true };
}

describe('clearance lifecycle rules', () => {
  it('complete requires no pending items', () => {
    assert.equal(canComplete('open', 2).ok, false);
    assert.deepEqual(canComplete('open', 0), { ok: true });
  });

  it('complete rejects terminal states', () => {
    assert.equal(canComplete('completed', 0).ok, false);
    assert.equal(canComplete('cancelled', 0).ok, false);
  });

  it('cancel rejects completed / already cancelled', () => {
    assert.equal(canCancel('completed').ok, false);
    assert.equal(canCancel('cancelled').ok, false);
    assert.deepEqual(canCancel('open'), { ok: true });
  });
});
