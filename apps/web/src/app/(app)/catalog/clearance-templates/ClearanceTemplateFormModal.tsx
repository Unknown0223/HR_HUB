'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import styles from './ClearanceTemplateFormModal.module.css';

type EmpOpt = { id: string; label: string; tabNumber?: string; positionName?: string };
type DivOpt = { id: string; label: string };
type PosOpt = { id: string; label: string };

type TemplateRow = {
  id: string;
  divisionId?: string | null;
  positionId?: string | null;
  requireManagerSign: boolean;
  requireHigherManagerSign: boolean;
  employees?: { id: string; employeeId: string }[];
};

export function ClearanceTemplateFormModal({
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

  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [requireManagerSign, setRequireManagerSign] = useState(false);
  const [requireHigherManagerSign, setRequireHigherManagerSign] = useState(false);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [pickOpen, setPickOpen] = useState(false);

  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<DivOpt[]>([]);
  const [positions, setPositions] = useState<PosOpt[]>([]);

  const empMap = useMemo(() => {
    const m = new Map<string, EmpOpt>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return employeeIds;
    return employeeIds.filter((id) => {
      const e = empMap.get(id);
      return [e?.label, e?.tabNumber, e?.positionName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [employeeIds, lineSearch, empMap]);

  const loadLookups = useCallback(async () => {
    try {
      const d = await apiFetch<{
        employees?: EmpOpt[];
        divisions?: DivOpt[];
        positions?: PosOpt[];
      }>('/api/catalog/lookups');
      setEmployees(d.employees || []);
      setDivisions(d.divisions || []);
      setPositions(d.positions || []);
    } catch {
      setEmployees([]);
      setDivisions([]);
      setPositions([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadLookups();
  }, [open, loadLookups]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    setSelectedKeys([]);
    setLineSearch('');
    setPickOpen(false);
    if (!editId) {
      setDivisionId('');
      setPositionId('');
      setRequireManagerSign(false);
      setRequireHigherManagerSign(false);
      setEmployeeIds([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<TemplateRow>(`/api/catalog/clearance-templates/${editId}`)
      .then((row) => {
        if (cancelled) return;
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setRequireManagerSign(Boolean(row.requireManagerSign));
        setRequireHigherManagerSign(Boolean(row.requireHigherManagerSign));
        setEmployeeIds((row.employees || []).map((e) => e.employeeId));
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

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = {
        divisionId: divisionId || null,
        positionId: positionId || null,
        requireManagerSign,
        requireHigherManagerSign,
        employeeIds,
      };
      if (isEdit && editId) {
        await apiFetch(`/api/catalog/clearance-templates/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        onSaved(editId);
      } else {
        const created = await apiFetch<TemplateRow>('/api/catalog/clearance-templates', {
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

  function addPicked(ids: string[]) {
    setEmployeeIds((prev) => {
      const next = [...prev];
      for (const id of ids) if (!next.includes(id)) next.push(id);
      return next;
    });
    setPickOpen(false);
  }

  function removeSelected() {
    if (!selectedKeys.length) return;
    const drop = new Set(selectedKeys);
    setEmployeeIds((prev) => prev.filter((id) => !drop.has(id)));
    setSelectedKeys([]);
  }

  const allChecked =
    filteredEmployees.length > 0 && filteredEmployees.every((id) => selectedKeys.includes(id));

  return (
    <>
      <FormModal
        open={open}
        title={
          isEdit ? 'Шаблон обходного листа (изменение)' : 'Шаблон обходного листа (создание)'
        }
        onClose={onClose}
        width="lg"
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
              <label className={modal.field}>
                <span>Должность</span>
                <select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                  <option value="">—</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.checkGroup}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={requireManagerSign}
                  onChange={(e) => setRequireManagerSign(e.target.checked)}
                />
                Подпись руководителя
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={requireHigherManagerSign}
                  onChange={(e) => setRequireHigherManagerSign(e.target.checked)}
                />
                Подпись вышестоящего руководителя
              </label>
            </div>

            <div className={modal.field}>
              <div className={styles.linesHead}>
                <p className={styles.linesTitle}>Сотрудники</p>
                <button
                  type="button"
                  className={styles.lineBtn}
                  onClick={() => setPickOpen(true)}
                >
                  <i className="fas fa-plus" aria-hidden />
                  Добавить
                </button>
                {selectedKeys.length > 0 ? (
                  <button
                    type="button"
                    className={`${styles.lineBtn} ${styles.lineDanger}`}
                    onClick={removeSelected}
                  >
                    <i className="fas fa-trash" aria-hidden />
                    Удалить
                  </button>
                ) : null}
                <input
                  className={styles.lineSearch}
                  placeholder="Поиск"
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                />
                <span className={styles.lineMeta}>
                  {filteredEmployees.length} / {employeeIds.length}
                </span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          disabled={filteredEmployees.length === 0}
                          onChange={(e) =>
                            setSelectedKeys(e.target.checked ? [...filteredEmployees] : [])
                          }
                          aria-label="Выбрать все"
                        />
                      </th>
                      <th>Табельный номер</th>
                      <th>Сотрудник</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((id) => {
                        const checked = selectedKeys.includes(id);
                        const emp = empMap.get(id);
                        return (
                          <tr key={id}>
                            <td className={styles.checkCol}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedKeys((prev) =>
                                    checked ? prev.filter((x) => x !== id) : [...prev, id],
                                  )
                                }
                              />
                            </td>
                            <td className={styles.tabCell}>{emp?.tabNumber || '—'}</td>
                            <td>{emp?.label || id}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </FormModal>

      {open && pickOpen ? (
        <EmployeePickModal
          title="Сотрудники"
          confirmText="Добавить"
          items={toPickItems(employees)}
          excludeIds={employeeIds}
          onClose={() => setPickOpen(false)}
          onConfirm={addPicked}
        />
      ) : null}
    </>
  );
}
