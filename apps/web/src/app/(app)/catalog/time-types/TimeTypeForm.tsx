'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from '../absence-types/form.module.css';

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
  coefficient?: number | null;
};

const PLAN = [
  { value: 'partial', label: 'Частичная' },
  { value: 'full', label: 'Полная' },
  { value: 'unplanned', label: 'Внеплановая' },
] as const;

export function TimeTypeForm({ typeId }: { typeId?: string }) {
  const router = useRouter();
  const isNew = !typeId;
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
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
    apiFetch<ParentOpt[] | { items?: ParentOpt[] }>('/api/catalog/time-types')
      .then((d) => {
        const list = Array.isArray(d) ? d : d.items || [];
        setParents(list.filter((t) => t.id !== typeId));
      })
      .catch(() => setParents([]));
  }, [typeId]);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    apiFetch<TimeTypeRow>(`/api/catalog/time-types/${typeId}`)
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [typeId, isNew]);

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
    setOk('');
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
      if (isNew) {
        await apiFetch<TimeTypeRow>('/api/catalog/time-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push('/catalog/time-types');
      } else {
        await apiFetch(`/api/catalog/time-types/${typeId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setOk('Сохранено');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className={styles.muted}>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>
          {isNew ? 'Вид рабочего времени (создание)' : 'Вид рабочего времени (изменение)'}
        </h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSave}
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <Link href="/catalog/time-types" className={styles.btnClose}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div className={styles.formLayout} style={{ gridTemplateColumns: '1fr' }}>
        <div className={styles.col}>
          <div className={styles.field}>
            <label>
              Название <span className={styles.req}>*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>
                Буквенный код <span className={styles.req}>*</span>
              </label>
              <input value={letterCode} onChange={(e) => setLetterCode(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Цифровой код</label>
              <input value={digitalCode} onChange={(e) => setDigitalCode(e.target.value)} />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Цвет</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 42, height: 34, padding: 2, cursor: 'pointer' }}
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>
                Родитель
              </label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— нет —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Нагрузка на план</label>
              <div className={styles.radioRow}>
                {PLAN.map((p) => (
                  <label key={p.value} className={styles.radio}>
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
            <div className={styles.field}>
              <label>Коэффициент</label>
              <input placeholder="1" disabled title="Скоро" />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.statusBlock}>
              <span className={styles.fieldLabel}>Статус</span>
              <label className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggle} ${active ? styles.toggleOn : ''}`}
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                />
                <span>Активный</span>
              </label>
            </div>
            <div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={useCoefAbsence}
                  onChange={(e) => setUseCoefAbsence(e.target.checked)}
                />
                Использовать коэффициент в запросах отсутствия
              </label>
              <p className={styles.muted} style={{ margin: '0.35rem 0 0 1.4rem', fontSize: '0.78rem' }}>
                Не учитывает часы по часовой ставке
                <br />
                Не учитывает часы по плановым дням
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
