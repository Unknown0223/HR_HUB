/** Shared helpers for the /m client (Uzbek UI, same JWT session as the web app). */

export const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

/** Sunday-first, matching JS `getDay()`. */
export const UZ_WEEKDAYS_SHORT = [
  'yak',
  'du',
  'se',
  'chor',
  'pay',
  'jum',
  'shan',
];

/** Monday-first header row for the calendar grid. */
export const UZ_WEEK_HEADER = ['du', 'se', 'chor', 'pay', 'jum', 'shan', 'yak'];

export function uzDate(value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** «26 Iyul 2026 (yak)» — the subtitle format used by the phone app header. */
export function uzDateWithWeekday(value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${uzDate(d)} (${UZ_WEEKDAYS_SHORT[d.getDay()]})`;
}

export function hhmm(value?: string | Date | null) {
  if (!value) return '--:--';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export type DayStatus =
  | 'on_time'
  | 'late'
  | 'absent'
  | 'not_started'
  | 'day_off'
  | 'leave';

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  on_time: "O'z vaqtida",
  late: 'Kechikdi',
  absent: 'Kelmadi',
  not_started: 'Boshlanmagan',
  day_off: 'Dam olish kuni',
  leave: 'Ta’til',
};

export const DAY_STATUS_COLOR: Record<DayStatus, string> = {
  on_time: 'var(--m-ok)',
  late: 'var(--m-late)',
  absent: 'var(--m-absent)',
  not_started: 'var(--m-ink-faint)',
  day_off: 'var(--m-dayoff)',
  leave: 'var(--m-accent-link)',
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  approved: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
  cancelled: 'Bekor qilingan',
};

export function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function money(value?: number | string | null) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
