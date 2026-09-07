'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
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

type EmpOpt = {
  id: string;
  lastName: string;
  firstName: string;
  tabNumber?: string;
  positionName?: string;
};

async function loadLookups() {
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
  const employees: EmpOpt[] = list.map((e) => ({
    id: e.id,
    lastName: e.lastName,
    firstName: e.firstName,
    tabNumber: e.tabNumber,
    positionName: e.position?.name,
  }));
  const acc = Array.isArray(accRaw) ? accRaw : accRaw.items || [];
  const ded = Array.isArray(dedRaw) ? dedRaw : dedRaw.items || [];
  return { employees, types: [...acc, ...ded] as TypeOpt[] };
}

/** Create modal for Arena list */
export function PaymentOrderFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [note, setNote] = useState('');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [types, setTypes] = useState<TypeOpt[]>([]);
  const empItems = useMemo(() => toPickItems(employees), [employees]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setEmployeeId('');
    setAccrualName('');
    setAmount('');
    setStartDate(today());
    setEndDate(today());
    setNote('');
    setLoading(true);
    loadLookups()
      .then(({ employees: emps, types: t }) => {
        setEmployees(emps);
        setTypes(t);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open]);

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
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<PaymentOrderRow>('/api/payroll/payment-orders', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          accrualName: accrualName || undefined,
          amount: Number(amount) || 0,
          startDate,
          endDate: endDate || undefined,
          note: note || undefined,
        }),
      });
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
      title={orderTitle('create')}
      onClose={onClose}
      width="lg"
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
      {loading ? <p className={modal.error} style={{ background: 'transparent', border: 'none', color: '#8ca0b8' }}>Загрузка…</p> : null}
      <div className={modal.fields}>
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
        <label className={modal.field}>
          <span>Начисление</span>
          <select value={accrualName} onChange={(e) => setAccrualName(e.target.value)}>
            <option value="">Поиск...</option>
            {types.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Сумма поручения <em className={modal.req}>*</em>
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>
              Дата начала <em className={modal.req}>*</em>
            </span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <label className={modal.field}>
          <span>Дата окончания</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className={modal.field}>
          <span>Примечание</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}

/** Full-page form for view / edit routes */
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
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [types, setTypes] = useState<TypeOpt[]>([]);

  const readOnly = viewOnly || status === 'paid';
  const pageTitle = orderTitle(isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);

  useEffect(() => {
    void (async () => {
      try {
        const { employees: emps, types: t } = await loadLookups();
        setEmployees(emps);
        setTypes(t);
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
