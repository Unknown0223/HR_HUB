'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  emptyAllowanceRule,
  parseAllowanceScope,
  type AllowancePolicyRow,
  type AllowanceRule,
  type AllowanceScope,
} from '@/lib/allowance-policies';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import localDanger from '../../catalog/document-types/page.module.css';
import local from './page.module.css';

type Opt = { id: string; label: string };

type RuleDraft = {
  id: string;
  startTime: string;
  endTime: string;
  coefficient: string;
};

function toDraft(r: AllowanceRule): RuleDraft {
  return {
    id: r.id,
    startTime: r.startTime || '',
    endTime: r.endTime || '',
    coefficient: r.coefficient != null ? String(r.coefficient) : '',
  };
}

export function AllowancePolicyForm({ policyId }: { policyId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = !policyId;
  const scope: AllowanceScope = parseAllowanceScope(searchParams.get('tab'));
  const listHref = `/payroll/allowance-policies${scope === 'company' ? '' : `?tab=${scope}`}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [divisionId, setDivisionId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [ruleSel, setRuleSel] = useState<Set<string>>(new Set());
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);

  useEffect(() => {
    apiFetch<{ divisions?: Opt[]; schedules?: Opt[] }>('/api/catalog/lookups')
      .then((d) => {
        setDivisions(d.divisions || []);
        setSchedules(d.schedules || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<AllowancePolicyRow>(`/api/payroll/allowance-policies/${policyId}`)
      .then((row) => {
        setMonth(row.month?.slice(0, 10) || '');
        setName(row.name || '');
        setActive(row.isActive !== false);
        setDivisionId(row.divisionId || '');
        setScheduleId(row.scheduleId || '');
        setRules((row.rules || []).map(toDraft));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [policyId, isNew]);

  function addRule() {
    const row = emptyAllowanceRule();
    setRules((prev) => [
      ...prev,
      { id: row.id, startTime: '', endTime: '', coefficient: '' },
    ]);
  }

  function patchRule(id: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeSelectedRules() {
    if (!ruleSel.size) return;
    setRules((prev) => prev.filter((r) => !ruleSel.has(r.id)));
    setRuleSel(new Set());
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
    if (scope === 'schedule' && !scheduleId) {
      setError('Укажите график работы');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      scope,
      month,
      name: name.trim(),
      isActive: active,
      divisionId: scope === 'division' ? divisionId : undefined,
      scheduleId: scope === 'schedule' ? scheduleId : undefined,
      rules: rules.map((r) => ({
        id: r.id,
        startTime: r.startTime || undefined,
        endTime: r.endTime || undefined,
        coefficient: r.coefficient.trim() === '' ? undefined : Number(r.coefficient.replace(',', '.')),
      })),
    };
    try {
      if (isNew) {
        await apiFetch('/api/payroll/allowance-policies', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/payroll/allowance-policies/${policyId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            month: payload.month,
            name: payload.name,
            isActive: payload.isActive,
            divisionId: payload.divisionId,
            scheduleId: payload.scheduleId,
            rules: payload.rules,
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

  const title = isNew ? 'Политики выплат (создание)' : 'Политики выплат (изменение)';

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

        <div className={local.stack}>
          <section className={local.section}>
            <h2 className={local.sectionTitle}>Общая информация</h2>
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
            {scope === 'schedule' ? (
              <div className={formStyles.field}>
                <label>
                  График работы <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup
                  value={scheduleId}
                  options={schedules}
                  placeholder="Поиск..."
                  onChange={setScheduleId}
                  allowClear
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
          </section>

          <section className={local.section}>
            <div className={local.rulesHead}>
              <h2 className={local.sectionTitle} style={{ margin: 0 }}>
                Правила
              </h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {ruleSel.size > 0 ? (
                  <button
                    type="button"
                    className={localDanger.btnDanger}
                    onClick={removeSelectedRules}
                  >
                    Удалить {ruleSel.size}
                  </button>
                ) : null}
                <button type="button" className={local.addBtn} onClick={addRule}>
                  Добавить
                </button>
              </div>
            </div>
            <table className={local.ruleTable}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={rules.length > 0 && rules.every((r) => ruleSel.has(r.id))}
                      onChange={(e) =>
                        setRuleSel(e.target.checked ? new Set(rules.map((r) => r.id)) : new Set())
                      }
                      aria-label="Выбрать все правила"
                    />
                  </th>
                  <th className={local.numCell}>№</th>
                  <th>Время начала</th>
                  <th>Время конца</th>
                  <th>Коэффициент Доплаты</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={local.ruleEmpty}>
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  rules.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={ruleSel.has(r.id)}
                          onChange={(e) => {
                            setRuleSel((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className={local.numCell}>{i + 1}</td>
                      <td>
                        <input
                          type="time"
                          value={r.startTime}
                          onChange={(e) => patchRule(r.id, { startTime: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={r.endTime}
                          onChange={(e) => patchRule(r.id, { endTime: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          value={r.coefficient}
                          onChange={(e) => patchRule(r.id, { coefficient: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
