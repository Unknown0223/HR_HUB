'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { MultiLookup } from '@/app/(app)/catalog/cashboxes/MultiLookup';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  FINE_RULE_SECTIONS,
  FINE_RULE_TYPE_LABELS,
  FINE_RULE_TYPES,
  emptyFineRules,
  formatRange,
  formatRuleType,
  formatRuleValue,
  newRuleId,
  parseFineScope,
  showInsidePeriod,
  showPeriodicity,
  valueFieldLabel,
  type FinePolicyRow,
  type FinePolicyRules,
  type FineRule,
  type FineRuleKey,
  type FineRuleType,
  type FineScope,
} from '@/lib/fine-policies';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from './page.module.css';

type Opt = { id: string; label: string };

type Draft = {
  timeFrom: string;
  timeTo: string;
  repeatFrom: string;
  repeatTo: string;
  type: FineRuleType;
  value: string;
  periodicityMin: string;
  onlyInsidePeriod: boolean;
};

const emptyDraft = (): Draft => ({
  timeFrom: '',
  timeTo: '',
  repeatFrom: '',
  repeatTo: '',
  type: 'coefficient',
  value: '',
  periodicityMin: '',
  onlyInsidePeriod: false,
});

function numOrUndef(v: string): number | undefined {
  const n = Number(String(v).trim().replace(',', '.'));
  return String(v).trim() === '' || Number.isNaN(n) ? undefined : n;
}

function draftFromRule(rule: FineRule): Draft {
  return {
    timeFrom: rule.timeFrom != null ? String(rule.timeFrom) : '',
    timeTo: rule.timeTo != null ? String(rule.timeTo) : '',
    repeatFrom: rule.repeatFrom != null ? String(rule.repeatFrom) : '',
    repeatTo: rule.repeatTo != null ? String(rule.repeatTo) : '',
    type: rule.type,
    value: rule.value != null ? String(rule.value) : '',
    periodicityMin: rule.periodicityMin != null ? String(rule.periodicityMin) : '',
    onlyInsidePeriod: !!rule.onlyInsidePeriod,
  };
}

export function FinePolicyForm({ policyId }: { policyId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = !policyId;
  const scope: FineScope = parseFineScope(searchParams.get('tab'));
  const listHref = `/payroll/fine-policies?tab=${scope}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [rules, setRules] = useState<FinePolicyRules>(emptyFineRules());
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);

  const [modalKey, setModalKey] = useState<FineRuleKey | null>(null);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [modalError, setModalError] = useState('');

  const section = useMemo(
    () => FINE_RULE_SECTIONS.find((s) => s.key === modalKey) || null,
    [modalKey],
  );

  useEffect(() => {
    apiFetch<{ divisions?: Opt[]; positions?: Opt[]; employees?: Opt[] }>(
      '/api/catalog/lookups',
    )
      .then((d) => {
        setDivisions(d.divisions || []);
        setPositions(d.positions || []);
        setEmployees(d.employees || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<FinePolicyRow>(`/api/payroll/fine-policies/${policyId}`)
      .then((row) => {
        setMonth(row.month?.slice(0, 10) || '');
        setName(row.name || '');
        setActive(row.isActive !== false);
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setEmployeeIds(row.employeeIds || []);
        setRules({ ...emptyFineRules(), ...row.rules });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [policyId, isNew]);

  function openAdd(key: FineRuleKey) {
    setModalKey(key);
    setEditRuleId(null);
    setDraft(emptyDraft());
    setModalError('');
  }

  function openEdit(key: FineRuleKey, rule: FineRule) {
    setModalKey(key);
    setEditRuleId(rule.id);
    setDraft(draftFromRule(rule));
    setModalError('');
  }

  function saveRule() {
    if (!modalKey || !section) return;
    if (draft.type !== 'annulment' && numOrUndef(draft.value) == null) {
      setModalError('Укажите значение');
      return;
    }
    const next: FineRule = {
      id: editRuleId || newRuleId(),
      type: draft.type,
    };
    if (section.hasTime) {
      const tf = numOrUndef(draft.timeFrom);
      const tt = numOrUndef(draft.timeTo);
      if (tf != null) next.timeFrom = tf;
      if (tt != null) next.timeTo = tt;
    }
    const rf = numOrUndef(draft.repeatFrom);
    const rt = numOrUndef(draft.repeatTo);
    if (rf != null) next.repeatFrom = rf;
    if (rt != null) next.repeatTo = rt;
    if (draft.type !== 'annulment') next.value = numOrUndef(draft.value);
    if (showPeriodicity(draft.type)) {
      const p = numOrUndef(draft.periodicityMin);
      if (p != null) next.periodicityMin = p;
    }
    if (showInsidePeriod(draft.type, section.hasTime)) {
      next.onlyInsidePeriod = draft.onlyInsidePeriod;
    }
    setRules((prev) => {
      const list = prev[modalKey] || [];
      const idx = list.findIndex((r) => r.id === next.id);
      const copy = [...list];
      if (idx >= 0) copy[idx] = next;
      else copy.push(next);
      return { ...prev, [modalKey]: copy };
    });
    setModalKey(null);
  }

  function removeRule(key: FineRuleKey, id: string) {
    setRules((prev) => ({
      ...prev,
      [key]: (prev[key] || []).filter((r) => r.id !== id),
    }));
  }

  async function save() {
    if (!month) {
      setError('Укажите месяц');
      return;
    }
    if (scope === 'division' && !divisionId) {
      setError('Укажите подразделение');
      return;
    }
    if (scope === 'position' && !positionId) {
      setError('Укажите должность');
      return;
    }
    if (scope === 'employee' && employeeIds.length === 0) {
      setError('Укажите сотрудников');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      scope,
      month,
      name: name.trim(),
      isActive: active,
      divisionId: scope === 'division' ? divisionId : undefined,
      positionId: scope === 'position' ? positionId : undefined,
      employeeIds: scope === 'employee' ? employeeIds : [],
      rules,
    };
    try {
      if (isNew) {
        await apiFetch('/api/payroll/fine-policies', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/payroll/fine-policies/${policyId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            month: body.month,
            name: body.name,
            isActive: body.isActive,
            divisionId: body.divisionId,
            positionId: body.positionId,
            employeeIds: body.employeeIds,
            rules: body.rules,
          }),
        });
      }
      router.push(listHref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const title = isNew ? 'Политика штрафов (создание)' : 'Политика штрафов (изменение)';

  if (loading) return <p className={formStyles.muted}>Загрузка…</p>;

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title, siblings: [] }} />
      <div className={formStyles.page}>
        <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
          <button
            type="button"
            className={formStyles.btnSave}
            disabled={saving}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <Link href={listHref} className={formStyles.btnClose}>
            Закрыть
          </Link>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={local.layout}>
          <div className={local.sideCard}>
            <div className={formStyles.field}>
              <label>
                Месяц <span className={formStyles.req}>*</span>
              </label>
              <input
                type="date"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="Выбрать Дату"
              />
            </div>
            <div className={formStyles.field}>
              <label>Название</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {scope === 'division' ? (
              <div className={formStyles.field}>
                <label>
                  Подразделение <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={divisionId}
                  options={divisions}
                  placeholder="Поиск..."
                  onChange={setDivisionId}
                  allowClear
                />
              </div>
            ) : null}
            {scope === 'position' ? (
              <div className={formStyles.field}>
                <label>
                  Должность <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={positionId}
                  options={positions}
                  placeholder="Поиск"
                  onChange={setPositionId}
                  allowClear
                />
              </div>
            ) : null}
            {scope === 'employee' ? (
              <div className={formStyles.field}>
                <label>
                  Сотрудники <span className={formStyles.req}>*</span>
                </label>
                <MultiLookup
                  value={employeeIds}
                  options={employees}
                  placeholder="Поиск"
                  onChange={setEmployeeIds}
                />
              </div>
            ) : null}
            <div className={formStyles.field}>
              <label>Статус</label>
              <label className={formStyles.toggleRow}>
                <button
                  type="button"
                  className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                />
                <span>Активный</span>
              </label>
            </div>
          </div>

          <div className={local.rulesCol}>
            {FINE_RULE_SECTIONS.map((sec) => {
              const list = rules[sec.key] || [];
              return (
                <section key={sec.key} className={local.ruleCard}>
                  <div className={local.ruleHead}>
                    <h2 className={local.ruleTitle}>{sec.title}</h2>
                    <button
                      type="button"
                      className={local.addLink}
                      onClick={() => openAdd(sec.key)}
                    >
                      + Добавить
                    </button>
                  </div>
                  <table className={local.ruleTable}>
                    <thead>
                      <tr>
                        {sec.hasTime ? <th>Время</th> : null}
                        <th>Повторение</th>
                        <th>Тип</th>
                        <th>Значение</th>
                        <th>Периодичность</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.length === 0 ? (
                        <tr>
                          <td
                            colSpan={sec.hasTime ? 5 : 4}
                            className={local.ruleEmpty}
                          >
                            Правила не заданы
                          </td>
                        </tr>
                      ) : (
                        list.map((rule) => (
                          <tr
                            key={rule.id}
                            onClick={() => openEdit(sec.key, rule)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              removeRule(sec.key, rule.id);
                            }}
                          >
                            {sec.hasTime ? (
                              <td>{formatRange(rule.timeFrom, rule.timeTo)}</td>
                            ) : null}
                            <td>{formatRange(rule.repeatFrom, rule.repeatTo)}</td>
                            <td>{formatRuleType(rule.type)}</td>
                            <td>{formatRuleValue(rule)}</td>
                            <td>
                              {rule.periodicityMin != null ? rule.periodicityMin : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {modalKey && section ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setModalKey(null)}
          role="presentation"
        >
          <div
            className={local.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="fine-rule-title"
          >
            <div className={local.modalHead}>
              <h3 className={local.modalTitle} id="fine-rule-title">
                {section.short}
              </h3>
              <button
                type="button"
                className={local.modalClose}
                onClick={() => setModalKey(null)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className={local.modalBody}>
              {section.hasTime ? (
                <div>
                  <div className={formStyles.fieldLabel}>Время (мин)</div>
                  <div className={local.rangeRow}>
                    <div className={local.rangeField}>
                      <label>от</label>
                      <input
                        value={draft.timeFrom}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, timeFrom: e.target.value }))
                        }
                        inputMode="numeric"
                      />
                    </div>
                    <div className={local.rangeField}>
                      <label>до (включительно)</label>
                      <input
                        value={draft.timeTo}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, timeTo: e.target.value }))
                        }
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <div>
                <div className={formStyles.fieldLabel}>Повторение (дн)</div>
                <div className={local.rangeRow}>
                  <div className={local.rangeField}>
                    <label>от</label>
                    <input
                      value={draft.repeatFrom}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, repeatFrom: e.target.value }))
                      }
                      inputMode="numeric"
                    />
                  </div>
                  <div className={local.rangeField}>
                    <label>до (включительно)</label>
                    <input
                      value={draft.repeatTo}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, repeatTo: e.target.value }))
                      }
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className={formStyles.fieldLabel}>Тип</div>
                <div className={formStyles.radioRow}>
                  {FINE_RULE_TYPES.map((t) => (
                    <label key={t} className={formStyles.radio}>
                      <input
                        type="radio"
                        name="fine-rule-type"
                        checked={draft.type === t}
                        onChange={() => setDraft((d) => ({ ...d, type: t }))}
                      />
                      {FINE_RULE_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>
              {draft.type !== 'annulment' ? (
                <div className={formStyles.field}>
                  <label>
                    {valueFieldLabel(draft.type)} <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    value={draft.value}
                    onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                    inputMode="decimal"
                  />
                </div>
              ) : null}
              {showPeriodicity(draft.type) ? (
                <div className={formStyles.field}>
                  <label>Периодичность (мин)</label>
                  <input
                    value={draft.periodicityMin}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, periodicityMin: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </div>
              ) : null}
              {showInsidePeriod(draft.type, section.hasTime) ? (
                <label className={formStyles.check}>
                  <input
                    type="checkbox"
                    checked={draft.onlyInsidePeriod}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, onlyInsidePeriod: e.target.checked }))
                    }
                  />
                  Учитывать время только внутри штрафного периода
                </label>
              ) : null}
              {modalError ? <p className={styles.error}>{modalError}</p> : null}
            </div>
            <div className={local.modalFoot}>
              <button type="button" className={formStyles.btnSave} onClick={saveRule}>
                Сохранить
              </button>
              <button
                type="button"
                className={formStyles.btnClose}
                onClick={() => setModalKey(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
