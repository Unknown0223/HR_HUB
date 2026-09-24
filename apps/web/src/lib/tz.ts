/** Default org timezone — matches locations / seed / attendance ingest. */
export const APP_TZ = 'Asia/Tashkent';

/** YYYY-MM-DD in APP_TZ (never toISOString UTC day). */
export function ymdToday(when: Date = new Date(), timeZone = APP_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

/** HH:MM in APP_TZ (never raw ISO UTC slice). */
export function fmtHm(iso?: string | Date | null, timeZone = APP_TZ): string | null {
  if (iso == null || iso === '') return null;
  const d = typeof iso === 'string' || iso instanceof Date ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mi = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh}:${mi}`;
}

/** Date + time in APP_TZ for mark lists (ru-RU locale). */
export function fmtDateTimeTz(iso?: string | Date | null, timeZone = APP_TZ): string {
  if (iso == null || iso === '') return '—';
  const d = typeof iso === 'string' || iso instanceof Date ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
