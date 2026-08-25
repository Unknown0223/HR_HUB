export const FINE_SCOPES = ['company', 'division', 'position', 'employee'] as const;
export type FineScope = (typeof FINE_SCOPES)[number];

export const FINE_SCOPE_TABS: { id: FineScope; label: string }[] = [
  { id: 'company', label: 'По компании' },
  { id: 'division', label: 'По подразделениям' },
  { id: 'position', label: 'По должностям' },
  { id: 'employee', label: 'По сотрудникам' },
];

export const FINE_RULE_KEYS = [
  'late',
  'early',
  'absence',
  'missed_day',
  'missed_mark',
] as const;
export type FineRuleKey = (typeof FINE_RULE_KEYS)[number];

export const FINE_RULE_SECTIONS: {
  key: FineRuleKey;
  title: string;
  short: string;
  hasTime: boolean;
}[] = [
  {
    key: 'late',
    title: 'Правила политики штрафов за Опоздание',
    short: 'Опоздание',
    hasTime: true,
  },
  {
    key: 'early',
    title: 'Правила политики штрафов за Ранний уход',
    short: 'Ранний уход',
    hasTime: true,
  },
  {
    key: 'absence',
    title: 'Правила политики штрафов за Отсутствие',
    short: 'Отсутствие',
    hasTime: true,
  },
  {
    key: 'missed_day',
    title: 'Правила политики штрафов за Пропуск дня',
    short: 'Пропуск дня',
    hasTime: false,
  },
  {
    key: 'missed_mark',
    title: 'Правила политики штрафов за Пропуск отметки',
    short: 'Пропуск отметки',
    hasTime: false,
  },
];

export const FINE_RULE_TYPES = [
  'coefficient',
  'amount',
  'time',
  'annulment',
  'percent',
] as const;
export type FineRuleType = (typeof FINE_RULE_TYPES)[number];

export const FINE_RULE_TYPE_LABELS: Record<FineRuleType, string> = {
  coefficient: 'Коэффициент',
  amount: 'Сумма',
  time: 'Время',
  annulment: 'Аннулирование',
  percent: 'Процент от заработной платы',
};

export type FineRule = {
  id: string;
  timeFrom?: number;
  timeTo?: number;
  repeatFrom?: number;
  repeatTo?: number;
  type: FineRuleType;
  value?: number;
  periodicityMin?: number;
  onlyInsidePeriod?: boolean;
};

export type FinePolicyRules = Record<FineRuleKey, FineRule[]>;

export type FinePolicyRow = {
  id: string;
  scope: FineScope | string;
  month: string;
  name: string;
  isActive: boolean;
  divisionId?: string | null;
  positionId?: string | null;
  division?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
  employeeIds: string[];
  employees?: { id: string; label: string }[];
  rules: FinePolicyRules;
};

export function emptyFineRules(): FinePolicyRules {
  return {
    late: [],
    early: [],
    absence: [],
    missed_day: [],
    missed_mark: [],
  };
}

export function parseFineScope(raw: string | null | undefined): FineScope {
  const v = String(raw || '').trim();
  return (FINE_SCOPES as readonly string[]).includes(v) ? (v as FineScope) : 'company';
}

export function formatMonthRu(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso || '—';
  const s = d.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\s*г\.?\s*$/i, '');
}

export function monthInputValue(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

export function formatRange(from?: number, to?: number): string {
  if (from == null && to == null) return '—';
  if (from != null && to != null) return `${from} – ${to}`;
  if (from != null) return String(from);
  return String(to);
}

export function formatRuleType(type?: string): string {
  if (type && type in FINE_RULE_TYPE_LABELS) {
    return FINE_RULE_TYPE_LABELS[type as FineRuleType];
  }
  return type || '—';
}

export function formatRuleValue(rule: FineRule): string {
  if (rule.type === 'annulment') return '—';
  if (rule.value == null) return '—';
  if (rule.type === 'percent') return `${rule.value} %`;
  return String(rule.value);
}

export function newRuleId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function valueFieldLabel(type: FineRuleType): string {
  if (type === 'time') return 'Значение (мин)';
  if (type === 'percent') return 'Процент от заработной платы (%)';
  return 'Значение';
}

export function showPeriodicity(type: FineRuleType): boolean {
  return type === 'amount';
}

export function showInsidePeriod(type: FineRuleType, hasTime: boolean): boolean {
  return hasTime && (type === 'coefficient' || type === 'amount' || type === 'time');
}
