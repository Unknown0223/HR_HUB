import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePinflDigits,
  parsePassportOcrText,
  parseTd1,
  parseTd3,
} from './passport-ocr';

describe('passport-ocr', () => {
  it('parses old UZ passport MRZ TD3', () => {
    const l1 = 'P<UZBKARIMOV<<ALI<VALI<<<<<<<<<<<<<<<<<<<<<<';
    const l2 = 'AA12345671UZB9001011M3001015<<<<<<<<<<<<<<06';
    const p = parseTd3(l1, l2);
    assert.ok(p);
    assert.equal(p!.docType, 'PASSPORT');
    assert.equal(p!.lastName, 'Karimov');
    assert.equal(p!.firstName, 'Ali');
    assert.equal(p!.middleName, 'Vali');
    assert.equal(p!.series, 'AA');
    assert.equal(p!.docNumber, '1234567');
    assert.equal(p!.birthDate, '1990-01-01');
    assert.equal(p!.gender, 'male');
    assert.equal(p!.expiresAt, '2030-01-01');
  });

  it('extracts PINFL from real UZ biometric MRZ (Utamurodov)', () => {
    const l1 = 'P<UZBUTAMURODOV<<JASURBEK<<<<<<<<<<<<<<<<<<<<<<<';
    const l2 = 'AC16268638UZB0302081M29021425080203866002648';
    const p = parseTd3(l1, l2);
    assert.ok(p);
    assert.equal(p!.series, 'AC');
    assert.equal(p!.docNumber, '1626863');
    assert.equal(p!.birthDate, '2003-02-08');
    assert.equal(p!.pinfl, '50802038660026');
  });

  it('strips last 2 check digits from biometric PINFL (16→14)', () => {
    assert.equal(normalizePinflDigits('3010199012345699'), '30101990123456');
    assert.equal(normalizePinflDigits('301019901234569'), '30101990123456');
    assert.equal(normalizePinflDigits('30101990123456'), '30101990123456');
  });

  it('parses UZ ID-card MRZ TD1 with PINFL in optional data', () => {
    const l1 = 'IDUZBAA9876547X30101990123456<';
    const l2 = '9001011M3001015UZB<<<<<<<<<<<6';
    const l3 = 'KARIMOVA<<DILNOZA<<<<<<<<<<<<<';
    const p = parseTd1(l1, l2, l3);
    assert.ok(p);
    assert.equal(p!.docType, 'ID_CARD');
    assert.equal(p!.docKind, 'id_card');
    assert.equal(p!.lastName, 'Karimova');
    assert.equal(p!.firstName, 'Dilnoza');
    assert.equal(p!.series, 'AA');
    assert.equal(p!.docNumber, '9876547');
    assert.equal(p!.birthDate, '1990-01-01');
    assert.equal(p!.pinfl, '30101990123456');
  });

  it('extracts PINFL and series from noisy OCR text', () => {
    const l1 = 'P<UZBBOTIROV<<ANVAR<<<<<<<<<<<<<<<<<<<<<<<<<<';
    const l2 = 'AA12345671UZB9001011M3001015<<<<<<<<<<<<<<06';
    const text = `
Фамилия: BOTIROV
Имя: ANVAR
ПИНФЛ 30101990123456
Паспорт AA 1234567
Дата рождения 01.01.1990
${l1}
${l2}
`;
    const r = parsePassportOcrText(text);
    assert.equal(r.pinfl, '30101990123456');
    assert.equal(r.docType, 'PASSPORT');
    assert.equal(r.series, 'AA');
    assert.equal(r.docNumber, '1234567');
    assert.ok(r.confidence === 'high' || r.confidence === 'medium');
    assert.ok(r.lastName.toLowerCase().includes('botirov'));
  });

  it('extracts JSHSHIR label with trailing extras', () => {
    const text = 'ЖШШИР: 3010199012345699 Фамилия: TEST';
    const r = parsePassportOcrText(text);
    assert.equal(r.pinfl, '30101990123456');
  });

  it('extracts patronymic from UZ visual zone (not in MRZ)', () => {
    const text = `
FAMILIYASI UTAMURODOV
ISMI JASURBEK
OTASINING ISMI SHERALI O'G'LI
TUG'ILGAN SANASI 08 02 2003
P<UZBUTAMURODOV<<JASURBEK<<<<<<<<<<<<<<<<<<<<<<<
AC16268638UZB0302081M29021425080203866002648
`;
    const r = parsePassportOcrText(text);
    assert.equal(r.pinfl, '50802038660026');
    assert.match(r.middleName.toUpperCase(), /SHERALI/);
    assert.match(r.middleName.toUpperCase(), /G.?LI/);
  });
});
