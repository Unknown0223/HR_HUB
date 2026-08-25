'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type Step = {
  id: string;
  fromGradeId: string;
  toGradeId: string;
  attempts: string;
  periodMonths: string;
  penaltyPeriodMonths: string;
  conditionsText: string;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyStep(): Step {
  return {
    id: uid(),
    fromGradeId: '',
    toGradeId: '',
    attempts: '1',
    periodMonths: '',
    penaltyPeriodMonths: '',
    conditionsText: '',
  };
}

export function CareerPathForm({
  mode,
  pathId,
}: {
  mode: 'create' | 'edit' | 'view';
  pathId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceEdit = searchParams.get('edit') === '1';
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [grades, setGrades] = useState<Opt[]>([]);

  const readOnly = mode === 'view' && !forceEdit;

  const pageTitle =
    mode === 'create'
      ? 'Карьерный путь (создание)'
      : readOnly
        ? 'Карьерный путь (просмотр)'
        : 'Карьерный путь (изменение)';

  const selectedStep = steps.find((s) => s.id === selectedStepId) || null;

  const loadLookups = useCallback(async () => {
    try {
      const lookups = await apiFetch<{ grades?: Opt[] }>('/api/catalog/lookups');
      setGrades(lookups.grades || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode === 'create' || !pathId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<{
          name: string;
          code: string;
          sortOrder?: number;
          isActive?: boolean;
          steps?: {
            fromGradeId?: string | null;
            toGradeId?: string | null;
            attempts?: number | null;
            periodMonths?: number | null;
            penaltyPeriodMonths?: number | null;
            conditions?: unknown;
          }[];
        }>(`/api/catalog/career-paths/${pathId}`);
        if (cancelled) return;
        setName(row.name || '');
        setCode(row.code || '');
        setSortOrder(String(row.sortOrder ?? 0));
        setIsActive(row.isActive !== false);
        const mapped = (row.steps || []).map((s) => ({
          id: uid(),
          fromGradeId: s.fromGradeId || '',
          toGradeId: s.toGradeId || '',
          attempts: s.attempts != null ? String(s.attempts) : '1',
          periodMonths: s.periodMonths != null ? String(s.periodMonths) : '',
          penaltyPeriodMonths:
            s.penaltyPeriodMonths != null ? String(s.penaltyPeriodMonths) : '',
          conditionsText:
            s.conditions == null
              ? ''
              : typeof s.conditions === 'string'
                ? s.conditions
                : JSON.stringify(s.conditions, null, 2),
        }));
        setSteps(mapped.length ? mapped : [emptyStep()]);
        if (mapped[0]) setSelectedStepId(mapped[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, pathId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || undefined,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        steps: steps
          .filter((s) => s.fromGradeId || s.toGradeId)
          .map((s, i) => {
            let conditions: unknown = undefined;
            if (s.conditionsText.trim()) {
              try {
                conditions = JSON.parse(s.conditionsText);
              } catch {
                conditions = s.conditionsText;
              }
            }
            return {
              fromGradeId: s.fromGradeId || null,
              toGradeId: s.toGradeId || null,
              attempts: s.attempts ? Number(s.attempts) : 1,
              periodMonths: s.periodMonths ? Number(s.periodMonths) : null,
              penaltyPeriodMonths: s.penaltyPeriodMonths
                ? Number(s.penaltyPeriodMonths)
                : null,
              sortOrder: i,
              conditions,
            };
          }),
      };
      if (mode === 'create') {
        const created = await apiFetch<{ id: string }>('/api/catalog/career-paths', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push(`/catalog/career-paths/${created.id}`);
      } else if (pathId) {
        await apiFetch(`/api/catalog/career-paths/${pathId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        router.push(`/catalog/career-paths/${pathId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className={styles.empty}>Загрузка…</p>;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="career-path-form" />
      <h1 className={styles.title}>{pageTitle}</h1>

      <form className={styles.form} onSubmit={(e) => void save(e)}>
        <div className={styles.actions}>
          {!readOnly ? (
            <button type="submit" className={styles.primary} disabled={saving}>
              Сохранить
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/catalog/career-paths')}
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.split}>
          <div className={styles.card}>
            <label className={styles.field}>
              <span>
                Название <em>*</em>
              </span>
              <input
                required
                disabled={readOnly}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Код</span>
                <input disabled={readOnly} value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Порядковый номер</span>
                <input
                  type="number"
                  disabled={readOnly}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.switchLabel}>
              <span>Статус</span>
              <span className={styles.switchRow}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Активный
              </span>
            </label>

            <div className={styles.lineToolbar}>
              {!readOnly ? (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    const s = emptyStep();
                    setSteps((prev) => [...prev, s]);
                    setSelectedStepId(s.id);
                  }}
                >
                  Добавить
                </button>
              ) : null}
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.lineTable}>
                <thead>
                  <tr>
                    <th />
                    <th>От разряда</th>
                    <th>К разряду</th>
                    <th>Попытки</th>
                    <th>Период</th>
                    <th>Штрафной период</th>
                    {!readOnly ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {!steps.length ? (
                    <tr>
                      <td colSpan={readOnly ? 6 : 7} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : null}
                  {steps.map((step) => {
                    const open = selectedStepId === step.id;
                    return (
                      <tr
                        key={step.id}
                        className={open ? styles.rowSelected : undefined}
                        onClick={() => setSelectedStepId(step.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <input type="checkbox" checked={open} readOnly />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            disabled={readOnly}
                            value={step.fromGradeId}
                            onChange={(e) =>
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id ? { ...s, fromGradeId: e.target.value } : s,
                                ),
                              )
                            }
                          >
                            <option value="">—</option>
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            disabled={readOnly}
                            value={step.toGradeId}
                            onChange={(e) =>
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id ? { ...s, toGradeId: e.target.value } : s,
                                ),
                              )
                            }
                          >
                            <option value="">—</option>
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            disabled={readOnly}
                            value={step.attempts}
                            onChange={(e) =>
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id ? { ...s, attempts: e.target.value } : s,
                                ),
                              )
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            disabled={readOnly}
                            value={step.periodMonths}
                            onChange={(e) =>
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id ? { ...s, periodMonths: e.target.value } : s,
                                ),
                              )
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            disabled={readOnly}
                            value={step.penaltyPeriodMonths}
                            onChange={(e) =>
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id
                                    ? { ...s, penaltyPeriodMonths: e.target.value }
                                    : s,
                                ),
                              )
                            }
                          />
                        </td>
                        {!readOnly ? (
                          <td>
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSteps((prev) => prev.filter((s) => s.id !== step.id));
                                if (selectedStepId === step.id) setSelectedStepId(null);
                              }}
                            >
                              Удалить
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.card}>
            {selectedStep ? (
              <label className={styles.field}>
                <span>Подробные условия перехода</span>
                <textarea
                  rows={12}
                  disabled={readOnly}
                  placeholder="Условия (текст или JSON)…"
                  value={selectedStep.conditionsText}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s) =>
                        s.id === selectedStep.id
                          ? { ...s, conditionsText: e.target.value }
                          : s,
                      ),
                    )
                  }
                />
              </label>
            ) : (
              <div className={styles.placeholder}>
                <p>Здесь вы можете посмотреть подробные условия выбранного перехода</p>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
