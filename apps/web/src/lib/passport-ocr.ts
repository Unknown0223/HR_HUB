/**
 * Uzbekistan passport / ID-card field extraction from OCR text.
 * Supports:
 * - old booklet biometric passport (MRZ TD3) — 1 image, PINFL in personal-number field
 * - new ID-card (MRZ TD1) — typically front+back images
 *
 * PINFL (JSHSHIR): 14 digits. Biometric MRZ may append 1–2 check digits;
 * strip trailing extras and keep 14.
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

/**
 * Normalize PINFL / JSHSHIR to exactly 14 digits.
 * Biometric MRZ often has 14 + 1–2 trailing check digits → drop last 2 when ≥16,
 * or drop 1 when length is 15.
 */
export function looksLikePinfl(digits: string): boolean {
  if (!/^[1-6]\d{13}$/.test(digits)) return false;
  const dd = Number(digits.slice(1, 3));
  const mm = Number(digits.slice(3, 5));
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
}

export function normalizePinflDigits(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 14) return looksLikePinfl(digits) ? digits : digits;
  if (digits.length === 15) {
    const a = digits.slice(0, 14);
    return looksLikePinfl(a) ? a : a;
  }
  if (digits.length >= 16) {
    const trimmed = digits.slice(0, -2);
    const cand = trimmed.length >= 14 ? trimmed.slice(0, 14) : trimmed;
    if (looksLikePinfl(cand)) return cand;
    // Prefer embedded plausible PINFL inside the digit string
    const embedded = digits.match(/[1-6]\d{13}/g) || [];
    for (const e of embedded) {
      if (looksLikePinfl(e)) return e;
    }
    return cand;
  }
  const embedded = digits.match(/[1-6]\d{13}/g) || [];
  for (const e of embedded) {
    if (looksLikePinfl(e)) return e;
  }
  return '';
}

/** Find MRZ-looking lines in noisy OCR text. */
export function extractMrzLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => onlyAlnum(l.replace(/\s+/g, '')))
    .filter((l) => l.length >= 28);
  const out: string[] = [];
  for (const l of lines) {
    // OCR may pad extra '<' beyond ICAO 30/44 — accept and truncate
    if (/^[A-Z0-9<]{28,60}$/.test(l)) {
      const capped = l.length > 44 && (l.startsWith('P') || l.startsWith('IP'))
        ? l.slice(0, 44)
        : l.length > 44 && !l.startsWith('P') && !l.startsWith('I') && !l.startsWith('A') && !l.startsWith('C')
          ? l.slice(0, 44)
          : l.startsWith('I') || l.startsWith('A') || (l.startsWith('C') && !l.startsWith('AC') && !l.startsWith('AA'))
            ? l.slice(0, 30)
            : l.slice(0, 44);
      // Document number lines often start with series letters (AC/AA) — keep 44 for TD3 line2
      const line =
        /^[A-Z]{2}\d{7}/.test(l) || /^[A-Z0-9]{9}\d?[A-Z]{3}\d{6}/.test(l)
          ? l.slice(0, 44)
          : capped;
      out.push(line);
    }
  }
  // Prefer P</I lines first, then number lines
  out.sort((a, b) => {
    const score = (x: string) =>
      x.startsWith('P') || x.startsWith('IP') ? 0 : x.startsWith('I') ? 1 : 2;
    return score(a) - score(b);
  });
  return out;
}

function pinflFromTd3Line2(l2: string): string {
  // ICAO: personal number positions 29–42 (1-based) = slice(28, 42);
  // include trailing check digit(s) OCR may glue on (43–44).
  const personal = l2.slice(28, 44).replace(/</g, '');
  let pinfl = normalizePinflDigits(personal);
  if (pinfl) return pinfl;

  // Tail may be longer/shorter if OCR dropped '<' fillers
  const tailDigits = l2.slice(28).replace(/\D/g, '');
  pinfl = normalizePinflDigits(tailDigits);
  if (pinfl) return pinfl;

  // After sex + expiry(+check): capture 14–16 digit PINFL block
  const m = l2.match(/[MF]\d{6}\d(\d{14,16})/);
  if (m) {
    pinfl = normalizePinflDigits(m[1]);
    if (pinfl) return pinfl;
  }

  // Last digit run on the line (often PINFL + 2 checks)
  const runs = l2.match(/\d{14,16}/g);
  if (runs?.length) {
    // Prefer a run whose digits 2–7 look like DDMMYY
    for (let i = runs.length - 1; i >= 0; i--) {
      const cand = normalizePinflDigits(runs[i]);
      if (!cand) continue;
      const dd = Number(cand.slice(1, 3));
      const mm = Number(cand.slice(3, 5));
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) return cand;
    }
    return normalizePinflDigits(runs[runs.length - 1]);
  }
  return '';
}

function pinflFromTd1(l1: string, l2: string): string {
  const opt1 = l1.slice(15, 30).replace(/</g, '');
  const opt2 = l2.slice(18, 29).replace(/</g, '');
  return (
    normalizePinflDigits(opt1) ||
    normalizePinflDigits(opt2) ||
    normalizePinflDigits(`${opt1}${opt2}`)
  );
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
  const pinfl = pinflFromTd3Line2(l2);
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
    pinfl,
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
  const pinfl = pinflFromTd1(l1, l2);
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
    pinfl,
    mrzRaw: `${l1}\n${l2}\n${l3}`,
    confidence: 'high',
    issuer: 'IIV',
  };
}

function findPinfl(text: string): string {
  const labeled = text
    .replace(/\s+/g, ' ')
    .match(
      /(?:ПИНФЛ|PINFL|JSHSHIR|ЖШШИР|JSHR|ЖШР|Ж\.?\s*Ш\.?\s*Ш\.?\s*И\.?\s*Р)\s*[:\-№#]?\s*([\d\s]{14,22})/i,
    );
  if (labeled) {
    const n = normalizePinflDigits(labeled[1]);
    if (n && looksLikePinfl(n)) return n;
    if (n) return n;
  }
  const runs = text.match(/\d{14,20}/g) || [];
  const plausible: string[] = [];
  for (const run of runs) {
    const n = normalizePinflDigits(run);
    if (n && looksLikePinfl(n)) plausible.push(n);
  }
  if (plausible.length) return plausible[plausible.length - 1];
  for (const run of runs) {
    const n = normalizePinflDigits(run);
    if (n) return n;
  }
  return '';
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
  const block = text.replace(/\r/g, '\n');
  const stop = String.raw`(?=\s*(?:TUG|ТУГ|MILLAT|JINS|KIM|ISMI|FAMILIYASI|OTASINING|ПИНФЛ|PINFL|\n[A-ZА-Я]{3,}|\nP<)|$)`;
  const last =
    block.match(
      new RegExp(
        String.raw`(?:Familiyasi|FAMILIYASI|Фамилия|Surname)\s*[:\-]?\s*([A-ZА-ЯЁЎҒҚҲʻʼ''\-]{2,40})`,
        'i',
      ),
    )?.[1] || '';
  const first =
    block.match(
      new RegExp(
        String.raw`(?:(?:^|\n)\s*Ismi|ISMI|Имя|Given names?|GIVEN NAMES?)\s*[:\-]?\s*([A-ZА-ЯЁЎҒҚҲʻʼ''\-]{2,40})`,
        'i',
      ),
    )?.[1] || '';
  const middle =
    block.match(
      new RegExp(
        String.raw`(?:Otasining\s*ismi|OTASINING\s*ISMI|Отчество|Father'?s?\s*name)\s*[:\-]?\s*([A-ZА-ЯЁЎҒҚҲʻʼ''Oʻ\-\s]{2,45}?)${stop}`,
        'i',
      ),
    )?.[1] ||
    block.match(/\b([A-ZА-ЯЁЎҒҚҲʻʼ']{2,30}\s+O[ʻ'`]?G[ʻ'`]?LI)\b/i)?.[1] ||
    block.match(/\b([A-ZА-ЯЁЎҒҚҲʻʼ']{2,30}\s+QIZI)\b/i)?.[1] ||
    '';
  const clean = (s: string) =>
    s
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(
        (w) =>
          !/^(FAMILIYASI|ISMI|OTASINING|SURNAME|NAME|TUG.?ILGAN|SANASI)$/i.test(w),
      )
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
  const short = mrz.filter((l) => l.length >= 28 && l.length <= 36);
  const long = mrz.filter((l) => l.length >= 40);
  if (short.length >= 3) {
    fromMrz = parseTd1(short[0], short[1], short[2]);
  }
  if (!fromMrz && long.length >= 2) {
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

  // Prefer MRZ personal-number PINFL; only fall back to OCR text search if empty
  if (!result.pinfl) {
    const pinfl = findPinfl(raw);
    if (pinfl) result.pinfl = pinfl;
  } else {
    result.pinfl = normalizePinflDigits(result.pinfl) || result.pinfl;
  }

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
    result.confidence = filled >= 4 ? 'medium' : 'low';
  } else if (filled < 3) {
    result.confidence = 'medium';
  }

  return result;
}

/** Merge OCR results from multiple sides (ID front+back). */
export function mergePassportScanFields(
  ...parts: Array<Partial<PassportScanFields> | null | undefined>
): PassportScanFields {
  const result: PassportScanFields = { ...EMPTY };
  for (const p of parts) {
    if (!p) continue;
    for (const key of Object.keys(EMPTY) as Array<keyof PassportScanFields>) {
      const v = p[key];
      if (v == null || v === '') continue;
      if (key === 'mrzRaw') {
        result.mrzRaw = result.mrzRaw
          ? `${result.mrzRaw}\n---\n${String(v)}`
          : String(v);
        continue;
      }
      if (key === 'confidence') {
        const rank = { high: 3, medium: 2, low: 1 } as const;
        const cur = rank[result.confidence];
        const next = rank[v as PassportScanFields['confidence']] || 0;
        if (next > cur) result.confidence = v as PassportScanFields['confidence'];
        continue;
      }
      if (key === 'pinfl') {
        const n = normalizePinflDigits(String(v));
        if (n && !result.pinfl) result.pinfl = n;
        continue;
      }
      if (!result[key]) {
        (result as Record<string, unknown>)[key] = v;
      }
    }
  }
  if (result.docKind === 'id_card') result.docType = 'ID_CARD';
  if (result.docKind === 'passport_book') result.docType = 'PASSPORT';
  return result;
}
