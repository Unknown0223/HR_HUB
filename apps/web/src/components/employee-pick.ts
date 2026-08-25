export type EmployeePickItem = {
  id: string;
  name: string;
  tabNumber?: string;
  positionName?: string;
  divisionId?: string;
};

type RawEmp = {
  id: string;
  label?: string;
  tabNumber?: string | null;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  positionName?: string;
  position?: { name?: string } | null;
  divisionId?: string | null;
};

function stripTabPrefix(label: string, tab?: string) {
  if (tab) {
    const re = new RegExp(`^${tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[—–-]\\s*`);
    if (re.test(label)) return label.replace(re, '');
  }
  const m = label.match(/^\S+\s+[—–-]\s+(.+)$/);
  return m ? m[1] : label;
}

export function toPickItem(e: RawEmp): EmployeePickItem {
  const fromParts = [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
  const tab = (e.tabNumber || '').trim();
  let name = fromParts;
  if (!name && e.label) name = stripTabPrefix(e.label, tab || undefined);
  else if (name && tab && e.label?.startsWith(tab)) name = fromParts;
  return {
    id: e.id,
    name: name || e.label || tab || '—',
    tabNumber: tab,
    positionName: e.positionName || e.position?.name || '',
    divisionId: e.divisionId || undefined,
  };
}

export function toPickItems(list: RawEmp[] | undefined | null): EmployeePickItem[] {
  return (list || []).map(toPickItem);
}

export function pickSearchText(e: EmployeePickItem) {
  return [e.tabNumber, e.name, e.positionName].filter(Boolean).join(' ').toLowerCase();
}
