export type BankMeta = {
  address?: string;
  swift?: string;
  smartupId?: string;
};

export type BankItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: BankMeta | null;
};

export function asBankMeta(raw?: unknown): BankMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as BankMeta;
}

export function padMfo(value: string) {
  const t = value.trim();
  if (/^\d+$/.test(t)) return t.padStart(5, '0');
  return t;
}

export function isBankActive(state: string, fallback = true) {
  const s = state.trim().toUpperCase();
  if (s === 'P' || s === '0' || s === 'N' || s.includes('пасс') || s.includes('неактив'))
    return false;
  if (s === 'A' || s === '1' || s.includes('актив')) return true;
  return fallback;
}

const HEADER_ALIASES: Record<string, string[]> = {
  smartupId: ['smartup_id', 'ид (smartup)', 'smartup', 'ид'],
  mfo: ['bank_code', 'мфо*', 'мфо', 'mfo', 'code'],
  name: ['name', 'название*', 'название'],
  address: ['address', 'адрес'],
  state: ['state', 'статус (a - активный, p - пассивный)', 'статус', 'status'],
};

function headerKey(cell: string) {
  const h = cell.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => h === a || h.startsWith(a))) return key;
  }
  return '';
}

export function parseBankRows(matrix: string[][]) {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(4, matrix.length); i++) {
    const keys = (matrix[i] || []).map(headerKey);
    if (keys.includes('mfo') && keys.includes('name')) {
      headerIndex = i;
      break;
    }
  }
  const header = (matrix[headerIndex] || []).map(headerKey);
  const col = (key: string) => {
    const idx = header.indexOf(key);
    return idx >= 0 ? idx : -1;
  };
  const iMfo = col('mfo');
  const iName = col('name');
  const iAddr = col('address');
  const iState = col('state');
  const iSid = col('smartupId');
  const out: Array<{
    mfo: string;
    name: string;
    address: string;
    smartupId: string;
    isActive: boolean;
  }> = [];
  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    if (headerKey(line[iMfo] || '') === 'mfo') continue;
    const mfo = padMfo(iMfo >= 0 ? line[iMfo] || '' : '');
    const name = (iName >= 0 ? line[iName] || '' : '').trim();
    if (!mfo && !name) continue;
    out.push({
      mfo,
      name,
      address: (iAddr >= 0 ? line[iAddr] || '' : '').trim(),
      smartupId: (iSid >= 0 ? line[iSid] || '' : '').trim(),
      isActive: isBankActive(iState >= 0 ? line[iState] || '' : '', true),
    });
  }
  return out;
}

export const BANK_TEMPLATE_TECH = ['smartup_id', 'bank_code', 'name', 'address', 'state'];
export const BANK_TEMPLATE_LABELS = [
  'ИД (SMARTUP)',
  'МФО*',
  'Название*',
  'Адрес',
  'Статус (A - активный, P - пассивный)',
];
