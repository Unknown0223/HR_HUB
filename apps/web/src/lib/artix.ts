export type ArtixDivision = {
  id: string;
  divisionId: string;
  divisionName: string;
  externalId: string;
};

export type ArtixUser = {
  id: string;
  employeeId?: string;
  userId?: string;
  name: string;
  code: string;
  login: string;
  password?: string;
  divisionId?: string;
  divisionName?: string;
  positionId?: string;
  positionName?: string;
  roles?: string;
  blocked?: boolean;
};

export type ArtixError = {
  id: string;
  createdAt: string;
  status: string;
  store: string;
  request: string;
  response: string;
};

export type ArtixRole = { id: string; name: string };

export type ArtixImportSettings = {
  fields: string[];
  startRow: number;
  idKind: 'user' | 'userId';
};

export type ArtixConfig = {
  sys?: string;
  soapUrl?: string;
  login?: string;
  password?: string;
  manualAttach?: boolean;
  badgeTemplateIds?: string[];
  extraPositions?: string[];
  divisions?: ArtixDivision[];
  users?: ArtixUser[];
  errors?: ArtixError[];
  roles?: ArtixRole[];
  import?: ArtixImportSettings;
};

export const IMPORT_FIELDS = [
  { key: 'userId', label: 'ИД пользователя' },
  { key: 'user', label: 'Пользователь' },
  { key: 'code', label: 'Код пользователя' },
  { key: 'login', label: 'Логин' },
  { key: 'password', label: 'Пароль' },
] as const;

export const DEFAULT_IMPORT: ArtixImportSettings = {
  fields: IMPORT_FIELDS.map((f) => f.key),
  startRow: 2,
  idKind: 'userId',
};

export const DEFAULT_ROLES: ArtixRole[] = [
  { id: 'admin', name: 'Администратор' },
  { id: 'cashier', name: 'Кассир' },
  { id: 'manager', name: 'Менеджер' },
];

export function asArtixConfig(raw?: unknown): ArtixConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ArtixConfig;
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function genCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

export function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function fieldLabel(key: string) {
  return IMPORT_FIELDS.find((f) => f.key === key)?.label || key;
}

/** Excel template header (Verifix export uses user_login for login). */
export function templateHeader(key: string) {
  if (key === 'login') return 'user_login';
  return fieldLabel(key);
}

export function artixImport(cfg?: ArtixConfig | null): ArtixImportSettings {
  const raw = cfg?.import;
  if (!raw || !Array.isArray(raw.fields) || raw.fields.length === 0) {
    return { ...DEFAULT_IMPORT, fields: [...DEFAULT_IMPORT.fields] };
  }
  return {
    fields: raw.fields.filter(Boolean),
    startRow: Number(raw.startRow) > 0 ? Number(raw.startRow) : 2,
    idKind: raw.idKind === 'user' ? 'user' : 'userId',
  };
}
