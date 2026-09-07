'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type ParentOpt = { id: string; code: string; name: string };

type TimeTypeRow = {
  id: string;
  code: string;
  name: string;
  letterCode?: string | null;
  digitalCode?: string | null;
  planLoad?: string | null;
  color?: string | null;
  parentId?: string | null;
  isPaid?: boolean;
  isActive?: boolean;
};

const PLAN = [
  { value: 'partial', label: 'Частичная' },
  { value: 'full', label: 'Полная' },
  { value: 'unplanned', label: 'Внеплановая' },
] as const;

export function TimeTypeFormModal({
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
  const [parents, setParents] = useState<ParentOpt[]>([]);

  const [name, setName] = useState('');
  const [letterCode, setLetterCode] = useState('');
  const [digitalCode, setDigitalCode] = useState('');
  const [color, setColor] = useState('#E73C3A');
  const [parentId, setParentId] = useState('');
  const [planLoad, setPlanLoad] = useState('partial');
  const [active, setActive] = useState(true);
  const [code, setCode] = useState('');
  const [useCoefAbsence, setUseCoefAbsence] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<ParentOpt[] | { items?: ParentOpt[] }>('/api/catalog/time-types')
      .then((d) => {
        const list = Array.isArray(d) ? d : d.items || [];
        setParents(list.filter((t) => t.id !== editId));
      })
      .catch(() => setParents([]));
  }, [open, editId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    if (!editId) {
      setName('');
      setLetterCode('');
      setDigitalCode('');
      setColor('#E73C3A');
      setParentId('');
      setPlanLoad('partial');
      setActive(true);
      setCode('');
      setUseCoefAbsence(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<TimeTypeRow>(`/api/catalog/time-types/${editId}`)
      .then((row) => {
        setName(row.name || '');
        setCode(row.code || '');
        setLetterCode(row.letterCode || row.code || '');
        setDigitalCode(row.digitalCode || '');
        setColor(row.color || '#E73C3A');
        setParentId(row.parentId || '');
        setPlanLoad(row.planLoad || 'partial');
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
    if (!letterCode.trim()) {
      setError('Укажите буквенный код');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || letterCode.trim(),
        letterCode: letterCode.trim(),
        digitalCode: digitalCode.trim() || null,
        color: color || null,
        parentId: parentId || null,
        planLoad,
        isActive: active,
        isPaid: true,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/time-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<TimeTypeRow>('/api/catalog/time-types', {
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
        isEdit ? 'Вид рабочего времени (изменение)' : 'Вид рабочего времени (создание)'
      }
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
          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Буквенный код <em className={modal.req}>*</em>
              </span>
              <input
                value={letterCode}
                onChange={(e) => setLetterCode(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Цифровой код</span>
              <input
                value={digitalCode}
                onChange={(e) => setDigitalCode(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Цвет</span>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </label>
            <label className={modal.field}>
              <span>Родитель</span>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— нет —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={modal.field}>
            <span>Нагрузка на план</span>
            <div className={modal.radioRow}>
              {PLAN.map((p) => (
                <label key={p.value} className={modal.radio}>
                  <input
                    type="radio"
                    checked={planLoad === p.value}
                    onChange={() => setPlanLoad(p.value)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Активный
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={useCoefAbsence}
                onChange={(e) => setUseCoefAbsence(e.target.checked)}
              />
              <span>
                Использовать коэффициент в запросах отсутствия
                <p className={styles.hint}>
                  Не учитывает часы по часовой ставке / плановым дням
                </p>
              </span>
            </label>
          </div>
        </div>
      )}
    </FormModal>
  );
}
