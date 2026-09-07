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
  scheduleId?: string | null;
};

type Shift = {
  id: string;
  code: string;
  name: string;
  startTime?: string;
  endTime?: string;
  scheduleId: string;
  schedule?: { id: string; name: string; code?: string } | null;
  isActive?: boolean;
};

export type RosterChangeFormValues = {
  employeeId: string;
  requestDate: string;
  shiftId: string;
  shiftName?: string;
  scheduleId?: string;
  recommendedEmployeeId: string;
  recommendedEmployeeName?: string;
  note: string;
  interHired?: boolean;
};

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function shiftLabel(s: Shift) {
  const times =
    s.startTime && s.endTime ? ` (${s.startTime}-${s.endTime})` : '';
  const sched = s.schedule?.name ? ` · ${s.schedule.name}` : '';
  return `${s.code ? `${s.code} — ` : ''}${s.name}${times}${sched}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RosterChangeFormModal({
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
  /** personal = Мои; manager = Доступные */
  mode: 'personal' | 'manager';
  editId?: string | null;
  initial?: Partial<RosterChangeFormValues> | null;
}) {
  const isEdit = Boolean(editId);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [requestDate, setRequestDate] = useState(todayIso);
  const [shiftId, setShiftId] = useState('');
  const [recommendedEmployeeId, setRecommendedEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const [interHired, setInterHired] = useState(false);
  const [showAssignedOnly, setShowAssignedOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setRequestDate(initial?.requestDate || todayIso());
    setShiftId(initial?.shiftId || '');
    setRecommendedEmployeeId(initial?.recommendedEmployeeId || '');
    setNote(initial?.note || '');
    setInterHired(Boolean(initial?.interHired));
    setShowAssignedOnly(false);
    setEmployeeId(initial?.employeeId || '');

    Promise.all([
      apiFetch<Employee[] | { items: Employee[] }>('/api/employees?status=active&limit=500'),
      apiFetch<Shift[] | { items: Shift[] }>('/api/catalog/schedule-shifts'),
    ])
      .then(([emps, sh]) => {
        const empList = Array.isArray(emps) ? emps : emps.items || [];
        const shiftList = (Array.isArray(sh) ? sh : sh.items || []).filter(
          (s) => s.isActive !== false,
        );
        setEmployees(empList);
        setShifts(shiftList);

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
      .catch(() => {
        setEmployees([]);
        setShifts([]);
      });
  }, [open, mode, initial]);

  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === shiftId),
    [shifts, shiftId],
  );

  const replacementCandidates = useMemo(() => {
    let list = employees.filter((e) => e.id !== employeeId);
    if (showAssignedOnly && selectedShift?.scheduleId) {
      list = list.filter((e) => e.scheduleId === selectedShift.scheduleId);
    }
    return list;
  }, [employees, employeeId, showAssignedOnly, selectedShift]);

  const title = useMemo(() => {
    if (isEdit) return 'Запрос на изменение расписания (изменение)';
    if (mode === 'personal') {
      return 'Запрос на изменение расписания (добавление, личный)';
    }
    return 'Запрос на изменение расписания (создание)';
  }, [isEdit, mode]);

  async function save() {
    if (!requestDate) {
      setError('Укажите дату запроса');
      return;
    }
    if (!shiftId) {
      setError('Укажите смену');
      return;
    }
    if (!recommendedEmployeeId) {
      setError('Укажите замещающего сотрудника');
      return;
    }
    if (!employeeId) {
      setError('Укажите сотрудника');
      return;
    }

    const shift = shifts.find((s) => s.id === shiftId);
    const emp = employees.find((e) => e.id === employeeId);
    const rec = employees.find((e) => e.id === recommendedEmployeeId);
    const payload = {
      changeKind: 'roster_substitute',
      requestDate,
      shiftId,
      shiftName: shift ? shiftLabel(shift) : undefined,
      shiftCode: shift?.code,
      scheduleId: shift?.scheduleId,
      recommendedEmployeeId,
      recommendedEmployeeName: rec ? empLabel(rec) : undefined,
      replacementEmployeeId: recommendedEmployeeId,
      note: note.trim() || undefined,
      interHired,
    };

    setBusy(true);
    setError('');
    try {
      const titleText = [
        'Расписание',
        shift ? shiftLabel(shift) : null,
        emp ? empLabel(emp) : null,
        rec ? `→ ${empLabel(rec)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      if (isEdit && editId) {
        const updated = await apiFetch<{ id: string }>(`/api/hr/requests/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            employeeId,
            title: titleText,
            payload,
          }),
        });
        onSaved(updated.id);
      } else {
        const created = await apiFetch<{ id: string }>('/api/hr/requests', {
          method: 'POST',
          body: JSON.stringify({
            employeeId,
            type: 'roster_change',
            title: titleText,
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
            Смена <em className={modal.req}>*</em>
          </span>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Поиск...</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)}
              </option>
            ))}
          </select>
          {!shifts.length ? (
            <span className={modal.hint} style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Нет смен — создайте в «Список смен расписания»
            </span>
          ) : null}
        </label>

        <label className={modal.field}>
          <span>
            {mode === 'personal' ? 'Замещающий сотрудник' : 'Заменяющий сотрудник'}{' '}
            <em className={modal.req}>*</em>
          </span>
          <select
            value={recommendedEmployeeId}
            onChange={(e) => setRecommendedEmployeeId(e.target.value)}
          >
            <option value="">Поиск...</option>
            {replacementCandidates.map((e) => (
              <option key={e.id} value={e.id}>
                {empLabel(e)}
                {e.tabNumber ? ` · ${e.tabNumber}` : ''}
              </option>
            ))}
          </select>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginTop: 6,
              fontSize: '0.82rem',
            }}
          >
            <button
              type="button"
              onClick={() => setShowAssignedOnly((v) => !v)}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'none',
                color: '#0a85e2',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {showAssignedOnly
                ? 'Все сотрудники'
                : `Назначенные (${replacementCandidates.length}) сотрудники`}
            </button>
            {mode === 'manager' ? (
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                <input
                  type="checkbox"
                  checked={interHired}
                  onChange={(e) => setInterHired(e.target.checked)}
                />
                Межнанимаемый сотрудник
              </label>
            ) : null}
          </div>
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
