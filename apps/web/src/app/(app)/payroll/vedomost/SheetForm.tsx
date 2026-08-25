'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { EmployeeLookup } from '@/components/EmployeeLookup';
import { EmployeePickModal } from '@/components/EmployeePickModal';
import { toPickItems } from '@/components/employee-pick';
import { apiFetch } from '@/lib/api';
import { formatMonthRu } from '@/lib/fine-policies';
import {
  empName,
  kindLabel,
  money,
  ROUNDING_OPTS,
  type PayrollSheet,
  type SheetKind,
  type SheetLine,
  type SheetPayType,
  type SheetSettings,
} from '@/lib/vedomost';
import form from '../accruals/form.module.css';
import list from '../../catalog/absence-types/page.module.css';
import extra from '../../catalog/settlements/extra.module.css';

type Opt = { id: string; label: string; tabNumber?: string; positionName?: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthValue(iso?: string) {
  const s = (iso || today()).slice(0, 7);
  return s;
}

export function SheetForm({ docId }: { docId?: string }) {
  const PATH_BASE = '/payroll/vedomost';
  const router = useRouter();
  const sp = useSearchParams();
  const initialKind = ((sp.get('kind') as SheetKind) || 'vedomost') as SheetKind;
  const isNew = !docId;
  const [kind, setKind] = useState<SheetKind>(initialKind);
  const [tab, setTab] = useState<'doc' | 'settings'>('doc');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('draft');
  const [month, setMonth] = useState(`${monthValue()}-01`);
  const [issueDate, setIssueDate] = useState(today());
  const [number, setNumber] = useState('');
  const [payType, setPayType] = useState<SheetPayType>('cash');
  const [divisionId, setDivisionId] = useState('');
  const [cashbox, setCashbox] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [note, setNote] = useState('');
  const [rounding, setRounding] = useState('###.000000');
  const [enableLimit, setEnableLimit] = useState(false);
  const [fileName, setFileName] = useState('');
  const [lines, setLines] = useState<SheetLine[]>([]);
  const [q, setQ] = useState('');
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [cashboxes, setCashboxes] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [settings, setSettings] = useState<SheetSettings | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [divs, dicts, emps, st] = await Promise.all([
          apiFetch<Array<{ id: string; name: string; code?: string }>>('/api/organization/divisions').catch(() => []),
          apiFetch<Array<{ code: string; items?: Array<{ name: string; code: string }> }>>(
            '/api/settings/dictionaries?kind=extra',
          ).catch(() => []),
          apiFetch<
            | {
                items?: Array<{
                  id: string;
                  lastName: string;
                  firstName: string;
                  tabNumber: string;
                  position?: { name?: string };
                }>;
              }
            | Array<{
                id: string;
                lastName: string;
                firstName: string;
                tabNumber: string;
                position?: { name?: string };
              }>
          >('/api/employees?status=active&limit=200').catch(() => []),
          apiFetch<SheetSettings>('/api/payroll/sheets/settings').catch(() => null),
        ]);
        setDivisions((Array.isArray(divs) ? divs : []).map((d) => ({ id: d.id, label: d.name })));
        const cb = dicts.find((d) => d.code === 'cashboxes')?.items || [];
        setCashboxes(cb.map((i) => i.name || i.code));
        const listEmp = Array.isArray(emps) ? emps : emps.items || [];
        setEmployees(
          listEmp.map((e) => ({
            id: e.id,
            label: [e.lastName, e.firstName].filter(Boolean).join(' ') || e.tabNumber,
            tabNumber: e.tabNumber,
            positionName: e.position?.name,
          })),
        );
        if (st) {
          setSettings(st);
          if (isNew) setRounding(st.rounding || rounding);
        }
        if (docId) {
          const row = await apiFetch<PayrollSheet>(`/api/payroll/sheets/${docId}`);
          setKind(row.kind);
          setStatus(row.status);
          setMonth(row.month.slice(0, 10));
          setIssueDate(row.issueDate.slice(0, 10));
          setNumber(row.number || '');
          setPayType(row.payType);
          setDivisionId(row.divisionId || '');
          setCashbox(row.cashbox || '');
          setBankAccount(row.bankAccount || '');
          setCurrency(row.currency || 'UZS');
          setNote(row.note || '');
          setRounding(row.rounding);
          setEnableLimit(row.enableLimit);
          setLines(row.lines || []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const readOnly = status !== 'draft';
  const isAdvance = kind === 'advance_salary';
  const total = useMemo(
    () =>
      lines.reduce((s, l) => {
        let a = Number(l.amount) || 0;
        if (enableLimit && Number(l.limitAmount) > 0) a = Math.min(a, Number(l.limitAmount));
        return s + a;
      }, 0),
    [lines, enableLimit],
  );

  const vis = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lines.map((l, i) => ({ l, i }));
    return lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => empName(l.employee).toLowerCase().includes(qq) || String(l.note || '').toLowerCase().includes(qq));
  }, [lines, q]);

  function payload() {
    return {
      kind,
      month: month.slice(0, 10),
      issueDate,
      payType,
      number: number || undefined,
      divisionId: divisionId || undefined,
      cashbox: cashbox || undefined,
      bankAccount: bankAccount || undefined,
      currency,
      note,
      rounding,
      enableLimit,
      lines: lines
        .filter((l) => l.employeeId)
        .map((l) => ({
          employeeId: l.employeeId,
          debt: Number(l.debt) || 0,
          limitAmount: Number(l.limitAmount) || 0,
          accruedAdvance: Number(l.accruedAdvance) || 0,
          amount: Number(l.amount) || 0,
          note: l.note || undefined,
          bank: l.bank || undefined,
          bankCode: l.bankCode || undefined,
          settlementAccount: l.settlementAccount || undefined,
        })),
    };
  }

  async function save(andComplete: boolean) {
    if (payType === 'cash' && !cashbox.trim()) {
      setError('Укажите кассу');
      return;
    }
    if (payType === 'bank' && !bankAccount.trim()) {
      setError('Укажите расчетный счет');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let id = docId;
      const body = payload();
      if (isNew) {
        const created = await apiFetch<PayrollSheet>('/api/payroll/sheets', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
      } else {
        const { kind: _kind, ...patch } = body;
        await apiFetch(`/api/payroll/sheets/${docId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      }
      if (andComplete && id) {
        await apiFetch(`/api/payroll/sheets/${id}/complete`, { method: 'POST' });
      }
      router.push(id ? `${PATH_BASE}/${id}` : PATH_BASE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function fill(forMonth = false) {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: SheetLine[] }>('/api/payroll/sheets/fill', {
        method: 'POST',
        body: JSON.stringify({ kind, month: month.slice(0, 10), divisionId: divisionId || undefined, forMonth }),
      });
      setLines(
        (data.lines || []).map((l) => ({
          ...l,
          employee: l.employee,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const next = await apiFetch<SheetSettings>('/api/payroll/sheets/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          rounding: settings.rounding,
          countPaidAdvances: settings.countPaidAdvances,
          generateNote: settings.generateNote,
          monthlyDayLimit: settings.monthlyDayLimit,
          percent: settings.percent,
          deductionPercent: settings.deductionPercent,
          postedAccrualsOnly: settings.postedAccrualsOnly,
          postedDeductionsOnly: settings.postedDeductionsOnly,
        }),
      });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка настроек');
    } finally {
      setSaving(false);
    }
  }

  function applyPicked(ids: string[]) {
    const have = new Set(lines.map((l) => l.employeeId));
    setLines((prev) => [
      ...prev,
      ...employees
        .filter((e) => ids.includes(e.id) && !have.has(e.id))
        .map((e) => ({
          employeeId: e.id,
          employee: { id: e.id, label: e.label },
          debt: 0,
          limitAmount: settings?.monthlyDayLimit || 0,
          accruedAdvance: 0,
          amount: 0,
        })),
    ]);
    setPickOpen(false);
  }

  const empItems = useMemo(() => toPickItems(employees), [employees]);

  function addRow() {
    const first = employees[0];
    setLines((prev) => [
      ...prev,
      {
        employeeId: first?.id || '',
        employee: first ? { id: first.id, label: first.label } : null,
        debt: 0,
        limitAmount: settings?.monthlyDayLimit || 0,
        accruedAdvance: 0,
        amount: 0,
      },
    ]);
  }

  function importRows() {
    const text = window.prompt('Вставьте CSV: сотрудникId;сумма;примечание');
    if (!text) return;
    const next: SheetLine[] = [];
    for (const line of text.split(/\r?\n/)) {
      const [employeeId, amount, noteVal] = line.split(';').map((s) => s.trim());
      if (!employeeId) continue;
      const emp = employees.find((e) => e.id === employeeId || e.label === employeeId);
      next.push({
        employeeId: emp?.id || employeeId,
        employee: emp ? { id: emp.id, label: emp.label } : { id: employeeId, label: employeeId },
        debt: 0,
        limitAmount: 0,
        accruedAdvance: 0,
        amount: Number(amount) || 0,
        note: noteVal || '',
      });
    }
    if (next.length) setLines(next);
  }

  if (loading) return <p>Загрузка…</p>;
  const title = `${kindLabel(kind)} (${isNew ? 'создание' : readOnly ? 'просмотр' : 'изменение'})`;

  return (
    <div className={form.page}>
      <PageSubnav groupKey="vedomost" titleOverride={title} />
      <div className={form.topBar}>
        <h1 className={form.title}>{title}</h1>
        <div className={form.actions}>
          {isAdvance ? (
            <>
              <button type="button" className={tab === 'doc' ? form.btnPost : form.btnClose} onClick={() => setTab('doc')}>
                Аванс
              </button>
              <button
                type="button"
                className={tab === 'settings' ? list.createBtn : form.btnClose}
                onClick={() => setTab('settings')}
              >
                Настройки
              </button>
            </>
          ) : null}
          {!readOnly && tab === 'doc' ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              <button type="button" className={form.btnPost} disabled={saving} onClick={() => void save(true)}>
                Завершить
              </button>
            </>
          ) : null}
          {tab === 'settings' ? (
            <>
              <button type="button" className={form.btnSave} disabled={saving} onClick={() => void saveSettings()}>
                Сохранить
              </button>
              <button
                type="button"
                className={form.btnClose}
                onClick={() =>
                  setSettings({
                    rounding: '####.000000',
                    countPaidAdvances: true,
                    generateNote: true,
                    monthlyDayLimit: 0,
                    percent: 40,
                    deductionPercent: 0,
                    postedAccrualsOnly: true,
                    postedDeductionsOnly: true,
                  })
                }
              >
                Сбросить
              </button>
            </>
          ) : null}
          <button type="button" className={form.btnClose} onClick={() => router.push(PATH_BASE)}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}

      {tab === 'settings' && settings ? (
        <div className={form.card} style={{ maxWidth: 720 }}>
          <div className={form.field} style={{ marginBottom: 12 }}>
            <label>Округление</label>
            <select value={settings.rounding} onChange={(e) => setSettings({ ...settings, rounding: e.target.value })}>
              {ROUNDING_OPTS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <label className={extra.toggle} style={{ marginBottom: 10 }}>
            <span className={`${extra.switch} ${settings.countPaidAdvances ? extra.switchOn : ''}`}>
              <input
                type="checkbox"
                checked={settings.countPaidAdvances}
                onChange={(e) => setSettings({ ...settings, countPaidAdvances: e.target.checked })}
              />
              <span className={extra.knob} />
            </span>
            Выплаченные авансы должны учитываться
          </label>
          <label className={extra.toggle} style={{ marginBottom: 10 }}>
            <span className={`${extra.switch} ${settings.generateNote ? extra.switchOn : ''}`}>
              <input
                type="checkbox"
                checked={settings.generateNote}
                onChange={(e) => setSettings({ ...settings, generateNote: e.target.checked })}
              />
              <span className={extra.knob} />
            </span>
            Примечание сгенерировано
          </label>
          <div className={form.field} style={{ marginBottom: 12 }}>
            <label>Месячный дневной лимит</label>
            <input
              type="number"
              value={settings.monthlyDayLimit}
              onChange={(e) => setSettings({ ...settings, monthlyDayLimit: Number(e.target.value) || 0 })}
            />
          </div>
          <div className={form.field} style={{ marginBottom: 12 }}>
            <label>Процент</label>
            <input
              type="number"
              value={settings.percent}
              onChange={(e) => setSettings({ ...settings, percent: Number(e.target.value) || 0 })}
            />
          </div>
          <div className={form.field} style={{ marginBottom: 12 }}>
            <label>Процент удержания заработной платы</label>
            <input
              type="number"
              value={settings.deductionPercent}
              onChange={(e) => setSettings({ ...settings, deductionPercent: Number(e.target.value) || 0 })}
            />
          </div>
          <div className={form.field} style={{ marginBottom: 8 }}>
            <label>Официальные типы начислений</label>
            <input placeholder="Поиск..." disabled />
          </div>
          <label className={extra.toggle} style={{ marginBottom: 12 }}>
            <span className={`${extra.switch} ${settings.postedAccrualsOnly ? extra.switchOn : ''}`}>
              <input
                type="checkbox"
                checked={settings.postedAccrualsOnly}
                onChange={(e) => setSettings({ ...settings, postedAccrualsOnly: e.target.checked })}
              />
              <span className={extra.knob} />
            </span>
            Документы Проведенные
          </label>
          <div className={form.field} style={{ marginBottom: 8 }}>
            <label>Официальные типы удержаний</label>
            <input placeholder="Поиск..." disabled />
          </div>
          <label className={extra.toggle}>
            <span className={`${extra.switch} ${settings.postedDeductionsOnly ? extra.switchOn : ''}`}>
              <input
                type="checkbox"
                checked={settings.postedDeductionsOnly}
                onChange={(e) => setSettings({ ...settings, postedDeductionsOnly: e.target.checked })}
              />
              <span className={extra.knob} />
            </span>
            Документы Проведенные
          </label>
        </div>
      ) : null}

      {tab === 'doc' ? (
        <>
          <div className={form.head}>
            <div className={form.card}>
              <div className={form.grid2}>
                <div className={form.field}>
                  <label>Месяц</label>
                  <input
                    type="month"
                    value={month.slice(0, 7)}
                    disabled={readOnly}
                    onChange={(e) => setMonth(`${e.target.value}-01`)}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: '#7e8299' }}>{formatMonthRu(month)}</div>
                </div>
                <div className={form.field}>
                  <label>
                    Дата выдачи <span className={form.req}>*</span>
                  </label>
                  <input type="date" value={issueDate} disabled={readOnly} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div className={form.field}>
                  <label>Номер</label>
                  <input value={number} disabled={readOnly} onChange={(e) => setNumber(e.target.value)} />
                </div>
                <div className={form.field}>
                  <label>Подразделение</label>
                  <select value={divisionId} disabled={readOnly} onChange={(e) => setDivisionId(e.target.value)}>
                    <option value="">Поиск...</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={`${form.field} ${form.full}`}>
                  <label>Примечание</label>
                  <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
                </div>
                {isAdvance ? null : (
                  <div className={form.field}>
                    <label>Включить лимит</label>
                    <label className={extra.toggle}>
                      <span className={`${extra.switch} ${enableLimit ? extra.switchOn : ''}`}>
                        <input
                          type="checkbox"
                          checked={enableLimit}
                          disabled={readOnly}
                          onChange={(e) => setEnableLimit(e.target.checked)}
                        />
                        <span className={extra.knob} />
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className={form.card}>
              <div className={form.field} style={{ marginBottom: 10 }}>
                <label>Тип {isAdvance ? 'аванса' : 'ведомости'}</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label>
                    <input
                      type="radio"
                      checked={payType === 'cash'}
                      disabled={readOnly}
                      onChange={() => setPayType('cash')}
                    />{' '}
                    Наличные
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={payType === 'bank'}
                      disabled={readOnly}
                      onChange={() => setPayType('bank')}
                    />{' '}
                    Безналичные
                  </label>
                </div>
              </div>
              {payType === 'cash' ? (
                <div className={form.field} style={{ marginBottom: 10 }}>
                  <label>
                    Касса {isAdvance ? '' : <span className={form.req}>*</span>}
                  </label>
                  <input
                    list="vd-cash"
                    value={cashbox}
                    disabled={readOnly}
                    placeholder="Поиск..."
                    onChange={(e) => setCashbox(e.target.value)}
                  />
                  <datalist id="vd-cash">
                    {cashboxes.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <div className={form.field} style={{ marginBottom: 10 }}>
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
              <div className={form.field} style={{ marginBottom: 10 }}>
                <label>Валюта</label>
                <select value={currency} disabled={readOnly} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="UZS">Узбекский сум</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className={form.field} style={{ marginBottom: 10 }}>
                <label>Общая сумма выдачи</label>
                <input value={money(total)} disabled />
              </div>
              {!isAdvance ? (
                <div className={form.field} style={{ marginBottom: 10 }}>
                  <label>Округление</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={rounding} disabled={readOnly} onChange={(e) => setRounding(e.target.value)}>
                      {ROUNDING_OPTS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={form.btnClose}
                      disabled={readOnly}
                      onClick={() =>
                        setLines((prev) => prev.map((l) => ({ ...l, amount: Math.round(Number(l.amount) || 0) })))
                      }
                    >
                      Рассчитать
                    </button>
                  </div>
                </div>
              ) : null}
              <label className={form.drop || extra.muted}>
                {fileName || 'Перетащите файл сюда или кликните для выбора файла'}
                <input
                  type="file"
                  disabled={readOnly}
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ fontSize: 12, color: '#95a5a6', marginTop: 4 }}>{fileName ? fileName : 'Не выбрано'}</div>
            </div>
          </div>

          <div className={form.card}>
            <div className={form.lineBar}>
              <div className={form.lineLeft}>
                {!readOnly ? (
                  <>
                    {isAdvance ? (
                      <button type="button" className={form.btnGhost || form.btnClose} onClick={addRow}>
                        Добавить
                      </button>
                    ) : null}
                    <button type="button" className={form.btnGhost || form.btnClose} disabled={saving} onClick={() => void fill(false)}>
                      Заполнить
                    </button>
                    {isAdvance ? (
                      <button type="button" className={list.createBtn} onClick={() => setPickOpen(true)}>
                        Подбор
                      </button>
                    ) : (
                      <>
                        <button type="button" className={form.btnClose} disabled={saving} onClick={() => void fill(true)}>
                          Заполнить за месяц
                        </button>
                        <button type="button" className={list.createBtn} onClick={importRows}>
                          Импорт
                        </button>
                      </>
                    )}
                    {!isAdvance ? (
                      <button type="button" className={extra.iconBtn} onClick={addRow}>
                        +
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className={form.lineRight}>
                <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className={form.tableWrap}>
              <table className={form.table}>
                <thead>
                  <tr>
                    {isAdvance ? <th style={{ width: 36 }} /> : null}
                    <th>№</th>
                    <th>Сотрудник</th>
                    {isAdvance ? <th className={form.num}>Начислено аванса</th> : <th className={form.num}>Задолженность</th>}
                    {isAdvance ? null : <th className={form.num}>Сумма лимита</th>}
                    <th className={form.num}>Сумма</th>
                    <th>Примечание</th>
                    <th>{isAdvance ? 'Расчетный счет' : 'Банк'}</th>
                    <th>Код банка</th>
                    {!readOnly ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {vis.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={list.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : null}
                  {vis.map(({ l, i }) => (
                    <tr key={l.id || `${l.employeeId}-${i}`}>
                      {isAdvance ? (
                        <td>
                          <input type="checkbox" />
                        </td>
                      ) : null}
                      <td>{i + 1}</td>
                      <td>
                        {readOnly ? (
                          empName(l.employee)
                        ) : (
                          <EmployeeLookup
                            value={l.employeeId}
                            options={empItems}
                            onChange={(id) => {
                              const emp = employees.find((x) => x.id === id);
                              setLines((prev) =>
                                prev.map((x, idx) =>
                                  idx === i ? { ...x, employeeId: id, employee: emp ? { id, label: emp.label } : x.employee } : x,
                                ),
                              );
                            }}
                          />
                        )}
                      </td>
                      <td className={form.num}>{money(isAdvance ? l.accruedAdvance : l.debt)}</td>
                      {isAdvance ? null : <td className={form.num}>{money(l.limitAmount)}</td>}
                      <td className={form.num}>
                        {readOnly ? (
                          money(l.amount)
                        ) : (
                          <input
                            type="number"
                            value={l.amount}
                            onChange={(e) => {
                              const amount = Number(e.target.value) || 0;
                              setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, amount } : x)));
                            }}
                          />
                        )}
                      </td>
                      <td>
                        {readOnly ? (
                          l.note || '—'
                        ) : (
                          <input
                            value={l.note || ''}
                            onChange={(e) =>
                              setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))
                            }
                          />
                        )}
                      </td>
                      <td>{isAdvance ? l.settlementAccount || '—' : l.bank || '—'}</td>
                      <td>{l.bankCode || '—'}</td>
                      {!readOnly ? (
                        <td>
                          <button type="button" className={extra.trash} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                            🗑
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {pickOpen ? (
        <EmployeePickModal
          title="Подбор"
          confirmText="Добавить"
          items={empItems}
          initialSelectedIds={lines.map((l) => l.employeeId).filter(Boolean)}
          onClose={() => setPickOpen(false)}
          onConfirm={applyPicked}
        />
      ) : null}
    </div>
  );
}
