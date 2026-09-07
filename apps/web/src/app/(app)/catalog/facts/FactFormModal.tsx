'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
  divisionId?: string;
};

type Division = { id: string; code: string; name: string };
type FactType = { id: string; code: string; name: string };

function empName(e?: Emp | null) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function FactFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [types, setTypes] = useState<FactType[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [factDate, setFactDate] = useState(todayInput());
  const [employeeId, setEmployeeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [factTypeId, setFactTypeId] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setFactDate(todayInput());
    setEmployeeId('');
    setDivisionId('');
    setFactTypeId('');
    setValue('');
    setLoading(true);
    Promise.all([
      apiFetch<FactType[] | { items: FactType[] }>('/api/catalog/fact-types'),
      apiFetch<{ items?: Emp[] } | Emp[]>('/api/employees?status=active&limit=500'),
      apiFetch<Division[] | { items?: Division[] }>('/api/catalog/divisions'),
    ])
      .then(([ft, emps, divs]) => {
        setTypes(Array.isArray(ft) ? ft : ft.items || []);
        const el = Array.isArray(emps)
          ? emps
          : Array.isArray((emps as { items?: Emp[] }).items)
            ? (emps as { items: Emp[] }).items
            : [];
        setEmployees(el);
        setDivisions(Array.isArray(divs) ? divs : divs.items || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open]);

  async function save() {
    if (!employeeId || !factTypeId || !value.trim() || !factDate) {
      setError('Заполните обязательные поля');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let div = divisionId;
      if (!div) {
        const emp = employees.find((x) => x.id === employeeId);
        if (emp?.divisionId) div = emp.divisionId;
      }
      await apiFetch('/api/catalog/facts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          divisionId: div || null,
          factTypeId,
          value: value.trim(),
          factDate,
          status: 'active',
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Добавить факт"
      onClose={onClose}
      width="md"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>
              Дата <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={factDate}
              onChange={(e) => setFactDate(e.target.value)}
            />
          </label>

          <label className={modal.field}>
            <span>
              Сотрудник <em className={modal.req}>*</em>
            </span>
            <select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                const emp = employees.find((x) => x.id === e.target.value);
                if (emp?.divisionId) setDivisionId(emp.divisionId);
              }}
            >
              <option value="">Поиск...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {empName(e)}
                  {e.tabNumber ? ` (${e.tabNumber})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>Подразделение</span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">Поиск...</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>
              Тип факта <em className={modal.req}>*</em>
            </span>
            <select
              value={factTypeId}
              onChange={(e) => setFactTypeId(e.target.value)}
            >
              <option value="">Поиск...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className={modal.field}>
            <span>
              Значение факта <em className={modal.req}>*</em>
            </span>
            <input value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        </div>
      )}
    </FormModal>
  );
}
