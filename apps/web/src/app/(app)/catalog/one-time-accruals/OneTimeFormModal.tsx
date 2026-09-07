'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import {
  CURRENCIES,
  kindTitle,
  type OneTimeDoc,
  type OneTimeKind,
} from '@/lib/one-time-accruals';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function OneTimeFormModal({
  open,
  kind,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: OneTimeKind;
  onClose: () => void;
  onSaved: (id: string, openDoc: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [divisions, setDivisions] = useState<{ id: string; label: string }[]>([]);

  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [month, setMonth] = useState(firstOfMonth());
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setNumber('');
    setDocDate(today());
    setMonth(firstOfMonth());
    setTitle('');
    setDivisionId('');
    setCurrency('UZS');
    setNote('');

    apiFetch<Array<{ id: string; name: string }>>('/api/organization/divisions')
      .then((d) =>
        setDivisions((Array.isArray(d) ? d : []).map((x) => ({ id: x.id, label: x.name }))),
      )
      .catch(() => setDivisions([]));
  }, [open, kind]);

  async function save(openDoc: boolean) {
    if (!docDate || !month) {
      setError('Заполните дату и месяц');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<OneTimeDoc>('/api/payroll/one-time-accruals', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          number: number.trim() || undefined,
          docDate,
          month,
          title: title.trim() || undefined,
          divisionId: divisionId || undefined,
          currency,
          calcType: 'value',
          percent: 0,
          useOneForAll: false,
          note: note.trim() || undefined,
          lines: [],
        }),
      });
      onSaved(created?.id || '', openDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title={kindTitle(kind, 'create')}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy}
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
      <div className={modal.fields}>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Дата <em className={modal.req}>*</em>
            </span>
            <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </label>
          <label className={modal.field}>
            <span>Номер</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="авто" />
          </label>
        </div>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Месяц <em className={modal.req}>*</em>
            </span>
            <input
              type="month"
              value={month.slice(0, 7)}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
            />
          </label>
          <label className={modal.field}>
            <span>Валюта</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={modal.field}>
          <span>Название документа</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={modal.field}>
          <span>Подразделение</span>
          <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            <option value="">— не выбрано —</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#8ca0b8', lineHeight: 1.45 }}>
          Строки сотрудников добавляются после создания — откройте документ и нажмите
          «Изменить».
        </p>
      </div>
    </FormModal>
  );
}
