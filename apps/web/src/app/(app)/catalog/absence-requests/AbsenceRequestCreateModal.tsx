'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';

type AbsenceType = {
  id: string;
  name: string;
  allowEmployeeRequest?: boolean;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type Kind = 'part_day' | 'full_day' | 'multi_day';

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

export function AbsenceRequestCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [types, setTypes] = useState<AbsenceType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [absenceTypeId, setAbsenceTypeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<Kind>('part_day');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [note, setNote] = useState('');
  const [typeQ, setTypeQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setAbsenceTypeId('');
    setKind('part_day');
    setNote('');
    setTypeQ('');
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setEndDate(today);
    apiFetch<AbsenceType[]>('/api/hr/absence-types')
      .then((d) =>
        setTypes(
          Array.isArray(d)
            ? d.filter((t) => t.allowEmployeeRequest !== false)
            : [],
        ),
      )
      .catch(() => setTypes([]));
    apiFetch<Employee[] | { items: Employee[] }>(
      '/api/employees?status=active&limit=500',
    )
      .then((d) => {
        const list = Array.isArray(d) ? d : d.items || [];
        setEmployees(list);
        if (list[0]) setEmployeeId(list[0].id);
      })
      .catch(() => setEmployees([]));
  }, [open]);

  const filteredTypes = useMemo(() => {
    const q = typeQ.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => t.name.toLowerCase().includes(q));
  }, [types, typeQ]);

  async function save() {
    if (!absenceTypeId) {
      setError('Выберите вид отсутствия');
      return;
    }
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/hr/absences', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          absenceTypeId,
          startDate: date,
          endDate: kind === 'multi_day' ? endDate : date,
          startTime: kind === 'part_day' ? startTime : undefined,
          endTime: kind === 'part_day' ? endTime : undefined,
          note: note || undefined,
          meta: {
            requestKind: kind,
            ...(kind === 'part_day' ? { startTime, endTime } : {}),
          },
        }),
      });
      onCreated(created.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Запрос на отсутствие"
      onClose={onClose}
      width="md"
      footer={
        <>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
        <div className={modal.field}>
          <span>
            Сотрудник <em className={modal.req}>*</em>
          </span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {empLabel(e)}
              </option>
            ))}
          </select>
        </div>

        <div className={modal.field}>
          <span>
            Вид отсутствия <em className={modal.req}>*</em>
          </span>
          <input
            placeholder="Поиск..."
            value={typeQ}
            onChange={(e) => setTypeQ(e.target.value)}
          />
          <select
            value={absenceTypeId}
            onChange={(e) => setAbsenceTypeId(e.target.value)}
          >
            <option value="">—</option>
            {filteredTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className={modal.radioRow}>
          {(
            [
              ['part_day', 'Часть дня'],
              ['full_day', 'Весь день'],
              ['multi_day', 'Несколько дней'],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className={modal.radio}>
              <input
                type="radio"
                checked={kind === v}
                onChange={() => setKind(v)}
              />
              {l}
            </label>
          ))}
        </div>

        <div className={modal.row2}>
          <div className={modal.field}>
            <span>
              {kind === 'multi_day' ? 'Начало' : 'Дата'}{' '}
              <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {kind === 'part_day' ? (
            <>
              <div className={modal.field}>
                <span>
                  Начало <em className={modal.req}>*</em>
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className={modal.field}>
                <span>
                  Конец <em className={modal.req}>*</em>
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </>
          ) : null}
          {kind === 'multi_day' ? (
            <div className={modal.field}>
              <span>
                Конец <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className={modal.field}>
          <span>Примечание</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </FormModal>
  );
}
