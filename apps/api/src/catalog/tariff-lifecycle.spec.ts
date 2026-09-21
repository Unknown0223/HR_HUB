import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** Pure status rules mirrored from TariffCatalogService (no DB). */
function canApprove(
  status: string,
  hasGroup: boolean,
  hasEffectiveAt: boolean,
): { ok: true } | { ok: false; message: string } {
  if (status === 'approved') {
    return { ok: false, message: 'Tariff approval already approved' };
  }
  if (status === 'rejected') {
    return { ok: false, message: 'Rejected tariff approval cannot be approved' };
  }
  if (!hasGroup) {
    return { ok: false, message: 'Тарифная группа обязательна' };
  }
  if (!hasEffectiveAt) {
    return { ok: false, message: 'Дата «Вступает в силу с» обязательна' };
  }
  return { ok: true };
}

function canReject(
  status: string,
): { ok: true } | { ok: false; message: string } {
  if (status === 'approved') {
    return { ok: false, message: 'Approved tariff approval cannot be rejected' };
  }
  if (status === 'rejected') {
    return { ok: false, message: 'Tariff approval already rejected' };
  }
  return { ok: true };
}

describe('tariff lifecycle rules', () => {
  it('approve requires group + effectiveAt', () => {
    assert.equal(canApprove('draft', false, true).ok, false);
    assert.equal(canApprove('draft', true, false).ok, false);
    assert.deepEqual(canApprove('draft', true, true), { ok: true });
  });

  it('approve rejects terminal states', () => {
    assert.equal(canApprove('approved', true, true).ok, false);
    assert.equal(canApprove('rejected', true, true).ok, false);
  });

  it('reject rejects approved / already rejected', () => {
    assert.equal(canReject('approved').ok, false);
    assert.equal(canReject('rejected').ok, false);
    assert.deepEqual(canReject('draft'), { ok: true });
  });
});
