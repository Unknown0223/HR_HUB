'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import {
  TRAVEL_CURRENCIES,
  travelTitle,
  type TravelDoc,
  type TravelLine,
  type TravelTripOpt,
} from '@/lib/travel-expenses';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/travel-expenses';

type Emp = {
  id: string;
  lastName: string;
  firstName: string;
  tabNumber?: string;
  positionName?: string;
  divisionName?: string;
};
type Opt = { id: string; label: string };
type TypeOpt = { id: string; name: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function kpiFmt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function SearchLookup({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: Opt[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    if (!qq) return options.slice(0, 80);
    return options.filter((o) => o.label.toLowerCase().includes(qq)).slice(0, 80);
  }, [options, draft]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className={form.searchWrap} ref={wrapRef}>
      <input
        className={form.searchInput}
        disabled={disabled}
        value={open ? draft : selected?.label || ''}
        placeholder="Поиск..."
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
      {value && !open && !disabled ? (
        <button type="button" className={form.searchClear} onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
      {open && !disabled ? (
        <div className={form.menu}>
          {filtered.length === 0 ? (
            <div className={form.optEmpty}>Нет данных</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.id}
                className={o.id === value ? form.optOn : form.opt}
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

export function TravelExpenseForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [employeeId, setEmployeeId] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [tripId, setTripId] = useState('');
  const [tripDays, setTripDays] = useState(0);
  const [currency, setCurrency] = useState('UZS');
  const [advance, setAdvance] = useState(0);
  const [calcForSalary, setCalcForSalary] = useState(false);
  const [lines, setLines] = useState<TravelLine[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [trips, setTrips] = useState<TravelTripOpt[]>([]);
  const [accrualTypes, setAccrualTypes] = useState<TypeOpt[]>([]);

  const readOnly = viewOnly || status === 'approved';
  const pageTitle = travelTitle(isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);
  const tripOpts = useMemo(() => trips.map((t) => ({ id: t.id, label: t.label || t.title })), [trips]);
  const typeLookups = useMemo(
    () => accrualTypes.map((t) => ({ id: t.name, label: t.name })),
    [accrualTypes],
  );
  const expenses = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const balance = Math.round((advance - expenses) * 100) / 100;
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lines;
    return lines.filter((l) => [l.accrualName, l.note].join(' ').toLowerCase().includes(qq));
  }, [lines, q]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    void (async () => {
      try {
        const [emps, accRaw] = await Promise.all([
          apiFetch<
            | {
                items?: Array<{
                  id: string;
                  lastName: string;
                  firstName: string;
                  tabNumber?: string;
                  position?: { name: string };
                  division?: { name: string };
                }>;
              }
            | Array<{
                id: string;
                lastName: string;
                firstName: string;
                tabNumber?: string;
                position?: { name: string };
                division?: { name: string };
              }>
          >('/api/employees?status=active&limit=500').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/accrual-types').catch(() => []),
        ]);
        const list = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            lastName: e.lastName,
            firstName: e.firstName,
            tabNumber: e.tabNumber,
            positionName: e.position?.name,
            divisionName: e.division?.name,
          })),
        );
        setAccrualTypes(Array.isArray(accRaw) ? accRaw : accRaw.items || []);
        if (docId) {
          const row = await apiFetch<TravelDoc>(`/api/payroll/travel-expenses/${docId}`);
          setStatus(row.status);
          setNumber(row.number || '');
          setDocDate(String(row.docDate || '').slice(0, 10) || today());
          setEmployeeId(row.employeeId);
          setDivisionName(row.employee?.divisionName || '');
          setTripId(row.tripId || '');
          setTripDays(row.tripDays || 0);
          setCurrency(row.currency || 'UZS');
          setAdvance(Number(row.advance) || 0);
          setCalcForSalary(Boolean(row.calcForSalary));
          setLines(row.lines || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  useEffect(() => {
    if (!employeeId) {
      setTrips([]);
      return;
    }
    void apiFetch<TravelTripOpt[]>(`/api/payroll/travel-expenses/trips?employeeId=${employeeId}`)
      .then(setTrips)
      .catch(() => setTrips([]));
  }, [employeeId]);

  function onEmployee(id: string) {
    setEmployeeId(id);
    setTripId('');
    setTripDays(0);
    setAdvance(0);
    const emp = employees.find((e) => e.id === id);
    setDivisionName(emp?.divisionName || '');
  }

  function onTrip(id: string) {
    setTripId(id);
    const t = trips.find((x) => x.id === id);
    if (t) {
      setTripDays(t.days);
      setAdvance(Number(t.amount) || 0);
    } else {
      setTripDays(0);
    }
  }

  function patchLine(i: number, patch: Partial<TravelLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addEmpty() {
    const t = trips.find((x) => x.id === tripId);
    setLines((prev) => [
      ...prev,
      {
        accrualName: '',
        startDate: t?.startDate ? String(t.startDate).slice(0, 10) : docDate,
        endDate: t?.endDate ? String(t.endDate).slice(0, 10) : docDate,
        amount: 0,
        note: '',
      },
    ]);
  }

  function payload() {
    return {
      number: number || undefined,
      docDate,
      employeeId,
      tripId,
      currency,
      advance,
      calcForSalary,
      lines: lines.map((l) => ({
        accrualName: l.accrualName || undefined,
        startDate: l.startDate || undefined,
        endDate: l.endDate || undefined,
        amount: Number(l.amount) || 0,
        note: l.note || undefined,
      })),
    };
  }

  async function save(andComplete: boolean) {
    if (!docDate) {
      setError('Укажите дату');
      return;
    }
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    if (!tripId) {
      setError('Выберите командировку');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<TravelDoc>('/api/payroll/travel-expenses', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/travel-expenses/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andComplete && id) {
        await apiFetch(`/api/payroll/travel-expenses/${id}/complete`, { method: 'POST' });
      }
      router.push(PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="travel-expenses" titleOverride={pageTitle} />
      <div className={form.topBar}>
        <h1 className={form.title}>{pageTitle}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              {status !== 'approved' ? (
                <button type="button" className={form.btnPost} disabled={saving} onClick={() => void save(true)}>
                  Завершить
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.head}>
        <div className={form.card}>
          <div className={form.grid2}>
            <div className={form.field}>
              <label>Номер</label>
              <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className={form.field}>
              <label>
                Дата <span className={form.req}>*</span>
              </label>
              <input type="date" value={docDate} disabled={readOnly} onChange={(e) => setDocDate(e.target.value)} />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>
                Сотрудник <span className={form.req}>*</span>
              </label>
              <EmployeeLookup
                value={employeeId}
                options={empItems}
                disabled={readOnly}
                placeholder="Поиск"
                onChange={onEmployee}
              />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>Подразделение</label>
              <input value={divisionName} disabled />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>
                Командировка <span className={form.req}>*</span>
              </label>
              <SearchLookup value={tripId} options={tripOpts} disabled={readOnly || !employeeId} onChange={onTrip} />
            </div>
            <div className={form.field}>
              <label>Кол-во дней командировки</label>
              <input value={tripDays || ''} disabled />
            </div>
            <div className={form.field}>
              <label>
                Валюта <span className={form.req}>*</span>
              </label>
              <select value={currency} disabled={readOnly} onChange={(e) => setCurrency(e.target.value)}>
                {TRAVEL_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={form.card}>
          <div className={form.kpiGrid}>
            <div className={`${form.kpi} ${form.kpiBlue}`}>
              <span>Аванс</span>
              <strong>{kpiFmt(advance)}</strong>
            </div>
            <div className={`${form.kpi} ${form.kpiPink}`}>
              <span>Расходы</span>
              <strong>{kpiFmt(expenses)}</strong>
            </div>
            <div className={`${form.kpi} ${form.kpiYellow}`}>
              <span>Остаток / Долг</span>
              <strong>{kpiFmt(balance)}</strong>
            </div>
          </div>
          <div className={form.toggle}>
            Рассчитать для зарплаты
            <label className={form.switch}>
              <input
                type="checkbox"
                disabled={readOnly}
                checked={calcForSalary}
                onChange={(e) => setCalcForSalary(e.target.checked)}
              />
              {calcForSalary ? 'Да' : 'Нет'}
            </label>
          </div>
        </div>
      </div>

      <div className={form.card} style={{ marginTop: '1rem' }}>
        <div className={form.lineBar}>
          <div className={form.lineLeft}>
            {!readOnly ? (
              <button type="button" className={form.btnGhost} onClick={addEmpty}>
                Добавить
              </button>
            ) : null}
          </div>
          <div className={form.lineRight}>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <span className={extra.muted}>
              {paged.length}/{visible.length}
            </span>
            <button type="button" className={form.btnGhost} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </button>
            <span className={extra.muted}>{Math.min(page, pageCount)}</span>
            <button
              type="button"
              className={form.btnGhost}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
        </div>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>№</th>
                <th>Начисление</th>
                <th>Дата начала</th>
                <th>Дата окончания</th>
                <th>Сумма</th>
                <th>Примечание</th>
                {!readOnly ? <th>Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className={form.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {paged.map((line, idx) => {
                const i = lines.indexOf(line);
                return (
                  <tr key={`${i}-${idx}`}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>{(page - 1) * pageSize + idx + 1}</td>
                    <td>
                      <SearchLookup
                        value={line.accrualName || ''}
                        options={typeLookups}
                        disabled={readOnly}
                        onChange={(name) => patchLine(i, { accrualName: name })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={readOnly}
                        value={line.startDate ? String(line.startDate).slice(0, 10) : ''}
                        onChange={(e) => patchLine(i, { startDate: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={readOnly}
                        value={line.endDate ? String(line.endDate).slice(0, 10) : ''}
                        onChange={(e) => patchLine(i, { endDate: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={line.amount}
                        onChange={(e) => patchLine(i, { amount: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={readOnly}
                        value={line.note || ''}
                        onChange={(e) => patchLine(i, { note: e.target.value })}
                      />
                    </td>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className={form.btnGhost}
                          onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
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
    </div>
  );
}
