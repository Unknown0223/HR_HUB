'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { toDatetimeLocal } from '@/lib/manual-ops';

export function ManualFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string, openAfter: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [docDate, setDocDate] = useState(toDatetimeLocal());
  const [number, setNumber] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setDocDate(toDatetimeLocal());
    setNumber('');
    setNote('');
  }, [open]);

  async function save(openAfter: boolean) {
    if (!docDate) {
      setError('Дата обязательна');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/payroll/manual-ops', {
        method: 'POST',
        body: JSON.stringify({
          docDate: new Date(docDate).toISOString(),
          number: number.trim() || undefined,
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
      title="Ручная операция (создание)"
      onClose={onClose}
      width="md"
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
              type="datetime-local"
              step="1"
              value={docDate.slice(0, 19)}
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

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
