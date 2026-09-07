'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type TariffGroupRow = {
  id: string;
  code: string;
  name: string;
  fullName?: string | null;
  gradeId?: string | null;
  baseRate?: string | number | null;
  isActive: boolean;
};

type GradeOption = { id: string; code?: string | null; name: string };

function autoCode(name: string) {
  return (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9А-ЯЁ]+/gi, '-')
      .slice(0, 24) || `TG-${Date.now().toString(36).toUpperCase()}`
  );
}

export function TariffGroupFormModal({
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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [grades, setGrades] = useState<GradeOption[]>([]);

  useEffect(() => {
    if (!open) return;
    apiFetch<GradeOption[]>('/api/catalog/grades')
      .then((rows) => setGrades(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setFullName('');
      setCode('');
      setGradeId('');
      setBaseRate('');
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<TariffGroupRow>(`/api/catalog/tariff-groups/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setFullName(row.fullName || row.name || '');
        setCode(row.code || '');
        setGradeId(row.gradeId || '');
        setBaseRate(row.baseRate != null ? String(row.baseRate) : '');
        setIsActive(row.isActive !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save() {
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    if (!fullName.trim()) {
      setError('Полное название обязательно');
      return;
    }
    const rate = baseRate.trim() ? Number(baseRate.trim().replace(',', '.')) : 0;
    if (!Number.isFinite(rate) || rate < 0) {
      setError('Базовая ставка указана неверно');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        fullName: fullName.trim(),
        code: code.trim() || autoCode(name),
        gradeId: gradeId || null,
        baseRate: rate,
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/tariff-groups/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<TariffGroupRow>('/api/catalog/tariff-groups', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        onSaved(created?.id || '');
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
      title={isEdit ? 'Тарифная группа (изменение)' : 'Тарифная группа (создание)'}
      onClose={onClose}
      width="md"
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
          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className={modal.field}>
            <span>
              Полное название <em className={modal.req}>*</em>
            </span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Код</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={isEdit ? '' : 'авто'}
              />
            </label>

            <label className={modal.field}>
              <span>Базовая ставка</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>Разряд</span>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              <option value="">—</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code ? `${g.code} — ${g.name}` : g.name}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </label>
          </div>
        </div>
      )}
    </FormModal>
  );
}
