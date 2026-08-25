'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import { bonusTitle, type BonusDoc, type BonusKind, type BonusLine } from '@/lib/bonus-accruals';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/bonus-accruals';

type Opt = { id: string; label: string };
type TypeOpt = { id: string; name: string; accrualName?: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function lastOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
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

export function BonusAccrualForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = !docId;
  const [kind, setKind] = useState<BonusKind>(searchParams.get('kind') === 'kpi' ? 'kpi' : 'fact');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(lastOfMonth());
  const [divisionId, setDivisionId] = useState('');
  const [factTypeId, setFactTypeId] = useState('');
  const [considerPayroll, setConsiderPayroll] = useState(false);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<BonusLine[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [factTypes, setFactTypes] = useState<TypeOpt[]>([]);
  const [accrualTypes, setAccrualTypes] = useState<TypeOpt[]>([]);
  const [employees, setEmployees] = useState<
    Array<{ id: string; lastName: string; firstName: string; tabNumber?: string; positionName?: string }>
  >([]);

  const readOnly = viewOnly || status === 'posted';
  const isFact = kind === 'fact';
  const pageTitle = bonusTitle(kind, isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);
  const factOpts = useMemo(() => factTypes.map((t) => ({ id: t.id, label: t.name })), [factTypes]);
  const typeLookups = useMemo(
    () => accrualTypes.map((t) => ({ id: t.name, label: t.name })),
    [accrualTypes],
  );
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lines;
    return lines.filter((l) =>
      [l.employee?.label, l.typeName, l.accrualName].join(' ').toLowerCase().includes(qq),
    );
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
        const [divs, factsRaw, accRaw, emps] = await Promise.all([
          apiFetch<Array<{ id: string; name: string }>>('/api/organization/divisions').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/fact-types').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/accrual-types').catch(() => []),
          apiFetch<
            | {
                items?: Array<{
                  id: string;
                  lastName: string;
                  firstName: string;
                  tabNumber?: string;
                  position?: { name: string };
                }>;
              }
            | Array<{
                id: string;
                lastName: string;
                firstName: string;
                tabNumber?: string;
                position?: { name: string };
              }>
          >('/api/employees?status=active&limit=500').catch(() => []),
        ]);
        setDivisions((Array.isArray(divs) ? divs : []).map((d) => ({ id: d.id, label: d.name })));
        setFactTypes(Array.isArray(factsRaw) ? factsRaw : factsRaw.items || []);
        setAccrualTypes(Array.isArray(accRaw) ? accRaw : accRaw.items || []);
        const list = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            lastName: e.lastName,
            firstName: e.firstName,
            tabNumber: e.tabNumber,
            positionName: e.position?.name,
          })),
        );
        if (docId) {
          const row = await apiFetch<BonusDoc>(`/api/payroll/bonus-accruals/${docId}`);
          setKind(row.kind === 'kpi' ? 'kpi' : 'fact');
          setStatus(row.status);
          setNumber(row.number || '');
          setDocDate(String(row.docDate || '').slice(0, 10) || today());
          setStartDate(String(row.startDate || '').slice(0, 10) || firstOfMonth());
          setEndDate(String(row.endDate || '').slice(0, 10) || lastOfMonth());
          setDivisionId(row.divisionId || '');
          setFactTypeId(row.factTypeId || '');
          setConsiderPayroll(Boolean(row.considerPayroll));
          setNote(row.note || '');
          setLines(row.lines || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  function patchLine(i: number, patch: Partial<BonusLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function payload() {
    const ft = factTypes.find((t) => t.id === factTypeId);
    return {
      kind,
      number: number || undefined,
      docDate,
      startDate,
      endDate,
      divisionId: divisionId || undefined,
      factTypeId: isFact ? factTypeId || undefined : undefined,
      factTypeName: isFact ? ft?.name : undefined,
      considerPayroll: isFact ? considerPayroll : false,
      note: note || undefined,
      lines: lines
        .filter((l) => l.employeeId)
        .map((l) => ({
          employeeId: l.employeeId,
          typeName: l.typeName || undefined,
          accrualName: l.accrualName || undefined,
          startDate: l.startDate || undefined,
          endDate: l.endDate || undefined,
          amount: Number(l.amount) || 0,
        })),
    };
  }

  async function save(andPost: boolean) {
    if (!docDate || !startDate || !endDate) {
      setError('Укажите даты');
      return;
    }
    if (andPost) {
      const ok = await confirm({
        message: 'Сохранить и провести документ?',
        confirmText: 'Да',
        cancelText: 'Нет',
      });
      if (!ok) return;
    }
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<BonusDoc>('/api/payroll/bonus-accruals', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/bonus-accruals/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andPost && id) {
        await apiFetch(`/api/payroll/bonus-accruals/${id}/post`, { method: 'POST' });
      }
      router.push(PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function fill() {
    const ok = await confirm({ message: 'Заполнить данные?', confirmText: 'Да', cancelText: 'Нет' });
    if (!ok) return;
    setSaving(true);
    setError('');
    try {
      const ft = factTypes.find((t) => t.id === factTypeId);
      const data = await apiFetch<{ lines: BonusLine[] }>('/api/payroll/bonus-accruals/fill', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          divisionId: divisionId || undefined,
          factTypeId: isFact ? factTypeId || undefined : undefined,
          factTypeName: isFact ? ft?.name : undefined,
          accrualName: isFact ? ft?.accrualName || undefined : undefined,
          startDate,
          endDate,
          considerPayroll: isFact ? considerPayroll : false,
        }),
      });
      setLines(data.lines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;

  const colSpan = isFact ? (readOnly ? 5 : 6) : readOnly ? 6 : 7;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="bonus-accruals" titleOverride={pageTitle} />
      <div className={form.topBar}>
        <h1 className={form.title}>{pageTitle}</h1>
        <div className={form.actions}>
          {!readOnly ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              <button type="button" className={form.btnPost} disabled={saving} onClick={() => void save(true)}>
                Провести
              </button>
            </>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.card}>
        <div className={form.grid4}>
          <div className={form.field}>
            <label>
              Дата <span className={form.req}>*</span>
            </label>
            <input type="date" value={docDate} disabled={readOnly} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>Номер</label>
            <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата начала <span className={form.req}>*</span>
            </label>
            <input type="date" value={startDate} disabled={readOnly} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата окончания <span className={form.req}>*</span>
            </label>
            <input type="date" value={endDate} disabled={readOnly} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className={form.grid2} style={{ marginTop: '0.75rem' }}>
          <div className={`${form.field} ${isFact ? '' : form.full}`}>
            <label>Подразделение</label>
            <SearchLookup value={divisionId} options={divisions} disabled={readOnly} onChange={setDivisionId} />
          </div>
          {isFact ? (
            <div className={form.field}>
              <label>Тип факта</label>
              <SearchLookup value={factTypeId} options={factOpts} disabled={readOnly} onChange={setFactTypeId} />
            </div>
          ) : null}
          <div className={`${form.field} ${form.full}`}>
            <label>Примечание</label>
            <textarea rows={4} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {isFact ? (
          <label className={form.checkInline} style={{ marginTop: '0.85rem' }}>
            <input
              type="checkbox"
              disabled={readOnly}
              checked={considerPayroll}
              onChange={(e) => setConsiderPayroll(e.target.checked)}
            />
            Расчет бонуса с учетом начислений, указанных в «Оплате труда»
          </label>
        ) : null}
      </div>

      <div className={form.card} style={{ marginTop: '1rem' }}>
        <div className={form.lineBar}>
          <div className={form.lineLeft}>
            {!readOnly ? (
              <button type="button" className={form.btnGhost} disabled={saving} onClick={() => void fill()}>
                Заполнить
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
                <th>Сотрудник</th>
                {isFact ? <th>Тип</th> : null}
                <th>Начисление</th>
                {!isFact ? <th>Дата начала</th> : null}
                {!isFact ? <th>Дата окончания</th> : null}
                <th>Сумма</th>
                {!readOnly ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className={form.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {paged.map((line, idx) => {
                const i = lines.indexOf(line);
                return (
                  <tr key={`${line.employeeId}-${idx}`}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>
                      <EmployeeLookup
                        value={line.employeeId}
                        options={empItems}
                        disabled={readOnly}
                        onChange={(id) => {
                          const emp = employees.find((e) => e.id === id);
                          patchLine(i, {
                            employeeId: id,
                            employee: emp
                              ? {
                                  id: emp.id,
                                  label: [emp.lastName, emp.firstName].filter(Boolean).join(' '),
                                  tabNumber: emp.tabNumber,
                                }
                              : null,
                          });
                        }}
                      />
                    </td>
                    {isFact ? (
                      <td>
                        <input
                          disabled={readOnly}
                          value={line.typeName || ''}
                          onChange={(e) => patchLine(i, { typeName: e.target.value })}
                        />
                      </td>
                    ) : null}
                    <td>
                      <SearchLookup
                        value={line.accrualName || ''}
                        options={typeLookups}
                        disabled={readOnly}
                        onChange={(name) => patchLine(i, { accrualName: name })}
                      />
                    </td>
                    {!isFact ? (
                      <td>
                        <input
                          type="date"
                          disabled={readOnly}
                          value={line.startDate ? String(line.startDate).slice(0, 10) : ''}
                          onChange={(e) => patchLine(i, { startDate: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {!isFact ? (
                      <td>
                        <input
                          type="date"
                          disabled={readOnly}
                          value={line.endDate ? String(line.endDate).slice(0, 10) : ''}
                          onChange={(e) => patchLine(i, { endDate: e.target.value })}
                        />
                      </td>
                    ) : null}
                    <td>
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={line.amount}
                        onChange={(e) => patchLine(i, { amount: Number(e.target.value) || 0 })}
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
