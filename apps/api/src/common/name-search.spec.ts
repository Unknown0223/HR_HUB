import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  employeeNameSearchWhere,
  personNameSearchWhere,
  searchTokens,
} from './name-search';

describe('name-search', () => {
  it('splits full FIO into tokens', () => {
    assert.deepEqual(searchTokens('  ABDURADIROV   ILHAM '), [
      'ABDURADIROV',
      'ILHAM',
    ]);
  });

  it('builds AND of per-token OR for employees', () => {
    const where = employeeNameSearchWhere('ABDURADIROV ILHAM');
    assert.ok(where);
    assert.ok(Array.isArray(where.AND));
    assert.equal(where.AND.length, 2);
    const first = where.AND[0] as { OR: unknown[] };
    assert.ok(Array.isArray(first.OR));
    assert.ok(first.OR.length >= 4);
  });

  it('returns undefined for empty query', () => {
    assert.equal(employeeNameSearchWhere('   '), undefined);
    assert.equal(personNameSearchWhere(''), undefined);
  });
});
