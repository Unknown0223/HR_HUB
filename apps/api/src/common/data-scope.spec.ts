import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currentEmployeeScope,
  runUnscoped,
  runWithRequestContext,
  scopedEmployeeWhere,
  setRequestScope,
} from './data-scope';

describe('data-scope', () => {
  it('matches nobody when no филиал is assigned', () => {
    assert.deepEqual(scopedEmployeeWhere({ locationIds: [], employeeIds: ['e1'] }), {
      id: { in: [] },
    });
  });

  it('filters by home филиал or a non-visit location grant', () => {
    const where = scopedEmployeeWhere({ locationIds: ['l1'], employeeIds: [] });
    assert.ok('OR' in where && Array.isArray(where.OR));
    assert.deepEqual(where.OR[0], { division: { locationId: { in: ['l1'] } } });
    const grant = JSON.stringify(where.OR[1]);
    assert.match(grant, /"accessType":"location"/);
    assert.match(grant, /"not":"visit"/);
  });

  it('narrows to picked employees inside the филиалы', () => {
    const where = scopedEmployeeWhere({ locationIds: ['l1'], employeeIds: ['e1', 'e2'] });
    assert.ok('AND' in where && Array.isArray(where.AND));
    assert.deepEqual(where.AND[1], { id: { in: ['e1', 'e2'] } });
  });

  it('keeps the scope per request context', async () => {
    assert.equal(currentEmployeeScope(), null);
    await runWithRequestContext(async () => {
      setRequestScope({ locationIds: ['l1'], employeeIds: [] });
      await Promise.resolve();
      assert.deepEqual(currentEmployeeScope(), { locationIds: ['l1'], employeeIds: [] });
    });
    assert.equal(currentEmployeeScope(), null);
  });

  it('runUnscoped hides the scope even for lazily started thenables', async () => {
    await runWithRequestContext(async () => {
      setRequestScope({ locationIds: ['l1'], employeeIds: [] });
      const lazy = { then: (resolve: (v: unknown) => void) => resolve(currentEmployeeScope()) };
      assert.equal(await runUnscoped(() => lazy as PromiseLike<unknown>), null);
      assert.deepEqual(currentEmployeeScope(), { locationIds: ['l1'], employeeIds: [] });
    });
  });
});
