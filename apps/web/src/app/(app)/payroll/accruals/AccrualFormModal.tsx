'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import { FilterSelectLookup } from '@/components/FilterSelectLookup';
import { MonthPeriodPicker } from '@/components/MonthPeriodPicker';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { ACCRUAL_KINDS, type AccrualKind } from '@/lib/accruals';

type Opt = { id: string; label: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7) + '-01';
}

export function AccrualFormModal({
  open,
  initialKind,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialKind?: string | null;
  onClose: () => void;
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [divisions, setDivisions] = useState<Opt[]>([]);

  const [kind, setKind] = useState<AccrualKind>('all_types');
  const [month, setMonth] = useState(currentMonth());
  const [docDate, setDocDate] = useState(todayIso());
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [mergeAccruals, setMergeAccruals] = useState(false);
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
    const startKind = (ACCRUAL_KINDS.find((k) => k.value === initialKind)?.value ||
      'all_types') as AccrualKind;
    setError('');
    setBusy(false);
    setKind(startKind);
    setMonth(currentMonth());
    setDocDate(todayIso());
    setNumber('');
    setTitle('');
    setDivisionId('');
    setCurrency('UZS');
    setMergeAccruals(startKind === 'sick_leave');
    setNote('');
    void loadLookups();
  }, [open, initialKind, loadLookups]);

  async function save(openAfter: boolean) {
    if (!month) {
      setError('Месяц начисления обязателен');
      return;
    }
    if (!docDate) {
      setError('Дата обязательна');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/payroll/accruals', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          month: month.includes('-01') ? month.slice(0, 10) : `${month.slice(0, 7)}-01`,
          docDate,
          number: number.trim() || undefined,
          title: title.trim() || undefined,
          divisionId: divisionId || undefined,
          currency,
          note: note.trim() || undefined,
          mergeAccruals,
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
      title="Начисление (создание)"
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
        <label className={modal.field}>
          <span>
            Тип документа <em className={modal.req}>*</em>
          </span>
          <select value={kind} onChange={(e) => setKind(e.target.value as AccrualKind)}>
            {ACCRUAL_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Месяц начисления <em className={modal.req}>*</em>
            </span>
            <MonthPeriodPicker
              compact={false}
              label=""
              value={month}
              onChange={(next) => setMonth(next || currentMonth())}
            />
          </label>
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
        </div>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Номер</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="авто"
            />
          </label>
          <label className={modal.field}>
            <span>Валюта</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="UZS">Узбекский сум</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>

        <label className={modal.field}>
          <span>Название документа</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className={modal.field}>
          <span>Подразделение</span>
          <FilterSelectLookup
            value={divisionId}
            searchable
            placeholder={loading ? 'Загрузка…' : 'Выберите подразделение…'}
            options={divisions.map((d) => ({ value: d.id, label: d.label }))}
            onChange={setDivisionId}
          />
        </label>

        <label className={modal.radio}>
          <input
            type="checkbox"
            checked={mergeAccruals}
            onChange={(e) => setMergeAccruals(e.target.checked)}
          />
          Объединение начислений
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
