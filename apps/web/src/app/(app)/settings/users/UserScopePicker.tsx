'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ScopeEmployee, ScopeLocation } from '@/lib/app-users';
import css from './user-scope.module.css';

function matches(q: string, ...parts: (string | null | undefined)[]) {
  if (!q) return true;
  return parts.join(' ').toLowerCase().includes(q);
}

/**
 * Филиалы (required for scoped roles) + optional employees inside them.
 * No employees ticked = the user sees every employee of the ticked филиалы.
 */
export function UserScopePicker({
  locations,
  locationIds,
  employeeIds,
  onChange,
  readOnly = false,
  required = false,
}: {
  locations: ScopeLocation[];
  locationIds: string[];
  employeeIds: string[];
  onChange: (next: { locationIds: string[]; employeeIds: string[] }) => void;
  readOnly?: boolean;
  required?: boolean;
}) {
  const [locQuery, setLocQuery] = useState('');
  const [empQuery, setEmpQuery] = useState('');
  const [employees, setEmployees] = useState<ScopeEmployee[]>([]);
  const [loadingEmp, setLoadingEmp] = useState(false);
  const [empError, setEmpError] = useState('');

  const locKey = [...locationIds].sort().join(',');

  useEffect(() => {
    if (!locKey) {
      setEmployees([]);
      return;
    }
    let cancelled = false;
    setLoadingEmp(true);
    setEmpError('');
    apiFetch<{ employees: ScopeEmployee[] }>(
      `/api/settings/users/scope-options?locationIds=${encodeURIComponent(locKey)}`,
    )
      .then((res) => {
        if (!cancelled) setEmployees(res.employees || []);
      })
      .catch((e) => {
        if (!cancelled) setEmpError(e instanceof Error ? e.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setLoadingEmp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locKey]);

  // Removing a филиал drops the employees that only belonged to it.
  useEffect(() => {
    if (loadingEmp || readOnly || !employeeIds.length) return;
    const allowed = new Set(employees.map((e) => e.id));
    const kept = employeeIds.filter((id) => allowed.has(id));
    if (kept.length !== employeeIds.length) onChange({ locationIds, employeeIds: kept });
  }, [employees, loadingEmp]); // eslint-disable-line react-hooks/exhaustive-deps

  const lq = locQuery.trim().toLowerCase();
  const eq = empQuery.trim().toLowerCase();
  const shownLocations = useMemo(
    () =>
      locations.filter(
        (l) => (readOnly ? locationIds.includes(l.id) : true) && matches(lq, l.name, l.code),
      ),
    [locations, locationIds, lq, readOnly],
  );
  const shownEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          (readOnly ? employeeIds.includes(e.id) : true) &&
          matches(eq, e.fullName, e.tabNumber, e.position, ...e.locations),
      ),
    [employees, employeeIds, eq, readOnly],
  );

  const locSet = new Set(locationIds);
  const empSet = new Set(employeeIds);
  const allLocShown = shownLocations.length > 0 && shownLocations.every((l) => locSet.has(l.id));
  const allEmpShown = shownEmployees.length > 0 && shownEmployees.every((e) => empSet.has(e.id));

  function toggleLocation(id: string, on: boolean) {
    const next = on ? [...locationIds, id] : locationIds.filter((x) => x !== id);
    onChange({ locationIds: next, employeeIds });
  }

  function toggleAllLocations(on: boolean) {
    const ids = shownLocations.map((l) => l.id);
    const next = on
      ? [...new Set([...locationIds, ...ids])]
      : locationIds.filter((x) => !ids.includes(x));
    onChange({ locationIds: next, employeeIds });
  }

  function toggleEmployee(id: string, on: boolean) {
    const next = on ? [...employeeIds, id] : employeeIds.filter((x) => x !== id);
    onChange({ locationIds, employeeIds: next });
  }

  function toggleAllEmployees(on: boolean) {
    const ids = shownEmployees.map((e) => e.id);
    const next = on
      ? [...new Set([...employeeIds, ...ids])]
      : employeeIds.filter((x) => !ids.includes(x));
    onChange({ locationIds, employeeIds: next });
  }

  return (
    <div className={css.wrap}>
      <div className={css.block}>
        <div className={css.head}>
          <span className={css.title}>
            Филиалы (локации) {required ? <span className={css.req}>*</span> : null}
          </span>
          <span className={css.count}>
            Выбрано: {locationIds.length} / {locations.length}
          </span>
          <input
            className={css.search}
            placeholder="Поиск филиала..."
            value={locQuery}
            onChange={(e) => setLocQuery(e.target.value)}
          />
        </div>
        <div className={`${css.listBox} ${css.locBox}`}>
          <table className={css.table}>
            <thead>
              <tr>
                <th className={css.check}>
                  {readOnly ? null : (
                    <input
                      type="checkbox"
                      checked={allLocShown}
                      onChange={(e) => toggleAllLocations(e.target.checked)}
                      aria-label="Выбрать все филиалы"
                    />
                  )}
                </th>
                <th>Филиал</th>
                <th>Код</th>
              </tr>
            </thead>
            <tbody>
              {shownLocations.length === 0 ? (
                <tr>
                  <td colSpan={3} className={css.empty}>
                    {readOnly ? 'Филиалы не назначены' : 'Нет данных'}
                  </td>
                </tr>
              ) : (
                shownLocations.map((l) => (
                  <tr key={l.id} className={locSet.has(l.id) ? css.rowOn : undefined}>
                    <td className={css.check}>
                      <input
                        type="checkbox"
                        checked={locSet.has(l.id)}
                        disabled={readOnly}
                        onChange={(e) => toggleLocation(l.id, e.target.checked)}
                        aria-label={l.name}
                      />
                    </td>
                    <td>
                      {l.name}
                      {l.isActive === false ? <span className={css.muted}> (неактивный)</span> : null}
                    </td>
                    <td className={css.muted}>{l.code}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={css.block}>
        <div className={css.head}>
          <span className={css.title}>Сотрудники</span>
          <span className={css.count}>
            Выбрано: {employeeIds.length} / {employees.length}
          </span>
          <input
            className={css.search}
            placeholder="Ф.И.О., таб. номер, должность..."
            value={empQuery}
            disabled={!locationIds.length}
            onChange={(e) => setEmpQuery(e.target.value)}
          />
        </div>
        <p className={css.hint}>
          {employeeIds.length
            ? 'Пользователь видит только отмеченных сотрудников.'
            : 'Сотрудники не отмечены — пользователь видит всех сотрудников выбранных филиалов.'}
        </p>
        <div className={css.listBox}>
          <table className={css.table}>
            <thead>
              <tr>
                <th className={css.check}>
                  {readOnly ? null : (
                    <input
                      type="checkbox"
                      checked={allEmpShown}
                      disabled={!shownEmployees.length}
                      onChange={(e) => toggleAllEmployees(e.target.checked)}
                      aria-label="Выбрать всех сотрудников"
                    />
                  )}
                </th>
                <th>Ф.И.О.</th>
                <th>Филиал</th>
                <th>Должность</th>
                <th>Таб. номер</th>
              </tr>
            </thead>
            <tbody>
              {!locationIds.length ? (
                <tr>
                  <td colSpan={5} className={css.empty}>
                    Сначала выберите филиал
                  </td>
                </tr>
              ) : loadingEmp ? (
                <tr>
                  <td colSpan={5} className={css.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : empError ? (
                <tr>
                  <td colSpan={5} className={css.error}>
                    {empError}
                  </td>
                </tr>
              ) : shownEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} className={css.empty}>
                    {readOnly ? 'Все сотрудники выбранных филиалов' : 'Нет данных'}
                  </td>
                </tr>
              ) : (
                shownEmployees.map((e) => (
                  <tr key={e.id} className={empSet.has(e.id) ? css.rowOn : undefined}>
                    <td className={css.check}>
                      <input
                        type="checkbox"
                        checked={empSet.has(e.id)}
                        disabled={readOnly}
                        onChange={(ev) => toggleEmployee(e.id, ev.target.checked)}
                        aria-label={e.fullName}
                      />
                    </td>
                    <td>{e.fullName}</td>
                    <td>{e.locations.join(', ')}</td>
                    <td>{e.position}</td>
                    <td className={css.muted}>{e.tabNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
