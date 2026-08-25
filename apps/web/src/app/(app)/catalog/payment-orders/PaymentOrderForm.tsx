'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import { orderTitle, type PaymentOrderRow } from '@/lib/payment-orders';
import form from '../../payroll/accruals/form.module.css';

const PATH = '/catalog/payment-orders';

function today() {
  return new Date().toISOString().slice(0, 10);
}

type TypeOpt = { id: string; name: string };

export function PaymentOrderForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('new');
  const [employeeId, setEmployeeId] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [note, setNote] = useState('');
  const [employees, setEmployees] = useState<
    Array<{ id: string; lastName: string; firstName: string; tabNumber?: string; positionName?: string }>
  >([]);
  const [types, setTypes] = useState<TypeOpt[]>([]);

  const readOnly = viewOnly || status === 'paid';
  const pageTitle = orderTitle(isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);

  useEffect(() => {
    void (async () => {
      try {
        const [emps, accRaw, dedRaw] = await Promise.all([
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
          >('/api/employees?status=active&limit=500').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/accrual-types').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/deduction-types').catch(() => []),
        ]);
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
        const acc = Array.isArray(accRaw) ? accRaw : accRaw.items || [];
        const ded = Array.isArray(dedRaw) ? dedRaw : dedRaw.items || [];
        setTypes([...acc, ...ded]);
        if (docId) {
          const row = await apiFetch<PaymentOrderRow>(`/api/payroll/payment-orders/${docId}`);
          setStatus(row.status);
          setEmployeeId(row.employeeId || '');
          setAccrualName(row.accrualName || row.title || '');
          setAmount(String(row.amount ?? ''));
          setStartDate(row.startDate ? String(row.startDate).slice(0, 10) : today());
          setEndDate(row.endDate ? String(row.endDate).slice(0, 10) : today());
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
      employeeId,
      accrualName: accrualName || undefined,
      amount: Number(amount) || 0,
      startDate,
      endDate: endDate || undefined,
      note: note || undefined,
    };
  }

  async function save() {
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (!(Number(amount) > 0)) {
      setError('Укажите сумму поручения');
      return;
    }
    if (!startDate) {
      setError('Укажите дату начала');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        await apiFetch('/api/payroll/payment-orders', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
      } else {
        await apiFetch(`/api/payroll/payment-orders/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
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
      <PageSubnav groupKey="payment-orders" titleOverride={pageTitle} />
      <div className={form.topBar}>
        <h1 className={form.title}>{pageTitle}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save()}>
              Сохранить
            </button>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.card}>
        <div className={form.grid2}>
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
          <div className={`${form.field} ${form.full}`}>
            <label>Начисление</label>
            <select
              value={accrualName}
              disabled={readOnly}
              onChange={(e) => setAccrualName(e.target.value)}
            >
              <option value="">Поиск...</option>
              {types.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
              {accrualName && !types.some((t) => t.name === accrualName) ? (
                <option value={accrualName}>{accrualName}</option>
              ) : null}
            </select>
          </div>
          <div className={form.field}>
            <label>
              Сумма поручения <span className={form.req}>*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              disabled={readOnly}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className={form.field}>
            <label>
              Дата начала <span className={form.req}>*</span>
            </label>
            <input type="date" value={startDate} disabled={readOnly} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>Дата окончания</label>
            <input type="date" value={endDate} disabled={readOnly} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className={`${form.field} ${form.full}`}>
            <label>Примечание</label>
            <textarea rows={3} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
