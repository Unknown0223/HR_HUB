'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './GradePromotionFormModal.module.css';

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
  note: string;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function empLabel(e?: Emp | null) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function emptyLine(changeDate: string): Line {
  return {
    id: uid(),
    employeeId: '',
    staffPositionId: '',
    fromGradeId: '',
    toGradeId: '',
    changeDate: changeDate || todayInput(),
    note: '',
  };
}

export function GradePromotionFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState('');

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [staffPositions, setStaffPositions] = useState<Opt[]>([]);

  const [documentDate, setDocumentDate] = useState(todayInput());
  const [documentNumber, setDocumentNumber] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [note, setNote] = useState('');
  const [periodType, setPeriodType] = useState<'grade_only' | 'position_and_grade'>(
    'grade_only',
  );
  const [medicalExam, setMedicalExam] = useState(false);
  const [useGphPeriod, setUseGphPeriod] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<{
      divisions?: Opt[];
      employees?: Opt[];
      grades?: Opt[];
      staffPositions?: Opt[];
    }>('/api/catalog/lookups')
      .then((lookups) => {
        if (cancelled) return;
        setDivisions(lookups.divisions || []);
        setEmployees(lookups.employees || []);
        setGrades(lookups.grades || []);
        setStaffPositions(lookups.staffPositions || []);
      })
      .catch(() => {
        /* lookups are optional for rendering the form */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setFilling(false);
    setDocumentDate(todayInput());
    setDocumentNumber('');
    setDivisionId('');
    setNote('');
    setPeriodType('grade_only');
    setMedicalExam(false);
    setUseGphPeriod(false);
    setLines([]);
  }, [open]);

  function patchLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function fillLines() {
    setFilling(true);
    setError('');
    try {
      const filled = await apiFetch<
        {
          employeeId: string;
          staffPositionId?: string | null;
          fromGradeId?: string | null;
          toGradeId?: string | null;
          employee?: Emp;
        }[]
      >('/api/catalog/grade-history/fill', {
        method: 'POST',
        body: JSON.stringify({ divisionId: divisionId || undefined }),
      });
      setLines(
        (filled || []).map((f) => ({
          id: uid(),
          employeeId: f.employeeId,
          staffPositionId: f.staffPositionId || '',
          fromGradeId: f.fromGradeId || '',
          toGradeId: f.toGradeId || '',
          changeDate: documentDate || todayInput(),
          note: '',
        })),
      );
      if (!filled?.length) setError('Нет сотрудников для заполнения');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setFilling(false);
    }
  }

  async function save(assignTraining: boolean) {
    if (!documentDate) {
      setError('Дата обязательна');
      return;
    }
    const payloadLines = lines.filter((l) => l.employeeId);
    if (!payloadLines.length) {
      setError('Добавьте хотя бы одного сотрудника');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/api/catalog/grade-history', {
        method: 'POST',
        body: JSON.stringify({
          documentDate,
          documentNumber: documentNumber.trim() || null,
          divisionId: divisionId || null,
          note: note.trim() || null,
          periodType,
          medicalExam,
          useGphPeriod,
          assignTraining,
          status: 'draft',
          lines: payloadLines.map((l, i) => ({
            employeeId: l.employeeId,
            staffPositionId: l.staffPositionId || null,
            fromGradeId: l.fromGradeId || null,
            toGradeId: l.toGradeId || null,
            changeDate: l.changeDate || null,
            note: l.note.trim() || null,
            sortOrder: i,
          })),
        }),
      });
      onSaved(created?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      title="Повышение разрядов (создание)"
      onClose={onClose}
      width="xl"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy || filling}
            onClick={() => void save(false)}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy || filling}
            onClick={() => void save(true)}
          >
            Сохранить и назначить к обучению
          </button>
          <button type="button" className={modal.btnGhost} onClick={onClose}>
            Закрыть
          </button>
        </>
      }
    >
      {error ? <p className={modal.error}>{error}</p> : null}

      <div className={modal.fields}>
        <div className={modal.row2}>
          <label className={modal.field}>
            <span>
              Дата <em className={modal.req}>*</em>
            </span>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>Номер</span>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="авто"
            />
          </label>
        </div>

        <label className={modal.field}>
          <span>Подразделение</span>
          <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            <option value="">Не выбрано</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div className={modal.field}>
          <span>Тип периода расчета</span>
          <div className={modal.radioRow}>
            <label className={modal.radio}>
              <input
                type="radio"
                name="grade-promotion-period"
                checked={periodType === 'grade_only'}
                onChange={() => setPeriodType('grade_only')}
              />
              Только изменение разряда
            </label>
            <label className={modal.radio}>
              <input
                type="radio"
                name="grade-promotion-period"
                checked={periodType === 'position_and_grade'}
                onChange={() => setPeriodType('position_and_grade')}
              />
              Изменение позиции и разряда
            </label>
          </div>
        </div>

        <div className={styles.checkGroup}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={medicalExam}
              onChange={(e) => setMedicalExam(e.target.checked)}
            />
            Медицинский осмотр
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={useGphPeriod}
              onChange={(e) => setUseGphPeriod(e.target.checked)}
            />
            Использовать период с договора ГПХ
          </label>
        </div>

        <label className={modal.field}>
          <span>Примечание</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Сотрудники</h3>
            <span className={styles.lineCount}>{lines.length}</span>
            <button
              type="button"
              className={styles.lineBtn}
              disabled={busy || filling}
              onClick={() => void fillLines()}
            >
              <i className="fas fa-magic" aria-hidden />
              {filling ? 'Заполнение…' : 'Заполнить'}
            </button>
            <button
              type="button"
              className={styles.lineBtn}
              disabled={busy || filling}
              onClick={() =>
                setLines((prev) => [...prev, emptyLine(documentDate)])
              }
            >
              <i className="fas fa-plus" aria-hidden />
              Добавить
            </button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.lineTable}>
              <thead>
                <tr>
                  <th className={styles.colEmp}>Сотрудник</th>
                  <th className={styles.colPos}>Позиция</th>
                  <th className={styles.colGrade}>Разряд: было → стало</th>
                  <th className={styles.colDate}>Дата изменения</th>
                  <th className={styles.colNote}>Примечание</th>
                  <th className={styles.colDel} />
                </tr>
              </thead>
              <tbody>
                {!lines.length ? (
                  <tr>
                    <td colSpan={6} className={styles.lineEmpty}>
                      Нажмите «Заполнить» или «Добавить»
                    </td>
                  </tr>
                ) : null}
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <select
                        value={line.employeeId}
                        onChange={(e) =>
                          patchLine(line.id, { employeeId: e.target.value })
                        }
                        aria-label="Сотрудник"
                      >
                        <option value="">—</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={line.staffPositionId}
                        onChange={(e) =>
                          patchLine(line.id, { staffPositionId: e.target.value })
                        }
                        aria-label="Позиция"
                      >
                        <option value="">—</option>
                        {staffPositions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className={styles.gradePair}>
                        <select
                          value={line.fromGradeId}
                          onChange={(e) =>
                            patchLine(line.id, { fromGradeId: e.target.value })
                          }
                          aria-label="Предыдущий разряд"
                        >
                          <option value="">—</option>
                          {grades.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <span className={styles.gradeArrow} aria-hidden>
                          →
                        </span>
                        <select
                          value={line.toGradeId}
                          onChange={(e) =>
                            patchLine(line.id, { toGradeId: e.target.value })
                          }
                          aria-label="Новый разряд"
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
                    <td>
                      <input
                        type="date"
                        value={line.changeDate}
                        onChange={(e) =>
                          patchLine(line.id, { changeDate: e.target.value })
                        }
                        aria-label="Дата изменения"
                      />
                    </td>
                    <td>
                      <input
                        value={line.note}
                        onChange={(e) => patchLine(line.id, { note: e.target.value })}
                        aria-label="Примечание"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        aria-label="Удалить строку"
                        onClick={() =>
                          setLines((prev) => prev.filter((l) => l.id !== line.id))
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.hint}>
            Документ создаётся как черновик. «Статус попытки» и «Состояние» по строкам
            можно заполнить на карточке документа, там же выполняется проведение.
          </p>
        </div>
      </div>
    </FormModal>
  );
}
