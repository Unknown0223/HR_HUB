/**
 * Uzbekistan passport / ID-card field extraction from OCR text.
 * Supports:
 * - old booklet passport (MRZ TD3, series AA + 7 digits)
 * - biometric ID-card (MRZ TD1)
 */

export type PassportDocKind = 'passport_book' | 'id_card' | 'unknown';

export type PassportScanFields = {
  docKind: PassportDocKind;
  docType: 'PASSPORT' | 'ID_CARD';
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  nationality: string;
  pinfl: string;
  series: string;
  docNumber: string;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  mrzRaw: string;
  confidence: 'high' | 'medium' | 'low';
};

const EMPTY: PassportScanFields = {
  docKind: 'unknown',
  docType: 'PASSPORT',
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  gender: '',
  nationality: '',
  pinfl: '',
  series: '',
  docNumber: '',
  issuedAt: '',
  expiresAt: '',
  issuer: '',
  mrzRaw: '',
  confidence: 'low',
};

function onlyAlnum(s: string) {
  return s.replace(/[^A-Z0-9<]/gi, '').toUpperCase();
}

function titleCaseName(raw: string) {
  const s = raw.replace(/</g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s) return '';
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function yyMmDdToIso(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  const iso = `${year}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

function sexFromMrz(ch: string): string {
  if (ch === 'M') return 'male';
  if (ch === 'F') return 'female';
  return '';
}

function splitNames(nameField: string): {
  lastName: string;
  firstName: string;
  middleName: string;
} {
  const parts = nameField.split('<<').map((p) => p.replace(/</g, ' ').trim());
  const lastName = titleCaseName(parts[0] || '');
  const given = titleCaseName((parts[1] || '').replace(/</g, ' '));
  const givenParts = given.split(/\s+/).filter(Boolean);
  return {
    lastName,
    firstName: givenParts[0] || '',
    middleName: givenParts.slice(1).join(' '),
  };
}

/** Find MRZ-looking lines in noisy OCR text. */
export function extractMrzLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => onlyAlnum(l.replace(/\s+/g, '')))
    .filter((l) => l.length >= 28);
  const out: string[] = [];
  for (const l of lines) {
    if (/^[A-Z0-9<]{28,44}$/.test(l)) out.push(l.slice(0, 44));
  }
  return out;
}

export function parseTd3(line1: string, line2: string): Partial<PassportScanFields> | null {
  const l1 = onlyAlnum(line1).padEnd(44, '<').slice(0, 44);
  const l2 = onlyAlnum(line2).padEnd(44, '<').slice(0, 44);
  if (!(l1.startsWith('P') || l1.startsWith('IP'))) return null;
  const names = splitNames(l1.slice(5));
  const docNumber = l2.slice(0, 9).replace(/</g, '');
  const nationality = l2.slice(10, 13).replace(/</g, '');
  const birthDate = yyMmDdToIso(l2.slice(13, 19));
  const gender = sexFromMrz(l2.charAt(20));
  const expiresAt = yyMmDdToIso(l2.slice(21, 27));
  let series = '';
  let number = docNumber;
  const m = docNumber.match(/^([A-Z]{1,3})(\d{5,9})$/);
  if (m) {
    series = m[1];
    number = m[2];
  }
  return {
    docKind: 'passport_book',
    docType: 'PASSPORT',
    ...names,
    nationality: nationality === 'UZB' ? 'Узбекистан' : nationality,
    birthDate,
    gender,
    expiresAt,
    series,
    docNumber: number || docNumber,
    mrzRaw: `${l1}\n${l2}`,
    confidence: 'high',
    issuer: 'IIV',
  };
}

export function parseTd1(
  line1: string,
  line2: string,
  line3: string,
): Partial<PassportScanFields> | null {
  const l1 = onlyAlnum(line1).padEnd(30, '<').slice(0, 30);
  const l2 = onlyAlnum(line2).padEnd(30, '<').slice(0, 30);
  const l3 = onlyAlnum(line3).padEnd(30, '<').slice(0, 30);
  if (!l1.startsWith('I') && !l1.startsWith('A') && !l1.startsWith('C')) return null;
  const docNumber = l1.slice(5, 14).replace(/</g, '');
  const nationality = l2.slice(15, 18).replace(/</g, '') || l1.slice(2, 5).replace(/</g, '');
  const birthDate = yyMmDdToIso(l2.slice(0, 6));
  const gender = sexFromMrz(l2.charAt(7));
  const expiresAt = yyMmDdToIso(l2.slice(8, 14));
  const names = splitNames(l3);
  let series = '';
  let number = docNumber;
  const m = docNumber.match(/^([A-Z]{1,3})(\d{5,9})$/);
  if (m) {
    series = m[1];
    number = m[2];
  }
  return {
    docKind: 'id_card',
    docType: 'ID_CARD',
    ...names,
    nationality: nationality === 'UZB' ? 'Узбекистан' : nationality,
    birthDate,
    gender,
    expiresAt,
    series,
    docNumber: number || docNumber,
    mrzRaw: `${l1}\n${l2}\n${l3}`,
    confidence: 'high',
    issuer: 'IIV',
  };
}

function findPinfl(text: string): string {
  const m = text.replace(/\s+/g, ' ').match(/\b(\d{14})\b/);
  return m ? m[1] : '';
}

function findBookPassport(text: string): { series: string; docNumber: string } | null {
  const m =
    text.toUpperCase().match(/\b([A-ZА-Я]{2})\s*[-№#:]?\s*(\d{7})\b/) ||
    text.toUpperCase().match(/\b([A-Z]{2})(\d{7})\b/);
  if (!m) return null;
  const series = m[1]
    .replace('А', 'A')
    .replace('В', 'B')
    .replace('С', 'C')
    .replace('Е', 'E')
    .replace('Н', 'H')
    .replace('К', 'K')
    .replace('М', 'M')
    .replace('О', 'O')
    .replace('Р', 'P')
    .replace('Т', 'T')
    .replace('Х', 'X');
  return { series, docNumber: m[2] };
}

function findIsoDates(text: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{2})[./-](\d{2})[./-](\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) {
      out.push(iso);
    }
  }
  return out;
}

function findNamesCyrillic(text: string): Partial<PassportScanFields> {
  // Common labels near FIO on UZ docs
  const block = text.replace(/\r/g, '\n');
  const last =
    block.match(/(?:Familiyasi|Фамилия|Surname)\s*[:\-]?\s*([A-ZА-ЯЁʻʼ'\- ]{2,40})/i)?.[1] ||
    '';
  const first =
    block.match(/(?:Ismi|Имя|Given names?|Name)\s*[:\-]?\s*([A-ZА-ЯЁʻʼ'\- ]{2,40})/i)?.[1] ||
    '';
  const middle =
    block.match(
      /(?:Otasining ismi|Отчество|Father'?s? name)\s*[:\-]?\s*([A-ZА-ЯЁʻʼ'\- ]{2,40})/i,
    )?.[1] || '';
  const clean = (s: string) =>
    s
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  return {
    lastName: clean(last),
    firstName: clean(first),
    middleName: clean(middle),
  };
}

export function parsePassportOcrText(text: string): PassportScanFields {
  const raw = String(text || '');
  const result: PassportScanFields = { ...EMPTY };
  const mrz = extractMrzLines(raw);

  let fromMrz: Partial<PassportScanFields> | null = null;
  // Prefer TD1 (3×~30) then TD3 (2×44)
  const short = mrz.filter((l) => l.length >= 28 && l.length <= 36);
  const long = mrz.filter((l) => l.length >= 40);
  if (short.length >= 3) {
    fromMrz = parseTd1(short[0], short[1], short[2]);
  }
  if (!fromMrz && long.length >= 2) {
    // pick a P< line if present
    const i = long.findIndex((l) => l.startsWith('P') || l.startsWith('IP'));
    if (i >= 0 && long[i + 1]) fromMrz = parseTd3(long[i], long[i + 1]);
    else fromMrz = parseTd3(long[0], long[1]);
  }
  if (!fromMrz && mrz.length >= 3) {
    fromMrz = parseTd1(mrz[0], mrz[1], mrz[2]);
  }
  if (!fromMrz && mrz.length >= 2) {
    fromMrz = parseTd3(mrz[0], mrz[1]);
  }

  if (fromMrz) Object.assign(result, fromMrz);

  const pinfl = findPinfl(raw);
  if (pinfl) result.pinfl = pinfl;

  if (!result.series || !result.docNumber) {
    const book = findBookPassport(raw);
    if (book) {
      result.series = result.series || book.series;
      result.docNumber = result.docNumber || book.docNumber;
      if (result.docKind === 'unknown') {
        result.docKind = 'passport_book';
        result.docType = 'PASSPORT';
      }
    }
  }

  const names = findNamesCyrillic(raw);
  if (!result.lastName && names.lastName) result.lastName = names.lastName;
  if (!result.firstName && names.firstName) result.firstName = names.firstName;
  if (!result.middleName && names.middleName) result.middleName = names.middleName;

  const dates = findIsoDates(raw);
  if (!result.birthDate && dates[0]) result.birthDate = dates[0];
  if (!result.issuedAt && dates.length >= 2) result.issuedAt = dates[1];
  if (!result.expiresAt && dates.length >= 3) result.expiresAt = dates[dates.length - 1];

  if (/ID[\s-]?CARD|ИДЕНТИФИКАЦИОН|ID[- ]?КАРТ/i.test(raw) && result.docKind === 'unknown') {
    result.docKind = 'id_card';
    result.docType = 'ID_CARD';
  }

  if (!result.issuer) {
    if (/IIV|МВД|ICHKI ISHLAR/i.test(raw)) result.issuer = 'IIV';
  }

  const filled = [
    result.lastName,
    result.firstName,
    result.docNumber,
    result.pinfl,
    result.birthDate,
  ].filter(Boolean).length;
  if (!fromMrz) {
    result.confidence = filled >= 4 ? 'medium' : filled >= 2 ? 'low' : 'low';
  } else if (filled < 3) {
    result.confidence = 'medium';
  }

  return result;
}
