export type PhotoTemplateId =
  | 'first_last'
  | 'last_first'
  | 'first_last_id'
  | 'last_first_id'
  | 'first_last_tab'
  | 'last_first_tab'
  | 'first_last_middle'
  | 'last_first_middle'
  | 'last_first_middle_tab'
  | 'last_first_middle_id'
  | 'tab'
  | 'id';

export const PHOTO_TEMPLATES: { id: PhotoTemplateId; label: string }[] = [
  { id: 'first_last', label: 'Имя Фамилия' },
  { id: 'last_first', label: 'Фамилия Имя' },
  { id: 'first_last_id', label: 'Имя Фамилия #ИД' },
  { id: 'last_first_id', label: 'Фамилия Имя #ИД' },
  { id: 'first_last_tab', label: 'Имя Фамилия #Таб. номер' },
  { id: 'last_first_tab', label: 'Фамилия Имя #Таб. номер' },
  { id: 'first_last_middle', label: 'Имя Фамилия Отчество' },
  { id: 'last_first_middle', label: 'Фамилия Имя Отчество' },
  { id: 'last_first_middle_tab', label: 'Фамилия Имя Отчество #Таб. номер' },
  { id: 'last_first_middle_id', label: 'Фамилия Имя Отчество #ИД' },
  { id: 'tab', label: 'Таб. номер' },
  { id: 'id', label: 'ИД' },
];

export type PhotoMatchEmp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
  externalId?: string | null;
};

export function isPhotoTemplate(v: unknown): v is PhotoTemplateId {
  return PHOTO_TEMPLATES.some((t) => t.id === v);
}

export function fileBaseName(original: string): string {
  const last = original.replace(/\\/g, '/').split('/').pop() || original;
  return last.replace(/\.[^.]+$/, '').trim();
}

function norm(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[_\-.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namePart(emp: PhotoMatchEmp, order: 'first_last' | 'last_first', withMiddle: boolean): string {
  const first = emp.firstName || '';
  const last = emp.lastName || '';
  const middle = emp.middleName || '';
  const parts =
    order === 'first_last'
      ? withMiddle
        ? [first, last, middle]
        : [first, last]
      : withMiddle
        ? [last, first, middle]
        : [last, first];
  return norm(parts.filter(Boolean).join(' '));
}

function idsOf(emp: PhotoMatchEmp): string[] {
  const out = [emp.id, emp.id.replace(/-/g, ''), emp.externalId || ''].map(norm).filter(Boolean);
  const short = emp.id.replace(/-/g, '').slice(-8);
  if (short) out.push(short);
  return [...new Set(out)];
}

export function matchPhotoEmployees(
  originalName: string,
  template: PhotoTemplateId,
  employees: PhotoMatchEmp[],
): PhotoMatchEmp[] {
  const raw = fileBaseName(originalName);
  const hashed = raw.split('#');
  const namePartRaw = hashed.length > 1 ? hashed.slice(0, -1).join('#') : raw;
  const hashKey = hashed.length > 1 ? norm(hashed[hashed.length - 1] || '') : '';
  const nName = norm(namePartRaw);
  const nAll = norm(raw);

  return employees.filter((emp) => {
    switch (template) {
      case 'first_last':
        return nAll === namePart(emp, 'first_last', false);
      case 'last_first':
        return nAll === namePart(emp, 'last_first', false);
      case 'first_last_middle':
        return nAll === namePart(emp, 'first_last', true);
      case 'last_first_middle':
        return nAll === namePart(emp, 'last_first', true);
      case 'first_last_id':
        return nName === namePart(emp, 'first_last', false) && idsOf(emp).includes(hashKey);
      case 'last_first_id':
        return nName === namePart(emp, 'last_first', false) && idsOf(emp).includes(hashKey);
      case 'first_last_tab':
        return nName === namePart(emp, 'first_last', false) && hashKey === norm(emp.tabNumber);
      case 'last_first_tab':
        return nName === namePart(emp, 'last_first', false) && hashKey === norm(emp.tabNumber);
      case 'last_first_middle_id':
        return nName === namePart(emp, 'last_first', true) && idsOf(emp).includes(hashKey);
      case 'last_first_middle_tab':
        return nName === namePart(emp, 'last_first', true) && hashKey === norm(emp.tabNumber);
      case 'tab':
        return nAll === norm(emp.tabNumber);
      case 'id':
        return idsOf(emp).includes(nAll);
      default:
        return false;
    }
  });
}

export function employeeLabel(emp: PhotoMatchEmp): string {
  return [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ');
}
