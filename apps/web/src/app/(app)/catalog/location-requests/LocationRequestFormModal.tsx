'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch, getSession } from '@/lib/api';

type Named = { id: string; name: string; code?: string };
type Employee = Named & {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
  email?: string | null;
};

export type LocationKind = 'part_day' | 'full_day' | 'multi_day';

export type LocationRequestFormValues = {
  employeeId: string;
  locationId: string;
  locationName?: string;
  requestKind: LocationKind;
  requestDate: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  note: string;
};

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function plusHours(hhmm: string, hours: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h || 0) + hours) * 60 + (m || 0);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function LocationRequestFormModal({
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
  /** personal = Мои (no employee field); manager = Доступные */
  mode: 'personal' | 'manager';
  editId?: string | null;
  initial?: Partial<LocationRequestFormValues> | null;
}) {
  const isEdit = Boolean(editId);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [requestKind, setRequestKind] = useState<LocationKind>('part_day');
  const [requestDate, setRequestDate] = useState(todayIso);
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    const st = nowTime();
    const kind = (initial?.requestKind as LocationKind) || 'part_day';
    setRequestKind(kind);
    setRequestDate(initial?.requestDate || todayIso());
    setStartDate(initial?.startDate || todayIso());
    setEndDate(initial?.endDate || todayIso());
    setStartTime(initial?.startTime || st);
    setEndTime(initial?.endTime || plusHours(st, 3));
    setNote(initial?.note || '');
    setLocationId(initial?.locationId || '');
    setEmployeeId(initial?.employeeId || '');

    Promise.all([
      apiFetch<Employee[] | { items: Employee[] }>('/api/employees?status=active&limit=500'),
      apiFetch<Named[] | { items: Named[] }>('/api/attendance/locations'),
    ])
      .then(([emps, locs]) => {
        const empList = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(empList);
        setLocations(Array.isArray(locs) ? locs : locs.items || []);

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
        setLocations([]);
      });
  }, [open, mode, initial]);

  const title = useMemo(() => {
    if (isEdit) return 'Запросы на локацию (изменение)';
    if (mode === 'personal') return 'Личный запрос на локацию (создание)';
    return 'Запросы на локацию (создание)';
  }, [isEdit, mode]);

  async function save() {
    if (!locationId) {
      setError('Укажите локацию');
      return;
    }
    if (!employeeId) {
      setError('Укажите сотрудника');
      return;
    }

    let start = requestDate;
    let end = requestDate;
    let st: string | undefined;
    let et: string | undefined;

    if (requestKind === 'part_day') {
      if (!requestDate || !startTime || !endTime) {
        setError('Укажите дату и время');
        return;
      }
      start = requestDate;
      end = requestDate;
      st = startTime;
      et = endTime;
    } else if (requestKind === 'full_day') {
      if (!requestDate) {
        setError('Укажите дату запроса');
        return;
      }
      start = requestDate;
      end = requestDate;
    } else {
      if (!startDate || !endDate) {
        setError('Укажите даты начала и окончания');
        return;
      }
      start = startDate;
      end = endDate;
    }

    const loc = locations.find((l) => l.id === locationId);
    const emp = employees.find((e) => e.id === employeeId);
    const payload = {
      locationId,
      locationName: loc?.name,
      requestKind,
      requestDate: requestKind === 'multi_day' ? start : requestDate,
      startDate: start,
      endDate: end,
      startTime: st,
      endTime: et,
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
            title: `Локация · ${loc?.name || ''} · ${emp ? empLabel(emp) : ''}`.trim(),
            payload,
          }),
        });
        onSaved(updated.id);
      } else {
        const created = await apiFetch<{ id: string }>('/api/hr/requests', {
          method: 'POST',
          body: JSON.stringify({
            employeeId,
            type: 'location',
            title: `Локация · ${loc?.name || ''} · ${emp ? empLabel(emp) : ''}`.trim(),
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

        <div className={modal.field}>
          <span>Тип</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: 4 }}>
            {(
              [
                ['part_day', 'Часть дня'],
                ['full_day', 'Полный день'],
                ['multi_day', 'Несколько дней'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="locKind"
                  checked={requestKind === val}
                  onChange={() => setRequestKind(val)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {requestKind === 'multi_day' ? (
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата начала <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>
                Дата окончания <em className={modal.req}>*</em>
              </span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
        ) : (
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
        )}

        {requestKind === 'part_day' ? (
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Время начала <em className={modal.req}>*</em>
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>
                Время окончания <em className={modal.req}>*</em>
              </span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
        ) : null}

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
