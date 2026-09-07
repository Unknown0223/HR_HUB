'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';
import modalStyles from './CareerPathFormModal.module.css';

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

type StepDto = {
  fromGradeId?: string | null;
  toGradeId?: string | null;
  attempts?: number | null;
  periodMonths?: number | null;
  penaltyPeriodMonths?: number | null;
  conditions?: unknown;
};

type CareerPathDto = {
  id?: string;
  name?: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
  steps?: StepDto[];
};

function toStep(s: StepDto): Step {
  return {
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
  };
}

/** Steps are replaced wholesale on PATCH, so always send the full list. */
function buildBody(v: {
  name: string;
  code: string;
  sortOrder: string;
  isActive: boolean;
  steps: Step[];
}) {
  return {
    name: v.name.trim(),
    code: v.code.trim() || undefined,
    sortOrder: Number(v.sortOrder) || 0,
    isActive: v.isActive,
    steps: v.steps
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
        const row = await apiFetch<CareerPathDto>(`/api/catalog/career-paths/${pathId}`);
        if (cancelled) return;
        setName(row.name || '');
        setCode(row.code || '');
        setSortOrder(String(row.sortOrder ?? 0));
        setIsActive(row.isActive !== false);
        const mapped = (row.steps || []).map(toStep);
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
      const body = buildBody({ name, code, sortOrder, isActive, steps });
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

export function CareerPathFormModal({
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
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [grades, setGrades] = useState<Opt[]>([]);

  const selectedStep = steps.find((s) => s.id === selectedStepId) || null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<{ grades?: Opt[] }>('/api/catalog/lookups')
      .then((d) => {
        if (!cancelled) setGrades(d.grades || []);
      })
      .catch(() => {
        if (!cancelled) setGrades([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setSelectedStepId(null);
    if (!editId) {
      setName('');
      setCode('');
      setSortOrder('0');
      setIsActive(true);
      setSteps([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<CareerPathDto>(`/api/catalog/career-paths/${editId}`)
      .then((row) => {
        if (cancelled) return;
        setName(row.name || '');
        setCode(row.code || '');
        setSortOrder(String(row.sortOrder ?? 0));
        setIsActive(row.isActive !== false);
        const mapped = (row.steps || []).map(toStep);
        setSteps(mapped);
        setSelectedStepId(mapped[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editId]);

  function patchStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStep() {
    const s = emptyStep();
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setSelectedStepId((prev) => (prev === id ? null : prev));
  }

  async function save() {
    if (!name.trim()) {
      setError('Название обязательно');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = buildBody({ name, code, sortOrder, isActive, steps });
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/career-paths/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<{ id: string }>('/api/catalog/career-paths', {
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
      title={isEdit ? 'Карьерный путь (изменение)' : 'Карьерный путь (создание)'}
      onClose={onClose}
      width="xl"
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
        <p className={modalStyles.muted}>Загрузка…</p>
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
              <span>Код</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={isEdit ? '' : 'авто'}
              />
            </label>
            <label className={modal.field}>
              <span>Порядковый номер</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </label>
          </div>

          <div className={modalStyles.checkGroup}>
            <label className={modalStyles.check}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </label>
          </div>

          <div className={modal.field}>
            <div className={modalStyles.linesHead}>
              <p className={modalStyles.linesTitle}>Переходы</p>
              <button type="button" className={modalStyles.lineBtn} onClick={addStep}>
                <i className="fas fa-plus" aria-hidden />
                Добавить
              </button>
              <span className={modalStyles.lineMeta}>{steps.length}</span>
            </div>

            <div className={modalStyles.tableWrap}>
              <table className={modalStyles.table}>
                <thead>
                  <tr>
                    <th>От разряда</th>
                    <th>К разряду</th>
                    <th className={modalStyles.numCol}>Попытки</th>
                    <th className={modalStyles.numCol}>Период, мес</th>
                    <th className={modalStyles.numCol}>Штраф, мес</th>
                    <th className={modalStyles.actCol} />
                  </tr>
                </thead>
                <tbody>
                  {steps.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={modalStyles.empty}>
                        Нет переходов — нажмите «Добавить»
                      </td>
                    </tr>
                  ) : (
                    steps.map((step) => (
                      <tr
                        key={step.id}
                        className={
                          selectedStepId === step.id ? modalStyles.rowSelected : undefined
                        }
                        onClick={() => setSelectedStepId(step.id)}
                      >
                        <td>
                          <select
                            value={step.fromGradeId}
                            onChange={(e) =>
                              patchStep(step.id, { fromGradeId: e.target.value })
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
                        <td>
                          <select
                            value={step.toGradeId}
                            onChange={(e) =>
                              patchStep(step.id, { toGradeId: e.target.value })
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
                        <td className={modalStyles.numCol}>
                          <input
                            type="number"
                            value={step.attempts}
                            onChange={(e) =>
                              patchStep(step.id, { attempts: e.target.value })
                            }
                          />
                        </td>
                        <td className={modalStyles.numCol}>
                          <input
                            type="number"
                            value={step.periodMonths}
                            onChange={(e) =>
                              patchStep(step.id, { periodMonths: e.target.value })
                            }
                          />
                        </td>
                        <td className={modalStyles.numCol}>
                          <input
                            type="number"
                            value={step.penaltyPeriodMonths}
                            onChange={(e) =>
                              patchStep(step.id, { penaltyPeriodMonths: e.target.value })
                            }
                          />
                        </td>
                        <td className={modalStyles.actCol}>
                          <button
                            type="button"
                            className={modalStyles.rowDel}
                            aria-label="Удалить переход"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStep(step.id);
                            }}
                          >
                            <i className="fas fa-trash" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <label className={modal.field}>
            <span>Подробные условия перехода</span>
            <textarea
              rows={4}
              disabled={!selectedStep}
              placeholder={
                selectedStep ? 'Условия (текст или JSON)…' : 'Выберите переход в таблице'
              }
              value={selectedStep?.conditionsText ?? ''}
              onChange={(e) =>
                selectedStep && patchStep(selectedStep.id, { conditionsText: e.target.value })
              }
            />
          </label>
        </div>
      )}
    </FormModal>
  );
}
