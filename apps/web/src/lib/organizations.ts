export type OrgMeta = {
  inn?: string;
  phone?: string;
  email?: string;
  altName?: string;
  currencyId?: string;
  currencyName?: string;
  timezone?: string;
  legalEntityId?: string;
  legalEntityName?: string;
  vatPayer?: boolean;
  vatRate?: number | null;
  excisePayer?: boolean;
};

export type OrgItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: OrgMeta | null;
};

export const TIMEZONES = [
  { id: 'Asia/Tashkent', label: '(UTC+05:00) Ташкент' },
  { id: 'Asia/Samarkand', label: '(UTC+05:00) Самарканд' },
  { id: 'Asia/Almaty', label: '(UTC+06:00) Алматы' },
  { id: 'Europe/Moscow', label: '(UTC+03:00) Москва' },
  { id: 'UTC', label: '(UTC+00:00) UTC' },
] as const;

export function asOrgMeta(raw?: unknown): OrgMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as OrgMeta;
}

export function autoOrgCode(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return slug || `ORG_${Date.now().toString(36).toUpperCase()}`;
}
