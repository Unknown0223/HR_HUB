'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch, getSession } from '@/lib/api';

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
  email?: string | null;
};

export type OvertimeFormValues = {
  employeeId: string;
  requestDate: string;
  overtimeTime: string;
  timeType: string;
  note: string;
};

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** "02:30" → hours number */
export function overtimeHoursFromTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  return Math.round((h + m / 60) * 100) / 100;
}

export function OvertimeRequestFormModal({
  open,
  onClose,
  onSaved,
  mode,
  editId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  mode: 'personal' | 'manager';
  editId?: string | null;
  initial?: Partial<OvertimeFormValues> | null;
}) {
  const isEdit = Boolean(editId);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [requestDate, setRequestDate] = useState(todayIso);
  const [overtimeTime, setOvertimeTime] = useState('02:00');
  const [timeType, setTimeType] = useState('Сверхурочные');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setRequestDate(initial?.requestDate || todayIso());
    setOvertimeTime(initial?.overtimeTime || '02:00');
    setTimeType(initial?.timeType || 'Сверхурочные');
    setNote(initial?.note || '');
    setEmployeeId(initial?.employeeId || '');

    apiFetch<Employee[] | { items: Employee[] }>('/api/employees?status=active&limit=500')
      .then((emps) => {
        const empList = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(empList);
        if (initial?.employeeId) {
          setEmployeeId(initial.employeeId);
          return;
        }
        if (mode === 'personal') {
          const session = getSession();
          const email = session?.user?.email?.toLowerCase();
          const matched = email
            ? empList.find((e) => e.email?.toLowerCase() === email)
            : undefined;
          setEmployeeId(matched?.id || empList[0]?.id || '');
        } else if (empList[0]) {
          setEmployeeId(empList[0].id);
        }
      })
      .catch(() => setEmployees([]));
  }, [open, mode, initial]);

  const title = useMemo(() => {
    if (isEdit) return 'Запросы по сверхурочным (изменение)';
    if (mode === 'personal') return 'Запросы по личным сверхурочным (создание)';
    return 'Запросы по сверхурочным (создание)';
  }, [isEdit, mode]);

  async function save() {
    if (!employeeId) {
      setError('Укажите сотрудника');
      return;
    }
    if (!requestDate) {
      setError('Укажите дату запроса');
      return;
    }
    if (!overtimeTime) {
      setError('Укажите сверхурочное время');
      return;
    }

    const hours = overtimeHoursFromTime(overtimeTime);
    if (hours <= 0) {
      setError('Сверхурочное время должно быть больше 00:00');
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    const payload = {
      requestDate,
      startDate: requestDate,
      endDate: requestDate,
      overtimeTime,
      hours,
      timeType: timeType.trim() || 'Сверхурочные',
      note: note.trim() || undefined,
    };

    setBusy(true);
    setError('');
    try {
      if (isEdit && editId) {
        const updated = await apiFetch<{ id: string }>(`/api/hr/requests/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            employeeId,
            title: `Сверхурочные · ${overtimeTime} · ${emp ? empLabel(emp) : ''}`.trim(),
            payload,
          }),
        });
        onSaved(updated.id);
      } else {
        const created = await apiFetch<{ id: string }>('/api/hr/requests', {
          method: 'POST',
          body: JSON.stringify({
            employeeId,
            type: 'overtime',
            title: `Сверхурочные · ${overtimeTime} · ${emp ? empLabel(emp) : ''}`.trim(),
            visibility: mode === 'personal' ? 'personal' : 'shared',
            payload,
          }),
        });
        onSaved(created.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title={title}
      onClose={onClose}
      width="md"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
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
      <div className={modal.fields}>
        {mode === 'manager' || isEdit ? (
          <label className={modal.field}>
            <span>
              Сотрудник <em className={modal.req}>*</em>
            </span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Поиск...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {empLabel(e)}
                  {e.tabNumber ? ` · ${e.tabNumber}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={modal.field}>
          <span>
            Дата запроса <em className={modal.req}>*</em>
          </span>
          <input
            type="date"
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
          />
        </label>

        <label className={modal.field}>
          <span>
            Сверхурочное время <em className={modal.req}>*</em>
          </span>
          <input
            type="time"
            value={overtimeTime}
            onChange={(e) => setOvertimeTime(e.target.value)}
          />
        </label>

        <label className={modal.field}>
          <span>Типы времени</span>
          <input
            value={timeType}
            onChange={(e) => setTimeType(e.target.value)}
            placeholder="Сверхурочные"
          />
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
