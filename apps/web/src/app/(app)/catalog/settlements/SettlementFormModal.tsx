'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { toDatetimeLocal, type AccountPair } from '@/lib/settlements';

export function SettlementFormModal({
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
  const [pairs, setPairs] = useState<AccountPair[]>([]);

  const [docDate, setDocDate] = useState(toDatetimeLocal());
  const [number, setNumber] = useState('');
  const [note, setNote] = useState('');
  const [pairIds, setPairIds] = useState<string[]>([]);

  const loadLookups = useCallback(async () => {
    setLoading(true);
    try {
      const all = await apiFetch<AccountPair[]>('/api/payroll/account-pairs');
      const active = (Array.isArray(all) ? all : []).filter((p) => p.isActive);
      setPairs(active);
      setPairIds(active.map((p) => p.id));
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
    setDocDate(toDatetimeLocal());
    setNumber('');
    setNote('');
    setPairIds([]);
    void loadLookups();
  }, [open, loadLookups]);

  async function save(openAfter: boolean) {
    if (!docDate) {
      setError('Дата обязательна');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/payroll/settlements', {
        method: 'POST',
        body: JSON.stringify({
          docDate: new Date(docDate).toISOString(),
          number: number.trim() || undefined,
          note: note.trim() || undefined,
          pairIds,
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

  const selected = pairs.filter((p) => pairIds.includes(p.id));

  return (
    <FormModal
      open={open}
      title="Взаимозачет (создание)"
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
          <span>Парные счета</span>
          <select
            value=""
            disabled={loading}
            onChange={(e) => {
              const id = e.target.value;
              if (id && !pairIds.includes(id)) setPairIds((ids) => [...ids, id]);
            }}
          >
            <option value="">Добавить…</option>
            {pairs
              .filter((p) => !pairIds.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <span>
            {selected.length === 0
              ? 'Не выбрано'
              : selected.length === pairs.length && pairs.length > 0
                ? 'Выбраны все парные счета'
                : `Выбрано: ${selected.length}`}
          </span>
          {selected.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {selected.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={modal.btnGhost}
                  style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                  onClick={() => setPairIds((ids) => ids.filter((id) => id !== p.id))}
                >
                  {p.name} ×
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </FormModal>
  );
}
