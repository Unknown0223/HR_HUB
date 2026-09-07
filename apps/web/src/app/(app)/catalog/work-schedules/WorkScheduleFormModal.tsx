'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import type { ScheduleKind } from './page';

const KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'ordinary', label: 'Обычный' },
  { kind: 'hourly', label: 'По-часовой' },
  { kind: 'advanced', label: 'Продвинутый' },
  { kind: 'multi_shift', label: 'Многосменный' },
  { kind: 'advanced_multi_shift', label: 'Продвинутый многосменный' },
];

type ScheduleRow = {
  id: string;
  name: string;
  code: string;
  kind?: ScheduleKind;
  startTime?: string;
  endTime?: string;
  graceMinutes?: number;
  isActive: boolean;
};

export function WorkScheduleFormModal({
  open,
  editId,
  initialKind = 'ordinary',
  onClose,
  onSaved,
}: {
  open: boolean;
  editId?: string | null;
  initialKind?: ScheduleKind;
  onClose: () => void;
  onSaved: (id: string, openDoc: boolean) => void;
}) {
  const isEdit = Boolean(editId);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [kind, setKind] = useState<ScheduleKind>(initialKind);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [graceMinutes, setGraceMinutes] = useState('15');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setKind(initialKind);
      setName('');
      setCode('');
      setStartTime('09:00');
      setEndTime('18:00');
      setGraceMinutes('15');
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<ScheduleRow>(`/api/attendance/schedules/${editId}`)
      .then((row) => {
        setKind((row.kind as ScheduleKind) || 'ordinary');
        setName(row.name || '');
        setCode(row.code || '');
        setStartTime(row.startTime || '09:00');
        setEndTime(row.endTime || '18:00');
        setGraceMinutes(String(row.graceMinutes ?? 15));
        setIsActive(row.isActive !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId, initialKind]);

  async function save(openDoc: boolean) {
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
        kind,
        startTime,
        endTime,
        graceMinutes: Number(graceMinutes) || 0,
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/attendance/schedules/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId, openDoc);
      } else {
        const created = await apiFetch<{ id: string }>('/api/attendance/schedules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        onSaved(created?.id || '', openDoc);
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
      title={isEdit ? 'График работы (изменение)' : 'График работы (создание)'}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || loading}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy || loading}
            onClick={() => void save(true)}
          >
            Сохранить и открыть
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      {loading ? (
        <p style={{ color: '#64788f', fontSize: 13 }}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>
              Тип графика <em className={modal.req}>*</em>
            </span>
            <select
              value={kind}
              disabled={isEdit}
              onChange={(e) => setKind(e.target.value as ScheduleKind)}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Название <em className={modal.req}>*</em>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={modal.field}>
              <span>Код</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Начало</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Окончание</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Допуск (мин)</span>
              <input
                type="number"
                min={0}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
              />
            </label>
            <label className={modal.radio} style={{ alignSelf: 'end', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </label>
          </div>

          <p style={{ color: '#64788f', fontSize: 13, margin: 0 }}>
            Годовой календарь и расширенные настройки — в карточке графика («Сохранить и
            открыть»).
          </p>
        </div>
      )}
    </FormModal>
  );
}
