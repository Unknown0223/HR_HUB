'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type TypeRow = {
  id: string;
  code: string;
  name: string;
  accrualName?: string | null;
  isActive: boolean;
};

const DEFAULT_ACCRUALS = [
  'Штраф за опоздание',
  'Штраф за прогул',
  'Удержание из зарплаты',
  'Без начисления',
];

export function IncidentTypeFormModal({
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
  const [accrualName, setAccrualName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [knownAccruals, setKnownAccruals] = useState<string[]>(DEFAULT_ACCRUALS);

  const accrualOptions = useMemo(() => {
    const set = new Set([...DEFAULT_ACCRUALS, ...knownAccruals]);
    if (accrualName.trim()) set.add(accrualName.trim());
    return Array.from(set);
  }, [knownAccruals, accrualName]);

  useEffect(() => {
    if (!open) return;
    apiFetch<TypeRow[]>('/api/catalog/incident-types')
      .then((rows) => {
        const names = (Array.isArray(rows) ? rows : [])
          .map((r) => r.accrualName)
          .filter((x): x is string => Boolean(x));
        if (names.length) {
          setKnownAccruals((prev) => Array.from(new Set([...prev, ...names])));
        }
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setCode('');
      setAccrualName('');
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<TypeRow>(`/api/catalog/incident-types/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setAccrualName(row.accrualName || '');
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
    if (!accrualName.trim()) {
      setError('Начисление обязательно');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || undefined,
        accrualName: accrualName.trim(),
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/incident-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<TypeRow>('/api/catalog/incident-types', {
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
      title={isEdit ? 'Тип инцидента (изменение)' : 'Тип инцидента (создание)'}
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
            <span>Код</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isEdit ? '' : 'авто'}
            />
          </label>

          <label className={modal.field}>
            <span>
              Начисление <em className={modal.req}>*</em>
            </span>
            <input
              list="incident-accrual-options"
              placeholder="Поиск"
              value={accrualName}
              onChange={(e) => setAccrualName(e.target.value)}
            />
            <datalist id="incident-accrual-options">
              {accrualOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
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
