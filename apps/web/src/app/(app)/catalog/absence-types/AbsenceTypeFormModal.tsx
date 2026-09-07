'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './AbsenceTypeFormModal.module.css';

type TimeOpt = { id: string; code: string; name: string };

type AbsenceType = {
  id: string;
  code: string;
  name: string;
  calcKind: string;
  timeTypeId?: string | null;
  isActive: boolean;
  allowEmployeeRequest: boolean;
  trackUnusedTime: boolean;
  requestTimeLimit: boolean;
  providedIn: string;
  isAnnual: boolean;
  daysPerYear?: number | null;
  limitDays?: number | null;
  monthlyQtyLimit: boolean;
  monthlyHourLimit: boolean;
  carryoverPolicy?: string | null;
};

const PROVIDED_IN = [
  ['calendar', 'В календарных днях'],
  ['working', 'В рабочие дни'],
  ['production', 'В производственных днях'],
] as const;

export function AbsenceTypeFormModal({
  open,
  onClose,
  onSaved,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
}) {
  const isEdit = Boolean(editId);
  const [timeTypes, setTimeTypes] = useState<TimeOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [timeTypeId, setTimeTypeId] = useState('');
  const [allowReq, setAllowReq] = useState(true);
  const [trackUnused, setTrackUnused] = useState(false);
  const [reqLimit, setReqLimit] = useState(false);
  const [providedIn, setProvidedIn] = useState<string>('working');
  const [isAnnual, setIsAnnual] = useState(false);
  const [active, setActive] = useState(true);
  const [daysPerYear, setDaysPerYear] = useState('');
  const [limitDays, setLimitDays] = useState('');
  const [monthlyQty, setMonthlyQty] = useState(false);
  const [monthlyHour, setMonthlyHour] = useState(false);
  const [carryover, setCarryover] = useState('');

  useEffect(() => {
    if (!open) return;
    apiFetch<TimeOpt[] | { items?: TimeOpt[] }>('/api/catalog/time-types')
      .then((d) => setTimeTypes(Array.isArray(d) ? d : d.items || []))
      .catch(() => setTimeTypes([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setTimeTypeId('');
      setAllowReq(true);
      setTrackUnused(false);
      setReqLimit(false);
      setProvidedIn('working');
      setIsAnnual(false);
      setActive(true);
      setDaysPerYear('');
      setLimitDays('');
      setMonthlyQty(false);
      setMonthlyHour(false);
      setCarryover('');
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<AbsenceType>(`/api/hr/absence-types/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setTimeTypeId(row.timeTypeId || '');
        setAllowReq(row.allowEmployeeRequest !== false);
        setTrackUnused(!!row.trackUnusedTime);
        setReqLimit(!!row.requestTimeLimit);
        setProvidedIn(row.providedIn || 'working');
        setIsAnnual(!!row.isAnnual);
        setActive(row.isActive !== false);
        setDaysPerYear(row.daysPerYear != null ? String(row.daysPerYear) : '');
        setLimitDays(row.limitDays != null ? String(row.limitDays) : '');
        setMonthlyQty(!!row.monthlyQtyLimit);
        setMonthlyHour(!!row.monthlyHourLimit);
        setCarryover(row.carryoverPolicy || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || undefined,
        timeTypeId: timeTypeId || null,
        allowEmployeeRequest: allowReq,
        trackUnusedTime: trackUnused,
        requestTimeLimit: reqLimit,
        providedIn,
        isAnnual,
        isActive: active,
        calcKind: isAnnual ? 'annual' : 'one_time',
        daysPerYear: daysPerYear ? Number(daysPerYear) : null,
        limitDays: limitDays ? Number(limitDays) : null,
        monthlyQtyLimit: monthlyQty,
        monthlyHourLimit: monthlyHour,
        carryoverPolicy: carryover || null,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/hr/absence-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<AbsenceType>('/api/hr/absence-types', {
          method: 'POST',
          body: JSON.stringify(body),
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
      title={isEdit ? 'Вид отсутствия (изменение)' : 'Вид отсутствия (создание)'}
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
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Название <em className={modal.req}>*</em>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={modal.field}>
              <span>Код</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={isEdit ? '' : 'авто'}
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>Вид времени</span>
            <select value={timeTypeId} onChange={(e) => setTimeTypeId(e.target.value)}>
              <option value="">—</option>
              {timeTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className={modal.field}>
            <span>Предоставляется</span>
            <div className={modal.radioRow}>
              {PROVIDED_IN.map(([v, l]) => (
                <label key={v} className={modal.radio}>
                  <input
                    type="radio"
                    name="providedIn"
                    checked={providedIn === v}
                    onChange={() => setProvidedIn(v)}
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={allowReq}
                onChange={(e) => setAllowReq(e.target.checked)}
              />
              Разрешить сотрудникам создавать запрос
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={trackUnused}
                onChange={(e) => setTrackUnused(e.target.checked)}
              />
              Учитывать неиспользованное время
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={reqLimit}
                onChange={(e) => setReqLimit(e.target.checked)}
              />
              Ограничение времени запроса
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={isAnnual}
                onChange={(e) => setIsAnnual(e.target.checked)}
              />
              Является ежегодным
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={monthlyQty}
                onChange={(e) => setMonthlyQty(e.target.checked)}
              />
              Связан с лимитом количества
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={monthlyHour}
                onChange={(e) => setMonthlyHour(e.target.checked)}
              />
              Связан с лимитом часов
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Количество дней в год</span>
              <input
                type="number"
                min={0}
                value={daysPerYear}
                onChange={(e) => setDaysPerYear(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Количество дней ограничения</span>
              <input
                type="number"
                min={0}
                value={limitDays}
                onChange={(e) => setLimitDays(e.target.value)}
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>Политика переноса</span>
            <input value={carryover} onChange={(e) => setCarryover(e.target.value)} />
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Активный
          </label>
        </div>
      )}
    </FormModal>
  );
}
