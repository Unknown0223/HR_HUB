'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type GradeRow = {
  id: string;
  code: string;
  name: string;
  level?: number;
  isActive: boolean;
};

export function GradeForm({
  mode,
  gradeId,
  embedded,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  gradeId?: string;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [isActive, setIsActive] = useState(true);

  const pageTitle = mode === 'edit' ? 'Разряд (изменение)' : 'Разряд (создание)';

  useEffect(() => {
    if (mode !== 'edit' || !gradeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<GradeRow>(`/api/catalog/grades/${gradeId}`);
        if (cancelled) return;
        setCode(row.code || '');
        setName(row.name || '');
        setLevel(row.level != null ? String(row.level) : '');
        setIsActive(row.isActive !== false);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, gradeId]);

  function goBack() {
    if (onCancel) onCancel();
    else router.push('/catalog/grades');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        code: code.trim() || `GR-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim(),
        level: Number(level) || 1,
        isActive,
      };
      if (mode === 'edit' && gradeId) {
        await apiFetch(`/api/catalog/grades/${gradeId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/grades', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (onSuccess) onSuccess();
      else router.push('/catalog/grades');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    if (embedded) return <p>Загрузка…</p>;
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="grades" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  const form = (
    <form
      onSubmit={onSave}
      className={embedded ? styles.formEmbedded : styles.form}
    >
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.secondary} onClick={goBack}>
          Закрыть
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.card}>
        <label>
          Код
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>
          Название <span className={styles.req}>*</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Порядковый номер
          <input
            type="number"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </label>
        <div className={styles.switchRow}>
          <span className={styles.switchLabel}>Статус</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className={styles.switchTrack} />
            <span className={styles.switchText}>
              {isActive ? 'Активный' : 'Неактивный'}
            </span>
          </label>
        </div>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="grades" titleOverride={pageTitle} />
      {form}
    </div>
  );
}
