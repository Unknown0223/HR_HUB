export const PERSON_DOC_FIELD_IDS = [
  'person',
  'docType',
  'series',
  'number',
  'issuer',
  'issuedAt',
  'startsAt',
  'expiresAt',
  'isValid',
  'status',
  'note',
] as const;

export function normalizePersonDocsImport(raw: unknown): {
  startRow: number;
  personKey: 'fio' | 'code';
  fields: string[];
} {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const startRow = Number(obj.startRow);
  const ids = new Set<string>(PERSON_DOC_FIELD_IDS);
  const fields = Array.isArray(obj.fields)
    ? obj.fields.map((x) => String(x)).filter((x) => ids.has(x))
    : [];
  for (const id of PERSON_DOC_FIELD_IDS) if (!fields.includes(id)) fields.push(id);
  return {
    startRow: Number.isFinite(startRow) && startRow >= 1 ? Math.floor(startRow) : 2,
    personKey: obj.personKey === 'code' ? 'code' : 'fio',
    fields,
  };
}

export function normFio(s: string): string {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fioVariants(last: string, first: string, middle?: string | null): string[] {
  const l = normFio(last);
  const f = normFio(first);
  const m = normFio(middle || '');
  const out = new Set<string>();
  if (l && f) {
    out.add([l, f, m].filter(Boolean).join(' '));
    out.add([f, l, m].filter(Boolean).join(' '));
    out.add([l, f].join(' '));
    out.add([f, l].join(' '));
  }
  return [...out];
}

export function parseImportDate(raw: string): Date | undefined {
  const t = String(raw || '').trim();
  if (!t) return undefined;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const dmy = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const n = Number(t.replace(',', '.'));
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + n * 86400000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(t);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}

export function parseYesNo(raw: string): boolean | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (['да', 'yes', 'true', '1', 'a', 'y', 'актив'].includes(s) || s.startsWith('да')) return true;
  if (['нет', 'no', 'false', '0', 'p', 'n'].includes(s) || s.startsWith('нет')) return false;
  return null;
}
