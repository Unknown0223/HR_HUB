'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type GradeRow = {
  id: string;
  code: string;
  name: string;
  level?: number;
  isActive: boolean;
};

export function GradeFormModal({
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
  const [code, setCode] = useState('');
  const [level, setLevel] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setLevel('');
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<GradeRow>(`/api/catalog/grades/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setLevel(row.level != null ? String(row.level) : '');
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
    setBusy(true);
    setError('');
    try {
      const body = {
        code: code.trim() || `GR-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim(),
        level: Number(level) || 1,
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/grades/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<GradeRow>('/api/catalog/grades', {
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
      title={isEdit ? 'Разряд (изменение)' : 'Разряд (создание)'}
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
              <span>Порядковый номер</span>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="1"
              />
            </label>
          </div>

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
