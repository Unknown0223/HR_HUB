'use client';

import {
  ACCOUNT_KINDS,
  PAYMENT_KINDS,
  SUBCONTO_NAMES,
  SUBCONTO_TYPES,
  newSubcontoRow,
  type AccountKind,
  type CoaMeta,
  type PaymentKind,
  type SubcontoRow,
} from '@/lib/coa';
import { SearchLookup } from '../avg-salaries/SearchLookup';
import formStyles from '../report-templates/form.module.css';
import extra from './page.module.css';

export type CoaDraft = {
  code: string;
  name: string;
  paymentKind: PaymentKind;
  active: boolean;
  parentCode: string;
  accountKind: AccountKind | '';
  quantitative: boolean;
  balance: boolean;
  checkExceed: boolean;
  subcontos: SubcontoRow[];
};

export function emptyDraft(): CoaDraft {
  return {
    code: '',
    name: '',
    paymentKind: 'base',
    active: true,
    parentCode: '',
    accountKind: '',
    quantitative: false,
    balance: false,
    checkExceed: false,
    subcontos: [newSubcontoRow()],
  };
}

export function draftFromMeta(
  code: string,
  name: string,
  isActive: boolean,
  meta: CoaMeta,
  inferKind: AccountKind,
  inferPay: PaymentKind,
): CoaDraft {
  return {
    code,
    name,
    paymentKind: inferPay,
    active: isActive !== false,
    parentCode: meta.parentCode || '',
    accountKind: inferKind,
    quantitative: !!meta.quantitative,
    balance: !!meta.balance,
    checkExceed: !!meta.checkExceed,
    subcontos:
      meta.subcontos && meta.subcontos.length
        ? meta.subcontos.map((s) => ({
            key: s.key || newSubcontoRow().key,
            name: s.name || '',
            type: s.type || '',
            required: !!s.required,
          }))
        : [newSubcontoRow()],
  };
}

function Toggle({
  on,
  onToggle,
  yesLabel,
  noLabel = 'Нет',
}: {
  on: boolean;
  onToggle: () => void;
  yesLabel: string;
  noLabel?: string;
}) {
  return (
    <label className={formStyles.toggleRow}>
      <button
        type="button"
        className={`${formStyles.toggle} ${on ? formStyles.toggleOn : ''}`}
        onClick={onToggle}
        aria-pressed={on}
      />
      <span>{on ? yesLabel : noLabel}</span>
    </label>
  );
}

export function CoaForm({
  draft,
  setDraft,
  parentOptions,
  error,
}: {
  draft: CoaDraft;
  setDraft: (next: CoaDraft) => void;
  parentOptions: { id: string; label: string }[];
  error?: string;
}) {
  function patch(p: Partial<CoaDraft>) {
    setDraft({ ...draft, ...p });
  }

  function patchSub(key: string, p: Partial<SubcontoRow>) {
    patch({
      subcontos: draft.subcontos.map((s) =>
        s.key === key ? { ...s, ...p } : s,
      ),
    });
  }

  function addSub(afterKey: string) {
    const next = [...draft.subcontos];
    const i = next.findIndex((s) => s.key === afterKey);
    next.splice(i + 1, 0, newSubcontoRow());
    patch({ subcontos: next });
  }

  function removeSub(key: string) {
    const next = draft.subcontos.filter((s) => s.key !== key);
    patch({ subcontos: next.length ? next : [newSubcontoRow()] });
  }

  function moveSub(key: string, dir: -1 | 1) {
    const i = draft.subcontos.findIndex((s) => s.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.subcontos.length) return;
    const next = [...draft.subcontos];
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row);
    patch({ subcontos: next });
  }

  return (
    <>
      {error ? <p className={formStyles.error}>{error}</p> : null}
      <div className={`${formStyles.card} ${extra.cardWide}`}>
        <div className={formStyles.layout}>
          <div>
            <div className={formStyles.field}>
              <label>
                Код <span className={formStyles.req}>*</span>
              </label>
              <input
                value={draft.code}
                onChange={(e) => patch({ code: e.target.value })}
              />
            </div>
            <div className={formStyles.field}>
              <label>
                Название <span className={formStyles.req}>*</span>
              </label>
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className={formStyles.field}>
              <label>Вид выплаты</label>
              <div className={formStyles.radioRow}>
                {PAYMENT_KINDS.map((k) => (
                  <label key={k.id} className={formStyles.radio}>
                    <input
                      type="radio"
                      name="paymentKind"
                      checked={draft.paymentKind === k.id}
                      onChange={() => patch({ paymentKind: k.id })}
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            </div>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>Статус</span>
              <Toggle
                on={draft.active}
                onToggle={() => patch({ active: !draft.active })}
                yesLabel="Активный"
                noLabel="Неактивный"
              />
            </div>
          </div>
          <div>
            <div className={formStyles.field}>
              <label>
                Подчинен счету <span className={formStyles.req}>*</span>
              </label>
              <SearchLookup
                value={draft.parentCode}
                options={parentOptions}
                allowClear
                onChange={(id) => patch({ parentCode: id })}
              />
            </div>
            <div className={formStyles.field}>
              <label>
                Вид счета <span className={formStyles.req}>*</span>
              </label>
              <SearchLookup
                value={draft.accountKind}
                options={ACCOUNT_KINDS.map((k) => ({
                  id: k.id,
                  label: k.label,
                }))}
                allowClear
                onChange={(id) =>
                  patch({ accountKind: (id as AccountKind) || '' })
                }
              />
            </div>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>Количественный</span>
              <Toggle
                on={draft.quantitative}
                onToggle={() => patch({ quantitative: !draft.quantitative })}
                yesLabel="Да"
              />
            </div>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>Балансовый</span>
              <Toggle
                on={draft.balance}
                onToggle={() => patch({ balance: !draft.balance })}
                yesLabel="Да"
              />
            </div>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>
                Проверка на превышение баланса
              </span>
              <Toggle
                on={draft.checkExceed}
                onToggle={() => patch({ checkExceed: !draft.checkExceed })}
                yesLabel="Да"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`${formStyles.card} ${extra.cardWide}`}>
        <h2 className={extra.subCardTitle}>Виды субконто</h2>
        {draft.subcontos.map((row) => (
          <div key={row.key} className={extra.subRow}>
            <span
              className={extra.drag}
              title="Переместить"
              onClick={() => moveSub(row.key, -1)}
            >
              ⋮⋮
            </span>
            <button
              type="button"
              className={extra.iconBtn}
              onClick={() => addSub(row.key)}
              aria-label="Добавить"
            >
              +
            </button>
            <button
              type="button"
              className={extra.iconBtn}
              onClick={() => removeSub(row.key)}
              aria-label="Удалить"
            >
              −
            </button>
            <SearchLookup
              value={row.name}
              options={SUBCONTO_NAMES}
              onChange={(id) => patchSub(row.key, { name: id })}
            />
            <div>
              <label className={formStyles.fieldLabel}>Тип субконто</label>
              <SearchLookup
                value={row.type}
                options={SUBCONTO_TYPES}
                onChange={(id) => patchSub(row.key, { type: id })}
              />
            </div>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>Обязательный</span>
              <Toggle
                on={row.required}
                onToggle={() =>
                  patchSub(row.key, { required: !row.required })
                }
                yesLabel="Да"
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
