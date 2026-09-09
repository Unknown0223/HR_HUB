import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
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

  it('parses UZ ID-card MRZ TD1', () => {
    const l1 = 'IDUZBAA9876547<<<<<<<<<<<<<<<';
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
    assert.equal(p!.gender, 'male');
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
});
