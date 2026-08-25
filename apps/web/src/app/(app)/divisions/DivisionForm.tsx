'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './division-form.module.css';

type Opt = { id: string; label: string };

type DivisionDetail = {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
  managerId?: string | null;
  divisionGroupId?: string | null;
  locationId?: string | null;
  scheduleId?: string | null;
  sortOrder?: number;
  openedAt?: string | null;
  closedAt?: string | null;
  legalEntity?: string | null;
  isActive: boolean;
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function DivisionForm({
  mode,
  divisionId,
}: {
  mode: 'create' | 'edit';
  divisionId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [divisionGroupId, setDivisionGroupId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [openedAt, setOpenedAt] = useState(todayInput());
  const [closedAt, setClosedAt] = useState('');
  const [legalEntity, setLegalEntity] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [employees, setEmployees] = useState<Opt[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [groups, setGroups] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);

  const pageTitle =
    mode === 'edit' ? 'Подразделение (изменение)' : 'Подразделение (создание)';

  const loadLookups = useCallback(async () => {
    try {
      const [lookups, divs, grp] = await Promise.all([
        apiFetch<{
          employees?: Opt[];
          schedules?: Opt[];
          locations?: Opt[];
          divisionGroups?: Opt[];
        }>('/api/catalog/lookups'),
        apiFetch<{ id: string; code: string; name: string }[]>(
          '/api/organization/divisions?status=all',
        ),
        apiFetch<{ id: string; code: string; name: string }[]>(
          '/api/catalog/division-groups',
        ),
      ]);
      setEmployees(lookups.employees || []);
      setSchedules(lookups.schedules || []);
      setLocations(lookups.locations || []);
      setDivisions(
        (Array.isArray(divs) ? divs : [])
          .filter((d) => d.id !== divisionId)
          .map((d) => ({ id: d.id, label: `${d.code} — ${d.name}` })),
      );
      setGroups(
        lookups.divisionGroups?.length
          ? lookups.divisionGroups
          : (Array.isArray(grp) ? grp : []).map((g) => ({
              id: g.id,
              label: `${g.code} ${g.name}`,
            })),
      );
    } catch {
      /* ignore */
    }
  }, [divisionId]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !divisionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<DivisionDetail>(
          `/api/organization/divisions/${divisionId}`,
        );
        if (cancelled) return;
        setCode(row.code || '');
        setName(row.name || '');
        setParentId(row.parentId || '');
        setManagerId(row.managerId || '');
        setDivisionGroupId(row.divisionGroupId || '');
        setLocationId(row.locationId || '');
        setScheduleId(row.scheduleId || '');
        setSortOrder(row.sortOrder != null ? String(row.sortOrder) : '');
        setOpenedAt(row.openedAt ? String(row.openedAt).slice(0, 10) : '');
        setClosedAt(row.closedAt ? String(row.closedAt).slice(0, 10) : '');
        setLegalEntity(row.legalEntity || '');
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
  }, [mode, divisionId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    if (!openedAt) {
      setError('Дата открытия обязательна');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        code: code.trim() || `DIV-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim(),
        parentId: parentId || null,
        managerId: mode === 'edit' ? managerId || null : managerId || null,
        divisionGroupId: divisionGroupId || null,
        locationId: locationId || null,
        scheduleId: scheduleId || null,
        sortOrder: Number(sortOrder) || 0,
        openedAt,
        closedAt: closedAt || null,
        legalEntity: legalEntity || null,
        isActive,
        createdByLabel: 'Admin',
        updatedByLabel: 'Admin',
      };
      if (mode === 'edit' && divisionId) {
        await apiFetch(`/api/organization/divisions/${divisionId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        router.push(`/divisions/${divisionId}`);
      } else {
        const created = await apiFetch<{ id: string }>('/api/organization/divisions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push(`/divisions/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="division-form" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="division-form" titleOverride={pageTitle} />

      <form onSubmit={onSave} className={styles.card}>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              router.push(
                mode === 'edit' && divisionId
                  ? `/divisions/${divisionId}`
                  : '/divisions?tab=divisions',
              )
            }
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.grid}>
          <label>
            Код
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label>
            Порядковый номер
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </label>
          <label className={styles.full}>
            Родитель
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Поиск...</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.full}>
            Название <span className={styles.req}>*</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={styles.full}>
            Группа подразделений
            <select
              value={divisionGroupId}
              onChange={(e) => setDivisionGroupId(e.target.value)}
            >
              <option value="">Поиск...</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.full}>
            Режим работы
            <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
              <option value="">Поиск...</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {mode === 'edit' ? (
            <label className={styles.full}>
              Руководитель
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">Поиск...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={styles.full}>
            Основная локация
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Поиск...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Дата открытия <span className={styles.req}>*</span>
            <input
              type="date"
              required
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </label>
          <label>
            Дата закрытия
            <input
              type="date"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              placeholder="Выбрать дату"
            />
          </label>
          <label className={styles.full}>
            Юридическое лицо
            <input
              placeholder="Поиск..."
              value={legalEntity}
              onChange={(e) => setLegalEntity(e.target.value)}
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
    </div>
  );
}
