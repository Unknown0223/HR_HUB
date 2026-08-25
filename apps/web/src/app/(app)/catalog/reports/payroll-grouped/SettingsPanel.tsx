'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILTIN_ACCRUALS,
  BUILTIN_DEDUCTIONS,
  TOTAL_CHECK_OPTS,
  emptyTotalGroup,
  emptyTotalSide,
  type GroupedSettings,
  type NamedGroup,
  type TotalGroup,
  type TotalSide,
  newId,
} from './settings';
import s from './page.module.css';

type Opt = { id: string; label: string };

function Check({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={s.check}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function MultiPick({
  label,
  options,
  selected,
  onChange,
  compact,
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={compact ? s.groupFieldCompact : s.groupField} ref={wrapRef}>
      <div className={s.groupLabel}>{label}</div>
      <button type="button" className={s.pickBtn} onClick={() => setOpen((v) => !v)}>
        {selected.length ? selected.map((id) => options.find((o) => o.id === id)?.label || id).join(', ') : 'Поиск...'}
      </button>
      {open ? (
        <div className={s.pickPanel}>
          <input
            className={s.pickSearch}
            placeholder="Поиск..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button type="button" key={o.id} className={on ? `${s.pickRow} ${s.pickOn}` : s.pickRow} onClick={() => toggle(o.id)}>
                <input type="checkbox" readOnly checked={on} tabIndex={-1} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function NamedGroupCard({
  group,
  itemOptions,
  onChange,
  onRemove,
}: {
  group: NamedGroup;
  itemOptions: Opt[];
  onChange: (g: NamedGroup) => void;
  onRemove: () => void;
}) {
  return (
    <div className={s.namedRow}>
      <div className={s.namedName}>
        <div className={s.groupLabel}>Группа *</div>
        <input
          className={s.groupName}
          value={group.name}
          placeholder="Группа"
          onChange={(e) => onChange({ ...group, name: e.target.value })}
        />
      </div>
      <div className={s.namedPick}>
        <MultiPick
          compact
          label="Начисления и удержания"
          options={itemOptions}
          selected={group.itemIds}
          onChange={(itemIds) => onChange({ ...group, itemIds })}
        />
      </div>
      <button type="button" className={s.trash} aria-label="Удалить" onClick={onRemove}>
        <i className="fas fa-trash-alt" aria-hidden />
      </button>
    </div>
  );
}

function TotalSideEditor({
  title,
  side,
  itemOptions,
  groupOptions,
  checkOptions,
  onChange,
}: {
  title: string;
  side: TotalSide;
  itemOptions: Opt[];
  groupOptions: Opt[];
  checkOptions: Opt[];
  onChange: (next: TotalSide) => void;
}) {
  function toggleCheck(id: string) {
    const on = side.checkIds.includes(id);
    onChange({
      ...side,
      checkIds: on ? side.checkIds.filter((x) => x !== id) : [...side.checkIds, id],
    });
  }
  return (
    <div className={s.totalSide}>
      <div className={s.totalSideTitle}>{title}</div>
      <MultiPick
        compact
        label="Начисления и удержания"
        options={itemOptions}
        selected={side.itemIds}
        onChange={(itemIds) => onChange({ ...side, itemIds })}
      />
      <MultiPick
        compact
        label="Группы начислений и удержаний"
        options={groupOptions}
        selected={side.groupIds}
        onChange={(groupIds) => onChange({ ...side, groupIds })}
      />
      <div className={s.totalChecks}>
        {checkOptions.map((o) => (
          <Check key={o.id} on={side.checkIds.includes(o.id)} label={o.label} onChange={() => toggleCheck(o.id)} />
        ))}
      </div>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  onChange,
  accrualOptions,
  deductionOptions,
}: {
  settings: GroupedSettings;
  onChange: (next: GroupedSettings) => void;
  accrualOptions: Opt[];
  deductionOptions: Opt[];
}) {
  const set = <K extends keyof GroupedSettings>(key: K, value: GroupedSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const setParent = (parent: keyof GroupedSettings, children: (keyof GroupedSettings)[], value: boolean) => {
    const next = { ...settings, [parent]: value } as GroupedSettings;
    for (const c of children) (next as Record<string, unknown>)[c] = value;
    onChange(next);
  };

  const allAccruals = useMemo(
    () => [...BUILTIN_ACCRUALS, ...accrualOptions.map((o) => ({ id: `acc:${o.id}`, label: o.label }))],
    [accrualOptions],
  );
  const allDeductions = useMemo(
    () => [...BUILTIN_DEDUCTIONS, ...deductionOptions.map((o) => ({ id: `ded:${o.id}`, label: o.label }))],
    [deductionOptions],
  );
  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const out: Opt[] = [];
    for (const o of [...allAccruals, ...allDeductions]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
    return out;
  }, [allAccruals, allDeductions]);

  const groupOpts = useMemo(
    () => [
      ...settings.accrualGroups.map((g) => ({ id: `ag:${g.id}`, label: g.name || 'Группа начислений' })),
      ...settings.deductionGroups.map((g) => ({ id: `dg:${g.id}`, label: g.name || 'Группа удержаний' })),
    ],
    [settings.accrualGroups, settings.deductionGroups],
  );

  const totalCheckOpts = useMemo(() => {
    const enabled = new Set<string>();
    if (settings.showDeductions) {
      if (settings.loan) enabled.add('loan');
      if (settings.advance) enabled.add('advance');
      if (settings.travelAdvance) enabled.add('travelAdvance');
      if (settings.ndfl) enabled.add('ndfl');
      if (settings.inpsAmount) enabled.add('inpsAmount');
      if (settings.deductionTotal) enabled.add('deductionTotal');
    }
    if (settings.showTotals) {
      if (settings.sheet) enabled.add('sheet');
      if (settings.toPay) enabled.add('toPay');
      if (settings.difference) enabled.add('difference');
    }
    const list = TOTAL_CHECK_OPTS.filter((o) => enabled.has(o.id));
    return list.length ? list : TOTAL_CHECK_OPTS.filter((o) => ['loan', 'advance', 'travelAdvance'].includes(o.id));
  }, [settings]);

  function patchTotal(id: string, patch: Partial<TotalGroup>) {
    set(
      'totalGroups',
      settings.totalGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  }

  return (
    <div className={s.settingsCard}>
      <div className={s.settingsGrid}>
        {/* —— Col 1 —— */}
        <div className={s.settingsCol}>
          <h3>Информация о сотруднике</h3>
          <Check on={settings.divisionGroup} label="Группа подразделений" onChange={(v) => set('divisionGroup', v)} />
          <Check on={settings.division} label="Подразделение" onChange={(v) => set('division', v)} />
          <Check on={settings.divisionCode} label="Код подразделения" onChange={(v) => set('divisionCode', v)} />
          <Check on={settings.orgUnit} label="Отдел" onChange={(v) => set('orgUnit', v)} />
          <Check on={settings.position} label="Должность" onChange={(v) => set('position', v)} />
          <Check on={settings.positionType} label="Тип позиции" onChange={(v) => set('positionType', v)} />
          <Check on={settings.tabNumber} label="Табельный номер" onChange={(v) => set('tabNumber', v)} />
          <Check on={settings.grade} label="Разряд" onChange={(v) => set('grade', v)} />
          <Check on={settings.schedule} label="График работы" onChange={(v) => set('schedule', v)} />
          <Check on={settings.bankAccount} label="Расчетный счет" onChange={(v) => set('bankAccount', v)} />
          <Check on={settings.pinfl} label="ПИНФЛ" onChange={(v) => set('pinfl', v)} />
          <Check on={settings.inps} label="номер ИНПС" onChange={(v) => set('inps', v)} />
          <Check on={settings.salary} label="Оклад" onChange={(v) => set('salary', v)} />
          <Check on={settings.plannedSalary} label="Плановый оклад" onChange={(v) => set('plannedSalary', v)} />

          <h3 className={s.settingsSub}>Источник данных</h3>
          <label className={s.check}>
            <input type="radio" name="pg-ds" checked={settings.dataSource === 'docs'} onChange={() => set('dataSource', 'docs')} />
            <span>По документам начислений/удержаний</span>
          </label>
          <label className={s.check}>
            <input
              type="radio"
              name="pg-ds"
              checked={settings.dataSource === 'preliminary'}
              onChange={() => set('dataSource', 'preliminary')}
            />
            <span>Предварительный расчет</span>
          </label>
          <Check on={settings.empDynFields} label="Динамические поля сотрудника" onChange={(v) => set('empDynFields', v)} />
          <Check
            on={settings.divDynFields}
            label="Показать динамические поля подразделений"
            onChange={(v) => set('divDynFields', v)}
          />

          <h3 className={s.settingsSub}>Дополнительные колонки</h3>
          <Check on={settings.emptyDateCol} label="Добавить пустую колонку для даты" onChange={(v) => set('emptyDateCol', v)} />
          <Check on={settings.emptySignCol} label="Добавить пустую колонку для подписи" onChange={(v) => set('emptySignCol', v)} />
        </div>

        {/* —— Col 2 —— */}
        <div className={s.settingsCol}>
          <h3>Информация о начислениях и удержаниях</h3>
          <Check
            on={settings.plannedTime}
            label="Плановое время"
            onChange={(v) => setParent('plannedTime', ['planDays', 'planHours'], v)}
          />
          <div className={s.nested}>
            <Check on={settings.planDays} label="дней" onChange={(v) => set('planDays', v)} />
            <Check on={settings.planHours} label="часов" onChange={(v) => set('planHours', v)} />
          </div>

          <Check
            on={settings.workedTime}
            label="Отработанное время"
            onChange={(v) => setParent('workedTime', ['workedDays', 'workedHours'], v)}
          />
          <div className={s.nested}>
            <Check on={settings.workedDays} label="дней" onChange={(v) => set('workedDays', v)} />
            <Check on={settings.workedHours} label="часов" onChange={(v) => set('workedHours', v)} />
          </div>

          <Check
            on={settings.overtime}
            label="Сверхурочное время"
            onChange={(v) => setParent('overtime', ['overtimeDays', 'overtimeHours'], v)}
          />
          <div className={s.nested}>
            <Check on={settings.overtimeDays} label="дней" onChange={(v) => set('overtimeDays', v)} />
            <Check on={settings.overtimeHours} label="часов" onChange={(v) => set('overtimeHours', v)} />
          </div>

          <Check on={settings.schedulePlan} label="План по расписанию" onChange={(v) => set('schedulePlan', v)} />
          <Check on={settings.scheduleFact} label="Факт по расписанию" onChange={(v) => set('scheduleFact', v)} />
          <Check on={settings.depositStart} label="Отображать депозит в начале периода" onChange={(v) => set('depositStart', v)} />
          <Check on={settings.depositEnd} label="Отображать депозит в конце периода" onChange={(v) => set('depositEnd', v)} />

          <Check on={settings.showAccruals} label="Начисления" onChange={(v) => set('showAccruals', v)} />

          <Check
            on={settings.showDeductions}
            label="Удержания"
            onChange={(v) =>
              setParent('showDeductions', ['loan', 'advance', 'travelAdvance', 'ndfl', 'inpsAmount', 'deductionTotal'], v)
            }
          />
          <div className={s.nested}>
            <Check on={settings.loan} label="Заем" onChange={(v) => set('loan', v)} />
            <Check on={settings.advance} label="Аванс" onChange={(v) => set('advance', v)} />
            <Check on={settings.travelAdvance} label="Командировочный аванс" onChange={(v) => set('travelAdvance', v)} />
            <Check on={settings.ndfl} label="НДФЛ" onChange={(v) => set('ndfl', v)} />
            <Check on={settings.inpsAmount} label="ИНПС" onChange={(v) => set('inpsAmount', v)} />
            <Check on={settings.deductionTotal} label="Итого удержано" onChange={(v) => set('deductionTotal', v)} />
          </div>

          <Check
            on={settings.showTotals}
            label="Итоги"
            onChange={(v) => setParent('showTotals', ['toPay', 'sheet', 'difference'], v)}
          />
          <div className={s.nested}>
            <Check on={settings.toPay} label="Начислено − Удержано" onChange={(v) => set('toPay', v)} />
            <Check on={settings.sheet} label="Ведомость" onChange={(v) => set('sheet', v)} />
            <Check on={settings.difference} label="Разница" onChange={(v) => set('difference', v)} />
          </div>
        </div>

        {/* —— Col 3 —— */}
        <div className={s.settingsCol}>
          <h3>Настройки начислений</h3>
          <MultiPick
            label="Начисления без группы"
            options={allAccruals}
            selected={settings.ungroupedAccrualIds}
            onChange={(ids) => set('ungroupedAccrualIds', ids)}
          />
          <button
            type="button"
            className={s.addLink}
            onClick={() => set('accrualGroups', [...settings.accrualGroups, { id: newId(), name: '', itemIds: [] }])}
          >
            + Добавить группу начислений
          </button>
          {settings.accrualGroups.map((g) => (
            <NamedGroupCard
              key={g.id}
              group={g}
              itemOptions={allItems}
              onChange={(next) =>
                set(
                  'accrualGroups',
                  settings.accrualGroups.map((x) => (x.id === g.id ? next : x)),
                )
              }
              onRemove={() => set('accrualGroups', settings.accrualGroups.filter((x) => x.id !== g.id))}
            />
          ))}

          <h3 className={s.settingsSub}>Настройки удержаний</h3>
          <MultiPick
            label="Удержания без группы"
            options={allDeductions}
            selected={settings.ungroupedDeductionIds}
            onChange={(ids) => set('ungroupedDeductionIds', ids)}
          />
          <button
            type="button"
            className={s.addLink}
            onClick={() => set('deductionGroups', [...settings.deductionGroups, { id: newId(), name: '', itemIds: [] }])}
          >
            + Добавить группу удержаний
          </button>
          {settings.deductionGroups.map((g) => (
            <NamedGroupCard
              key={g.id}
              group={g}
              itemOptions={allItems}
              onChange={(next) =>
                set(
                  'deductionGroups',
                  settings.deductionGroups.map((x) => (x.id === g.id ? next : x)),
                )
              }
              onRemove={() => set('deductionGroups', settings.deductionGroups.filter((x) => x.id !== g.id))}
            />
          ))}

          <h3 className={s.settingsSub}>Настройки итогов</h3>
          <button
            type="button"
            className={s.addLink}
            onClick={() => set('totalGroups', [...settings.totalGroups, emptyTotalGroup()])}
          >
            + Добавить группу итогов
          </button>
          {settings.totalGroups.map((g) => (
            <div key={g.id} className={s.totalCard}>
              <div className={s.namedRow}>
                <div className={s.namedName} style={{ flex: 1 }}>
                  <div className={s.groupLabel}>Группа *</div>
                  <input
                    className={s.groupName}
                    value={g.name}
                    placeholder="Группа"
                    onChange={(e) => patchTotal(g.id, { name: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={s.trash}
                  aria-label="Удалить"
                  onClick={() => set('totalGroups', settings.totalGroups.filter((x) => x.id !== g.id))}
                >
                  <i className="fas fa-trash-alt" aria-hidden />
                </button>
              </div>
              <div className={s.totalSplit}>
                <TotalSideEditor
                  title="Сложение"
                  side={g.add || emptyTotalSide()}
                  itemOptions={allItems}
                  groupOptions={groupOpts}
                  checkOptions={totalCheckOpts}
                  onChange={(add) => patchTotal(g.id, { add })}
                />
                <TotalSideEditor
                  title="Вычитание"
                  side={g.sub || emptyTotalSide()}
                  itemOptions={allItems}
                  groupOptions={groupOpts}
                  checkOptions={totalCheckOpts}
                  onChange={(sub) => patchTotal(g.id, { sub })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
