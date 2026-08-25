export type CountryMeta = {
  altName?: string;
  gps?: string;
};

export type RegionMeta = {
  altName?: string;
  gps?: string;
  countryId?: string;
  countryCode?: string;
  countryName?: string;
};

export type GeoItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: CountryMeta & RegionMeta | null;
};

export function asGeoMeta(raw?: unknown): CountryMeta & RegionMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as CountryMeta & RegionMeta;
}

export function autoGeoCode(name: string, prefix = 'GEO') {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 12);
  return slug || `${prefix}_${Date.now().toString(36).toUpperCase()}`;
}

export function regionOfCountry(r: GeoItem, country: GeoItem) {
  const m = asGeoMeta(r.meta);
  return m.countryId === country.id || m.countryCode === country.code;
}

export function histEventLabel(action: string) {
  if (action.endsWith('.create')) return 'Создание';
  if (action.endsWith('.update')) return 'Изменение';
  if (action.endsWith('.delete')) return 'Удаление';
  return action;
}
