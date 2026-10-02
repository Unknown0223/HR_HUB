export type PayrollLineInput = {
  type: string;
  amount: number | { toString(): string };
  description?: string | null;
};

export type PayrollRow = { type: string; label: string; amount: number };

const LABELS: Record<string, string> = {
  base: 'Oklad',
  bonus: 'Mukofot',
  overtime: 'Ish vaqtidan tashqari',
  one_time: 'Bir martalik to‘lov',
  other: 'Boshqa hisoblash',
  penalty: 'Jarima',
  deduction: 'Ushlab qolish',
  advance: 'Avans',
};

const WITHHELD = new Set(['penalty', 'deduction']);

const round = (v: number) => Math.round(v * 100) / 100;
const money = (v: PayrollLineInput['amount']) => round(Number(v));

/**
 * Splits an employee's payroll lines for one period into accruals and withholdings.
 * Advance lines are not accruals: paid advances (if any) take precedence over them,
 * otherwise their sum is treated as the amount already paid out.
 */
export function summarizePayroll(
  lines: PayrollLineInput[],
  paidAdvances: PayrollLineInput['amount'][],
) {
  const accruals: PayrollRow[] = [];
  const withholdings: PayrollRow[] = [];
  let advanceLines = 0;
  for (const l of lines) {
    const amount = money(l.amount);
    if (l.type === 'advance') {
      advanceLines += Math.abs(amount);
      continue;
    }
    const label = l.description?.trim() || LABELS[l.type] || l.type;
    if (WITHHELD.has(l.type)) {
      withholdings.push({ type: l.type, label, amount: Math.abs(amount) });
    } else {
      accruals.push({ type: l.type, label, amount });
    }
  }
  const advances = paidAdvances.length
    ? paidAdvances.reduce<number>((s, a) => s + money(a), 0)
    : advanceLines;
  const accrued = accruals.reduce((s, r) => s + r.amount, 0);
  const withheld = withholdings.reduce((s, r) => s + r.amount, 0);
  return {
    accruals,
    withholdings,
    totals: {
      accrued: round(accrued),
      withheld: round(withheld),
      advances: round(advances),
      due: round(accrued - withheld - advances),
    },
  };
}
