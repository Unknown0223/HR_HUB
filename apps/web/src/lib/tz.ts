/** Default org timezone — matches locations / seed / attendance ingest. */
export const APP_TZ = 'Asia/Tashkent';

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

/** Date + time in APP_TZ for mark lists. */
export function fmtDateTimeTz(iso?: string | Date | null, timeZone = APP_TZ): string {
  if (iso == null || iso === '') return '—';
  const d = typeof iso === 'string' || iso instanceof Date ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU', { timeZone });
}
