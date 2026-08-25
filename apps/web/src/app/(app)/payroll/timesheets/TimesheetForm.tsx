'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch, PageResult } from '@/lib/api';
import { formatMonthRu } from '@/lib/fine-policies';
import {
  DEFAULT_TIMESHEET_SETTINGS,
  TIME_KINDS,
  daysInMonth,
  emptyDays,
  isWeekend,
  type TimeKindKey,
  type TimesheetDays,
  type TimesheetLine,
  type TimesheetSettings,
  type TimesheetSheetRow,
  weekdayRu,
} from '@/lib/timesheets';
import styles from './form.module.css';

type Opt = { id: string; label: string };

type EmpPick = {
  id: string;
  tabNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  hiredAt?: string | null;
  position?: { name: string } | null;
  grade?: { name: string } | null;
  division?: { name: string } | null;
  schedule?: { name: string } | null;
};

type LineDraft = TimesheetLine & { key: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(iso?: string) {
  const d = iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function empFull(e: EmpPick) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function SearchLookup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Opt[];
  onChange: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.label.toLowerCase().includes(qq));
  }, [options, draft]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className={styles.searchWrap} ref={wrapRef}>
      <input
        className={styles.searchInput}
        value={open ? draft : selected?.label || ''}
        placeholder="Поиск"
        onFocus={() => {
          setDraft('');
          setOpen(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {value && !open ? (
        <button type="button" className={styles.searchClear} onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
      {open ? (
        <div className={styles.menu}>
          {filtered.length === 0 ? (
            <div className={styles.optEmpty}>Нет данных</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.id}
                className={o.id === value ? styles.optOn : styles.opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function lineFromEmp(emp: EmpPick): LineDraft {
  return {
    key: newKey(),
    employeeId: emp.id,
    tabNumber: emp.tabNumber,
    fullName: empFull(emp),
    positionName: emp.position?.name || '',
    divisionName: emp.division?.name || '',
    orgUnitName: emp.division?.name || '',
    scheduleName: emp.schedule?.name || '',
    plannedDays: null,
    plannedHours: null,
    workedDays: null,
    workedHours: null,
    days: emptyDays(),
  };
}

function toPayload(lines: LineDraft[]): TimesheetLine[] {
  return lines
    .filter((l) => l.employeeId)
    .map((l, i) => ({
      employeeId: l.employeeId,
      sortOrder: i,
      plannedDays: l.plannedDays ?? undefined,
      plannedHours: l.plannedHours ?? undefined,
      workedDays: l.workedDays ?? undefined,
      workedHours: l.workedHours ?? undefined,
      days: l.days || emptyDays(),
    }));
}

export function TimesheetForm({ sheetId }: { sheetId?: string }) {
  const router = useRouter();
  const mode = sheetId ? 'edit' : 'create';
  const [loading, setLoading] = useState(Boolean(sheetId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [docId, setDocId] = useState<string | null>(sheetId ?? null);
  const [docDate, setDocDate] = useState(todayIso());
  const [number, setNumber] = useState('');
  const [month, setMonth] = useState(firstOfMonthIso());
  const [divisionId, setDivisionId] = useState('');
  const [periodType, setPeriodType] = useState('full_month');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lineSearch, setLineSearch] = useState('');
  const [lineTab, setLineTab] = useState<'totals' | 'details'>('totals');
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [settings, setSettings] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickRows, setPickRows] = useState<EmpPick[]>([]);
  const [filling, setFilling] = useState(false);

  const readOnly = status === 'posted' || status === 'cancelled';
  const pageTitle =
    mode === 'edit' ? 'Табель (изменение)' : 'Табель (создание)';

  const visibleKinds = useMemo(() => {
    if (settings.allTimeTypes || settings.timeTypeIds.length === 0) return TIME_KINDS;
    return TIME_KINDS.filter((k) => settings.timeTypeIds.includes(k.key));
  }, [settings]);

  const filteredLines = useMemo(() => {
    const qq = lineSearch.trim().toLowerCase();
    if (!qq) return lines;
    return lines.filter((l) =>
      [l.fullName, l.tabNumber, l.positionName, l.divisionName, l.scheduleName]
        .join(' ')
        .toLowerCase()
        .includes(qq),
    );
  }, [lines, lineSearch]);

  const dayCount = daysInMonth(month);
  const dayNums = Array.from({ length: dayCount }, (_, i) => i + 1);

  const loadLookups = useCallback(async () => {
    const d = await apiFetch<{ divisions?: Opt[] }>('/api/catalog/lookups');
    setDivisions(d.divisions || []);
    try {
      setSettings(await apiFetch<TimesheetSettings>('/api/payroll/timesheets/settings'));
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (!sheetId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await apiFetch<TimesheetSheetRow>(`/api/payroll/timesheets/${sheetId}`);
        if (cancelled) return;
        setDocId(row.id);
        setStatus(row.status);
        setDocDate(row.docDate.slice(0, 10));
        setNumber(row.number || '');
        setMonth(row.month.slice(0, 10));
        setDivisionId(row.divisionId || '');
        setPeriodType(row.periodType || 'full_month');
        setNote(row.note || '');
        setLines(
          (row.lines || []).map((l) => ({
            ...l,
            key: l.id || newKey(),
            days: l.days || emptyDays(),
          })),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetId]);

  async function save(andPost: boolean) {
    setSaving(true);
    setError('');
    try {
      const body = {
        docDate,
        number: number || undefined,
        month,
        divisionId: divisionId || undefined,
        periodType,
        note,
        lines: toPayload(lines),
      };
      let id = docId;
      if (id) {
        await apiFetch(`/api/payroll/timesheets/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<TimesheetSheetRow>('/api/payroll/timesheets', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
        setDocId(id);
        setNumber(created.number || '');
        router.replace(`/payroll/timesheets/${id}/edit`);
      }
      if (andPost && id) {
        await apiFetch(`/api/payroll/timesheets/${id}/post`, { method: 'POST' });
      }
      router.push('/payroll/timesheets');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function onPost() {
    const ok = await confirm({
      message: 'Сохранить и провести документ?',
      confirmText: 'Да',
      cancelText: 'Нет',
      variant: 'primary',
    });
    if (!ok) return;
    await save(true);
  }

  async function fill() {
    setFilling(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: TimesheetLine[] }>('/api/payroll/timesheets/fill', {
        method: 'POST',
        body: JSON.stringify({
          month,
          divisionId: divisionId || undefined,
        }),
      });
      setLines(
        (data.lines || []).map((l) => ({
          ...l,
          key: newKey(),
          days: l.days || emptyDays(),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setFilling(false);
    }
  }

  async function openPicker() {
    setPickOpen(true);
    try {
      const page = await apiFetch<PageResult<EmpPick>>('/api/employees?status=active&limit=200');
      setPickRows(page.items || []);
    } catch {
      setPickRows([]);
    }
  }

  function applyPick(ids: string[]) {
    const have = new Set(lines.map((l) => l.employeeId));
    const added = pickRows.filter((e) => ids.includes(e.id) && !have.has(e.id)).map(lineFromEmp);
    setLines((prev) => [...prev, ...added]);
    setPickOpen(false);
  }

  function setDay(key: string, kind: TimeKindKey, day: number, raw: string) {
    const n = raw.trim() === '' ? 0 : Number(raw);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const days: TimesheetDays = { ...emptyDays(), ...(l.days || {}) };
        const bucket = { ...(days[kind] || {}) };
        if (!Number.isFinite(n) || n === 0) delete bucket[String(day)];
        else bucket[String(day)] = n;
        days[kind] = bucket;
        return { ...l, days };
      }),
    );
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <PageSubnav groupKey="timesheet" titleOverride={pageTitle} />
        <p className={styles.muted}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="timesheet" titleOverride={pageTitle} />
      <div className={styles.topBar}>
        <h1 className={styles.title}>{pageTitle}</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSave}
            disabled={saving || readOnly}
            onClick={() => void save(false)}
          >
            Сохранить
          </button>
          <button
            type="button"
            className={styles.btnSave}
            disabled={saving || readOnly}
            onClick={() => void onPost()}
          >
            Провести
          </button>
          <button type="button" className={styles.btnClose} onClick={() => router.push('/payroll/timesheets')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.card}>
        <div className={styles.grid3}>
          <div className={styles.field}>
            <label>
              Дата <span className={styles.req}>*</span>
            </label>
            <input type="date" value={docDate} disabled={readOnly} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Номер</label>
            <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>
              Месяц <span className={styles.req}>*</span>
            </label>
            <div className={styles.monthText}>{formatMonthRu(month)}</div>
            <input
              type="month"
              value={month.slice(0, 7)}
              disabled={readOnly}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
              style={{ marginTop: 6 }}
            />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label>Подразделение</label>
            <SearchLookup value={divisionId} options={divisions} onChange={setDivisionId} />
          </div>
          <div className={styles.field}>
            <label>Тип периода</label>
            <select value={periodType} disabled={readOnly} onChange={(e) => setPeriodType(e.target.value)}>
              <option value="full_month">Полный месяц</option>
            </select>
          </div>
        </div>
        <div className={styles.field}>
          <label>Примечание</label>
          <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={lineTab === 'totals' ? styles.tabOn : styles.tab}
            onClick={() => setLineTab('totals')}
          >
            Итого
          </button>
          <button
            type="button"
            className={lineTab === 'details' ? styles.tabOn : styles.tab}
            onClick={() => setLineTab('details')}
          >
            Детали
          </button>
        </div>
        <div className={styles.lineBar}>
          <div className={styles.lineLeft}>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={readOnly}
              onClick={() => setLines((p) => [...p, { key: newKey(), employeeId: '', days: emptyDays() }])}
            >
              Добавить
            </button>
            <button type="button" className={styles.btnGhost} disabled={readOnly || filling} onClick={() => void fill()}>
              {filling ? 'Заполнение…' : 'Заполнить'}
            </button>
            <button type="button" className={styles.btnSelect} disabled={readOnly} onClick={() => void openPicker()}>
              Выбрать
            </button>
            {selectedKeys.length > 0 ? (
              <button
                type="button"
                className={styles.btnDanger}
                disabled={readOnly}
                onClick={() => {
                  setLines((p) => p.filter((l) => !selectedKeys.includes(l.key)));
                  setSelectedKeys([]);
                }}
              >
                Удалить {selectedKeys.length}
              </button>
            ) : null}
          </div>
          <div className={styles.lineRight}>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={lineSearch}
              onChange={(e) => setLineSearch(e.target.value)}
            />
            <span className={styles.muted}>
              {filteredLines.length} / {lines.length}
            </span>
          </div>
        </div>

        {lineTab === 'totals' ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        filteredLines.length > 0 && filteredLines.every((l) => selectedKeys.includes(l.key))
                      }
                      onChange={(e) =>
                        setSelectedKeys(e.target.checked ? filteredLines.map((l) => l.key) : [])
                      }
                    />
                  </th>
                  <th>№</th>
                  <th>Табельный номер</th>
                  <th>ФИО</th>
                  <th>Должность</th>
                  <th>Подразделение</th>
                  <th>Орг. единица</th>
                  <th>График работы</th>
                  {settings.showPlannedDays ? <th>По плану (дней)</th> : null}
                  {settings.showPlannedHours ? <th>По плану (часы)</th> : null}
                  {settings.showWorkedDays ? <th>Отработано дней</th> : null}
                  {settings.showWorkedHours ? <th>Отработано часов</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={12} className={styles.empty}>
                      нет данных
                    </td>
                  </tr>
                ) : (
                  filteredLines.map((l, idx) => (
                    <tr key={l.key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedKeys.includes(l.key)}
                          onChange={(e) =>
                            setSelectedKeys((prev) =>
                              e.target.checked ? [...prev, l.key] : prev.filter((k) => k !== l.key),
                            )
                          }
                        />
                      </td>
                      <td>{idx + 1}</td>
                      <td>{l.tabNumber || ''}</td>
                      <td>
                        {l.fullName ? (
                          <span className={styles.chip}>
                            {l.fullName}
                            {!readOnly ? (
                              <button
                                type="button"
                                onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                              >
                                ×
                              </button>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{l.positionName || ''}</td>
                      <td>{l.divisionName || ''}</td>
                      <td>{l.orgUnitName || ''}</td>
                      <td>{l.scheduleName || ''}</td>
                      {settings.showPlannedDays ? <td>{l.plannedDays ?? ''}</td> : null}
                      {settings.showPlannedHours ? <td>{l.plannedHours ?? ''}</td> : null}
                      {settings.showWorkedDays ? <td>{l.workedDays ?? ''}</td> : null}
                      {settings.showWorkedHours ? <td>{l.workedHours ?? ''}</td> : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th rowSpan={2} className={styles.sticky} />
                  <th rowSpan={2}>№</th>
                  <th rowSpan={2}>Табельный номер</th>
                  <th rowSpan={2}>ФИО</th>
                  <th rowSpan={2}>Должность</th>
                  {settings.showPlannedDays ? <th rowSpan={2}>По плану (дней)</th> : null}
                  {settings.showPlannedHours ? <th rowSpan={2}>По плану (часы)</th> : null}
                  {settings.showWorkedDays ? <th rowSpan={2}>Отработано дней</th> : null}
                  {settings.showWorkedHours ? <th rowSpan={2}>Отработано часов</th> : null}
                  <th rowSpan={2}>Виды рабочего времени</th>
                  {dayNums.map((d) => (
                    <th key={d} className={`${styles.dayCell} ${isWeekend(month, d) ? styles.weekend : ''}`}>
                      {d}
                    </th>
                  ))}
                </tr>
                <tr>
                  {dayNums.map((d) => (
                    <th key={`w${d}`} className={`${styles.dayCell} ${isWeekend(month, d) ? styles.weekend : ''}`}>
                      {weekdayRu(month, d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={20} className={styles.empty}>
                      нет данных
                    </td>
                  </tr>
                ) : (
                  filteredLines.flatMap((l, idx) =>
                    visibleKinds.map((kind, ki) => (
                      <tr key={`${l.key}-${kind.key}`} className={idx % 2 ? styles.groupB : styles.groupA}>
                        {ki === 0 ? (
                          <>
                            <td rowSpan={visibleKinds.length}>
                              <input
                                type="checkbox"
                                checked={selectedKeys.includes(l.key)}
                                onChange={(e) =>
                                  setSelectedKeys((prev) =>
                                    e.target.checked ? [...prev, l.key] : prev.filter((k) => k !== l.key),
                                  )
                                }
                              />
                            </td>
                            <td rowSpan={visibleKinds.length}>{idx + 1}</td>
                            <td rowSpan={visibleKinds.length}>{l.tabNumber || ''}</td>
                            <td rowSpan={visibleKinds.length}>
                              <span className={styles.chip}>{l.fullName || '—'}</span>
                            </td>
                            <td rowSpan={visibleKinds.length}>{l.positionName || ''}</td>
                            {settings.showPlannedDays ? (
                              <td rowSpan={visibleKinds.length}>{l.plannedDays ?? ''}</td>
                            ) : null}
                            {settings.showPlannedHours ? (
                              <td rowSpan={visibleKinds.length}>{l.plannedHours ?? ''}</td>
                            ) : null}
                            {settings.showWorkedDays ? (
                              <td rowSpan={visibleKinds.length}>{l.workedDays ?? ''}</td>
                            ) : null}
                            {settings.showWorkedHours ? (
                              <td rowSpan={visibleKinds.length}>{l.workedHours ?? ''}</td>
                            ) : null}
                          </>
                        ) : null}
                        <td>{kind.label}</td>
                        {dayNums.map((d) => (
                          <td
                            key={d}
                            className={`${styles.dayCell} ${isWeekend(month, d) ? styles.weekend : ''}`}
                          >
                            <input
                              className={styles.numInput}
                              disabled={readOnly}
                              value={l.days?.[kind.key]?.[String(d)] ?? ''}
                              onChange={(e) => setDay(l.key, kind.key, d, e.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    )),
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickOpen ? (
        <EmployeePickModal
          title="Сотрудники"
          items={toPickItems(
            pickRows.map((e) => ({
              id: e.id,
              tabNumber: e.tabNumber,
              firstName: e.firstName,
              lastName: e.lastName,
              middleName: e.middleName,
              positionName: e.position?.name,
            })),
          )}
          onClose={() => setPickOpen(false)}
          onConfirm={applyPick}
        />
      ) : null}
    </div>
  );
}
