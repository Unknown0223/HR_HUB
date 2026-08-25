export const ALLOWANCE_SCOPES = ['company', 'division', 'schedule'] as const;
export type AllowanceScope = (typeof ALLOWANCE_SCOPES)[number];

export const ALLOWANCE_SCOPE_TABS: { id: AllowanceScope; label: string }[] = [
  { id: 'company', label: 'По компании' },
  { id: 'division', label: 'По подразделениям' },
  { id: 'schedule', label: 'По графикам работы' },
];

export type AllowanceRule = {
  id: string;
  startTime?: string;
  endTime?: string;
  coefficient?: number;
};

export type AllowancePolicyRow = {
  id: string;
  scope: AllowanceScope | string;
  month: string;
  name: string;
  isActive: boolean;
  divisionId?: string | null;
  scheduleId?: string | null;
  division?: { id: string; name: string } | null;
  schedule?: { id: string; name: string; code?: string } | null;
  rules: AllowanceRule[];
};

export function parseAllowanceScope(raw: string | null | undefined): AllowanceScope {
  const v = String(raw || '').trim();
  return (ALLOWANCE_SCOPES as readonly string[]).includes(v)
    ? (v as AllowanceScope)
    : 'company';
}

export function newAllowanceRuleId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyAllowanceRule(): AllowanceRule {
  return { id: newAllowanceRuleId(), startTime: '', endTime: '' };
}
