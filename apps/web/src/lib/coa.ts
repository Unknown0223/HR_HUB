export type PaymentKind = 'base' | 'except_base' | 'all';
export type AccountKind =
  | 'transit'
  | 'active'
  | 'passive'
  | 'active_passive'
  | 'contra_active'
  | 'contra_passive';

export type SubcontoRow = {
  key: string;
  name: string;
  type: string;
  required: boolean;
};

export type CoaMeta = {
  parentCode?: string;
  parentName?: string;
  accountKind?: AccountKind;
  paymentKind?: PaymentKind;
  quantitative?: boolean;
  balance?: boolean;
  checkExceed?: boolean;
  isMain?: boolean;
  subcontos?: SubcontoRow[];
  isDebit?: boolean;
  isCredit?: boolean;
  currency?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export const ACCOUNT_KINDS: { id: AccountKind; label: string }[] = [
  { id: 'transit', label: 'Транзитный' },
  { id: 'active', label: 'Активный' },
  { id: 'passive', label: 'Пассивный' },
  { id: 'active_passive', label: 'Активно-пассивный' },
  { id: 'contra_active', label: 'Контр-активный' },
  { id: 'contra_passive', label: 'Контр-пассивный' },
];

export const PAYMENT_KINDS: { id: PaymentKind; label: string }[] = [
  { id: 'base', label: 'Базовая' },
  { id: 'except_base', label: 'Все, кроме базовой' },
  { id: 'all', label: 'Все' },
];

export const SUBCONTO_NAMES: { id: string; label: string }[] = [
  { id: 'employees', label: 'Сотрудники' },
  { id: 'divisions', label: 'Подразделения' },
  { id: 'positions', label: 'Должности' },
  { id: 'persons', label: 'Физические лица' },
  { id: 'orgs', label: 'Организации' },
  { id: 'cashboxes', label: 'Кассы' },
  { id: 'currencies', label: 'Валюты' },
];

export const SUBCONTO_TYPES: { id: string; label: string }[] = [
  { id: 'balance', label: 'Остатки' },
  { id: 'turnover', label: 'Обороты' },
  { id: 'both', label: 'Остатки и обороты' },
];

export function asCoaMeta(raw?: unknown): CoaMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as CoaMeta;
}

export function inferAccountKind(meta: CoaMeta): AccountKind {
  if (meta.accountKind) return meta.accountKind;
  if (meta.isDebit && meta.isCredit) return 'transit';
  if (meta.isDebit) return 'active';
  if (meta.isCredit) return 'passive';
  return 'transit';
}

export function inferPaymentKind(meta: CoaMeta): PaymentKind {
  if (meta.paymentKind) return meta.paymentKind;
  return 'base';
}

export function accountKindLabel(kind?: AccountKind | null) {
  return ACCOUNT_KINDS.find((k) => k.id === kind)?.label || '—';
}

export function currencyKindLabel(kind: PaymentKind) {
  if (kind === 'all') return 'Все валюты';
  if (kind === 'except_base') return 'Все, кроме базовой';
  return 'Только в базовой валюте';
}

export function parentCaption(code?: string, name?: string) {
  if (!code) return '—';
  return name ? `${code}. ${name}` : code;
}

export function isMainAccount(code: string, meta: CoaMeta) {
  if (meta.isMain) return true;
  if (meta.parentCode && meta.parentCode === code) return true;
  return /0$/.test(code);
}

export function debitCreditFromKind(kind: AccountKind) {
  if (kind === 'active' || kind === 'contra_active') {
    return { isDebit: true, isCredit: false };
  }
  if (kind === 'passive' || kind === 'contra_passive') {
    return { isDebit: false, isCredit: true };
  }
  return { isDebit: true, isCredit: true };
}

export function yesNo(v?: boolean) {
  return v ? 'Да' : 'Нет';
}

export function newSubcontoRow(): SubcontoRow {
  return {
    key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    type: '',
    required: false,
  };
}
