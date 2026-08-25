export const PERSON_DOC_FIELDS = [
  { id: 'person', label: 'Физическое лицо' },
  { id: 'docType', label: 'Тип документа' },
  { id: 'series', label: 'Серия документа' },
  { id: 'number', label: 'Номер документа' },
  { id: 'issuer', label: 'Выдано' },
  { id: 'issuedAt', label: 'Дата выдачи' },
  { id: 'startsAt', label: 'Дата начала' },
  { id: 'expiresAt', label: 'Дата истечения' },
  { id: 'isValid', label: 'Действительный' },
  { id: 'status', label: 'Статус' },
  { id: 'note', label: 'Примечание' },
] as const;

export type PersonDocFieldId = (typeof PERSON_DOC_FIELDS)[number]['id'];

export type PersonDocsImportConfig = {
  startRow: number;
  personKey: 'fio' | 'code';
  fields: PersonDocFieldId[];
};

export type PersonDocItem = Partial<Record<PersonDocFieldId, string>>;

export type PersonDocsImportResult = {
  ok: boolean;
  created: number;
  updated: number;
  errors: { line: number; error: string }[];
  items?: { id: string; docNumber: string }[];
};

export function defaultPersonDocsImport(): PersonDocsImportConfig {
  return {
    startRow: 2,
    personKey: 'fio',
    fields: PERSON_DOC_FIELDS.map((f) => f.id),
  };
}

export function normalizePersonDocsImport(raw: unknown): PersonDocsImportConfig {
  const base = defaultPersonDocsImport();
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const startRow = Number(obj.startRow);
  const personKey = obj.personKey === 'code' ? 'code' : 'fio';
  const ids = new Set(PERSON_DOC_FIELDS.map((f) => f.id));
  const fields = Array.isArray(obj.fields)
    ? (obj.fields.filter((x) => ids.has(x as PersonDocFieldId)) as PersonDocFieldId[])
    : [];
  for (const id of base.fields) if (!fields.includes(id)) fields.push(id);
  return {
    startRow: Number.isFinite(startRow) && startRow >= 1 ? Math.floor(startRow) : 2,
    personKey,
    fields,
  };
}

export function matrixToPersonDocItems(
  rows: string[][],
  fields: PersonDocFieldId[],
  startRow: number,
): PersonDocItem[] {
  const from = Math.max(1, startRow) - 1;
  const out: PersonDocItem[] = [];
  for (let i = from; i < rows.length; i++) {
    const line = rows[i] || [];
    const item: PersonDocItem = {};
    let any = false;
    fields.forEach((key, col) => {
      const val = (line[col] || '').trim();
      if (val) {
        item[key] = val;
        any = true;
      }
    });
    if (any) out.push(item);
  }
  return out;
}
