'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './position-form.module.css';

type Opt = { id: string; label: string };

type AliasRow = { id: string; grade: string; alias: string };

type PositionDetail = {
  id: string;
  code: string;
  name: string;
  positionGroupId?: string | null;
  sortOrder?: number;
  description?: string | null;
  role?: string | null;
  costAccount?: string | null;
  laborClassifier?: string | null;
  aliases?: AliasRow[] | null;
  isActive: boolean;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function PositionForm({
  mode,
  positionId,
}: {
  mode: 'create' | 'edit';
  positionId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [name, setName] = useState('');
  const [positionGroupId, setPositionGroupId] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [divisionIds, setDivisionIds] = useState('');
  const [costAccount, setCostAccount] = useState('');
  const [laborClassifier, setLaborClassifier] = useState('');
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [groups, setGroups] = useState<Opt[]>([]);
  const [divisions, setDivisions] = useState<Opt[]>([]);

  const pageTitle =
    mode === 'edit' ? 'Должность (изменение)' : 'Должность (создание)';

  const loadLookups = useCallback(async () => {
    try {
      const [lookups, grp, divs] = await Promise.all([
        apiFetch<{
          positionGroups?: Opt[];
          divisions?: Opt[];
        }>('/api/catalog/lookups'),
        apiFetch<{ id: string; code: string; name: string }[]>(
          '/api/catalog/position-groups',
        ),
        apiFetch<{ id: string; code: string; name: string }[]>(
          '/api/organization/divisions?status=all',
        ),
      ]);
      setGroups(
        lookups.positionGroups?.length
          ? lookups.positionGroups
          : (Array.isArray(grp) ? grp : []).map((g) => ({
              id: g.id,
              label: `${g.code} ${g.name}`,
            })),
      );
      setDivisions(
        lookups.divisions?.length
          ? lookups.divisions
          : (Array.isArray(divs) ? divs : []).map((d) => ({
              id: d.id,
              label: `${d.code} — ${d.name}`,
            })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !positionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<PositionDetail>(
          `/api/organization/positions/${positionId}`,
        );
        if (cancelled) return;
        setCode(row.code || '');
        setName(row.name || '');
        setPositionGroupId(row.positionGroupId || '');
        setSortOrder(row.sortOrder != null ? String(row.sortOrder) : '');
        setDescription(row.description || '');
        setRole(row.role || '');
        setCostAccount(row.costAccount || '');
        setLaborClassifier(row.laborClassifier || '');
        const rawAliases = Array.isArray(row.aliases) ? row.aliases : [];
        setAliases(
          rawAliases.map((a) => ({
            id: uid(),
            grade: String((a as AliasRow).grade || ''),
            alias: String((a as AliasRow).alias || ''),
          })),
        );
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
  }, [mode, positionId]);

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
        code: code.trim() || `POS-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim(),
        positionGroupId: positionGroupId || null,
        sortOrder: Number(sortOrder) || 0,
        description: description.trim() || null,
        role: role.trim() || null,
        costAccount: costAccount.trim() || null,
        laborClassifier: laborClassifier.trim() || null,
        aliases: aliases
          .filter((a) => a.grade.trim() || a.alias.trim())
          .map(({ grade, alias }) => ({ grade: grade.trim(), alias: alias.trim() })),
        isActive,
        createdByLabel: 'Admin',
      };
      if (mode === 'edit' && positionId) {
        await apiFetch(`/api/organization/positions/${positionId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        router.push('/positions?tab=positions');
      } else {
        await apiFetch('/api/organization/positions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push('/positions?tab=positions');
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
        <PageSubnav groupKey="position-form" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="position-form" titleOverride={pageTitle} />

      <form onSubmit={onSave} className={styles.cardWide}>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/positions?tab=positions')}
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.twoCol}>
          <div className={styles.col}>
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
              Название <span className={styles.req}>*</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={styles.full}>
              Группа должностей
              <select
                value={positionGroupId}
                onChange={(e) => setPositionGroupId(e.target.value)}
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
              Роли
              <input
                placeholder="Поиск..."
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <label className={styles.full}>
              Описание должности
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div className={styles.col}>
            <label className={styles.full}>
              Подразделения
              <select
                value={divisionIds}
                onChange={(e) => setDivisionIds(e.target.value)}
              >
                <option value="">Поиск...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.full}>
              Счет затрат
              <input
                placeholder="Поиск..."
                value={costAccount}
                onChange={(e) => setCostAccount(e.target.value)}
              />
            </label>
            <label className={styles.full}>
              Классификатор mehnat
              <input
                placeholder="Поиск..."
                value={laborClassifier}
                onChange={(e) => setLaborClassifier(e.target.value)}
              />
            </label>

            <div className={styles.aliasBlock}>
              <div className={styles.aliasHead}>
                <span>Псевдонимы</span>
                <button
                  type="button"
                  className={styles.teal}
                  onClick={() =>
                    setAliases((prev) => [...prev, { id: uid(), grade: '', alias: '' }])
                  }
                >
                  Добавить
                </button>
              </div>
              <table className={styles.aliasTable}>
                <thead>
                  <tr>
                    <th />
                    <th>Разряд</th>
                    <th>Псевдоним</th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.length ? (
                    aliases.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            type="button"
                            className={styles.rowDel}
                            onClick={() =>
                              setAliases((prev) => prev.filter((x) => x.id !== a.id))
                            }
                          >
                            ×
                          </button>
                        </td>
                        <td>
                          <input
                            value={a.grade}
                            onChange={(e) =>
                              setAliases((prev) =>
                                prev.map((x) =>
                                  x.id === a.id ? { ...x, grade: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={a.alias}
                            onChange={(e) =>
                              setAliases((prev) =>
                                prev.map((x) =>
                                  x.id === a.id ? { ...x, alias: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className={styles.emptyCell}>
                        нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
        </div>
      </form>
    </div>
  );
}
