'use client';

import { useEffect, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import {
  ALLOWANCE_SCOPE_TABS,
  newAllowanceRuleId,
  type AllowancePolicyRow,
  type AllowanceScope,
} from '@/lib/allowance-policies';
import styles from './page.module.css';

type Opt = { id: string; label: string };

type RuleDraft = {
  id: string;
  startTime: string;
  endTime: string;
  coefficient: string;
};

function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export function AllowancePolicyFormModal({
  open,
  scope,
  onClose,
  onSaved,
}: {
  open: boolean;
  scope: AllowanceScope;
  onClose: () => void;
  /** openAfter → jump to the full editor */
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);

  const [month, setMonth] = useState(firstOfMonth());
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [divisionId, setDivisionId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([]);

  const scopeLabel =
    ALLOWANCE_SCOPE_TABS.find((t) => t.id === scope)?.label ?? 'По компании';

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setMonth(firstOfMonth());
    setName('');
    setIsActive(true);
    setDivisionId('');
    setScheduleId('');
    setRules([]);
    setLoading(true);
    apiFetch<{ divisions?: Opt[]; schedules?: Opt[] }>('/api/catalog/lookups')
      .then((d) => {
        setDivisions(d.divisions || []);
        setSchedules(d.schedules || []);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка загрузки справочников'),
      )
      .finally(() => setLoading(false));
  }, [open]);

  function patchRule(id: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(openAfter: boolean) {
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
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<AllowancePolicyRow>(
        '/api/payroll/allowance-policies',
        {
          method: 'POST',
          body: JSON.stringify({
            scope,
            month,
            name: name.trim(),
            isActive,
            divisionId: scope === 'division' ? divisionId : undefined,
            scheduleId: scope === 'schedule' ? scheduleId : undefined,
            rules: rules.map((r) => ({
              id: r.id,
              startTime: r.startTime || undefined,
              endTime: r.endTime || undefined,
              coefficient:
                r.coefficient.trim() === ''
                  ? undefined
                  : Number(r.coefficient.replace(',', '.')),
            })),
          }),
        },
      );
      onSaved(created?.id || '', openAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Политика выплат (создание)"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy || loading}
            onClick={() => void save(true)}
          >
            Сохранить и открыть
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Месяц <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Уровень</span>
              <input value={scopeLabel} readOnly />
            </label>
          </div>

          <label className={modal.field}>
            <span>Название</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          {scope === 'division' ? (
            <div className={modal.field}>
              <span>
                Подразделение <em className={modal.req}>*</em>
              </span>
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
            <div className={modal.field}>
              <span>
                График работы <em className={modal.req}>*</em>
              </span>
              <SearchLookup
                value={scheduleId}
                options={schedules}
                placeholder="Поиск..."
                onChange={setScheduleId}
                allowClear
              />
            </div>
          ) : null}

          <div className={styles.modalRules}>
            <div className={styles.modalRulesHead}>
              <span>Правила</span>
              <button
                type="button"
                className={styles.addBtn}
                onClick={() =>
                  setRules((prev) => [
                    ...prev,
                    {
                      id: newAllowanceRuleId(),
                      startTime: '',
                      endTime: '',
                      coefficient: '',
                    },
                  ])
                }
              >
                Добавить
              </button>
            </div>
            <table className={styles.ruleTable}>
              <thead>
                <tr>
                  <th className={styles.numCell}>№</th>
                  <th>Начало</th>
                  <th>Конец</th>
                  <th>Коэффициент</th>
                  <th className={styles.numCell} />
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.ruleEmpty}>
                      Правила не заданы
                    </td>
                  </tr>
                ) : (
                  rules.map((r, i) => (
                    <tr key={r.id}>
                      <td className={styles.numCell}>{i + 1}</td>
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
                          onChange={(e) =>
                            patchRule(r.id, { coefficient: e.target.value })
                          }
                        />
                      </td>
                      <td className={styles.numCell}>
                        <button
                          type="button"
                          className={modal.iconBtn}
                          aria-label="Удалить правило"
                          onClick={() =>
                            setRules((prev) => prev.filter((x) => x.id !== r.id))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </label>
          </div>
        </div>
      )}
    </FormModal>
  );
}
