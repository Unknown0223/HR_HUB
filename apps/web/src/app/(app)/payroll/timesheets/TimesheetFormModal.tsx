'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { formatMonthRu } from '@/lib/fine-policies';

type Opt = { id: string; label: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function TimesheetFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [divisions, setDivisions] = useState<Opt[]>([]);

  const [docDate, setDocDate] = useState(todayIso());
  const [number, setNumber] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [divisionId, setDivisionId] = useState('');
  const [periodType, setPeriodType] = useState('full_month');
  const [note, setNote] = useState('');

  const loadLookups = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<{ divisions?: Opt[] }>('/api/catalog/lookups');
      setDivisions(d.divisions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки справочников');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setDocDate(todayIso());
    setNumber('');
    setMonth(currentMonth());
    setDivisionId('');
    setPeriodType('full_month');
    setNote('');
    void loadLookups();
  }, [open, loadLookups]);

  async function save(openAfter: boolean) {
    if (!docDate) {
      setError('Дата обязательна');
      return;
    }
    if (!month) {
      setError('Месяц обязателен');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/payroll/timesheets', {
        method: 'POST',
        body: JSON.stringify({
          docDate,
          number: number.trim() || undefined,
          month: `${month}-01`,
          divisionId: divisionId || undefined,
          periodType,
          note: note.trim() || undefined,
          lines: [],
        }),
      });
      onSaved(created?.id || '', openAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Табель (создание)"
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
            Отмена
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}
      <div className={modal.fields}>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Дата <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>Номер</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="авто"
            />
          </label>
        </div>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Месяц <em className={modal.req}>*</em>
            </span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span>{month ? formatMonthRu(`${month}-01`) : ''}</span>
          </label>
          <label className={modal.field}>
            <span>Тип периода</span>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
              <option value="full_month">Полный месяц</option>
            </select>
          </label>
        </div>

        <label className={modal.field}>
          <span>Подразделение</span>
          <select
            value={divisionId}
            disabled={loading}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            <option value="">—</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
