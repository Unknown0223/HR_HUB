export type AdvanceLimitRule = {
  id: string;
  name: string;
  maxAmount: number;
  roles: string[];
  employeeIds: string[];
  reason: string | null;
  isActive: boolean;
};

export type ResolvedAdvanceLimit = {
  id: string;
  name: string;
  maxAmount: number;
  reason: string | null;
  /** Which kind of rule matched: a named employee, the user's role, or everyone. */
  scope: 'employee' | 'role' | 'all';
};

/**
 * An employee rule beats a role rule, which beats an "everyone" rule (no roles, no employees).
 * Several rules of the same kind may match; the smallest cap applies.
 */
export function resolveAdvanceLimit(
  rules: AdvanceLimitRule[],
  who: { employeeId: string; role: string },
): ResolvedAdvanceLimit | null {
  const active = rules.filter((r) => r.isActive && r.maxAmount > 0);
  const tiers: Array<[ResolvedAdvanceLimit['scope'], AdvanceLimitRule[]]> = [
    ['employee', active.filter((r) => r.employeeIds.includes(who.employeeId))],
    [
      'role',
      active.filter((r) => !r.employeeIds.length && r.roles.includes(who.role)),
    ],
    ['all', active.filter((r) => !r.employeeIds.length && !r.roles.length)],
  ];
  for (const [scope, matched] of tiers) {
    if (!matched.length) continue;
    const pick = matched.reduce((a, b) => (b.maxAmount < a.maxAmount ? b : a));
    return {
      id: pick.id,
      name: pick.name,
      maxAmount: pick.maxAmount,
      reason: pick.reason,
      scope,
    };
  }
  return null;
}

export const ADVANCE_COMMENT_MIN = 5;

/** Above the cap the employee must say what the money is for; at or below it no comment is needed. */
export function advanceCommentError(
  amount: number,
  comment: string | null | undefined,
  limit: ResolvedAdvanceLimit | null,
): string | null {
  if (!limit || amount <= limit.maxAmount) return null;
  if ((comment ?? '').trim().length >= ADVANCE_COMMENT_MIN) return null;
  return `Summa limitdan (${limit.maxAmount}) oshdi — avans nima uchun kerakligini yozing / Сумма больше лимита (${limit.maxAmount}). Укажите, на что нужен аванс`;
}
