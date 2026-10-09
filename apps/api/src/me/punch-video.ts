export type PunchVideoSettings = {
  enabled: boolean;
  codeRequired: boolean;
  chatId: string;
};

export const PUNCH_VIDEO_MIN_SEC = 5;
export const PUNCH_VIDEO_MAX_SEC = 10;
export const PUNCH_VIDEO_MIN_BYTES = 40_000;
export const PUNCH_VIDEO_MAX_BYTES = 12 * 1024 * 1024;

export function parsePunchVideoSettings(extras: unknown): PunchVideoSettings {
  const root = extras && typeof extras === 'object' && !Array.isArray(extras) ? (extras as Record<string, unknown>) : {};
  const raw = root.punchVideo;
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    enabled: c.enabled === true,
    codeRequired: c.codeRequired !== false,
    chatId: String(c.chatId || '').trim(),
  };
}

export function assertVideoPunch(input: { durationSec: number; bytes: number; enabled: boolean; codeRequired: boolean; code: number | null; spokenCode?: number }) {
  if (!input.enabled) {
    return { ok: false as const, code: 'PUNCH_VIDEO_DISABLED', message: 'Video bilan belgilash o‘chirilgan' };
  }
  if (input.durationSec < PUNCH_VIDEO_MIN_SEC || input.durationSec > PUNCH_VIDEO_MAX_SEC) {
    return { ok: false as const, code: 'PUNCH_VIDEO_DURATION', message: `Video ${PUNCH_VIDEO_MIN_SEC}–${PUNCH_VIDEO_MAX_SEC} soniya bo‘lishi kerak` };
  }
  if (input.bytes < PUNCH_VIDEO_MIN_BYTES || input.bytes > PUNCH_VIDEO_MAX_BYTES) {
    return { ok: false as const, code: 'PUNCH_VIDEO_SIZE', message: 'Video hajmi mos emas' };
  }
  if (input.codeRequired) {
    if (!input.code || input.spokenCode !== input.code) {
      return { ok: false as const, code: 'PUNCH_VIDEO_CODE', message: 'Ekrandagi kunlik kod yuborilmadi' };
    }
  }
  return { ok: true as const };
}

export const PUNCH_CODE_MIN = 100;
export const PUNCH_CODE_MAX = 999;

/** `code` / `nocode` on the grant wins; older grants follow the company setting. */
export function spokenCodeRequired(note: string | null | undefined, companyDefault: boolean): boolean {
  if (note === 'code') return true;
  if (note === 'nocode') return false;
  return companyDefault;
}

/** Pick a free 3-digit code, 100..999. */
export function pickDayCode(used: Set<number>, random: () => number = Math.random): number | null {
  const span = PUNCH_CODE_MAX - PUNCH_CODE_MIN + 1;
  let taken = 0;
  for (const code of used) if (code >= PUNCH_CODE_MIN && code <= PUNCH_CODE_MAX) taken++;
  if (taken >= span) return null;
  for (let i = 0; i < 40; i++) {
    const code = PUNCH_CODE_MIN + Math.floor(random() * span);
    if (!used.has(code)) return code;
  }
  for (let code = PUNCH_CODE_MIN; code <= PUNCH_CODE_MAX; code++) if (!used.has(code)) return code;
  return null;
}
