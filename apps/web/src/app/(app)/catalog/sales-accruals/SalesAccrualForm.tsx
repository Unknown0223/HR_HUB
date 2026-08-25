'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import { ROUNDING_OPTS } from '@/lib/vedomost';
import {
  lineAmount,
  money,
  roundByMask,
  SALES_KINDS,
  type PayType,
  type SalesAccrualDoc,
  type SalesKind,
  type SalesLine,
} from '@/lib/sales-accruals';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/sales-accruals';

type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  positionId?: string | null;
  positionName?: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function SearchLookup({
  value,
  options,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  options: Opt[];
  onChange: (id: string) => void;
  disabled?: boolean;
  invalid?: boolean;
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
        className={`${form.searchInput} ${invalid ? form.searchInvalid : ''}`}
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
          {filtered.length === 0 ? <div className={form.optEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className={form.opt}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SalesAccrualForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const isNew = !docId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [tried, setTried] = useState(false);
  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth());
  const [periodTo, setPeriodTo] = useState(today());
  const [title, setTitle] = useState('');
  const [paymentType, setPaymentType] = useState<PayType>('cash');
  const [salesKind, setSalesKind] = useState<SalesKind>('personal');
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [cashbox, setCashbox] = useState('Основная касса');
  const [bankAccount, setBankAccount] = useState('');
  const [rounding, setRounding] = useState('####.000000');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<SalesLine[]>([]);
  const [showTotals, setShowTotals] = useState(false);
  const [q, setQ] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [cashboxes, setCashboxes] = useState<string[]>([]);

  const readOnly = viewOnly || status === 'posted';

  useEffect(() => {
    void (async () => {
      try {
        const [divs, poss, emps, dicts] = await Promise.all([
          apiFetch<Array<{ id: string; name: string }>>('/api/organization/divisions').catch(() => []),
          apiFetch<Array<{ id: string; name: string }>>('/api/organization/positions').catch(() => []),
          apiFetch<
            | {
                items?: Array<{
                  id: string;
                  lastName: string;
                  firstName: string;
                  tabNumber?: string;
                  positionId?: string;
                  position?: { name: string };
                }>;
              }
            | Array<{
                id: string;
                lastName: string;
                firstName: string;
                tabNumber?: string;
                positionId?: string;
                position?: { name: string };
              }>
          >('/api/employees?status=active&limit=500').catch(() => []),
          apiFetch<Array<{ code: string; items?: Array<{ name: string; code: string }> }>>(
            '/api/settings/dictionaries?kind=extra',
          ).catch(() => []),
        ]);
        setDivisions((Array.isArray(divs) ? divs : []).map((d) => ({ id: d.id, label: d.name })));
        setPositions((Array.isArray(poss) ? poss : []).map((p) => ({ id: p.id, label: p.name })));
        const list = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            label: [e.lastName, e.firstName].filter(Boolean).join(' '),
            tabNumber: e.tabNumber,
            positionId: e.positionId,
            positionName: e.position?.name,
          })),
        );
        const cb = dicts.find((d) => d.code === 'cashboxes')?.items || [];
        const names = cb.map((i) => i.name || i.code);
        setCashboxes(names);
        if (isNew && names.includes('Основная касса')) setCashbox('Основная касса');
        else if (isNew && names[0]) setCashbox(names[0]);
        if (docId) {
          const row = await apiFetch<SalesAccrualDoc>(`/api/payroll/sales-accruals/${docId}`);
          setStatus(row.status);
          setNumber(row.number || '');
          setDocDate(row.docDate.slice(0, 10));
          setPeriodFrom(row.periodFrom.slice(0, 10));
          setPeriodTo(row.periodTo.slice(0, 10));
          setTitle(row.title || '');
          setPaymentType(row.paymentType === 'bank' ? 'bank' : 'cash');
          setSalesKind(row.salesKind === 'division' ? 'division' : 'personal');
          setDivisionId(row.divisionId || '');
          setPositionId(row.positionId || '');
          setCashbox(row.cashbox || '');
          setBankAccount(row.bankAccount || '');
          setRounding(row.rounding || '####.000000');
          setNote(row.note || '');
          setLines(row.lines || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId, isNew]);

  const empItems = useMemo(() => toPickItems(employees), [employees]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lines;
    return lines.filter((l) =>
      [l.employee?.label, l.positionName, l.salesKind].join(' ').toLowerCase().includes(qq),
    );
  }, [lines, q]);

  const totalSales = roundByMask(
    lines.reduce((s, l) => s + Number(l.salesAmount || 0), 0),
    rounding,
  );
  const totalAmount = roundByMask(
    lines.reduce((s, l) => s + Number(l.amount || 0), 0),
    rounding,
  );

  function recalc(next = lines, mask = rounding) {
    setLines(
      next.map((l) => ({
        ...l,
        amount: lineAmount(l.salesAmount, l.percent, mask),
      })),
    );
  }

  function payload() {
    return {
      number: number || undefined,
      docDate,
      periodFrom,
      periodTo,
      title: title || undefined,
      paymentType,
      salesKind,
      divisionId: divisionId || undefined,
      positionId: positionId || undefined,
      cashbox: paymentType === 'cash' ? cashbox : undefined,
      bankAccount: paymentType === 'bank' ? bankAccount : undefined,
      rounding,
      note: note || undefined,
      lines: lines
        .filter((l) => l.employeeId)
        .map((l) => ({
          employeeId: l.employeeId,
          positionId: l.positionId || undefined,
          salesKind: l.salesKind,
          percent: Number(l.percent) || 0,
          salesAmount: Number(l.salesAmount) || 0,
          amount: Number(l.amount) || 0,
        })),
    };
  }

  function valid() {
    if (paymentType === 'cash' && !cashbox.trim()) return false;
    if (paymentType === 'bank' && !bankAccount.trim()) return false;
    if (lines.some((l) => !l.employeeId)) return false;
    return true;
  }

  async function save(andPost: boolean) {
    setTried(true);
    if (!valid()) {
      setError(paymentType === 'bank' ? 'Укажите расчетный счет' : 'Укажите кассу');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<SalesAccrualDoc>('/api/payroll/sales-accruals', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/sales-accruals/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andPost && id) {
        await apiFetch(`/api/payroll/sales-accruals/${id}/post`, { method: 'POST' });
      }
      router.push(PATH);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function fill() {
    const ok = await confirm({
      message: 'Заполнить данные?',
      confirmText: 'Да',
      cancelText: 'Нет',
    });
    if (!ok) return;
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: SalesLine[] }>('/api/payroll/sales-accruals/fill', {
        method: 'POST',
        body: JSON.stringify({
          divisionId: divisionId || undefined,
          positionId: positionId || undefined,
          salesKind,
        }),
      });
      setLines(data.lines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  function addEmpty() {
    setLines((prev) => [
      ...prev,
      {
        employeeId: '',
        positionId: positionId || null,
        salesKind,
        percent: 0,
        salesAmount: 0,
        amount: 0,
      },
    ]);
  }

  function applyPicked(ids: string[]) {
    const chosen = new Set(ids);
    const add = employees.filter((e) => chosen.has(e.id) && !lines.some((l) => l.employeeId === e.id));
    setLines((prev) => [
      ...prev,
      ...add.map((e) => ({
        employeeId: e.id,
        employee: { id: e.id, label: e.label },
        positionId: e.positionId,
        positionName: e.positionName,
        salesKind,
        percent: 0,
        salesAmount: 0,
        amount: 0,
      })),
    ]);
    setPickOpen(false);
    void (async () => {
      try {
        const data = await apiFetch<{ lines: SalesLine[] }>('/api/payroll/sales-accruals/fill', {
          method: 'POST',
          body: JSON.stringify({ employeeIds: add.map((e) => e.id), salesKind }),
        });
        const byEmp = new Map((data.lines || []).map((l) => [l.employeeId, l]));
        setLines((prev) =>
          prev.map((l) => {
            const f = byEmp.get(l.employeeId);
            return f ? { ...l, percent: f.percent, positionId: f.positionId, positionName: f.positionName } : l;
          }),
        );
      } catch {
        /* keep rows */
      }
    })();
  }

  const titleText = `Начисление процентов от продаж (${isNew ? 'создание' : readOnly ? 'просмотр' : 'изменение'})`;
  if (loading) return <p>Загрузка…</p>;

  const payInvalid = tried && paymentType === 'cash' && !cashbox.trim();
  const bankInvalid = tried && paymentType === 'bank' && !bankAccount.trim();

  return (
    <div className={form.page}>
      <PageSubnav groupKey="sales-accruals" titleOverride={titleText} />
      <div className={form.topBar}>
        <h1 className={form.title}>{titleText}</h1>
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
            <label>Номер</label>
            <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата <span className={form.req}>*</span>
            </label>
            <input type="date" value={docDate} disabled={readOnly} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата начала <span className={form.req}>*</span>
            </label>
            <input type="date" value={periodFrom} disabled={readOnly} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>
              Дата окончания <span className={form.req}>*</span>
            </label>
            <input type="date" value={periodTo} disabled={readOnly} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
          <div className={form.field} style={{ gridColumn: '1 / span 2' }}>
            <label>Название</label>
            <input value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>Тип оплаты</label>
            <div className={form.radios}>
              <label>
                <input
                  type="radio"
                  disabled={readOnly}
                  checked={paymentType === 'cash'}
                  onChange={() => setPaymentType('cash')}
                />
                Наличные
              </label>
              <label>
                <input
                  type="radio"
                  disabled={readOnly}
                  checked={paymentType === 'bank'}
                  onChange={() => setPaymentType('bank')}
                />
                Безналичные
              </label>
            </div>
          </div>
          <div className={form.field}>
            <label>Тип продаж</label>
            <SearchLookup
              value={salesKind}
              disabled={readOnly}
              options={SALES_KINDS.map((k) => ({ id: k.value, label: k.label }))}
              onChange={(id) => setSalesKind(id === 'division' ? 'division' : 'personal')}
            />
          </div>
          <div className={form.field}>
            <label>Подразделение</label>
            <SearchLookup value={divisionId} options={divisions} disabled={readOnly} onChange={setDivisionId} />
          </div>
          <div className={form.field}>
            <label>Должность</label>
            <SearchLookup value={positionId} options={positions} disabled={readOnly} onChange={setPositionId} />
          </div>
          {paymentType === 'cash' ? (
            <div className={`${form.field} ${payInvalid ? form.invalid : ''}`}>
              <label>
                Касса <span className={form.req}>*</span>
              </label>
              <input
                list="sa-cash"
                value={cashbox}
                disabled={readOnly}
                placeholder="Поиск..."
                onChange={(e) => setCashbox(e.target.value)}
              />
              <datalist id="sa-cash">
                {cashboxes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          ) : (
            <div className={`${form.field} ${bankInvalid ? form.invalid : ''}`}>
              <label>
                Расчетный счет <span className={form.req}>*</span>
              </label>
              <input
                value={bankAccount}
                disabled={readOnly}
                placeholder="Поиск..."
                onChange={(e) => setBankAccount(e.target.value)}
              />
            </div>
          )}
          <div className={form.calcRow} style={{ gridColumn: 'span 1' }}>
            <div className={form.field}>
              <label>Округление</label>
              <select
                value={rounding}
                disabled={readOnly}
                onChange={(e) => {
                  setRounding(e.target.value);
                  recalc(lines, e.target.value);
                }}
              >
                {ROUNDING_OPTS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            {!readOnly ? (
              <button type="button" className={form.btnGhost} onClick={() => recalc()}>
                Рассчитать
              </button>
            ) : null}
          </div>
          <div className={`${form.field} ${form.noteWide}`}>
            <label>Примечание</label>
            <textarea rows={3} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className={form.field}>
            <label>Общая сумма продаж</label>
            <input value={money(totalSales)} readOnly />
          </div>
          <div className={form.field}>
            <label>Общая сумма</label>
            <input value={money(totalAmount)} readOnly />
          </div>
        </div>
      </div>

      <div className={form.card}>
        <div className={form.lineBar}>
          <div className={form.lineLeft}>
            {!readOnly ? (
              <>
                <button type="button" className={form.btnGhost} onClick={addEmpty}>
                  Добавить
                </button>
                <button type="button" className={form.btnGhost} disabled={saving} onClick={() => void fill()}>
                  Заполнить
                </button>
                <button type="button" className={form.btnSelect} onClick={() => setPickOpen(true)}>
                  Выбрать сотрудников
                </button>
              </>
            ) : null}
            <label className={form.checkInline}>
              <input type="checkbox" checked={showTotals} onChange={(e) => setShowTotals(e.target.checked)} />
              Показать итоговые строки
            </label>
          </div>
          <div className={form.lineRight}>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <span className={extra.muted}>{visible.length}/{lines.length}</span>
          </div>
        </div>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>№</th>
                <th>Сотрудник</th>
                <th>Должность</th>
                <th>Тип продаж</th>
                <th>Процент</th>
                <th>Сумма продаж</th>
                <th>Сумма</th>
                {!readOnly ? <th>Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 8 : 9} className={form.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {visible.map((line, idx) => {
                const i = lines.indexOf(line);
                return (
                  <tr key={`${line.employeeId}-${idx}`}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>{idx + 1}</td>
                    <td>
                      <EmployeeLookup
                        value={line.employeeId}
                        options={empItems}
                        disabled={readOnly}
                        invalid={tried && !line.employeeId}
                        onChange={(id) => {
                          const emp = employees.find((e) => e.id === id);
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    employeeId: id,
                                    employee: emp ? { id: emp.id, label: emp.label } : null,
                                    positionId: emp?.positionId,
                                    positionName: emp?.positionName,
                                  }
                                : l,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td>{line.positionName || employees.find((e) => e.id === line.employeeId)?.positionName || '—'}</td>
                    <td>
                      <select
                        disabled={readOnly}
                        value={line.salesKind}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, salesKind: e.target.value === 'division' ? 'division' : 'personal' } : l,
                            ),
                          )
                        }
                      >
                        {SALES_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={line.percent}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    percent: Number(e.target.value) || 0,
                                    amount: lineAmount(l.salesAmount, Number(e.target.value) || 0, rounding),
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={line.salesAmount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? {
                                    ...l,
                                    salesAmount: Number(e.target.value) || 0,
                                    amount: lineAmount(Number(e.target.value) || 0, l.percent, rounding),
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        disabled={readOnly}
                        value={line.amount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, amount: Number(e.target.value) || 0 } : l)),
                          )
                        }
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
              {showTotals && lines.length > 0 ? (
                <tr>
                  <td colSpan={6} />
                  <td>
                    <strong>{money(totalSales)}</strong>
                  </td>
                  <td>
                    <strong>{money(totalAmount)}</strong>
                  </td>
                  {!readOnly ? <td /> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {pickOpen ? (
        <EmployeePickModal
          items={empItems}
          initialSelectedIds={lines.map((l) => l.employeeId).filter(Boolean)}
          onClose={() => setPickOpen(false)}
          onConfirm={(ids) => applyPicked(ids)}
        />
      ) : null}
    </div>
  );
}
