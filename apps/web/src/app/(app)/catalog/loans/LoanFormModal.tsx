'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { toPickItems } from '@/components/employee-pick';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { LOAN_CURRENCIES, loanTitle, type LoanRow } from '@/lib/loans';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function LoanFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<
    Array<{ id: string; lastName: string; firstName: string; tabNumber?: string; positionName?: string }>
  >([]);

  const [number, setNumber] = useState('');
  const [loanDate, setLoanDate] = useState(today());
  const [contractNumber, setContractNumber] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(firstOfMonth());
  const [principal, setPrincipal] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [note, setNote] = useState('');

  const empItems = useMemo(() => toPickItems(employees), [employees]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setNumber('');
    setLoanDate(today());
    setContractNumber('');
    setContractDate('');
    setEmployeeId('');
    setStartDate(firstOfMonth());
    setEndDate(firstOfMonth());
    setPrincipal('');
    setCurrency('UZS');
    setNote('');

    apiFetch<
      | {
          items?: Array<{
            id: string;
            lastName: string;
            firstName: string;
            tabNumber?: string;
            position?: { name: string };
          }>;
        }
      | Array<{
          id: string;
          lastName: string;
          firstName: string;
          tabNumber?: string;
          position?: { name: string };
        }>
    >('/api/employees?status=active&limit=500')
      .then((emps) => {
        const list = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            lastName: e.lastName,
            firstName: e.firstName,
            tabNumber: e.tabNumber,
            positionName: e.position?.name,
          })),
        );
      })
      .catch(() => setEmployees([]));
  }, [open]);

  async function save(andComplete: boolean) {
    if (!loanDate) {
      setError('Укажите дату займа');
      return;
    }
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (!startDate || !endDate) {
      setError('Укажите период С / До');
      return;
    }
    if (!(Number(principal) > 0)) {
      setError('Укажите сумму');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<LoanRow>('/api/payroll/loans', {
        method: 'POST',
        body: JSON.stringify({
          number: number.trim() || undefined,
          loanDate,
          contractNumber: contractNumber.trim() || undefined,
          contractDate: contractDate || undefined,
          employeeId,
          startDate,
          endDate: endDate || undefined,
          principal: Number(principal) || 0,
          currency,
          note: note.trim() || undefined,
        }),
      });
      if (andComplete && created?.id) {
        await apiFetch(`/api/payroll/loans/${created.id}/complete`, { method: 'POST' });
      }
      onSaved(created?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title={loanTitle('create')}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy}
            onClick={() => void save(true)}
          >
            Сохранить и завершить
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Номер займа</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="авто" />
          </label>
          <label className={modal.field}>
            <span>
              Дата займа <em className={modal.req}>*</em>
            </span>
            <input type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
          </label>
        </div>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Номер договора</span>
            <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} />
          </label>
          <label className={modal.field}>
            <span>Дата договора</span>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
            />
          </label>
        </div>
        <label className={modal.field}>
          <span>
            Сотрудник <em className={modal.req}>*</em>
          </span>
          <EmployeeLookup
            value={employeeId}
            options={empItems}
            placeholder="Поиск"
            onChange={setEmployeeId}
          />
        </label>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              С <em className={modal.req}>*</em>
            </span>
            <input
              type="month"
              value={startDate.slice(0, 7)}
              onChange={(e) => setStartDate(`${e.target.value}-01`)}
            />
          </label>
          <label className={modal.field}>
            <span>
              До <em className={modal.req}>*</em>
            </span>
            <input
              type="month"
              value={endDate.slice(0, 7)}
              onChange={(e) => setEndDate(`${e.target.value}-01`)}
            />
          </label>
        </div>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Сумма <em className={modal.req}>*</em>
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>Валюта</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {LOAN_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
      </div>
    </FormModal>
  );
}
