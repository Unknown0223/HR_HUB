'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems, type EmployeePickItem } from '@/components/employee-pick';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './TimesheetCorrectionFormModal.module.css';

type EmpOpt = {
  id: string;
  label: string;
  divisionId?: string | null;
  tabNumber?: string | null;
  positionName?: string;
};
type DivOpt = { id: string; label: string };

type CreatedRow = { id: string };

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function TimesheetCorrectionFormModal({
  open,
  batchDefault = false,
  onClose,
  onCreated,
}: {
  open: boolean;
  batchDefault?: boolean;
  onClose: () => void;
  /** openDoc = user asked to continue in the full editor (hours by employee) */
  onCreated: (id: string, openDoc: boolean) => void;
}) {
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [batch, setBatch] = useState(batchDefault);
  const [documentDate, setDocumentDate] = useState(todayIso);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('Корректировка табеля');
  const [divisionId, setDivisionId] = useState('');
  const [filterByDepartments, setFilterByDepartments] = useState(true);
  const [periodFrom, setPeriodFrom] = useState(monthStartIso);
  const [periodTo, setPeriodTo] = useState(todayIso);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setBatch(batchDefault);
    setDocumentDate(todayIso());
    setNumber('');
    setTitle('Корректировка табеля');
    setDivisionId('');
    setFilterByDepartments(true);
    setPeriodFrom(batchDefault ? monthStartIso() : todayIso());
    setPeriodTo(todayIso());
    setEmployeeIds([]);
    setPickOpen(false);
  }, [open, batchDefault]);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ employees?: EmpOpt[]; divisions?: DivOpt[] }>('/api/catalog/lookups')
      .then((d) => {
        setEmployees(d.employees || []);
        setDivisions(d.divisions || []);
      })
      .catch(() => {
        setEmployees([]);
        setDivisions([]);
      });
  }, [open]);

  const pickItems = useMemo<EmployeePickItem[]>(
    () =>
      toPickItems(
        employees.filter(
          (e) => !filterByDepartments || !divisionId || e.divisionId === divisionId,
        ),
      ),
    [employees, filterByDepartments, divisionId],
  );

  const selected = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e] as const));
    return employeeIds.map((id) => ({ id, label: byId.get(id)?.label || id }));
  }, [employeeIds, employees]);

  async function save(openDoc: boolean) {
    if (employeeIds.length === 0) {
      setError('Добавьте хотя бы одного сотрудника');
      return;
    }
    const to = batch ? periodTo : periodFrom;
    if (new Date(to).getTime() < new Date(periodFrom).getTime()) {
      setError('Дата «по» не может быть раньше даты «с»');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<CreatedRow>('/api/catalog/timesheet-adjustments', {
        method: 'POST',
        body: JSON.stringify({
          documentDate,
          number: number.trim() || undefined,
          title: title.trim() || 'Корректировка табеля',
          divisionId: divisionId || undefined,
          periodFrom,
          periodTo: to,
          meta: {
            filterByDepartments,
            outsideLimit: 'Без ограничений',
            countLunch: true,
            countBefore: true,
            beforeLimit: 'Без ограничений',
            countAfter: true,
            afterLimit: 'Без ограничений',
          },
          lines: employeeIds.map((employeeId, idx) => ({ employeeId, sortOrder: idx })),
        }),
      });
      onCreated(created.id, openDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FormModal
        open={open}
        title={
          batch
            ? 'Корректировка табеля списком (создание)'
            : 'Корректировка табеля (создание)'
        }
        onClose={onClose}
        width="lg"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={busy}
              onClick={() => void save(false)}
            >
              {busy ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              disabled={busy}
              onClick={() => void save(true)}
            >
              Сохранить и заполнить часы
            </button>
            <button type="button" className={modal.btnGhost} onClick={onClose}>
              Закрыть
            </button>
          </>
        }
      >
        {error ? <p className={modal.error}>{error}</p> : null}
        <div className={modal.fields}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={batch}
              onChange={(e) => setBatch(e.target.checked)}
            />
            Списком (период корректировки)
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата документа <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </label>
            <label className={modal.field}>
              <span>Номер документа</span>
              <input
                value={number}
                placeholder="авто"
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
          </div>

          <label className={modal.field}>
            <span>Название документа</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className={modal.field}>
            <span>Подразделение</span>
            <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">—</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={filterByDepartments}
              onChange={(e) => setFilterByDepartments(e.target.checked)}
            />
            Фильтровать по департаментам
          </label>

          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                {batch ? 'Период корректировки с' : 'Дата корректировки'}{' '}
                <em className={modal.req}>*</em>
              </span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </label>
            {batch ? (
              <label className={modal.field}>
                <span>
                  по <em className={modal.req}>*</em>
                </span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          <div className={modal.field}>
            <span>
              Сотрудники <em className={modal.req}>*</em>
            </span>
            <div className={styles.pickRow}>
              <button
                type="button"
                className={modal.btnGhost}
                onClick={() => setPickOpen(true)}
              >
                Подбор сотрудников
              </button>
              <span className={styles.pickMeta}>Выбрано: {employeeIds.length}</span>
              {employeeIds.length > 0 ? (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setEmployeeIds([])}
                >
                  Очистить
                </button>
              ) : null}
            </div>
            {selected.length > 0 ? (
              <ul className={styles.chips}>
                {selected.map((e) => (
                  <li key={e.id} className={styles.chip}>
                    {e.label}
                    <button
                      type="button"
                      aria-label={`Убрать ${e.label}`}
                      onClick={() =>
                        setEmployeeIds((prev) => prev.filter((id) => id !== e.id))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>
                Часы по сотрудникам заполняются в документе после создания.
              </p>
            )}
          </div>
        </div>
      </FormModal>

      {pickOpen ? (
        <EmployeePickModal
          title="Подбор сотрудников"
          confirmText="Добавить"
          items={pickItems}
          initialSelectedIds={employeeIds}
          onClose={() => setPickOpen(false)}
          onConfirm={(ids) => {
            setEmployeeIds(ids);
            setPickOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
