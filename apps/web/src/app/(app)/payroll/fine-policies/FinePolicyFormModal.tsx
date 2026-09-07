'use client';

import { useEffect, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { MultiLookup } from '@/app/(app)/catalog/cashboxes/MultiLookup';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import {
  FINE_SCOPE_TABS,
  emptyFineRules,
  type FinePolicyRow,
  type FineScope,
} from '@/lib/fine-policies';
import styles from './page.module.css';

type Opt = { id: string; label: string };

function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export function FinePolicyFormModal({
  open,
  scope,
  onClose,
  onSaved,
}: {
  open: boolean;
  scope: FineScope;
  onClose: () => void;
  /** openAfter → jump to the full editor to configure fine rules */
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);

  const [month, setMonth] = useState(firstOfMonth());
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);

  const scopeLabel =
    FINE_SCOPE_TABS.find((t) => t.id === scope)?.label ?? 'По компании';

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setMonth(firstOfMonth());
    setName('');
    setIsActive(true);
    setDivisionId('');
    setPositionId('');
    setEmployeeIds([]);
    setLoading(true);
    apiFetch<{ divisions?: Opt[]; positions?: Opt[]; employees?: Opt[] }>(
      '/api/catalog/lookups',
    )
      .then((d) => {
        setDivisions(d.divisions || []);
        setPositions(d.positions || []);
        setEmployees(d.employees || []);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка загрузки справочников'),
      )
      .finally(() => setLoading(false));
  }, [open]);

  async function save(openAfter: boolean) {
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
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<FinePolicyRow>('/api/payroll/fine-policies', {
        method: 'POST',
        body: JSON.stringify({
          scope,
          month,
          name: name.trim(),
          isActive,
          divisionId: scope === 'division' ? divisionId : undefined,
          positionId: scope === 'position' ? positionId : undefined,
          employeeIds: scope === 'employee' ? employeeIds : [],
          rules: emptyFineRules(),
        }),
      });
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
      title="Политика штрафов (создание)"
      onClose={onClose}
      width="md"
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
            Сохранить и задать правила
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

          {scope === 'position' ? (
            <div className={modal.field}>
              <span>
                Должность <em className={modal.req}>*</em>
              </span>
              <SearchLookup
                value={positionId}
                options={positions}
                placeholder="Поиск..."
                onChange={setPositionId}
                allowClear
              />
            </div>
          ) : null}

          {scope === 'employee' ? (
            <div className={modal.field}>
              <span>
                Сотрудники <em className={modal.req}>*</em>
              </span>
              <MultiLookup
                value={employeeIds}
                options={employees}
                placeholder="Поиск..."
                onChange={setEmployeeIds}
              />
            </div>
          ) : null}

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
