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
  type AccrualDeduction,
  type AccrualDoc,
  type AccrualKind,
  type AccrualLine,
  type EmpRef,
  empName,
  kindLabel,
  money,
} from '@/lib/accruals';
import { formatMonthRu } from '@/lib/fine-policies';
import styles from './form.module.css';

type Opt = { id: string; label: string; tabNumber?: string; positionName?: string; divisionId?: string };
type TypeOpt = { id: string; name: string; code?: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso() {
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
    <div className={styles.searchWrap} ref={wrapRef}>
      <input
        className={styles.searchInput}
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
        <button type="button" className={styles.searchClear} onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
      {open && !disabled ? (
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

function recalc(line: AccrualLine): AccrualLine {
  const accrued = Number(line.accrued) || 0;
  const ndfl = Number(line.ndfl) || 0;
  const inps = Number(line.inps) || 0;
  return { ...line, toPay: Math.round((accrued - ndfl - inps) * 100) / 100 };
}

export function AccrualForm({ docId }: { docId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKind = (searchParams.get('kind') || 'all_types') as AccrualKind;
  const isNew = !docId;
  const [kind, setKind] = useState<AccrualKind>(initialKind);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AccrualDoc['status']>('draft');
  const [month, setMonth] = useState(firstOfMonthIso());
  const [docDate, setDocDate] = useState(todayIso());
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [note, setNote] = useState('');
  const [mergeAccruals, setMergeAccruals] = useState(kind === 'sick_leave');
  const [fileName, setFileName] = useState('');
  const [tab, setTab] = useState<'accruals' | 'deductions'>('accruals');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<AccrualLine[]>([]);
  const [deductions, setDeductions] = useState<AccrualDeduction[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [divisions, setDivisions] = useState<Opt[]>([]);
  const [accrualTypes, setAccrualTypes] = useState<TypeOpt[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<TypeOpt[]>([]);
  const [empMap, setEmpMap] = useState<Record<string, EmpRef>>({});

  const readOnly = status === 'posted';
  const pageTitle = `${kindLabel(kind)} (${isNew ? 'создание' : status === 'posted' ? 'просмотр' : 'изменение'})`;

  const totals = useMemo(() => {
    const accrued = lines.reduce((s, l) => s + (Number(l.accrued) || 0), 0);
    const deducted = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const ndfl = lines.reduce((s, l) => s + (Number(l.ndfl) || 0), 0);
    const inps = lines.reduce((s, l) => s + (Number(l.inps) || 0), 0);
    const esp = lines.reduce((s, l) => s + (Number(l.esp) || 0), 0);
    return { accrued, deducted, ndfl, inps, esp };
  }, [lines, deductions]);

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, accRaw, dedRaw] = await Promise.all([
          apiFetch<{
            employees?: Array<EmpRef & { id: string; label?: string; positionName?: string; divisionId?: string }>;
            divisions?: Opt[];
          }>('/api/catalog/lookups'),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/accrual-types'),
          apiFetch<TypeOpt[] | { items: TypeOpt[] }>('/api/catalog/deduction-types'),
        ]);
        const acc = Array.isArray(accRaw) ? accRaw : accRaw.items || [];
        const ded = Array.isArray(dedRaw) ? dedRaw : dedRaw.items || [];
        const emps = lookups.employees || [];
        setEmployees(
          emps.map((e) => ({
            id: e.id,
            label: e.label || `${empName(e)}${e.tabNumber ? ` (${e.tabNumber})` : ''}`,
            tabNumber: e.tabNumber,
            positionName: e.positionName,
            divisionId: e.divisionId,
          })),
        );
        setEmpMap(Object.fromEntries(emps.map((e) => [e.id, e])));
        setDivisions(lookups.divisions || []);
        setAccrualTypes(acc);
        setDeductionTypes(ded);
        if (docId) {
          const row = await apiFetch<AccrualDoc>(`/api/payroll/accruals/${docId}`);
          setKind(row.kind);
          setStatus(row.status);
          setMonth(row.month.slice(0, 10));
          setDocDate(row.docDate.slice(0, 10));
          setNumber(row.number || '');
          setTitle(row.title || '');
          setDivisionId(row.divisionId || '');
          setCurrency(row.currency || 'UZS');
          setNote(row.note || '');
          setMergeAccruals(row.mergeAccruals);
          setLines(row.lines || []);
          setDeductions(row.deductions || []);
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
      month,
      docDate,
      number: number || undefined,
      title: title || undefined,
      divisionId: divisionId || undefined,
      currency,
      note: note || undefined,
      mergeAccruals,
      attachments: fileName ? [{ name: fileName }] : undefined,
      lines: lines.filter((l) => l.employeeId).map((l) => recalc(l)),
      deductions: deductions.filter((d) => d.employeeId),
    };
  }

  async function save(andPost: boolean) {
    setSaving(true);
    setError('');
    try {
      let id = docId;
      if (isNew) {
        const created = await apiFetch<AccrualDoc>('/api/payroll/accruals', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        id = created.id;
      } else {
        await apiFetch(`/api/payroll/accruals/${docId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload()),
        });
      }
      if (andPost && id) {
        const ok = await confirm({
          title: 'Подтверждение',
          message: 'Сохранить и провести начисление?',
          confirmText: 'Да',
          cancelText: 'Нет',
        });
        if (ok) {
          await apiFetch(`/api/payroll/accruals/${id}/post`, { method: 'POST' });
        }
      }
      router.push(id ? `/payroll/accruals/${id}` : '/payroll/accruals');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function fill() {
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch<{ lines: AccrualLine[] }>('/api/payroll/accruals/fill', {
        method: 'POST',
        body: JSON.stringify({ kind, month, divisionId: divisionId || undefined, mergeAccruals }),
      });
      setLines(data.lines || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка заполнения');
    } finally {
      setSaving(false);
    }
  }

  function applyPicked(ids: string[]) {
    const chosen = ids.filter(Boolean);
    if (tab === 'accruals') {
      const have = new Set(lines.map((l) => l.employeeId));
      setLines((prev) => [
        ...prev,
        ...chosen
          .filter((id) => !have.has(id))
          .map((id) => ({
            employeeId: id,
            employee: empMap[id],
            accrued: 0,
            toPay: 0,
            ndfl: 0,
            inps: 0,
            esp: 0,
          })),
      ]);
    } else {
      const have = new Set(deductions.map((d) => d.employeeId));
      setDeductions((prev) => [
        ...prev,
        ...chosen
          .filter((id) => !have.has(id))
          .map((id) => ({ employeeId: id, employee: empMap[id], amount: 0 })),
      ]);
    }
    setPickOpen(false);
  }

  const empItems = useMemo(() => toPickItems(employees), [employees]);

  const visLines = lines.filter((l) => {
    if (!q.trim()) return true;
    return empName(l.employee || empMap[l.employeeId]).toLowerCase().includes(q.toLowerCase());
  });
  const visDeds = deductions.filter((d) => {
    if (!q.trim()) return true;
    return empName(d.employee || empMap[d.employeeId]).toLowerCase().includes(q.toLowerCase());
  });

  if (loading) return <p>Загрузка…</p>;

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="accruals" titleOverride={pageTitle} />
      <div className={styles.topBar}>
        <h1 className={styles.title}>{pageTitle}</h1>
        <div className={styles.actions}>
          {!readOnly ? (
            <>
              <button type="button" className={styles.btnSave} disabled={saving} onClick={() => void save(false)}>
                Сохранить
              </button>
              <button type="button" className={styles.btnPost} disabled={saving} onClick={() => void save(true)}>
                Провести
              </button>
            </>
          ) : null}
          <button type="button" className={styles.btnClose} onClick={() => router.push('/payroll/accruals')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.head}>
        <div className={styles.card}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Месяц начисления</label>
              <input
                type="month"
                value={month.slice(0, 7)}
                disabled={readOnly}
                onChange={(e) => setMonth(`${e.target.value}-01`)}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#7e8299' }}>{formatMonthRu(month)}</div>
            </div>
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
            <div className={`${styles.field} ${styles.full}`}>
              <label>Название документа</label>
              <input value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Подразделение</label>
              <SearchLookup value={divisionId} options={divisions} onChange={setDivisionId} disabled={readOnly} />
            </div>
            <div className={styles.field}>
              <label>
                Валюта <span className={styles.req}>*</span>
              </label>
              <select value={currency} disabled={readOnly} onChange={(e) => setCurrency(e.target.value)}>
                <option value="UZS">Узбекский сум</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className={`${styles.field} ${styles.full}`}>
              <label>Примечание</label>
              <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sums}>
            <div className={styles.sumAcc}>
              <div className={styles.sumLabel}>Начислено</div>
              <div className={styles.sumVal}>{money(totals.accrued)}</div>
            </div>
            <div className={styles.sumDed}>
              <div className={styles.sumLabel}>Удержано</div>
              <div className={styles.sumVal}>{money(totals.deducted)}</div>
            </div>
          </div>
          <div className={styles.taxRow}>
            <div className={styles.taxBox}>
              НДФЛ<b>{money(totals.ndfl)}</b>
            </div>
            <div className={styles.taxBox}>
              ИНПС<b>{money(totals.inps)}</b>
            </div>
            <div className={styles.taxBox}>
              ЕСП<b>{money(totals.esp)}</b>
            </div>
          </div>
          <label className={styles.toggle}>
            Объединение начислений
            <span className={styles.switch}>
              <input
                type="checkbox"
                checked={mergeAccruals}
                disabled={readOnly}
                onChange={(e) => setMergeAccruals(e.target.checked)}
              />
              {mergeAccruals ? 'Да' : 'Нет'}
            </span>
          </label>
          <label className={styles.drop}>
            {fileName || 'Перетащите файл сюда или кликните для выбора файла'}
            <input
              type="file"
              disabled={readOnly}
              onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
            />
          </label>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button type="button" className={tab === 'accruals' ? styles.tabOn : styles.tab} onClick={() => setTab('accruals')}>
            Начисления
          </button>
          <button
            type="button"
            className={tab === 'deductions' ? styles.tabOn : styles.tab}
            onClick={() => setTab('deductions')}
          >
            Удержания
          </button>
        </div>
        <div className={styles.lineBar}>
          <div className={styles.lineLeft}>
            {!readOnly ? (
              <>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    if (tab === 'accruals') {
                      setLines((prev) => [
                        ...prev,
                        { employeeId: '', accrued: 0, toPay: 0, ndfl: 0, inps: 0, esp: 0 },
                      ]);
                    } else {
                      setDeductions((prev) => [...prev, { employeeId: '', amount: 0 }]);
                    }
                  }}
                >
                  Добавить
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => void fill()}>
                  Заполнить
                </button>
                <button type="button" className={styles.btnSelect} onClick={() => setPickOpen(true)}>
                  Выбрать
                </button>
              </>
            ) : null}
          </div>
          <div className={styles.lineRight}>
            <input className={styles.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {tab === 'accruals' ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>№</th>
                  <th>Сотрудник</th>
                  <th>Начисление</th>
                  <th className={styles.num}>Начислено</th>
                  <th className={styles.num}>К выплате</th>
                  <th className={styles.num}>НДФЛ</th>
                  <th className={styles.num}>ИНПС</th>
                  <th className={styles.num}>ЕСП</th>
                  {!readOnly ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {visLines.length === 0 ? (
                  <tr>
                    <td colSpan={10} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
                {visLines.map((line, i) => (
                  <tr key={`${line.employeeId}-${i}`}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>{i + 1}</td>
                    <td>
                      <EmployeeLookup
                        value={line.employeeId}
                        options={empItems}
                        disabled={readOnly}
                        onChange={(id) => {
                          setLines((prev) =>
                            prev.map((x) => (x === line ? { ...x, employeeId: id, employee: empMap[id] } : x)),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <select
                        disabled={readOnly}
                        value={line.accrualTypeId || ''}
                        onChange={(e) => {
                          const t = accrualTypes.find((x) => x.id === e.target.value);
                          setLines((prev) =>
                            prev.map((x) =>
                              x === line
                                ? { ...x, accrualTypeId: t?.id || '', accrualName: t?.name || '' }
                                : x,
                            ),
                          );
                        }}
                      >
                        <option value="">—</option>
                        {accrualTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(['accrued', 'toPay', 'ndfl', 'inps', 'esp'] as const).map((key) => (
                      <td key={key}>
                        <input
                          className={styles.num}
                          type="number"
                          disabled={readOnly}
                          value={line[key]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setLines((prev) =>
                              prev.map((x) => (x === line ? recalc({ ...x, [key]: v }) : x)),
                            );
                          }}
                        />
                      </td>
                    ))}
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => setLines((prev) => prev.filter((x) => x !== line))}
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>№</th>
                  <th>Сотрудник</th>
                  <th>Удержание</th>
                  <th className={styles.num}>Удержано</th>
                  {!readOnly ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {visDeds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.empty}>
                      Нет данных
                    </td>
                  </tr>
                ) : null}
                {visDeds.map((row, i) => (
                  <tr key={`${row.employeeId}-${i}`}>
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>{i + 1}</td>
                    <td>
                      <EmployeeLookup
                        value={row.employeeId}
                        options={empItems}
                        disabled={readOnly}
                        onChange={(id) => {
                          setDeductions((prev) =>
                            prev.map((x) => (x === row ? { ...x, employeeId: id, employee: empMap[id] } : x)),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <select
                        disabled={readOnly}
                        value={row.deductionTypeId || ''}
                        onChange={(e) => {
                          const t = deductionTypes.find((x) => x.id === e.target.value);
                          setDeductions((prev) =>
                            prev.map((x) =>
                              x === row
                                ? { ...x, deductionTypeId: t?.id || '', deductionName: t?.name || '' }
                                : x,
                            ),
                          );
                        }}
                      >
                        <option value="">—</option>
                        {deductionTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        disabled={readOnly}
                        value={row.amount}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDeductions((prev) => prev.map((x) => (x === row ? { ...x, amount: v } : x)));
                        }}
                      />
                    </td>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => setDeductions((prev) => prev.filter((x) => x !== row))}
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickOpen ? (
        <EmployeePickModal
          items={empItems.filter((e) => !divisionId || e.divisionId === divisionId)}
          initialSelectedIds={
            tab === 'accruals'
              ? lines.map((l) => l.employeeId).filter(Boolean)
              : deductions.map((d) => d.employeeId).filter(Boolean)
          }
          onClose={() => setPickOpen(false)}
          onConfirm={applyPicked}
        />
      ) : null}
    </div>
  );
}
