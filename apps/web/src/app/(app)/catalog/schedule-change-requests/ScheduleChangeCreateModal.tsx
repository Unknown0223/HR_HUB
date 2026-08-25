'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string | null;
};

type ChangeKind = 'day_swap' | 'schedule_change';
type DayType = 'work' | 'off';
type SwapPair = { fromDate: string; toDate: string };
type DayChange = { date: string; dayType: DayType };

function empLabel(e: Employee) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

export function ScheduleChangeCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const empWrapRef = useRef<HTMLDivElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [empQ, setEmpQ] = useState('');
  const [empOpen, setEmpOpen] = useState(false);
  const [changeKind, setChangeKind] = useState<ChangeKind>('schedule_change');
  const [swaps, setSwaps] = useState<SwapPair[]>([{ fromDate: '', toDate: '' }]);
  const [days, setDays] = useState<DayChange[]>([{ date: '', dayType: 'work' }]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setEmployeeId('');
    setEmpQ('');
    setChangeKind('schedule_change');
    setSwaps([{ fromDate: '', toDate: '' }]);
    setDays([{ date: '', dayType: 'work' }]);
    setNote('');
    apiFetch<Employee[] | { items: Employee[] }>(
      '/api/employees?status=active&limit=500',
    )
      .then((d) => setEmployees(Array.isArray(d) ? d : d.items || []))
      .catch(() => setEmployees([]));
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!empWrapRef.current?.contains(e.target as Node)) setEmpOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectedEmp = employees.find((e) => e.id === employeeId);
  const filteredEmployees = useMemo(() => {
    const q = empQ.trim().toLowerCase();
    if (!q) return employees.slice(0, 30);
    return employees
      .filter((e) =>
        [empLabel(e), e.tabNumber || ''].join(' ').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [employees, empQ]);

  async function save() {
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (changeKind === 'day_swap') {
      if (!swaps.some((s) => s.fromDate && s.toDate)) {
        setError('Укажите пару дат для обмена');
        return;
      }
    } else if (!days.some((d) => d.date)) {
      setError('Укажите дату изменения');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const emp = employees.find((e) => e.id === employeeId);
      const title =
        changeKind === 'day_swap'
          ? `Обмен дней · ${emp ? empLabel(emp) : ''}`
          : `Изменение графика · ${emp ? empLabel(emp) : ''}`;
      const payload =
        changeKind === 'day_swap'
          ? {
              changeKind: 'day_swap',
              swaps: swaps.filter((s) => s.fromDate && s.toDate),
              note: note.trim() || undefined,
            }
          : {
              changeKind: 'schedule_change',
              days: days
                .filter((d) => d.date)
                .map((d) => ({ date: d.date, dayType: d.dayType })),
              note: note.trim() || undefined,
            };
      const created = await apiFetch<{ id: string }>('/api/hr/requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          type: 'schedule_change',
          title,
          visibility: 'shared',
          payload,
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
      title="Запрос на изменение графика"
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
        <div className={modal.field} ref={empWrapRef}>
          <span>
            Сотрудник <em className={modal.req}>*</em>
          </span>
          <div className={modal.combo}>
            <input
              placeholder="Поиск..."
              value={empQ}
              onChange={(e) => {
                setEmpQ(e.target.value);
                setEmpOpen(true);
                if (selectedEmp && e.target.value !== empLabel(selectedEmp)) {
                  setEmployeeId('');
                }
              }}
              onFocus={() => setEmpOpen(true)}
              autoComplete="off"
            />
            {empOpen ? (
              <ul className={modal.comboList}>
                {filteredEmployees.length === 0 ? (
                  <li className={modal.comboEmpty}>Нет сотрудников</li>
                ) : (
                  filteredEmployees.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className={
                          e.id === employeeId
                            ? modal.comboItemActive
                            : modal.comboItem
                        }
                        onClick={() => {
                          setEmployeeId(e.id);
                          setEmpQ(empLabel(e));
                          setEmpOpen(false);
                        }}
                      >
                        <span>{empLabel(e)}</span>
                        {e.tabNumber ? (
                          <span className={modal.comboMeta}>{e.tabNumber}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>

        <div className={modal.field}>
          <span>
            Тип запроса <em className={modal.req}>*</em>
          </span>
          <div className={modal.radioRow}>
            <label className={modal.radio}>
              <input
                type="radio"
                checked={changeKind === 'day_swap'}
                onChange={() => setChangeKind('day_swap')}
              />
              Обмен дней
            </label>
            <label className={modal.radio}>
              <input
                type="radio"
                checked={changeKind === 'schedule_change'}
                onChange={() => setChangeKind('schedule_change')}
              />
              Изменение графика
            </label>
          </div>
        </div>

        {changeKind === 'day_swap' ? (
          <div className={modal.field}>
            <span>Даты обмена</span>
            <div className={modal.swapList}>
              {swaps.map((s, i) => (
                <div key={i} className={modal.swapRow}>
                  <input
                    type="date"
                    className={modal.dateInput}
                    value={s.fromDate}
                    onChange={(e) =>
                      setSwaps((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, fromDate: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <span className={modal.swapArrow}>↔</span>
                  <input
                    type="date"
                    className={modal.dateInput}
                    value={s.toDate}
                    onChange={(e) =>
                      setSwaps((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, toDate: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {swaps.length > 1 ? (
                    <button
                      type="button"
                      className={modal.iconBtn}
                      onClick={() =>
                        setSwaps((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className={modal.addBtn}
                onClick={() =>
                  setSwaps((prev) => [...prev, { fromDate: '', toDate: '' }])
                }
              >
                +
              </button>
            </div>
          </div>
        ) : (
          <div className={modal.field}>
            <div className={modal.swapList}>
              {days.map((d, i) => (
                <div key={i} className={modal.dayRow}>
                  <input
                    type="date"
                    className={modal.dateInput}
                    value={d.date}
                    onChange={(e) =>
                      setDays((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, date: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <div className={modal.dayTypeRadios}>
                    <label className={modal.radio}>
                      <input
                        type="radio"
                        name={`dt-${i}`}
                        checked={d.dayType === 'work'}
                        onChange={() =>
                          setDays((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? { ...x, dayType: 'work' } : x,
                            ),
                          )
                        }
                      />
                      Рабочий
                    </label>
                    <label className={modal.radio}>
                      <input
                        type="radio"
                        name={`dt-${i}`}
                        checked={d.dayType === 'off'}
                        onChange={() =>
                          setDays((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? { ...x, dayType: 'off' } : x,
                            ),
                          )
                        }
                      />
                      Выходной
                    </label>
                  </div>
                  {days.length > 1 ? (
                    <button
                      type="button"
                      className={modal.iconBtn}
                      onClick={() =>
                        setDays((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className={modal.addBtn}
                onClick={() =>
                  setDays((prev) => [...prev, { date: '', dayType: 'work' }])
                }
              >
                +
              </button>
            </div>
          </div>
        )}

        <div className={modal.field}>
          <span>Примечание</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Примечание..."
          />
        </div>
      </div>
    </FormModal>
  );
}
