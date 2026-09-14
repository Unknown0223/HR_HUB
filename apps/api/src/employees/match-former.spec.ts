import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMatchHits,
  isExactMatchKind,
  normalizePassport,
  normalizePinfl,
  normalizeText,
  queryHasMatchSignal,
  rankCandidate,
  type MatchFormerCandidate,
} from './match-former';

function cand(
  partial: Partial<MatchFormerCandidate> &
    Pick<MatchFormerCandidate, 'employeeId' | 'lastName' | 'firstName'>,
): MatchFormerCandidate {
  return {
    fullName: `${partial.lastName} ${partial.firstName}`,
    tabNumber: 'T1',
    status: 'dismissed',
    hiredAt: '2020-01-01',
    dismissedAt: '2024-01-01',
    division: 'IT',
    position: 'Dev',
    pinfl: null,
    passport: null,
    birthDate: null,
    middleName: null,
    ...partial,
  };
}

describe('match-former helpers', () => {
  it('normalizes pinfl and passport', () => {
    assert.equal(normalizePinfl('3010 1990 123456'), '30101990123456');
    assert.equal(normalizePassport('AA', '1234567'), 'AA1234567');
    assert.equal(normalizeText('  Ali   Karimov '), 'ALI KARIMOV');
  });

  it('ranks exact pinfl highest', () => {
    const r = rankCandidate(
      { pinfl: '30101990123456', lastName: 'X', firstName: 'Y' },
      cand({
        employeeId: '1',
        lastName: 'Other',
        firstName: 'Person',
        pinfl: '30101990123456',
      }),
    );
    assert.equal(r?.matchKind, 'exact_pinfl');
  });

  it('ranks passport and fio+birth', () => {
    const pass = rankCandidate(
      { passportSeries: 'AA', passportNumber: '1234567' },
      cand({
        employeeId: '2',
        lastName: 'Karimov',
        firstName: 'Ali',
        passport: 'AA 1234567',
      }),
    );
    assert.equal(pass?.matchKind, 'exact_passport');

    const fioBirth = rankCandidate(
      {
        lastName: 'Karimov',
        firstName: 'Ali',
        birthDate: '1990-01-15',
      },
      cand({
        employeeId: '3',
        lastName: 'Karimov',
        firstName: 'Ali',
        birthDate: '1990-01-15',
      }),
    );
    assert.equal(fioBirth?.matchKind, 'fio_birth');
  });

  it('ranks fio approx and builds hits preferring exact', () => {
    const approx = rankCandidate(
      { lastName: 'Karimov', firstName: 'Ali' },
      cand({ employeeId: '4', lastName: 'Karimov', firstName: 'Ali' }),
    );
    assert.equal(approx?.matchKind, 'fio_approx');

    const hits = buildMatchHits(
      { pinfl: '30101990123456', lastName: 'Karimov', firstName: 'Ali' },
      [
        cand({
          employeeId: 'a',
          lastName: 'Karimov',
          firstName: 'Ali',
          pinfl: '30101990123456',
        }),
        cand({
          employeeId: 'b',
          lastName: 'Karimov',
          firstName: 'Ali',
        }),
      ],
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].employeeId, 'a');
    assert.ok(isExactMatchKind(hits[0].matchKind));
  });

  it('queryHasMatchSignal', () => {
    assert.equal(queryHasMatchSignal({}), false);
    assert.equal(queryHasMatchSignal({ lastName: 'A', firstName: 'B' }), true);
    assert.equal(queryHasMatchSignal({ pinfl: '30101990123456' }), true);
  });
});
