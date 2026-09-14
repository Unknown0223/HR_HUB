/**
 * Match dismissed employees for rehire detection (create-employee flow).
 * Pure helpers are unit-tested; DB access stays in EmployeesService.
 */

export type MatchKind =
  | 'exact_pinfl'
  | 'exact_passport'
  | 'fio_birth'
  | 'fio_approx';

export const MATCH_KIND_SCORE: Record<MatchKind, number> = {
  exact_pinfl: 100,
  exact_passport: 90,
  fio_birth: 70,
  fio_approx: 40,
};

export const MATCH_KIND_LABEL_RU: Record<MatchKind, string> = {
  exact_pinfl: 'ПИНФЛ',
  exact_passport: 'Паспорт',
  fio_birth: 'ФИО + дата рождения',
  fio_approx: 'ФИО (приблизительно)',
};

export type MatchFormerQuery = {
  pinfl?: string;
  passportSeries?: string;
  passportNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  birthDate?: string;
};

export type MatchFormerCandidate = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
  status: string;
  hiredAt: string | null;
  dismissedAt: string | null;
  division: string | null;
  position: string | null;
  pinfl: string | null;
  passport: string | null;
  birthDate: string | null;
  lastName: string;
  firstName: string;
  middleName: string | null;
};

export type MatchFormerHit = {
  employeeId: string;
  fullName: string;
  tabNumber: string;
  status: string;
  hiredAt: string | null;
  dismissedAt: string | null;
  division: string | null;
  position: string | null;
  pinflMasked: string | null;
  passportMasked: string | null;
  birthDate: string | null;
  matchKind: MatchKind;
  matchLabel: string;
  score: number;
};

export function normalizeText(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizePinfl(raw: string | null | undefined): string {
  return String(raw || '').replace(/\D/g, '');
}

export function normalizePassport(
  series: string | null | undefined,
  number: string | null | undefined,
): string {
  const joined = [series, number].filter(Boolean).join('');
  return String(joined || '')
    .toUpperCase()
    .replace(/[\s\-–—._]/g, '');
}

export function normalizePassportBlob(raw: string | null | undefined): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s\-–—._]/g, '');
}

export function toYmd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function maskPinfl(pinfl: string | null | undefined): string | null {
  const p = normalizePinfl(pinfl);
  if (!p) return null;
  if (p.length <= 4) return '****';
  return `${p.slice(0, 4)}******${p.slice(-4)}`;
}

export function maskPassport(passport: string | null | undefined): string | null {
  const p = normalizePassportBlob(passport);
  if (!p) return null;
  if (p.length <= 4) return '****';
  return `${p.slice(0, 2)}***${p.slice(-3)}`;
}

function fioKey(
  lastName: string,
  firstName: string,
  middleName?: string | null,
  includeMiddle = true,
): string {
  const parts = [normalizeText(lastName), normalizeText(firstName)];
  if (includeMiddle) {
    const m = normalizeText(middleName);
    if (m) parts.push(m);
  }
  return parts.filter(Boolean).join('|');
}

/** Rank a single candidate against the query; null if no match. */
export function rankCandidate(
  query: MatchFormerQuery,
  cand: MatchFormerCandidate,
): { matchKind: MatchKind; score: number } | null {
  const qPinfl = normalizePinfl(query.pinfl);
  const cPinfl = normalizePinfl(cand.pinfl);
  if (qPinfl.length >= 10 && cPinfl && qPinfl === cPinfl) {
    return { matchKind: 'exact_pinfl', score: MATCH_KIND_SCORE.exact_pinfl };
  }

  const qPass = normalizePassport(query.passportSeries, query.passportNumber);
  const cPass = normalizePassportBlob(cand.passport);
  if (qPass.length >= 6 && cPass && (cPass === qPass || cPass.includes(qPass) || qPass.includes(cPass))) {
    return { matchKind: 'exact_passport', score: MATCH_KIND_SCORE.exact_passport };
  }

  const qLast = normalizeText(query.lastName);
  const qFirst = normalizeText(query.firstName);
  if (!qLast || !qFirst) return null;

  const fullKey = fioKey(cand.lastName, cand.firstName, cand.middleName, true);
  const qFull = fioKey(query.lastName!, query.firstName!, query.middleName, true);
  const shortKey = fioKey(cand.lastName, cand.firstName, null, false);
  const qShort = fioKey(query.lastName!, query.firstName!, null, false);

  const fioExact =
    fullKey === qFull ||
    shortKey === qShort ||
    (normalizeText(cand.lastName) === qLast &&
      normalizeText(cand.firstName) === qFirst);

  if (!fioExact) return null;

  const qBirth = toYmd(query.birthDate);
  const cBirth = toYmd(cand.birthDate);
  if (qBirth && cBirth && qBirth === cBirth) {
    return { matchKind: 'fio_birth', score: MATCH_KIND_SCORE.fio_birth };
  }

  return { matchKind: 'fio_approx', score: MATCH_KIND_SCORE.fio_approx };
}

export function buildMatchHits(
  query: MatchFormerQuery,
  candidates: MatchFormerCandidate[],
  limit = 5,
): MatchFormerHit[] {
  const scored: MatchFormerHit[] = [];
  for (const cand of candidates) {
    const rank = rankCandidate(query, cand);
    if (!rank) continue;
    scored.push({
      employeeId: cand.employeeId,
      fullName: cand.fullName,
      tabNumber: cand.tabNumber,
      status: cand.status,
      hiredAt: cand.hiredAt,
      dismissedAt: cand.dismissedAt,
      division: cand.division,
      position: cand.position,
      pinflMasked: maskPinfl(cand.pinfl),
      passportMasked: maskPassport(cand.passport),
      birthDate: cand.birthDate,
      matchKind: rank.matchKind,
      matchLabel: MATCH_KIND_LABEL_RU[rank.matchKind],
      score: rank.score,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName, 'ru'));
  const best = scored[0]?.score ?? 0;
  // Prefer top tier: if any exact_* exist, drop weaker unless same employee already listed.
  const exactBest = best >= MATCH_KIND_SCORE.exact_passport;
  const filtered = exactBest
    ? scored.filter((h) => h.score >= MATCH_KIND_SCORE.exact_passport)
    : scored;
  const seen = new Set<string>();
  const out: MatchFormerHit[] = [];
  for (const h of filtered) {
    if (seen.has(h.employeeId)) continue;
    seen.add(h.employeeId);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

export function queryHasMatchSignal(query: MatchFormerQuery): boolean {
  if (normalizePinfl(query.pinfl).length >= 10) return true;
  if (normalizePassport(query.passportSeries, query.passportNumber).length >= 6) {
    return true;
  }
  if (normalizeText(query.lastName) && normalizeText(query.firstName)) return true;
  return false;
}

export function isExactMatchKind(kind: MatchKind): boolean {
  return kind === 'exact_pinfl' || kind === 'exact_passport';
}
