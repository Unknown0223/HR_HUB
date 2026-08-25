'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type TypeRow = {
  id: string;
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

export function IncidentTypeForm({
  mode,
  typeId,
}: {
  mode: 'create' | 'edit';
  typeId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [accrualName, setAccrualName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [knownAccruals, setKnownAccruals] = useState<string[]>(DEFAULT_ACCRUALS);

  const pageTitle =
    mode === 'edit' ? 'Тип инцидента (изменение)' : 'Тип инцидента (создание)';

  const accrualOptions = useMemo(() => {
    const set = new Set([...DEFAULT_ACCRUALS, ...knownAccruals]);
    if (accrualName.trim()) set.add(accrualName.trim());
    return Array.from(set);
  }, [knownAccruals, accrualName]);

  useEffect(() => {
    apiFetch<TypeRow[]>('/api/catalog/incident-types')
      .then((rows) => {
        const names = (Array.isArray(rows) ? rows : [])
          .map((r) => r.accrualName)
          .filter((x): x is string => Boolean(x));
        if (names.length) setKnownAccruals((prev) => Array.from(new Set([...prev, ...names])));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !typeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<TypeRow>(`/api/catalog/incident-types/${typeId}`);
        if (cancelled) return;
        setName(row.name || '');
        setAccrualName(row.accrualName || '');
        setIsActive(row.isActive !== false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, typeId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    if (!accrualName.trim()) {
      setError('Начисление обязательно');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = { name: name.trim(), accrualName: accrualName.trim(), isActive };
      if (mode === 'edit' && typeId) {
        await apiFetch(`/api/catalog/incident-types/${typeId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/incident-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      router.push('/catalog/incident-types');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="incident-types" />
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="incident-types" titleOverride={pageTitle} />

      <form onSubmit={onSave}>
        <div className={styles.docHead}>
          <h2 className={styles.docTitle}>{pageTitle}</h2>
          <div className={styles.docActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => router.push('/catalog/incident-types')}
            >
              Закрыть
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card} style={{ maxWidth: 520 }}>
          <label className={styles.full}>
            Название *
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className={styles.full}>
            Начисление *
            <input
              list="incident-accrual-options"
              required
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

          <label className={styles.switchLabel}>
            Статус
            <span className={styles.switchRight}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </span>
          </label>
        </div>
      </form>
    </div>
  );
}
