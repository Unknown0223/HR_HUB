'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirm } from '@/lib/dialogs';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import {
  CURRENCIES,
  formatMonthRu,
  kindTitle,
  type OneTimeCalc,
  type OneTimeDoc,
  type OneTimeKind,
  type OneTimeLine,
} from '@/lib/one-time-accruals';
import form from '../../payroll/accruals/form.module.css';
import extra from '../settlements/extra.module.css';

const PATH = '/catalog/one-time-accruals';

type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  positionName?: string;
  divisionId?: string;
  managerId?: string;
};
type TypeOpt = { id: string; name: string };

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

export function OneTimeForm({ docId, viewOnly }: { docId?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const isNew = !docId;
  const [kind, setKind] = useState<OneTimeKind>(sp.get('kind') === 'deduction' ? 'deduction' : 'accrual');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [number, setNumber] = useState('');
  const [docDate, setDocDate] = useState(today());
  const [month, setMonth] = useState(firstOfMonth());
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [basis, setBasis] = useState('');
  const [note, setNote] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [calcType, setCalcType] = useState<OneTimeCalc>('value');
  const [percent, setPercent] = useState(0);
  const [formula, setFormula] = useState('');
  const [useOneForAll, setUseOneForAll] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sharedTypeId, setSharedTypeId] = useState('');
  const [lines, setLines] = useState<OneTimeLine[]>([]);
  const [q, setQ] = useState('');
  const [pickMode, setPickMode] = useState<'staff' | 'initiators' | null>(null);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [accrualTypes, setAccrualTypes] = useState<TypeOpt[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<TypeOpt[]>([]);

  const readOnly = viewOnly || status === 'posted';
  const typeOpts = kind === 'deduction' ? deductionTypes : accrualTypes;
  const typeLabel = kind === 'deduction' ? 'Удержание' : 'Начисление';
  const pageTitle = kindTitle(kind, isNew ? 'create' : readOnly ? 'view' : 'edit');
  const empItems = useMemo(() => toPickItems(employees), [employees]);
  const typeLookups = useMemo(() => typeOpts.map((t) => ({ id: t.id, label: t.name })), [typeOpts]);
  const pickItems = useMemo(() => {
    const base = empItems.filter((e) => !divisionId || e.divisionId === divisionId);
    if (pickMode !== 'initiators') return base;
    const ids = new Set(divisions.map((d) => d.managerId).filter(Boolean) as string[]);
    return base.filter((e) => ids.has(e.id));
  }, [empItems, divisionId, pickMode, divisions]);
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lines;
    return lines.filter((l) =>
      [l.employee?.label, l.typeName, l.note].join(' ').toLowerCase().includes(qq),
    );
  }, [lines, q]);

  useEffect(() => {
    void (async () => {
      try {
        const [divs, emps, accRaw, dedRaw] = await Promise.all([
          apiFetch<Array<{ id: string; name: string }>>('/api/organization/divisions').catch(() => []),
          apiFetch<
            | {
                items?: Array<{
                  id: string;
                  lastName: string;
                  firstName: string;
                  tabNumber?: string;
                  divisionId?: string;
                  position?: { name: string };
                }>;
              }
            | Array<{
                id: string;
                lastName: string;
                firstName: string;
                tabNumber?: string;
                divisionId?: string;
                position?: { name: string };
              }>
          >('/api/employees?status=active&limit=500').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/accrual-types').catch(() => []),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/deduction-types').catch(() => []),
        ]);
        setDivisions(
          (Array.isArray(divs) ? divs : []).map((d) => ({
            id: d.id,
            label: d.name,
            managerId: (d as { managerId?: string }).managerId,
          })),
        );
        const list = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            label: [e.lastName, e.firstName].filter(Boolean).join(' '),
            tabNumber: e.tabNumber,
            positionName: e.position?.name,
            divisionId: e.divisionId,
          })),
        );
        setAccrualTypes(Array.isArray(accRaw) ? accRaw : accRaw.items || []);
        setDeductionTypes(Array.isArray(dedRaw) ? dedRaw : dedRaw.items || []);
        if (docId) {
          const row = await apiFetch<OneTimeDoc>(`/api/payroll/one-time-accruals/${docId}`);
          setKind(row.kind === 'deduction' ? 'deduction' : 'accrual');
          setStatus(row.status);
          setNumber(row.number || '');
          setDocDate(row.docDate.slice(0, 10));
          setMonth(row.month.slice(0, 10));
          setTitle(row.title || '');
          setDivisionId(row.divisionId || '');
          setBasis(row.basis || '');
          setNote(row.note || '');
          setCurrency(row.currency || 'UZS');
          setCalcType(row.calcType === 'percent' || row.calcType === 'formula' ? row.calcType : 'value');
          setPercent(Number(row.percent) || 0);
          setFormula(row.formula || '');
          setUseOneForAll(Boolean(row.useOneForAll));
          setFileName(row.attachments?.[0]?.name || '');
          setLines(row.lines || []);
          setSharedTypeId(row.lines?.[0]?.typeId || '');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [docId]);

  function payload() {
    return {
      kind,
      number: number || undefined,
      docDate,
      month,
      title: title || undefined,
      divisionId: divisionId || undefined,
      basis: basis || undefined,
      note: note || undefined,
      currency,
      calcType,
      percent: Number(percent) || 0,
      formula: formula || undefined,
      useOneForAll,
      attachments: fileName ? [{ name: fileName }] : [],
      lines: lines
        .filter((l) => l.employeeId)
        .map((l) => ({
          employeeId: l.employeeId,
          typeId: l.typeId || undefined,
          typeName: l.typeName || undefined,
          lineDate: l.lineDate || undefined,
          amount: Number(l.amount) || 0,
          note: l.note || undefined,
        })),
    };
  }

  async function save(andPost: boolean) {
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<OneTimeDoc>('/api/payroll/one-time-accruals', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/one-time-accruals/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andPost && id) {
        await apiFetch(`/api/payroll/one-time-accruals/${id}/post`, { method: 'POST' });
      }
      router.push(`${PATH}?kind=${kind}`);
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
      const shared = useOneForAll
        ? typeOpts.find((x) => x.id === sharedTypeId) || typeOpts[0]
        : undefined;
      const data = await apiFetch<{ lines: OneTimeLine[] }>('/api/payroll/one-time-accruals/fill', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          divisionId: divisionId || undefined,
          lineDate: docDate,
          useOneForAll,
          typeId: shared?.id,
          typeName: shared?.name,
        }),
      });
      setLines(data.lines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  async function recalc() {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: OneTimeLine[] }>('/api/payroll/one-time-accruals/calculate', {
        method: 'POST',
        body: JSON.stringify({ calcType, percent, formula, lines: payload().lines }),
      });
      setLines((prev) =>
        prev.map((l) => {
          const n = (data.lines || []).find((x) => x.employeeId === l.employeeId);
          return n ? { ...l, amount: n.amount } : l;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка расчета');
    } finally {
      setSaving(false);
    }
  }

  function applySharedType(typeId: string) {
    const t = typeOpts.find((x) => x.id === typeId);
    setSharedTypeId(typeId);
    if (!t) return;
    setLines((prev) => prev.map((l) => ({ ...l, typeId: t.id, typeName: t.name })));
  }

  function setOneForAll(on: boolean) {
    setUseOneForAll(on);
    if (!on) return;
    const t = typeOpts.find((x) => x.id === sharedTypeId) || typeOpts[0];
    if (t) applySharedType(t.id);
  }

  function addEmpty() {
    const shared = useOneForAll
      ? typeOpts.find((x) => x.id === sharedTypeId) || typeOpts[0]
      : undefined;
    setLines((prev) => [
      ...prev,
      {
        employeeId: '',
        typeId: shared?.id,
        typeName: shared?.name,
        lineDate: docDate,
        amount: 0,
        note: '',
      },
    ]);
  }

  function applyPicked(ids: string[]) {
    const have = new Set(lines.map((l) => l.employeeId));
    const shared = useOneForAll
      ? typeOpts.find((x) => x.id === sharedTypeId) || typeOpts[0]
      : undefined;
    setLines((prev) => [
      ...prev,
      ...employees
        .filter((e) => ids.includes(e.id) && !have.has(e.id))
        .map((e) => ({
          employeeId: e.id,
          employee: { id: e.id, label: e.label, tabNumber: e.tabNumber },
          typeId: shared?.id,
          typeName: shared?.name,
          lineDate: docDate,
          amount: 0,
          note: '',
        })),
    ]);
    setPickMode(null);
  }

  function importRows() {
    const text = window.prompt('Вставьте CSV: табельный номер;сумма;примечание;дата');
    if (!text) return;
    const next: OneTimeLine[] = [];
    for (const row of text.split(/\r?\n/)) {
      const [tab, amount, noteVal, dateVal] = row.split(';').map((s) => s.trim());
      if (!tab) continue;
      const emp = employees.find((e) => e.tabNumber === tab || e.id === tab || e.label === tab);
      if (!emp) continue;
      next.push({
        employeeId: emp.id,
        employee: { id: emp.id, label: emp.label, tabNumber: emp.tabNumber },
        lineDate: dateVal || docDate,
        amount: Number(amount) || 0,
        note: noteVal || '',
      });
    }
    if (next.length) setLines((prev) => [...prev, ...next]);
  }

  function patchLine(i: number, patch: Partial<OneTimeLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  if (loading) return <p>Загрузка…</p>;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="one-time-accruals" titleOverride={pageTitle} />
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
          <button type="button" className={form.btnClose} onClick={() => router.push(`${PATH}?kind=${kind}`)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      <div className={form.head}>
        <div className={form.card}>
          <div className={form.grid2}>
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
            <div className={`${form.field} ${form.full}`}>
              <label>Название документа</label>
              <input value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>Подразделение</label>
              <SearchLookup value={divisionId} options={divisions} disabled={readOnly} onChange={setDivisionId} />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>Основание</label>
              <textarea rows={3} value={basis} disabled={readOnly} onChange={(e) => setBasis(e.target.value)} />
            </div>
            <div className={`${form.field} ${form.full}`}>
              <label>Примечание</label>
              <textarea rows={3} value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        <div className={form.card}>
          <div className={form.field}>
            <label>Месяц</label>
            <input
              type="month"
              value={month.slice(0, 7)}
              disabled={readOnly}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
            />
            <div className={extra.hint}>{formatMonthRu(month)}</div>
          </div>
          <div className={form.field} style={{ marginTop: 10 }}>
            <label>
              Валюта <span className={form.req}>*</span>
            </label>
            <select value={currency} disabled={readOnly} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className={form.field} style={{ marginTop: 10 }}>
            <label>Тип расчета</label>
            <div className={`${form.radios} ${form.radiosCol}`}>
              {(
                [
                  ['value', 'По введенному значению'],
                  ['percent', 'В процентах'],
                  ['formula', 'Формула'],
                ] as const
              ).map(([v, lab]) => (
                <label key={v}>
                  <input
                    type="radio"
                    name="calcType"
                    checked={calcType === v}
                    disabled={readOnly}
                    onChange={() => setCalcType(v)}
                  />
                  {lab}
                </label>
              ))}
            </div>
            {calcType === 'percent' ? (
              <div className={form.pctRow}>
                <div className={form.field}>
                  <label>Процент</label>
                  <input
                    type="number"
                    step="any"
                    value={percent}
                    disabled={readOnly}
                    onChange={(e) => setPercent(Number(e.target.value) || 0)}
                  />
                </div>
                <button type="button" className={form.btnGhost} disabled={readOnly || saving} onClick={() => void recalc()}>
                  Рассчитать
                </button>
              </div>
            ) : null}
            {calcType === 'formula' ? (
              <div className={form.pctRow}>
                <div className={form.field}>
                  <label>Формула</label>
                  <input
                    value={formula}
                    disabled={readOnly}
                    placeholder="например 10%"
                    onChange={(e) => setFormula(e.target.value)}
                  />
                </div>
                <button type="button" className={form.btnGhost} disabled={readOnly || saving} onClick={() => void recalc()}>
                  Рассчитать
                </button>
              </div>
            ) : null}
          </div>
          <label className={form.checkInline} style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={useOneForAll}
              disabled={readOnly}
              onChange={(e) => setOneForAll(e.target.checked)}
            />
            {kind === 'deduction' ? 'Использовать одно удержание ко всем' : 'Использовать одно начисление ко всем'}
          </label>
          {useOneForAll ? (
            <div className={form.field} style={{ marginTop: 8 }}>
              <label>{typeLabel}</label>
              <SearchLookup
                value={sharedTypeId}
                options={typeLookups}
                disabled={readOnly}
                onChange={applySharedType}
              />
            </div>
          ) : null}
          <div className={form.field} style={{ marginTop: 12 }}>
            <label>Файлы</label>
            <label
              className={form.drop}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (readOnly) return;
                const f = e.dataTransfer.files?.[0];
                if (f) setFileName(f.name);
              }}
            >
              Перетащите файл сюда или кликните для выбора файла
              <input
                type="file"
                disabled={readOnly}
                onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
              />
            </label>
            <div className={extra.hint}>{fileName || 'Не выбраны'}</div>
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
                <button type="button" className={form.btnSelect} onClick={() => setPickMode('staff')}>
                  Подбор
                </button>
                <button type="button" className={form.btnSelect} onClick={() => setPickMode('initiators')}>
                  Подбор инициаторов
                </button>
                <button type="button" className={form.btnSelect} onClick={importRows}>
                  Импорт
                </button>
              </>
            ) : null}
          </div>
          <div className={form.lineRight}>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <span className={extra.muted}>
              {visible.length}/{lines.length}
            </span>
          </div>
        </div>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>№</th>
                <th>Сотрудник</th>
                <th>{typeLabel}</th>
                <th>Дата начисления</th>
                <th>Сумма</th>
                <th>Примечание</th>
                {!readOnly ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className={form.empty}>
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
                        onChange={(id) => {
                          const emp = employees.find((e) => e.id === id);
                          patchLine(i, {
                            employeeId: id,
                            employee: emp ? { id: emp.id, label: emp.label, tabNumber: emp.tabNumber } : null,
                          });
                        }}
                      />
                    </td>
                    <td>
                      <SearchLookup
                        value={line.typeId || ''}
                        options={typeLookups}
                        disabled={readOnly || useOneForAll}
                        onChange={(id) => {
                          const t = typeOpts.find((x) => x.id === id);
                          patchLine(i, { typeId: t?.id || '', typeName: t?.name || '' });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={readOnly}
                        value={line.lineDate ? String(line.lineDate).slice(0, 10) : ''}
                        onChange={(e) => patchLine(i, { lineDate: e.target.value })}
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

      {pickMode ? (
        <EmployeePickModal
          title={pickMode === 'initiators' ? 'Подбор инициаторов' : 'Подбор'}
          confirmText="Добавить"
          items={pickItems}
          onClose={() => setPickMode(null)}
          onConfirm={(ids) => applyPicked(ids)}
        />
      ) : null}
    </div>
  );
}
