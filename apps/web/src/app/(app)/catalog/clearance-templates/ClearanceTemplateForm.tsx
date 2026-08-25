'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type EmpOpt = { id: string; label: string; tabNumber?: string; positionName?: string };
type DivOpt = { id: string; label: string };
type PosOpt = { id: string; label: string };

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  divisionId?: string | null;
  positionId?: string | null;
  requireManagerSign: boolean;
  requireHigherManagerSign: boolean;
  isActive: boolean;
  employees?: {
    id: string;
    employeeId: string;
    employee?: {
      id: string;
      firstName: string;
      lastName: string;
      middleName?: string | null;
      tabNumber: string;
    } | null;
  }[];
};

export function ClearanceTemplateForm({
  mode,
  templateId,
}: {
  mode: 'create' | 'edit';
  templateId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
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

  const pageTitle =
    mode === 'edit' ? 'Шаблон обходного листа (изменение)' : 'Шаблон обходного листа (создание)';

  const empMap = useMemo(() => {
    const m = new Map<string, EmpOpt>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return employeeIds;
    return employeeIds.filter((id) => (empMap.get(id)?.label || '').toLowerCase().includes(q));
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
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode !== 'edit' || !templateId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const row = await apiFetch<TemplateRow>(`/api/catalog/clearance-templates/${templateId}`);
        if (cancelled) return;
        setDivisionId(row.divisionId || '');
        setPositionId(row.positionId || '');
        setRequireManagerSign(Boolean(row.requireManagerSign));
        setRequireHigherManagerSign(Boolean(row.requireHigherManagerSign));
        setEmployeeIds((row.employees || []).map((e) => e.employeeId));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, templateId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        divisionId: divisionId || null,
        positionId: positionId || null,
        requireManagerSign,
        requireHigherManagerSign,
        employeeIds,
      };
      if (mode === 'edit' && templateId) {
        await apiFetch(`/api/catalog/clearance-templates/${templateId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        router.push('/catalog/clearance-templates');
      } else {
        await apiFetch('/api/catalog/clearance-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        router.push('/catalog/clearance-templates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function addPicked(ids: string[]) {
    const next = [...employeeIds];
    for (const id of ids) {
      if (!next.includes(id)) next.push(id);
    }
    setEmployeeIds(next);
    setPickOpen(false);
  }

  function removeSelected() {
    if (!selectedKeys.length) return;
    const drop = new Set(selectedKeys);
    setEmployeeIds((prev) => prev.filter((id) => !drop.has(id)));
    setSelectedKeys([]);
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="clearance-templates" />
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="clearance-templates" titleOverride={pageTitle} />

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
              onClick={() => router.push('/catalog/clearance-templates')}
            >
              Закрыть
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.grid2}>
            <label>
              Подразделение
              <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">Поиск...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Должность
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">Поиск...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.checkRow}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={requireManagerSign}
                onChange={(e) => setRequireManagerSign(e.target.checked)}
              />
              Руководитель
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={requireHigherManagerSign}
                onChange={(e) => setRequireHigherManagerSign(e.target.checked)}
              />
              Вышестоящий руководитель
            </label>
          </div>

          <div className={styles.linesHead}>
            <div className={styles.linesActions}>
              <button type="button" className={styles.ghost} onClick={() => setPickOpen(true)}>
                Создать
              </button>
              {selectedKeys.length > 0 ? (
                <button type="button" className={styles.danger} onClick={removeSelected}>
                  Удалить
                </button>
              ) : null}
            </div>
            <input
              className={styles.lineSearch}
              placeholder="Поиск"
              value={lineSearch}
              onChange={(e) => setLineSearch(e.target.value)}
            />
            <span className={styles.pagerMeta}>
              {filteredEmployees.length} / {employeeIds.length}
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCol} />
                  <th>Сотрудники</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={2} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((id) => {
                    const checked = selectedKeys.includes(id);
                    return (
                      <tr key={id}>
                        <td>
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
                        <td>{empMap.get(id)?.label || id}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </form>

      {pickOpen ? (
        <EmployeePickModal
          title="Сотрудники"
          confirmText="Добавить"
          items={toPickItems(employees)}
          excludeIds={employeeIds}
          onClose={() => setPickOpen(false)}
          onConfirm={addPicked}
        />
      ) : null}
    </div>
  );
}
