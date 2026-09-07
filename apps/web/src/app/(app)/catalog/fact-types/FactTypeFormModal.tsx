'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type FactTypeRow = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  parentId?: string | null;
  accrualName?: string | null;
  isActive?: boolean;
};

export function FactTypeFormModal({
  open,
  onClose,
  onSaved,
  editId,
  parents,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
  parents: FactTypeRow[];
}) {
  const isEdit = Boolean(editId);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Количество');
  const [parentId, setParentId] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setUnit('Количество');
      setParentId('');
      setAccrualName('');
      setActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<FactTypeRow>(`/api/catalog/fact-types/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setUnit(row.unit || 'Количество');
        setParentId(row.parentId || '');
        setAccrualName(row.accrualName || '');
        setActive(row.isActive !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!unit.trim()) {
      setError('Укажите единицу измерения');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code:
          code.trim() ||
          name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9А-ЯЁ]+/gi, '_')
            .slice(0, 32),
        unit: unit.trim(),
        parentId: parentId || null,
        accrualName: accrualName.trim() || null,
        isActive: active,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/fact-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<FactTypeRow>('/api/catalog/fact-types', {
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
      title={isEdit ? 'Тип факта (изменение)' : 'Тип факта (создание)'}
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
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Единица измерения <em className={modal.req}>*</em>
              </span>
              <input
                list="fact-type-units"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Поиск..."
              />
              <datalist id="fact-type-units">
                <option value="Количество" />
                <option value="Сумма" />
                <option value="Часы" />
                <option value="%" />
              </datalist>
            </label>
            <label className={modal.field}>
              <span>Родитель</span>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Поиск...</option>
                {parents
                  .filter((r) => r.id !== editId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className={modal.field}>
            <span>Начисление</span>
            <input
              value={accrualName}
              onChange={(e) => setAccrualName(e.target.value)}
              placeholder="Поиск..."
            />
          </label>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Активный
            </label>
          </div>
        </div>
      )}
    </FormModal>
  );
}
