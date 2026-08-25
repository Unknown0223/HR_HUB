'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type TaxBlock = {
  taxable: boolean;
  rateNo: string;
  account: string;
};

type PayrollCalc = {
  personnel: {
    accrualAccount: string;
    deductionAccount: string;
    advancesAccount: string;
    tripAdvanceReportAccount: string;
    tripExpenseAccount: string;
    loanAccount: string;
    depositAccount: string;
    allowCurrency: boolean;
    currency: string;
    allowProjects: boolean;
  };
  ndfl: TaxBlock;
  inps: TaxBlock;
  esp: TaxBlock;
};

type AccountOpt = { id: string; code: string; name: string; debitAccount?: string };

const PERSONNEL_FIELDS: {
  key: keyof PayrollCalc['personnel'];
  label: string;
}[] = [
  { key: 'accrualAccount', label: 'Счет начисления' },
  { key: 'deductionAccount', label: 'Счет удержания' },
  {
    key: 'advancesAccount',
    label: 'Авансы, выданные по оплате труда',
  },
  {
    key: 'tripAdvanceReportAccount',
    label: 'Авансовый отчет по командировке',
  },
  {
    key: 'tripExpenseAccount',
    label: 'Расходы командированного сотрудника',
  },
  { key: 'loanAccount', label: 'Счет займа' },
  { key: 'depositAccount', label: 'Счет депозита' },
];

function emptyTax(): TaxBlock {
  return { taxable: false, rateNo: '', account: '' };
}

function emptyState(): PayrollCalc {
  return {
    personnel: {
      accrualAccount: '',
      deductionAccount: '',
      advancesAccount: '',
      tripAdvanceReportAccount: '',
      tripExpenseAccount: '',
      loanAccount: '',
      depositAccount: '',
      allowCurrency: false,
      currency: '',
      allowProjects: false,
    },
    ndfl: emptyTax(),
    inps: emptyTax(),
    esp: emptyTax(),
  };
}

function AccountField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: AccountOpt[];
  required?: boolean;
}) {
  const listId = `acc-${label.replace(/\s+/g, '-')}`;
  return (
    <div className={styles.field}>
      <label>
        {label}
        {required ? <span className={styles.req}>*</span> : null}
      </label>
      <input
        list={listId}
        value={value}
        placeholder="Поиск..."
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => {
          const hint = o.debitAccount || o.code;
          return (
            <option key={o.id} value={hint}>
              {o.code} — {o.name}
            </option>
          );
        })}
      </datalist>
    </div>
  );
}

function TaxColumn({
  title,
  subtitle,
  block,
  onChange,
  options,
}: {
  title: string;
  subtitle: string;
  block: TaxBlock;
  onChange: (next: TaxBlock) => void;
  options: AccountOpt[];
}) {
  return (
    <div className={styles.col}>
      <h3 className={styles.colHead}>{title}</h3>
      <p className={styles.colSub}>{subtitle}</p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={block.taxable}
          onChange={(e) => onChange({ ...block, taxable: e.target.checked })}
        />
        Облагается
      </label>
      {block.taxable ? (
        <>
          <div className={`${styles.field} ${styles.rateField}`}>
            <label>
              Ставка № <span className={styles.req}>*</span>
            </label>
            <input
              value={block.rateNo}
              onChange={(e) => onChange({ ...block, rateNo: e.target.value })}
            />
          </div>
          <AccountField
            label="Счет"
            value={block.account}
            onChange={(account) => onChange({ ...block, account })}
            options={options}
            required
          />
        </>
      ) : null}
    </div>
  );
}

export default function PayrollCalcSettingsPage() {
  const [s, setS] = useState<PayrollCalc | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [data, pairs] = await Promise.all([
        apiFetch<{ payrollCalc: PayrollCalc }>('/api/settings/payroll-calc'),
        apiFetch<AccountOpt[] | { items?: AccountOpt[] }>(
          '/api/catalog/account-pairs',
        ).catch(() => []),
      ]);
      const raw = data.payrollCalc || {};
      const base = emptyState();
      setS({
        ...base,
        ...raw,
        personnel: { ...base.personnel, ...(raw.personnel || {}) },
        ndfl: { ...base.ndfl, ...(raw.ndfl || {}) },
        inps: { ...base.inps, ...(raw.inps || {}) },
        esp: { ...base.esp, ...(raw.esp || {}) },
      });
      const list = Array.isArray(pairs)
        ? pairs
        : Array.isArray((pairs as { items?: AccountOpt[] }).items)
          ? ((pairs as { items: AccountOpt[] }).items)
          : [];
      setAccounts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setS(emptyState());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!s) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const res = await apiFetch<{ payrollCalc: PayrollCalc }>(
        '/api/settings/payroll-calc',
        {
          method: 'PATCH',
          body: JSON.stringify({ payrollCalc: s }),
        },
      );
      const raw = res.payrollCalc || s;
      const base = emptyState();
      setS({
        ...base,
        ...raw,
        personnel: { ...base.personnel, ...(raw.personnel || {}) },
        ndfl: { ...base.ndfl, ...(raw.ndfl || {}) },
        inps: { ...base.inps, ...(raw.inps || {}) },
        esp: { ...base.esp, ...(raw.esp || {}) },
      });
      setOk('Сохранено');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  if (!s) {
    return <p className={styles.muted}>Загрузка…</p>;
  }

  const p = s.personnel;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>Расчет зарплаты</h1>
        <button
          type="button"
          className={styles.btnSave}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? '…' : 'Сохранить'}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div className={styles.card}>
        <div className={styles.grid}>
          <div className={styles.col}>
            <h3 className={styles.colHead}>Расчеты с персоналом</h3>
            <p className={styles.colSub}>Расчеты с персоналом по оплате труда</p>
            {PERSONNEL_FIELDS.map((f) => (
              <AccountField
                key={f.key}
                label={f.label}
                value={String(p[f.key] ?? '')}
                onChange={(v) =>
                  setS({
                    ...s,
                    personnel: { ...p, [f.key]: v },
                  })
                }
                options={accounts}
              />
            ))}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={p.allowCurrency}
                onChange={(e) =>
                  setS({
                    ...s,
                    personnel: { ...p, allowCurrency: e.target.checked },
                  })
                }
              />
              Разрешить использование валюты
            </label>
            {p.allowCurrency ? (
              <div className={styles.indent}>
                <AccountField
                  label="Валюта"
                  value={p.currency}
                  onChange={(currency) =>
                    setS({ ...s, personnel: { ...p, currency } })
                  }
                  options={[]}
                />
              </div>
            ) : null}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={p.allowProjects}
                onChange={(e) =>
                  setS({
                    ...s,
                    personnel: { ...p, allowProjects: e.target.checked },
                  })
                }
              />
              Разрешить использование проектов
            </label>
          </div>

          <TaxColumn
            title="НДФЛ"
            subtitle="Налог на доходы физических лиц"
            block={s.ndfl}
            onChange={(ndfl) => setS({ ...s, ndfl })}
            options={accounts}
          />
          <TaxColumn
            title="ИНПС"
            subtitle="Взносы в индивидуальную накопительную пенсионную систему"
            block={s.inps}
            onChange={(inps) => setS({ ...s, inps })}
            options={accounts}
          />
          <TaxColumn
            title="ЕСП"
            subtitle="Единый социальный платеж"
            block={s.esp}
            onChange={(esp) => setS({ ...s, esp })}
            options={accounts}
          />
        </div>
      </div>
    </div>
  );
}
