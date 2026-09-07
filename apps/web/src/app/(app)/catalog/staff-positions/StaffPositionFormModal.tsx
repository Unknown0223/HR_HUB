'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './StaffPositionFormModal.module.css';

type Opt = { id: string; label: string };

type StaffDetail = {
  id: string;
  code: string;
  title: string;
  divisionId?: string | null;
  positionId?: string | null;
  gradeId?: string | null;
  scheduleId?: string | null;
  headcount?: number;
  openedAt?: string | null;
  closedAt?: string | null;
  vacationDays?: number | null;
  roles?: string | null;
  groupName?: string | null;
  accessDivisionIds?: string[] | null;
  isPrimary?: boolean;
  contractualSalary?: boolean;
  isActive: boolean;
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toInputDate(iso?: string | null) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

export function StaffPositionFormModal({
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

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);

  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [headcount, setHeadcount] = useState('1');
  const [openedAt, setOpenedAt] = useState(todayInput());
  const [closedAt, setClosedAt] = useState('');
  const [groupName, setGroupName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [vacationDays, setVacationDays] = useState('');
  const [roles, setRoles] = useState('');
  const [accessDivisionId, setAccessDivisionId] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [contractualSalary, setContractualSalary] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<{
      divisions?: Opt[];
      positions?: Opt[];
      grades?: Opt[];
      schedules?: Opt[];
    }>('/api/catalog/lookups')
      .then((lookups) => {
        if (cancelled) return;
        setDivisions(lookups.divisions || []);
        setPositions(lookups.positions || []);
        setGrades(lookups.grades || []);
        setSchedules(lookups.schedules || []);
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
    if (!editId) {
      setDivisionId('');
      setPositionId('');
      setTitle('');
      setCode('');
      setHeadcount('1');
      setOpenedAt(todayInput());
      setClosedAt('');
      setGroupName('');
      setGradeId('');
      setScheduleId('');
      setVacationDays('');
      setRoles('');
      setAccessDivisionId('');
      setIsPrimary(true);
      setContractualSalary(true);
      setIsActive(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<StaffDetail>(`/api/catalog/staff-positions/${editId}`)
      .then((row) => {
        if (cancelled) return;
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setTitle(row.title || '');
        setCode(row.code || '');
        setHeadcount(String(row.headcount ?? 1));
        setOpenedAt(toInputDate(row.openedAt) || todayInput());
        setClosedAt(toInputDate(row.closedAt));
        setGroupName(row.groupName || '');
        setGradeId(row.gradeId || '');
        setScheduleId(row.scheduleId || '');
        setVacationDays(row.vacationDays != null ? String(row.vacationDays) : '');
        setRoles(row.roles || '');
        setAccessDivisionId(
          Array.isArray(row.accessDivisionIds) ? row.accessDivisionIds[0] || '' : '',
        );
        setIsPrimary(row.isPrimary !== false);
        setContractualSalary(Boolean(row.contractualSalary));
        setIsActive(row.isActive !== false);
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

  // Suggest a name from the chosen position and division while creating.
  useEffect(() => {
    if (isEdit || title.trim()) return;
    const pos = positions.find((p) => p.id === positionId);
    const div = divisions.find((d) => d.id === divisionId);
    if (pos && div) setTitle(`${pos.label} / ${div.label}`);
    else if (pos) setTitle(pos.label);
  }, [positionId, divisionId, positions, divisions, isEdit, title]);

  async function save() {
    if (!divisionId) {
      setError('Подразделение обязательно');
      return;
    }
    if (!positionId) {
      setError('Должность обязательна');
      return;
    }
    if (!openedAt) {
      setError('Дата открытия обязательна');
      return;
    }
    if (!title.trim()) {
      setError('Название обязательно');
      return;
    }
    if (!Number(headcount) || Number(headcount) < 1) {
      setError('Количество единиц должно быть ≥ 1');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        code: code.trim() || `SP-${Date.now().toString(36).toUpperCase()}`,
        title: title.trim(),
        divisionId,
        positionId,
        gradeId: gradeId || null,
        scheduleId: scheduleId || null,
        headcount: Number(headcount) || 1,
        openedAt,
        closedAt: closedAt || null,
        vacationDays: vacationDays ? Number(vacationDays) : null,
        roles: roles.trim() || null,
        groupName: groupName.trim() || null,
        accessDivisionIds: accessDivisionId ? [accessDivisionId] : [],
        isPrimary,
        contractualSalary,
        isActive,
        status: closedAt ? 'closed' : isActive ? 'vacant' : 'closed',
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/staff-positions/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<StaffDetail>('/api/catalog/staff-positions', {
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
      title={isEdit ? 'Позиция (изменение)' : 'Позиция (создание)'}
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
        <p className={styles.muted}>Загрузка…</p>
      ) : (
        <div className={modal.fields}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Подразделение <em className={modal.req}>*</em>
              </span>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                <option value="">Не выбрано</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={modal.field}>
              <span>
                Должность <em className={modal.req}>*</em>
              </span>
              <select
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
              >
                <option value="">Не выбрано</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={modal.field}>
            <span>
              Название <em className={modal.req}>*</em>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <span>
                Количество единиц <em className={modal.req}>*</em>
              </span>
              <input
                type="number"
                min={1}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата открытия <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={openedAt}
                onChange={(e) => setOpenedAt(e.target.value)}
              />
            </label>

            <label className={modal.field}>
              <span>Дата закрытия</span>
              <input
                type="date"
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Разряд</span>
              <select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
                <option value="">Не выбрано</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={modal.field}>
              <span>График работы</span>
              <select
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                <option value="">Не выбрано</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Группа позиций</span>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>

            <label className={modal.field}>
              <span>Кол-во отпускных дней (в год)</span>
              <input
                type="number"
                value={vacationDays}
                onChange={(e) => setVacationDays(e.target.value)}
              />
            </label>
          </div>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Роли</span>
              <input value={roles} onChange={(e) => setRoles(e.target.value)} />
            </label>

            <label className={modal.field}>
              <span>Доступ к подразделениям</span>
              <select
                value={accessDivisionId}
                onChange={(e) => setAccessDivisionId(e.target.value)}
              >
                <option value="">Не выбрано</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={modal.field}>
            <span>Тип позиции</span>
            <div className={modal.radioRow}>
              <label className={modal.radio}>
                <input
                  type="radio"
                  name="staff-position-type"
                  checked={isPrimary}
                  onChange={() => setIsPrimary(true)}
                />
                Основной
              </label>
              <label className={modal.radio}>
                <input
                  type="radio"
                  name="staff-position-type"
                  checked={!isPrimary}
                  onChange={() => setIsPrimary(false)}
                />
                Не основной
              </label>
            </div>
          </div>

          <div className={styles.checkGroup}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Активный
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={contractualSalary}
                onChange={(e) => setContractualSalary(e.target.checked)}
              />
              Договорная зарплата
            </label>
          </div>

          {!isEdit ? (
            <p className={styles.hint}>
              Начисления, удержания и дополнительную информацию можно заполнить после
              создания — на карточке позиции.
            </p>
          ) : null}
        </div>
      )}
    </FormModal>
  );
}
