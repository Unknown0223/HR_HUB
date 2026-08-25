'use client';

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type Emp = {
  id: string;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  tabNumber?: string;
};

type Line = {
  id: string;
  employeeId: string;
  staffPositionId: string;
  fromGradeId: string;
  toGradeId: string;
  changeDate: string;
  attemptStatus: string;
  lineState: string;
  note: string;
  employeeLabel?: string;
  positionLabel?: string;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toInputDate(iso?: string | null) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function empLabel(e?: Emp | null) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function emptyLine(): Line {
  return {
    id: uid(),
    employeeId: '',
    staffPositionId: '',
    fromGradeId: '',
    toGradeId: '',
    changeDate: todayInput(),
    attemptStatus: '',
    lineState: '',
    note: '',
  };
}

export function GradePromotionForm({
  mode,
  promotionId,
}: {
  mode: 'create' | 'edit' | 'view';
  promotionId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceEdit = searchParams.get('edit') === '1';
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');

  const [documentDate, setDocumentDate] = useState(todayInput());
  const [documentNumber, setDocumentNumber] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [note, setNote] = useState('');
  const [periodType, setPeriodType] = useState<'grade_only' | 'position_and_grade'>('grade_only');
  const [medicalExam, setMedicalExam] = useState(false);
  const [useGphPeriod, setUseGphPeriod] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [lineQ, setLineQ] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [staffPositions, setStaffPositions] = useState<Opt[]>([]);

  const readOnly =
    (mode === 'view' && !forceEdit) || status === 'posted' || status === 'cancelled';

  const pageTitle =
    mode === 'create'
      ? 'Повышение разрядов (создание)'
      : readOnly
        ? 'Повышение разрядов (просмотр)'
        : 'Повышение разрядов (изменение)';

  const loadLookups = useCallback(async () => {
    try {
      const lookups = await apiFetch<{
        divisions?: Opt[];
        employees?: Opt[];
        grades?: Opt[];
        staffPositions?: Opt[];
      }>('/api/catalog/lookups');
      setDivisions(lookups.divisions || []);
      setEmployees(lookups.employees || []);
      setGrades(lookups.grades || []);
      setStaffPositions(lookups.staffPositions || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode === 'create' || !promotionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<{
          documentDate?: string;
          documentNumber?: string | null;
          divisionId?: string | null;
          note?: string | null;
          periodType?: string;
          medicalExam?: boolean;
          useGphPeriod?: boolean;
          status?: string;
          lines?: {
            employeeId: string;
            staffPositionId?: string | null;
            fromGradeId?: string | null;
            toGradeId?: string | null;
            changeDate?: string | null;
            attemptStatus?: string | null;
            lineState?: string | null;
            note?: string | null;
            employee?: Emp | null;
            staffPosition?: { title?: string; code?: string } | null;
          }[];
        }>(`/api/catalog/grade-history/${promotionId}`);
        if (cancelled) return;
        setDocumentDate(toInputDate(row.documentDate) || todayInput());
        setDocumentNumber(row.documentNumber || '');
        setDivisionId(row.divisionId || '');
        setNote(row.note || '');
        setPeriodType(
          row.periodType === 'position_and_grade' ? 'position_and_grade' : 'grade_only',
        );
        setMedicalExam(Boolean(row.medicalExam));
        setUseGphPeriod(Boolean(row.useGphPeriod));
        setStatus(row.status || 'draft');
        setLines(
          (row.lines || []).map((l) => ({
            id: uid(),
            employeeId: l.employeeId,
            staffPositionId: l.staffPositionId || '',
            fromGradeId: l.fromGradeId || '',
            toGradeId: l.toGradeId || '',
            changeDate: toInputDate(l.changeDate) || todayInput(),
            attemptStatus: l.attemptStatus || '',
            lineState: l.lineState || '',
            note: l.note || '',
            employeeLabel: empLabel(l.employee),
            positionLabel: l.staffPosition?.title || l.staffPosition?.code || '',
          })),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, promotionId]);

  const visibleLines = useMemo(() => {
    const q = lineQ.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const emp =
        l.employeeLabel ||
        employees.find((e) => e.id === l.employeeId)?.label ||
        '';
      const from = grades.find((g) => g.id === l.fromGradeId)?.label || '';
      const to = grades.find((g) => g.id === l.toGradeId)?.label || '';
      return [emp, from, to, l.note, l.attemptStatus].join(' ').toLowerCase().includes(q);
    });
  }, [lines, lineQ, employees, grades]);

  async function fillLines() {
    setSaving(true);
    setError('');
    try {
      const filled = await apiFetch<
        {
          employeeId: string;
          staffPositionId?: string | null;
          fromGradeId?: string | null;
          toGradeId?: string | null;
          employee?: Emp;
          staffPosition?: { title?: string; code?: string } | null;
        }[]
      >('/api/catalog/grade-history/fill', {
        method: 'POST',
        body: JSON.stringify({ divisionId: divisionId || undefined }),
      });
      setLines(
        filled.map((f) => ({
          id: uid(),
          employeeId: f.employeeId,
          staffPositionId: f.staffPositionId || '',
          fromGradeId: f.fromGradeId || '',
          toGradeId: f.toGradeId || '',
          changeDate: documentDate || todayInput(),
          attemptStatus: '',
          lineState: '',
          note: '',
          employeeLabel: empLabel(f.employee),
          positionLabel: f.staffPosition?.title || f.staffPosition?.code || '',
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  function payload(assignTraining = false) {
    return {
      documentDate,
      documentNumber: documentNumber || null,
      divisionId: divisionId || null,
      note: note || null,
      periodType,
      medicalExam,
      useGphPeriod,
      assignTraining,
      status: 'draft',
      lines: lines
        .filter((l) => l.employeeId)
        .map((l, i) => ({
          employeeId: l.employeeId,
          staffPositionId: l.staffPositionId || null,
          fromGradeId: l.fromGradeId || null,
          toGradeId: l.toGradeId || null,
          changeDate: l.changeDate || null,
          attemptStatus: l.attemptStatus || null,
          lineState: l.lineState || null,
          note: l.note || null,
          sortOrder: i,
        })),
    };
  }

  async function save(e: FormEvent, assignTraining = false) {
    e.preventDefault();
    if (!documentDate) {
      setError('Дата обязательна');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = payload(assignTraining);
      if (mode === 'create') {
        const created = await apiFetch<{ id: string }>('/api/catalog/grade-history', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push(`/catalog/grade-history/${created.id}`);
      } else if (promotionId) {
        await apiFetch(`/api/catalog/grade-history/${promotionId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        router.push(`/catalog/grade-history/${promotionId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function postDoc() {
    if (!promotionId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/catalog/grade-history/${promotionId}/post`, { method: 'POST' });
      router.push('/catalog/grade-history');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проведения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className={styles.empty}>Загрузка…</p>;
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="grade-history-form" />
      <h1 className={styles.title}>{pageTitle}</h1>

      <form className={styles.form} onSubmit={(e) => void save(e, false)}>
        <div className={styles.actions}>
          {!readOnly ? (
            <>
              <button type="submit" className={styles.primary} disabled={saving}>
                Сохранить
              </button>
              <button
                type="button"
                className={styles.teal}
                disabled={saving}
                onClick={(e) => void save(e, true)}
              >
                Сохранить и назначить к обучению
              </button>
            </>
          ) : null}
          {mode !== 'create' && status === 'draft' ? (
            <button type="button" className={styles.teal} disabled={saving} onClick={() => void postDoc()}>
              Провести
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/catalog/grade-history')}
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>
                Дата <em>*</em>
              </span>
              <input
                type="date"
                required
                disabled={readOnly}
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Номер</span>
              <input
                disabled={readOnly}
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Подразделение</span>
              <select
                disabled={readOnly}
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Примечание</span>
              <textarea
                disabled={readOnly}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <fieldset className={styles.radioGroup} disabled={readOnly}>
            <legend>Тип периода расчета</legend>
            <label>
              <input
                type="radio"
                checked={periodType === 'grade_only'}
                onChange={() => setPeriodType('grade_only')}
              />
              Только изменение разряда
            </label>
            <label>
              <input
                type="radio"
                checked={periodType === 'position_and_grade'}
                onChange={() => setPeriodType('position_and_grade')}
              />
              Изменение позиции и разряда
            </label>
          </fieldset>

          <div className={styles.checkRow}>
            <label>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={medicalExam}
                onChange={(e) => setMedicalExam(e.target.checked)}
              />
              Медицинский осмотр
            </label>
            <label>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={useGphPeriod}
                onChange={(e) => setUseGphPeriod(e.target.checked)}
              />
              Использовать период с договора ГПХ
            </label>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.lineToolbar}>
            {!readOnly ? (
              <>
                <button type="button" className={styles.secondary} disabled={saving} onClick={() => void fillLines()}>
                  Заполнить
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  Добавить
                </button>
              </>
            ) : null}
            <input
              className={styles.lineSearch}
              placeholder="Поиск..."
              value={lineQ}
              onChange={(e) => setLineQ(e.target.value)}
            />
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.lineTable}>
              <thead>
                <tr>
                  <th />
                  <th>Сотрудник</th>
                  <th>Статус попытки</th>
                  <th>Позиция</th>
                  <th>Предыдущий разряд → Новый</th>
                  <th>Дата изменения</th>
                  <th>Состояние</th>
                  <th>Примечание</th>
                  {!readOnly ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {!visibleLines.length ? (
                  <tr>
                    <td colSpan={readOnly ? 8 : 9} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
                {visibleLines.map((line) => {
                  const open = selectedLineId === line.id;
                  return (
                    <Fragment key={line.id}>
                      <tr
                        className={open ? styles.rowSelected : undefined}
                        onClick={() => setSelectedLineId(open ? null : line.id)}
                      >
                        <td>
                          <input type="checkbox" checked={open} readOnly />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {readOnly ? (
                            line.employeeLabel ||
                            employees.find((x) => x.id === line.employeeId)?.label ||
                            '—'
                          ) : (
                            <select
                              value={line.employeeId}
                              onChange={(e) => {
                                const employeeId = e.target.value;
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id
                                      ? {
                                          ...l,
                                          employeeId,
                                          employeeLabel:
                                            employees.find((x) => x.id === employeeId)?.label || '',
                                        }
                                      : l,
                                  ),
                                );
                              }}
                            >
                              <option value="">—</option>
                              {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            disabled={readOnly}
                            value={line.attemptStatus}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id ? { ...l, attemptStatus: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {readOnly ? (
                            line.positionLabel ||
                            staffPositions.find((p) => p.id === line.staffPositionId)?.label ||
                            '—'
                          ) : (
                            <select
                              value={line.staffPositionId}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id
                                      ? { ...l, staffPositionId: e.target.value }
                                      : l,
                                  ),
                                )
                              }
                            >
                              <option value="">—</option>
                              {staffPositions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={styles.gradePair}>
                            <select
                              disabled={readOnly}
                              value={line.fromGradeId}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id ? { ...l, fromGradeId: e.target.value } : l,
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
                            <span>→</span>
                            <select
                              disabled={readOnly}
                              value={line.toGradeId}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.id === line.id ? { ...l, toGradeId: e.target.value } : l,
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
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="date"
                            disabled={readOnly}
                            value={line.changeDate}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id ? { ...l, changeDate: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            disabled={readOnly}
                            value={line.lineState}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id ? { ...l, lineState: e.target.value } : l,
                                ),
                              )
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            disabled={readOnly}
                            value={line.note}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id ? { ...l, note: e.target.value } : l,
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
                                setLines((prev) => prev.filter((l) => l.id !== line.id));
                              }}
                            >
                              Удалить
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
  );
}
