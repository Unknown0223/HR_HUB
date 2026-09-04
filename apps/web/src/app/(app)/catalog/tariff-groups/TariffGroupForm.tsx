'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Row = {
  id: string;
  code: string;
  name: string;
  fullName?: string | null;
  isActive: boolean;
};

export function TariffGroupForm({
  mode,
  groupId,
  embedded,
  onSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  groupId?: string;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [touched, setTouched] = useState(false);

  const pageTitle =
    mode === 'edit'
      ? 'Тарифная группа (изменение)'
      : 'Тарифная группа (создание)';

  useEffect(() => {
    if (mode !== 'edit' || !groupId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<Row>(`/api/catalog/tariff-groups/${groupId}`);
        if (cancelled) return;
        setName(row.name || '');
        setFullName(row.fullName || row.name || '');
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
  }, [mode, groupId]);

  function goBack() {
    if (onCancel) onCancel();
    else router.push('/catalog/tariff-groups');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !fullName.trim()) {
      setError('Заполните обязательные поля');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        fullName: fullName.trim(),
        code:
          name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9А-ЯЁ]+/gi, '-')
            .slice(0, 24) || `TG-${Date.now().toString(36).toUpperCase()}`,
        isActive,
      };
      if (mode === 'edit' && groupId) {
        await apiFetch(`/api/catalog/tariff-groups/${groupId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/tariff-groups', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (onSuccess) onSuccess();
      else router.push('/catalog/tariff-groups');
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
        <PageSubnav groupKey="tariff-groups" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  const nameInvalid = touched && !name.trim();
  const fullInvalid = touched && !fullName.trim();

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
          Название <span className={styles.req}>*</span>
          <input
            className={nameInvalid ? styles.invalid : undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Полное название <span className={styles.req}>*</span>
          <input
            className={fullInvalid ? styles.invalid : undefined}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
      <PageSubnav groupKey="tariff-groups" titleOverride={pageTitle} />
      {form}
    </div>
  );
}
