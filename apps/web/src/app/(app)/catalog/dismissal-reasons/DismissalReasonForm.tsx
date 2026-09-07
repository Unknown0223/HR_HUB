'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type ReasonRow = {
  id: string;
  code: string;
  name: string;
  groupName?: string | null;
  basisType?: string | null;
  isActive: boolean;
};

const BASIS_OPTIONS = [
  { value: 'positive', label: 'Положительное (positive)' },
  { value: 'negative', label: 'Отрицательное (negative)' },
];

export function DismissalReasonFormModal({
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

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [basisType, setBasisType] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [knownGroups, setKnownGroups] = useState<string[]>([]);

  const groupOptions = useMemo(() => {
    const set = new Set(knownGroups);
    if (groupName.trim()) set.add(groupName.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [knownGroups, groupName]);

  /** Keep values that came from Verifix imports but are not in our option list. */
  const basisOptions = useMemo(() => {
    const known = BASIS_OPTIONS.map((o) => o.value);
    if (basisType && !known.includes(basisType)) {
      return [...BASIS_OPTIONS, { value: basisType, label: basisType }];
    }
    return BASIS_OPTIONS;
  }, [basisType]);

  useEffect(() => {
    if (!open) return;
    apiFetch<ReasonRow[]>('/api/catalog/dismissal-reasons')
      .then((rows) => {
        const groups = (Array.isArray(rows) ? rows : [])
          .map((r) => r.groupName)
          .filter((x): x is string => Boolean(x));
        if (groups.length) {
          setKnownGroups((prev) => Array.from(new Set([...prev, ...groups])));
        }
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setCode('');
      setName('');
      setGroupName('');
      setBasisType('');
      setIsActive(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<ReasonRow>(`/api/catalog/dismissal-reasons/${editId}`)
      .then((row) => {
        setCode(row.code || '');
        setName(row.name || '');
        setGroupName(row.groupName || '');
        setBasisType(row.basisType || '');
        setIsActive(row.isActive !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, editId]);

  async function save() {
    if (!code.trim()) {
      setError('Код обязателен');
      return;
    }
    if (!name.trim()) {
      setError('Наименование обязательно');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        groupName: groupName.trim(),
        basisType: basisType.trim(),
        isActive,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/dismissal-reasons/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<ReasonRow>('/api/catalog/dismissal-reasons', {
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
      title={
        isEdit ? 'Причина увольнения (изменение)' : 'Причина увольнения (создание)'
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
              Код <em className={modal.req}>*</em>
            </span>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>

          <label className={modal.field}>
            <span>
              Наименование <em className={modal.req}>*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className={modal.field}>
            <span>Группа причин увольнения</span>
            <input
              list="dismissal-reason-group-options"
              placeholder="Поиск"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <datalist id="dismissal-reason-group-options">
              {groupOptions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>

          <label className={modal.field}>
            <span>Тип основания</span>
            <select
              value={basisType}
              onChange={(e) => setBasisType(e.target.value)}
            >
              <option value="">— не указан —</option>
              {basisOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={styles.hint}>
              Определяет, считается ли увольнение по этой причине положительным или
              отрицательным в аналитике.
            </p>
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
