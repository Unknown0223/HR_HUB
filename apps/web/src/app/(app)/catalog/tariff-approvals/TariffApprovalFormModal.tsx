'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './TariffApprovalFormModal.module.css';

type Opt = { id: string; label: string };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function TariffApprovalFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [groups, setGroups] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [documentDate, setDocumentDate] = useState(todayInput());
  const [documentNumber, setDocumentNumber] = useState('');
  const [tariffGroupId, setTariffGroupId] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [linkedToBase, setLinkedToBase] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setDocumentDate(todayInput());
    setDocumentNumber('');
    setTariffGroupId('');
    setEffectiveAt('');
    setBaseRate('');
    setLinkedToBase(true);
    setNote('');
  }, [open]);

  useEffect(() => {
    if (!open || groups.length) return;
    let cancelled = false;
    apiFetch<{ tariffGroups?: Opt[] }>('/api/catalog/lookups')
      .then((lookups) => {
        if (!cancelled) setGroups(lookups.tariffGroups || []);
      })
      .catch(() => {
        /* lookups are optional */
      });
    return () => {
      cancelled = true;
    };
  }, [open, groups.length]);

  async function pickGroup(id: string) {
    setTariffGroupId(id);
    setBaseRate('');
    if (!id) return;
    try {
      const row = await apiFetch<{ baseRate?: string | number }>(
        `/api/catalog/tariff-groups/${id}`,
      );
      if (row.baseRate != null) setBaseRate(String(row.baseRate));
    } catch {
      /* base rate can be entered manually */
    }
  }

  async function save(andPost: boolean) {
    if (!documentDate || !tariffGroupId || !effectiveAt) {
      setError('Заполните обязательные поля');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/catalog/tariff-approvals', {
        method: 'POST',
        body: JSON.stringify({
          tariffGroupId,
          documentDate,
          documentNumber: documentNumber.trim() || null,
          effectiveAt,
          baseRate: baseRate ? Number(baseRate) : null,
          linkedToBase,
          note: note.trim() || null,
          status: 'draft',
        }),
      });
      if (andPost && created?.id) {
        await apiFetch(`/api/catalog/tariff-approvals/${created.id}/post`, {
          method: 'POST',
        });
      }
      onSaved(created?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Утверждение тарифной группы (создание)"
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
            Сохранить и провести
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
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>

          <label className={modal.field}>
            <span>Номер</span>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="авто"
            />
          </label>
        </div>

        <label className={modal.field}>
          <span>
            Тарифная группа <em className={modal.req}>*</em>
          </span>
          <select
            value={tariffGroupId}
            onChange={(e) => void pickGroup(e.target.value)}
          >
            <option value="">Не выбрано</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <div className={modal.row2}>
          <label className={modal.field}>
            <span>Базовый тариф</span>
            <input
              type="number"
              step="0.01"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
              placeholder="из тарифной группы"
            />
          </label>

          <label className={modal.field}>
            <span>
              Вступает в силу с <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={linkedToBase}
            onChange={(e) => setLinkedToBase(e.target.checked)}
          />
          Размеры тарифов уст. в привязке к базовому тарифу
        </label>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className={styles.hint}>
          Разряды и оклады добавляются после создания — откройте документ и нажмите
          «Изменить».
        </p>
      </div>
    </FormModal>
  );
}
