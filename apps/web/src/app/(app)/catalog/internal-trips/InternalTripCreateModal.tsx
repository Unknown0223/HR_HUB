'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';

type Named = { id: string; name: string; code?: string };

type Employee = Named & {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
  divisionId?: string | null;
  positionId?: string | null;
  scheduleId?: string | null;
};

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function InternalTripCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Named[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [positions, setPositions] = useState<Named[]>([]);
  const [schedules, setSchedules] = useState<Named[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [recipientDivisionId, setRecipientDivisionId] = useState('');
  const [senderDivisionId, setSenderDivisionId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [employeeId, setEmployeeId] = useState('');
  const [lines, setLines] = useState<{ employeeId: string; positionId: string; quantity: string }[]>(
    [],
  );
  const [requestDate, setRequestDate] = useState(todayIso);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [earlyArrival, setEarlyArrival] = useState('00:00');
  const [lateDeparture, setLateDeparture] = useState('00:00');
  const [bySchedule, setBySchedule] = useState(true);
  const [workScheduleId, setWorkScheduleId] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setRecipientDivisionId('');
    setSenderDivisionId('');
    setLocationId('');
    setPositionId('');
    setQuantity('1');
    setEmployeeId('');
    setLines([]);
    setRequestDate(todayIso());
    setStartDate(todayIso());
    setEndDate(todayIso());
    setEarlyArrival('00:00');
    setLateDeparture('00:00');
    setBySchedule(true);
    setWorkScheduleId('');
    setAccrualName('');
    setAmount('');
    setNote('');

    Promise.all([
      apiFetch<Employee[] | { items: Employee[] }>('/api/employees?status=active&limit=500'),
      apiFetch<Named[] | { items: Named[] }>('/api/organization/divisions'),
      apiFetch<Named[] | { items: Named[] }>('/api/attendance/locations'),
      apiFetch<Named[] | { items: Named[] }>('/api/organization/positions'),
      apiFetch<Named[] | { items: Named[] }>('/api/attendance/schedules'),
    ])
      .then(([emps, divs, locs, poss, schs]) => {
        const empList = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(empList);
        setDivisions(Array.isArray(divs) ? divs : divs.items || []);
        setLocations(Array.isArray(locs) ? locs : locs.items || []);
        setPositions(Array.isArray(poss) ? poss : poss.items || []);
        setSchedules(Array.isArray(schs) ? schs : schs.items || []);
        if (empList[0]) {
          setEmployeeId(empList[0].id);
          if (empList[0].divisionId) {
            setSenderDivisionId(empList[0].divisionId);
            setRecipientDivisionId(empList[0].divisionId);
          }
          if (empList[0].positionId) setPositionId(empList[0].positionId);
          if (empList[0].scheduleId) setWorkScheduleId(empList[0].scheduleId);
        }
      })
      .catch(() => {
        setEmployees([]);
        setDivisions([]);
        setLocations([]);
        setPositions([]);
        setSchedules([]);
      });
  }, [open]);

  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );

  function addLine() {
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        employeeId,
        positionId: positionId || selectedEmp?.positionId || '',
        quantity: quantity || '1',
      },
    ]);
    setError('');
  }

  async function save() {
    const primary =
      lines[0] ||
      (employeeId
        ? {
            employeeId,
            positionId: positionId || selectedEmp?.positionId || '',
            quantity: quantity || '1',
          }
        : null);

    if (!primary?.employeeId) {
      setError('Добавьте сотрудника');
      return;
    }
    if (!recipientDivisionId) {
      setError('Укажите подразделение (получатель)');
      return;
    }
    if (!locationId) {
      setError('Укажите локацию');
      return;
    }
    if (!startDate || !endDate) {
      setError('Укажите даты');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/hr/internal-trips', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: primary.employeeId,
          recipientDivisionId,
          senderDivisionId: senderDivisionId || undefined,
          locationId,
          positionId: primary.positionId || undefined,
          quantity: Number(primary.quantity) || 1,
          requestDate,
          startDate,
          endDate,
          earlyArrival,
          lateDeparture,
          bySchedule,
          workScheduleId: bySchedule && workScheduleId ? workScheduleId : undefined,
          accrualName: accrualName.trim() || undefined,
          amount: amount.trim() || undefined,
          note: note.trim() || undefined,
          visibility: 'personal',
          meta: {
            lines: lines.length
              ? lines
              : [
                  {
                    employeeId: primary.employeeId,
                    positionId: primary.positionId,
                    quantity: primary.quantity,
                  },
                ],
          },
        }),
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <FormModal
      open={open}
      title="Внутренняя командировка (создание)"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
      <label className={modal.field}>
        <span>
          Подразделение (получатель) <em className={modal.req}>*</em>
        </span>
        <select
          value={recipientDivisionId}
          onChange={(e) => setRecipientDivisionId(e.target.value)}
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
          Локация <em className={modal.req}>*</em>
        </span>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Поиск...</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className={modal.field}>
        <span>Подразделение (отправитель)</span>
        <select
          value={senderDivisionId}
          onChange={(e) => setSenderDivisionId(e.target.value)}
        >
          <option value="">Поиск...</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <div className={modal.row2}>
        <label className={modal.field}>
          <span>
            Должность <em className={modal.req}>*</em>
          </span>
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            <option value="">Поиск...</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={modal.field} style={{ maxWidth: 120 }}>
          <span>
            Кол-во <em className={modal.req}>*</em>
          </span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
      </div>

      <label className={modal.field}>
        <span>
          Сотрудник <em className={modal.req}>*</em>
        </span>
        <select
          value={employeeId}
          onChange={(e) => {
            const id = e.target.value;
            setEmployeeId(id);
            const emp = employees.find((x) => x.id === id);
            if (emp?.divisionId) setSenderDivisionId(emp.divisionId);
            if (emp?.positionId) setPositionId(emp.positionId);
            if (emp?.scheduleId) setWorkScheduleId(emp.scheduleId);
          }}
        >
          <option value="">Поиск...</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {empLabel(e)}
              {e.tabNumber ? ` · ${e.tabNumber}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className={modal.row2} style={{ gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button type="button" className={modal.btnGhost} onClick={addLine}>
          Добавить
        </button>
        <button type="button" className={modal.btnGhost} onClick={() => setPickOpen(true)}>
          Подбор сотрудников
        </button>
      </div>

      {lines.length > 0 ? (
        <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
          {lines.map((line, i) => {
            const e = employees.find((x) => x.id === line.employeeId);
            const p = positions.find((x) => x.id === line.positionId);
            return (
              <li key={`${line.employeeId}-${i}`}>
                {e ? empLabel(e) : line.employeeId}
                {p ? ` · ${p.name}` : ''} · ×{line.quantity}
                <button
                  type="button"
                  style={{ marginLeft: 8, border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
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

      <div className={modal.row2}>
        <label className={modal.field}>
          <span>
            Дата начала <em className={modal.req}>*</em>
          </span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className={modal.field}>
          <span>
            Дата окончания <em className={modal.req}>*</em>
          </span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>

      <div className={modal.row2}>
        <label className={modal.field}>
          <span>
            Ранний приход (до начала внутренней командировки) <em className={modal.req}>*</em>
          </span>
          <input
            type="time"
            value={earlyArrival}
            onChange={(e) => setEarlyArrival(e.target.value)}
          />
        </label>
        <label className={modal.field}>
          <span>
            Поздний уход (после окончания внутренней командировки) <em className={modal.req}>*</em>
          </span>
          <input
            type="time"
            value={lateDeparture}
            onChange={(e) => setLateDeparture(e.target.value)}
          />
        </label>
      </div>

      <label
        className={modal.field}
        style={{ flexDirection: 'row', alignItems: 'center', gap: '0.65rem' }}
      >
        <input
          type="checkbox"
          checked={bySchedule}
          onChange={(e) => setBySchedule(e.target.checked)}
        />
        <span style={{ margin: 0 }}>По графику</span>
      </label>

      {bySchedule ? (
        <label className={modal.field}>
          <span>
            График работы <em className={modal.req}>*</em>
          </span>
          <select
            value={workScheduleId}
            onChange={(e) => setWorkScheduleId(e.target.value)}
          >
            <option value="">Поиск...</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className={modal.row2}>
        <label className={modal.field}>
          <span>
            Начисления <em className={modal.req}>*</em>
          </span>
          <input
            value={accrualName}
            onChange={(e) => setAccrualName(e.target.value)}
            placeholder="Поиск..."
          />
        </label>
        <label className={modal.field}>
          <span>
            Сумма <em className={modal.req}>*</em>
          </span>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>

      <label className={modal.field}>
        <span>Описание</span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      </div>
    </FormModal>
    {pickOpen ? (
      <EmployeePickModal
        title="Подбор сотрудников"
        confirmText="Добавить"
        items={toPickItems(
          employees.map((e) => ({
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            middleName: e.middleName,
            tabNumber: e.tabNumber || undefined,
            positionName: positions.find((p) => p.id === (e.positionId || positionId))?.name,
          })),
        )}
        excludeIds={lines.map((l) => l.employeeId)}
        onClose={() => setPickOpen(false)}
        onConfirm={(ids) => {
          const have = new Set(lines.map((l) => l.employeeId));
          setLines((prev) => [
            ...prev,
            ...ids
              .filter((id) => !have.has(id))
              .map((id) => {
                const emp = employees.find((x) => x.id === id);
                return {
                  employeeId: id,
                  positionId: positionId || emp?.positionId || '',
                  quantity: quantity || '1',
                };
              }),
          ]);
          setPickOpen(false);
        }}
      />
    ) : null}
    </>
  );
}
