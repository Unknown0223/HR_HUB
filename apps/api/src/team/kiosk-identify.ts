export type ScoredMember = { employeeId: string; score: number };

export type KioskIdentity =
  | { status: 'match'; best: ScoredMember }
  | { status: 'unknown'; best: ScoredMember | null }
  | { status: 'ambiguous'; best: ScoredMember; second: ScoredMember };

/** Two teammates this close above the threshold cannot be told apart reliably. */
export const KIOSK_AMBIGUOUS_MARGIN = 0.05;

/**
 * Decides who stands in front of the manager's phone. Only a single clear winner above the
 * threshold is accepted; a near tie is refused rather than guessed.
 */
export function pickKioskIdentity(
  scored: ScoredMember[],
  threshold: number,
  margin = KIOSK_AMBIGUOUS_MARGIN,
): KioskIdentity {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const [best, second] = sorted;
  if (!best || best.score < threshold) return { status: 'unknown', best: best ?? null };
  if (second && second.score >= threshold && best.score - second.score < margin) {
    return { status: 'ambiguous', best, second };
  }
  return { status: 'match', best };
}
