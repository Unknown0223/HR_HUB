'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type DynamicObjectRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  isActive?: boolean;
};

export function DynamicObjectFormModal({
  open,
  onClose,
  onSaved,
  editId,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  editId?: string | null;
  kind: 'entity' | 'fact';
}) {
  const isEdit = Boolean(editId);
  const titleNoun = kind === 'fact' ? 'Факт' : 'Объект';
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<DynamicObjectRow>(`/api/catalog/dynamic-objects/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
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
    if (!code.trim()) {
      setError('Укажите код');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim(),
        kind,
        isActive: active,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/dynamic-objects/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<DynamicObjectRow>(
          '/api/catalog/dynamic-objects',
          {
            method: 'POST',
            body: JSON.stringify(body),
          },
        );
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
      title={
        isEdit ? `${titleNoun} (изменение)` : `${titleNoun} (создание)`
      }
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
              Код <em className={modal.req}>*</em>
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isEdit}
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
