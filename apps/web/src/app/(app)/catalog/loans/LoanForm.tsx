'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import {
  formatMonthRu,
  LOAN_CURRENCIES,
  loanTitle,
  type LoanRow,
} from '@/lib/loans';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/loans';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function LoanForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
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
  const [employees, setEmployees] = useState<
    Array<{ id: string; lastName: string; firstName: string; tabNumber?: string; positionName?: string }>
  >([]);

  const readOnly = viewOnly || status === 'closed';
  const pageTitle = loanTitle(isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);

  useEffect(() => {
    void (async () => {
      try {
        const emps = await apiFetch<
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
        >('/api/employees?status=active&limit=500').catch(() => []);
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
        if (docId) {
          const row = await apiFetch<LoanRow>(`/api/payroll/loans/${docId}`);
          setStatus(row.status);
          setNumber(row.number || '');
          setLoanDate(String(row.loanDate || '').slice(0, 10) || today());
          setContractNumber(row.contractNumber || '');
          setContractDate(row.contractDate ? String(row.contractDate).slice(0, 10) : '');
          setEmployeeId(row.employeeId);
          setStartDate(String(row.startDate || '').slice(0, 10) || firstOfMonth());
          setEndDate(row.endDate ? String(row.endDate).slice(0, 10) : firstOfMonth());
          setPrincipal(String(row.principal ?? ''));
          setCurrency(row.currency || 'UZS');
          setNote(row.note || '');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  function payload() {
    return {
      number: number || undefined,
      loanDate,
      contractNumber: contractNumber || undefined,
      contractDate: contractDate || undefined,
      employeeId,
      startDate,
      endDate: endDate || undefined,
      principal: Number(principal) || 0,
      currency,
      note: note || undefined,
    };
  }

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
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<LoanRow>('/api/payroll/loans', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/loans/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andComplete && id) {
        await apiFetch(`/api/payroll/loans/${id}/complete`, { method: 'POST' });
      }
      router.push(PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="loans" titleOverride={pageTitle} />
      <div className={form.topBar}>
        <h1 className={form.title}>{pageTitle}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              {status !== 'active' ? (
                <button type="button" className={form.btnPost} disabled={saving} onClick={() => void save(true)}>
                  Завершить
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.head}>
        <div className={form.card}>
          <div className={form.grid2}>
            <div className={form.field}>
              <label>Номер займа</label>
              <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className={form.field}>
              <label>
                Дата займа <span className={form.req}>*</span>
              </label>
              <input type="date" value={loanDate} disabled={readOnly} onChange={(e) => setLoanDate(e.target.value)} />
            </div>
            <div className={form.field}>
              <label>Номер договора</label>
              <input
                value={contractNumber}
                disabled={readOnly}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            </div>
            <div className={form.field}>
              <label>Дата</label>
              <input
                type="date"
                value={contractDate}
                disabled={readOnly}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>
                Сотрудник <span className={form.req}>*</span>
              </label>
              <EmployeeLookup
                value={employeeId}
                options={empItems}
                disabled={readOnly}
                placeholder="Поиск"
                onChange={setEmployeeId}
              />
            </div>
            <div className={form.field}>
              <label>
                С <span className={form.req}>*</span>
              </label>
              <input
                type="month"
                value={startDate.slice(0, 7)}
                disabled={readOnly}
                onChange={(e) => setStartDate(`${e.target.value}-01`)}
              />
              <div className={extra.hint}>{formatMonthRu(startDate)}</div>
            </div>
            <div className={form.field}>
              <label>
                До <span className={form.req}>*</span>
              </label>
              <input
                type="month"
                value={endDate.slice(0, 7)}
                disabled={readOnly}
                onChange={(e) => setEndDate(`${e.target.value}-01`)}
              />
              <div className={extra.hint}>{formatMonthRu(endDate)}</div>
            </div>
          </div>
        </div>

        <div className={form.card}>
          <div className={form.field}>
            <label>
              Сумма <span className={form.req}>*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={principal}
              disabled={readOnly}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </div>
          <div className={form.field} style={{ marginTop: 10 }}>
            <label>Валюта</label>
            <select value={currency} disabled={readOnly} onChange={(e) => setCurrency(e.target.value)}>
              {LOAN_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className={form.field} style={{ marginTop: 10 }}>
            <label>Примечание</label>
            <textarea rows={6} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
