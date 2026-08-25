'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type PayRow = { id: string; name: string; indicators: string };

type StaffDetail = {
  id: string;
  code: string;
  title: string;
  divisionId?: string | null;
  positionId?: string | null;
  gradeId?: string | null;
  scheduleId?: string | null;
  tariffGroupId?: string | null;
  headcount?: number;
  openedAt?: string | null;
  closedAt?: string | null;
  vacationDays?: number | null;
  roles?: string | null;
  groupName?: string | null;
  accessDivisionIds?: string[] | null;
  isPrimary?: boolean;
  contractualSalary?: boolean;
  accruals?: { name?: string; indicators?: string }[] | null;
  deductions?: { name?: string; indicators?: string }[] | null;
  extraInfo?: string | null;
  isActive: boolean;
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

export function StaffPositionForm({
  mode,
  staffPositionId,
}: {
  mode: 'create' | 'edit' | 'view';
  staffPositionId?: string;
}) {
  const router = useRouter();
  const readOnly = mode === 'view';
  const [loading, setLoading] = useState(mode !== 'create');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pay' | 'extra'>('pay');

  const [divisionId, setDivisionId] = useState('');
  const [openedAt, setOpenedAt] = useState(todayInput());
  const [closedAt, setClosedAt] = useState('');
  const [positionId, setPositionId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [vacationDays, setVacationDays] = useState('');
  const [roles, setRoles] = useState('');
  const [code, setCode] = useState('');
  const [headcount, setHeadcount] = useState('1');
  const [title, setTitle] = useState('');
  const [accessDivisionId, setAccessDivisionId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isPrimary, setIsPrimary] = useState(true);
  const [contractualSalary, setContractualSalary] = useState(true);
  const [accruals, setAccruals] = useState<PayRow[]>([]);
  const [deductions, setDeductions] = useState<PayRow[]>([]);
  const [extraInfo, setExtraInfo] = useState('');

  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);

  const pageTitle =
    mode === 'edit'
      ? 'Позиции (изменение)'
      : mode === 'view'
        ? 'Позиции (просмотр)'
        : 'Позиции (создание)';

  const loadLookups = useCallback(async () => {
    try {
      const lookups = await apiFetch<{
        divisions?: Opt[];
        positions?: Opt[];
        grades?: Opt[];
        schedules?: Opt[];
      }>('/api/catalog/lookups');
      setDivisions(lookups.divisions || []);
      setPositions(lookups.positions || []);
      setGrades(lookups.grades || []);
      setSchedules(lookups.schedules || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (mode === 'create' || !staffPositionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<StaffDetail>(
          `/api/catalog/staff-positions/${staffPositionId}`,
        );
        if (cancelled) return;
        setDivisionId(row.divisionId || '');
        setOpenedAt(toInputDate(row.openedAt) || todayInput());
        setClosedAt(toInputDate(row.closedAt));
        setPositionId(row.positionId || '');
        setGroupName(row.groupName || '');
        setGradeId(row.gradeId || '');
        setScheduleId(row.scheduleId || '');
        setVacationDays(row.vacationDays != null ? String(row.vacationDays) : '');
        setRoles(row.roles || '');
        setCode(row.code || '');
        setHeadcount(String(row.headcount ?? 1));
        setTitle(row.title || '');
        const access = Array.isArray(row.accessDivisionIds)
          ? row.accessDivisionIds[0] || ''
          : '';
        setAccessDivisionId(access);
        setIsActive(row.isActive !== false);
        setIsPrimary(row.isPrimary !== false);
        setContractualSalary(Boolean(row.contractualSalary));
        setAccruals(
          (Array.isArray(row.accruals) ? row.accruals : []).map((a) => ({
            id: uid(),
            name: String(a.name || ''),
            indicators: String(a.indicators || ''),
          })),
        );
        setDeductions(
          (Array.isArray(row.deductions) ? row.deductions : []).map((a) => ({
            id: uid(),
            name: String(a.name || ''),
            indicators: String(a.indicators || ''),
          })),
        );
        setExtraInfo(row.extraInfo || '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, staffPositionId]);

  // Auto-fill title from position + division
  useEffect(() => {
    if (mode !== 'create' || title.trim()) return;
    const pos = positions.find((p) => p.id === positionId);
    const div = divisions.find((d) => d.id === divisionId);
    if (pos && div) setTitle(`${pos.label} / ${div.label}`);
    else if (pos) setTitle(pos.label);
  }, [positionId, divisionId, positions, divisions, mode, title]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!divisionId) {
      setError('Подразделение обязательно');
      return;
    }
    if (!openedAt) {
      setError('Дата открытия обязательна');
      return;
    }
    if (!positionId) {
      setError('Должность обязательна');
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
    setSaving(true);
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
        accruals: accruals
          .filter((a) => a.name.trim())
          .map(({ name, indicators }) => ({
            name: name.trim(),
            indicators: indicators.trim(),
          })),
        deductions: deductions
          .filter((a) => a.name.trim())
          .map(({ name, indicators }) => ({
            name: name.trim(),
            indicators: indicators.trim(),
          })),
        extraInfo: extraInfo.trim() || null,
        isActive,
        status: closedAt ? 'closed' : isActive ? 'vacant' : 'closed',
      };
      if (mode === 'edit' && staffPositionId) {
        await apiFetch(`/api/catalog/staff-positions/${staffPositionId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/staff-positions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      router.push('/catalog/staff-positions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function PayTable({
    rows,
    setRows,
    label,
  }: {
    rows: PayRow[];
    setRows: (fn: (prev: PayRow[]) => PayRow[]) => void;
    label: string;
  }) {
    return (
      <div className={styles.payBlock}>
        <div className={styles.payTitle}>{label}</div>
        <table className={styles.payTable}>
          <thead>
            <tr>
              <th>№</th>
              <th>Начисление</th>
              <th>Показатели</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      disabled={readOnly}
                      value={r.name}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.id === r.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      disabled={readOnly}
                      value={r.indicators}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x) =>
                            x.id === r.id
                              ? { ...x, indicators: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    {!readOnly ? (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() =>
                          setRows((prev) => prev.filter((x) => x.id !== r.id))
                        }
                      >
                        Удалить
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className={styles.emptyCell}>
                  нет данных
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!readOnly ? (
          <button
            type="button"
            className={styles.addPay}
            onClick={() =>
              setRows((prev) => [...prev, { id: uid(), name: '', indicators: '' }])
            }
          >
            +
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <PageSubnav groupKey="staff-positions" titleOverride={pageTitle} />
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="staff-positions" titleOverride={pageTitle} />

      <form onSubmit={onSave} className={styles.form}>
        <div className={styles.actions}>
          {!readOnly ? (
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                router.push(`/catalog/staff-positions/${staffPositionId}/edit`)
              }
            >
              Изменить
            </button>
          )}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/catalog/staff-positions')}
          >
            Закрыть
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.grid}>
            <label>
              Подразделение <span className={styles.req}>*</span>
              <select
                required
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
            <label>
              Дата открытия <span className={styles.req}>*</span>
              <input
                type="date"
                required
                disabled={readOnly}
                value={openedAt}
                onChange={(e) => setOpenedAt(e.target.value)}
              />
            </label>
            <label>
              Дата закрытия
              <input
                type="date"
                disabled={readOnly}
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
              />
            </label>

            <label>
              Должность <span className={styles.req}>*</span>
              <select
                required
                disabled={readOnly}
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.span2}>
              Группа позиций
              <input
                disabled={readOnly}
                placeholder="Поиск..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>

            <label>
              Разряд
              <select
                disabled={readOnly}
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              График работы
              <select
                disabled={readOnly}
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Кол-во отпускных дней (в год)
              <input
                type="number"
                disabled={readOnly}
                value={vacationDays}
                onChange={(e) => setVacationDays(e.target.value)}
              />
            </label>

            <label>
              Роли
              <input
                disabled={readOnly}
                placeholder="Поиск..."
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
              />
            </label>
            <label>
              Код
              <input
                disabled={readOnly}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label>
              Количество единиц <span className={styles.req}>*</span>
              <input
                type="number"
                min={1}
                required
                disabled={readOnly}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
              />
            </label>

            <label className={styles.span2}>
              Название <span className={styles.req}>*</span>
              <input
                required
                disabled={readOnly}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Доступ к подразделениям
              <select
                disabled={readOnly}
                value={accessDivisionId}
                onChange={(e) => setAccessDivisionId(e.target.value)}
              >
                <option value="">Поиск...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.metaRow}>
            <div className={styles.switchRow}>
              <span>Статус</span>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span className={styles.switchTrack} />
                <span>{isActive ? 'Активный' : 'Неактивный'}</span>
              </label>
            </div>

            <fieldset className={styles.radioGroup} disabled={readOnly}>
              <legend>Тип позиции</legend>
              <label>
                <input
                  type="radio"
                  checked={isPrimary}
                  onChange={() => setIsPrimary(true)}
                />
                Основной
              </label>
              <label>
                <input
                  type="radio"
                  checked={!isPrimary}
                  onChange={() => setIsPrimary(false)}
                />
                Не основной
              </label>
            </fieldset>

            <label className={styles.check}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={contractualSalary}
                onChange={(e) => setContractualSalary(e.target.checked)}
              />
              Договорная зарплата
            </label>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={tab === 'pay' ? styles.tabActive : styles.tab}
            onClick={() => setTab('pay')}
          >
            Оплата труда
          </button>
          <button
            type="button"
            className={tab === 'extra' ? styles.tabActive : styles.tab}
            onClick={() => setTab('extra')}
          >
            Дополнительная информация
          </button>
        </div>

        {tab === 'pay' ? (
          <div className={styles.card}>
            <PayTable rows={accruals} setRows={setAccruals} label="Начисления" />
            <PayTable
              rows={deductions}
              setRows={setDeductions}
              label="Удержания"
            />
          </div>
        ) : (
          <div className={styles.card}>
            <label className={styles.full}>
              Дополнительная информация
              <textarea
                rows={6}
                disabled={readOnly}
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
              />
            </label>
          </div>
        )}
      </form>
    </div>
  );
}
