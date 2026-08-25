'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImportPanel } from '@/components/ImportPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { useUrlParam } from '@/lib/use-url-state';
import styles from '../../page-shared.module.css';

type Tab = 'timesheet' | 'policies' | 'periods' | 'vedomost' | 'advances' | 'manual';

const TABS = ['timesheet', 'policies', 'periods', 'vedomost', 'advances', 'manual'] as const;

type Emp = { id: string; lastName: string; firstName: string; tabNumber: string };
type Policy = {
  id: string;
  code: string;
  name: string;
  latePenaltyPerMin: string | number;
  absencePenalty: string | number;
  overtimeBonusPerHour?: string | number;
  baseSalaryDefault: string | number;
};
type Period = {
  id: string;
  year: number;
  month: number;
  status: string;
  _count?: { lines: number; advances: number };
};
type Advance = {
  id: string;
  amount: string | number;
  status: string;
  paidAt: string | null;
  note?: string | null;
  employee?: Emp;
  period?: { year: number; month: number } | null;
};
type PayrollLine = {
  id: string;
  type: string;
  status: string;
  amount: string | number;
  description?: string | null;
  employee?: Emp;
};

function money(n: string | number) {
  return Number(n).toLocaleString('ru-RU');
}

export default function PayrollPage() {
  const router = useRouter();
  const [tab, setTab] = useUrlParam('tab', 'timesheet', TABS);
  const [kind, setKind] = useUrlParam('kind', '', ['', 'allowance', 'penalty'] as const);
  const [error, setError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [timesheet, setTimesheet] = useState<unknown[]>([]);
  const [vedomost, setVedomost] = useState<{
    rows: {
      employee: Emp & { division?: { name: string } | null };
      base: number;
      bonus: number;
      penalty: number;
      advance: number;
      net: number;
    }[];
    totals: { base: number; penalty: number; advance: number; net: number };
    period: { year: number; month: number; status: string };
  } | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [periodId, setPeriodId] = useState('');

  useEffect(() => {
    if (tab === 'timesheet') {
      router.replace('/payroll/timesheets');
      return;
    }
    if (tab !== 'policies') return;
    router.replace(
      kind === 'allowance' ? '/payroll/allowance-policies' : '/payroll/fine-policies',
    );
  }, [tab, kind, router]);

  async function load() {
    setError('');
    try {
      if (tab === 'policies') {
        return;
      }
      if (tab === 'periods') setPeriods(await apiFetch('/api/payroll/periods'));
      if (tab === 'advances') setAdvances(await apiFetch('/api/payroll/advances'));
      if (tab === 'timesheet') {
        return;
      }
      if (tab === 'vedomost' && periodId) {
        setVedomost(await apiFetch(`/api/payroll/periods/${periodId}/vedomost`));
      }
      if (tab === 'manual') {
        setPeriods(await apiFetch('/api/payroll/periods'));
        if (periodId) {
          setLines(await apiFetch(`/api/payroll/lines?periodId=${periodId}`));
        }
      }
      if (tab === 'advances' || tab === 'vedomost') {
        setPeriods(await apiFetch('/api/payroll/periods'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    load();
  }, [tab, year, month, periodId]);

  useEffect(() => {
    apiFetch<{ items: Emp[] }>('/api/employees?status=active&limit=500')
      .then((r) => setEmployees(r.items))
      .catch(() => undefined);
    apiFetch<Period[]>('/api/payroll/periods')
      .then((p) => {
        setPeriods(p);
        if (p[0] && !periodId) setPeriodId(p[0].id);
      })
      .catch(() => undefined);
  }, []);

  async function createPolicy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const isAllowance = kind === 'allowance';
    let code = String(fd.get('code') || '').trim();
    if (isAllowance && code && !code.toUpperCase().startsWith('ALL')) {
      code = `ALL-${code}`;
    }
    await apiFetch('/api/payroll/policies', {
      method: 'POST',
      body: JSON.stringify({
        code,
        name: fd.get('name'),
        latePenaltyPerMin: isAllowance
          ? 0
          : Number(fd.get('latePenaltyPerMin') || 500),
        absencePenalty: isAllowance
          ? 0
          : Number(fd.get('absencePenalty') || 100000),
        overtimeBonusPerHour: isAllowance
          ? Number(fd.get('overtimeBonusPerHour') || 25000)
          : Number(fd.get('overtimeBonusPerHour') || 0),
        baseSalaryDefault: Number(fd.get('baseSalaryDefault') || 5000000),
      }),
    });
    e.currentTarget.reset();
    setTab('policies');
    await load();
  }

  async function createPeriod(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = await apiFetch<Period>('/api/payroll/periods', {
      method: 'POST',
      body: JSON.stringify({
        year: Number(fd.get('year')),
        month: Number(fd.get('month')),
        note: fd.get('note') || undefined,
      }),
    });
    setPeriodId(p.id);
    setTab('periods');
    await load();
  }

  async function calculate(id: string) {
    await apiFetch(`/api/payroll/periods/${id}/calculate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setPeriodId(id);
    setTab('vedomost');
    await load();
  }

  async function closePeriod(id: string) {
    await apiFetch(`/api/payroll/periods/${id}/close`, { method: 'PATCH' });
    await load();
  }

  async function reopenPeriod(id: string) {
    await apiFetch(`/api/payroll/periods/${id}/reopen`, { method: 'PATCH' });
    await load();
  }

  async function payAdvance(id: string) {
    await apiFetch(`/api/payroll/advances/${id}/pay`, { method: 'POST' });
    await load();
  }

  async function postLine(id: string) {
    await apiFetch(`/api/payroll/lines/${id}/post`, { method: 'POST' });
    await load();
  }

  async function createAdvance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/payroll/advances', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        amount: Number(fd.get('amount')),
        periodId: fd.get('periodId') || undefined,
        note: fd.get('note') || undefined,
      }),
    });
    e.currentTarget.reset();
    setTab('advances');
    await load();
  }

  async function createLine(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/payroll/lines', {
      method: 'POST',
      body: JSON.stringify({
        periodId: fd.get('periodId'),
        employeeId: fd.get('employeeId'),
        type: fd.get('type'),
        amount: Number(fd.get('amount')),
        description: fd.get('description') || undefined,
      }),
    });
    e.currentTarget.reset();
    setPeriodId(String(fd.get('periodId')));
    setTab('manual');
    await load();
  }

  function exportVedomostCsv() {
    if (!vedomost?.rows?.length) return;
    downloadCsv(
      `vedomost-${vedomost.period.year}-${vedomost.period.month}`,
      vedomost.rows.map((r) => ({
        tabNumber: r.employee.tabNumber,
        employee: `${r.employee.lastName} ${r.employee.firstName}`,
        base: r.base,
        bonus: r.bonus,
        penalty: r.penalty,
        advance: r.advance,
        net: r.net,
      })),
    );
  }

  function exportTimesheetCsv() {
    if (!sheet.length) return;
    downloadCsv(
      `timesheet-${year}-${month}`,
      sheet.map((r) => ({
        employee: `${r.employee.lastName} ${r.employee.firstName}`,
        division: r.employee.division?.name ?? '',
        onTime: r.onTime,
        late: r.late,
        absent: r.absent,
        leave: r.leave,
        lateMinutes: r.lateMinutes,
      })),
    );
  }

  async function exportAdvancesXlsx() {
    setExportBusy(true);
    try {
      await downloadXlsxViaApi('/api/payroll/advances/export.xlsx', 'payroll-advances.xlsx');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  async function exportLinesXlsx() {
    if (!periodId) return;
    setExportBusy(true);
    try {
      await downloadXlsxViaApi(
        `/api/payroll/lines/export.xlsx?periodId=${periodId}`,
        'payroll-lines.xlsx',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта');
    } finally {
      setExportBusy(false);
    }
  }

  const sheet = timesheet as {
    employee: Emp & { division?: { name: string } | null };
    onTime: number;
    late: number;
    absent: number;
    leave: number;
    lateMinutes: number;
  }[];

  const headerActions = (
    <div className={styles.rowActions}>
      {tab === 'timesheet' ? (
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={!sheet.length}
          onClick={exportTimesheetCsv}
        >
          CSV
        </button>
      ) : null}
      {tab === 'vedomost' && vedomost ? (
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={!vedomost.rows.length}
          onClick={exportVedomostCsv}
        >
          CSV
        </button>
      ) : null}
      {tab === 'advances' ? (
        <>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={exportBusy}
            onClick={() => void exportAdvancesXlsx()}
          >
            Excel
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? 'Скрыть импорт' : 'Импорт'}
          </button>
        </>
      ) : null}
      {tab === 'manual' ? (
        <>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={exportBusy || !periodId}
            onClick={() => void exportLinesXlsx()}
          >
            Excel
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? 'Скрыть импорт' : 'Импорт'}
          </button>
        </>
      ) : null}
    </div>
  );

  if (tab === 'timesheet') {
    return (
      <div className={styles.wrap}>
        <p>Переход к табелю…</p>
      </div>
    );
  }

  if (tab === 'policies') {
    return (
      <div className={styles.wrap}>
        <p>
          {kind === 'allowance'
            ? 'Переход к политике доплат…'
            : 'Переход к политикам штрафов…'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav
        groupKey={
          tab === 'timesheet'
            ? 'timesheet'
            : tab === 'policies'
              ? 'policies'
              : tab === 'periods'
                ? 'periods'
                : tab === 'vedomost'
                  ? 'vedomost'
                  : tab === 'advances'
                    ? 'advances'
                    : 'payroll-lines'
        }
      />

      <header className={styles.header}>
        <div className={styles.rowActions}>{headerActions}</div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'advances' && showImport ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <ImportPanel
            endpoint="/api/payroll/advances/import"
            hint="employeeTabNumber|employeeId, amount, periodId?, note?, status? (default draft)"
            onDone={() => void load()}
          />
        </div>
      ) : null}

      {tab === 'manual' && showImport ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <ImportPanel
            endpoint="/api/payroll/lines/import"
            hint="periodId OR year+month, employeeTabNumber OR employeeId, type?, amount, description?"
            onDone={() => void load()}
          />
        </div>
      ) : null}

      {tab === 'timesheet' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            style={{ gridTemplateColumns: '1fr 1fr auto', maxWidth: 480 }}
          >
            <label>
              Год
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <label>
              Месяц
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </label>
            <button className={styles.btn} type="submit" style={{ alignSelf: 'end' }}>
              Обновить
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'policies' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <div className={styles.rowActions} style={{ marginBottom: '0.75rem', gap: '0.5rem' }}>
            <button
              type="button"
              className={kind !== 'allowance' ? styles.tabActive : styles.tab}
              onClick={() => setKind('')}
            >
              Политики штрафов
            </button>
            <button
              type="button"
              className={kind === 'allowance' ? styles.tabActive : styles.tab}
              onClick={() => setKind('allowance')}
            >
              Политика доплат
            </button>
          </div>
          <form className={styles.form} onSubmit={createPolicy} key={kind || 'penalty'}>
            <label>
              Код
              <input
                name="code"
                required
                placeholder={kind === 'allowance' ? 'OT' : 'STD'}
              />
            </label>
            <label>
              Наименование
              <input
                name="name"
                required
                placeholder={
                  kind === 'allowance'
                    ? 'Доплата за сверхурочные'
                    : 'Стандартная политика'
                }
              />
            </label>
            {kind === 'allowance' ? (
              <>
                <label>
                  Доплата за сверхурочные (сум/час)
                  <input name="overtimeBonusPerHour" type="number" defaultValue={25000} />
                </label>
                <label>
                  Оклад по умолчанию
                  <input name="baseSalaryDefault" type="number" defaultValue={5000000} />
                </label>
              </>
            ) : (
              <>
                <label>
                  Штраф за опоздание (сум/мин)
                  <input name="latePenaltyPerMin" type="number" defaultValue={500} />
                </label>
                <label>
                  Штраф за отсутствие
                  <input name="absencePenalty" type="number" defaultValue={100000} />
                </label>
                <label>
                  Оклад по умолчанию
                  <input name="baseSalaryDefault" type="number" defaultValue={5000000} />
                </label>
              </>
            )}
            <button className={styles.btn} type="submit">
              {kind === 'allowance' ? 'Добавить политику доплат' : 'Добавить политику'}
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'periods' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form className={styles.form} onSubmit={createPeriod}>
            <label>
              Год
              <input name="year" type="number" required defaultValue={year} />
            </label>
            <label>
              Месяц
              <input name="month" type="number" min={1} max={12} required defaultValue={month} />
            </label>
            <label>
              Примечание
              <input name="note" />
            </label>
            <button className={styles.btn} type="submit">
              Открыть период
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'vedomost' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem', padding: '1rem' }}>
          <label className={styles.muted}>
            Период{' '}
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">—</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year}-{String(p.month).padStart(2, '0')} ({p.status})
                </option>
              ))}
            </select>
          </label>
          {vedomost ? (
            <div style={{ marginTop: '0.5rem' }}>
              <StatusBadge status={vedomost.period.status} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'advances' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form className={styles.form} onSubmit={createAdvance}>
            <label>
              Сотрудник
              <select name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сумма
              <input name="amount" type="number" required />
            </label>
            <label>
              Период
              <select name="periodId">
                <option value="">—</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.year}-{String(p.month).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Примечание
              <input name="note" />
            </label>
            <button className={styles.btn} type="submit">
              Выдать аванс
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'manual' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form className={styles.form} onSubmit={createLine}>
            <label>
              Период
              <select
                name="periodId"
                required
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.year}-{String(p.month).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сотрудник
              <select name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="type" defaultValue="bonus">
                <option value="bonus">bonus</option>
                <option value="deduction">deduction</option>
                <option value="overtime">overtime</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              Сумма (+/−)
              <input name="amount" type="number" required />
            </label>
            <label>
              Примечание
              <input name="description" />
            </label>
            <button className={styles.btn} type="submit">
              Добавить
            </button>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <table>
          <thead>
            <tr>
              {tab === 'timesheet' && (
                <>
                  <th>Сотрудник</th>
                  <th>Подразделение</th>
                  <th>Вовремя</th>
                  <th>Опоздание</th>
                  <th>Неявка</th>
                  <th>Отпуск</th>
                  <th>Опоздание мин</th>
                </>
              )}
              {tab === 'policies' && (
                <>
                  <th>Код</th>
                  <th>Наименование</th>
                  {kind === 'allowance' ? (
                    <>
                      <th>Доплата/час</th>
                      <th>Оклад по умолч.</th>
                    </>
                  ) : (
                    <>
                      <th>Штраф/мин</th>
                      <th>Неявка</th>
                      <th>Оклад по умолч.</th>
                    </>
                  )}
                </>
              )}
              {tab === 'periods' && (
                <>
                  <th>Период</th>
                  <th>Статус</th>
                  <th>Строки</th>
                  <th />
                </>
              )}
              {tab === 'vedomost' && (
                <>
                  <th>Сотрудник</th>
                  <th>Основное</th>
                  <th>Бонус</th>
                  <th>Штраф</th>
                  <th>Аванс</th>
                  <th>К выплате</th>
                </>
              )}
              {tab === 'advances' && (
                <>
                  <th>Сотрудник</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Дата</th>
                  <th>Период</th>
                  <th>Примечание</th>
                  <th />
                </>
              )}
              {tab === 'manual' && (
                <>
                  <th>Сотрудник</th>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Примечание</th>
                  <th />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tab === 'timesheet' &&
              sheet.map((r) => (
                <tr key={r.employee.id}>
                  <td>
                    {r.employee.lastName} {r.employee.firstName}
                  </td>
                  <td>{r.employee.division?.name ?? '—'}</td>
                  <td>{r.onTime}</td>
                  <td>{r.late}</td>
                  <td>{r.absent}</td>
                  <td>{r.leave}</td>
                  <td>{r.lateMinutes}</td>
                </tr>
              ))}
            {tab === 'policies' &&
              policies
                .filter((p) => {
                  const isAll = p.code.toUpperCase().startsWith('ALL');
                  return kind === 'allowance' ? isAll : !isAll;
                })
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    {kind === 'allowance' ? (
                      <>
                        <td>{money(p.overtimeBonusPerHour ?? 0)}</td>
                        <td>{money(p.baseSalaryDefault)}</td>
                      </>
                    ) : (
                      <>
                        <td>{money(p.latePenaltyPerMin)}</td>
                        <td>{money(p.absencePenalty)}</td>
                        <td>{money(p.baseSalaryDefault)}</td>
                      </>
                    )}
                  </tr>
                ))}
            {tab === 'periods' &&
              periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.year}-{String(p.month).padStart(2, '0')}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>{p._count?.lines ?? 0}</td>
                  <td>
                    <span className={styles.rowActions}>
                      {p.status !== 'closed' ? (
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={() => calculate(p.id)}
                        >
                          Hisoblash
                        </button>
                      ) : null}
                      {p.status === 'calculated' ? (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => closePeriod(p.id)}
                        >
                          Отмена
                        </button>
                      ) : null}
                      {p.status === 'closed' ? (
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => reopenPeriod(p.id)}
                        >
                          Открыть заново
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => {
                          setPeriodId(p.id);
                          setTab('vedomost');
                        }}
                      >
                        Vedomost
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            {tab === 'vedomost' &&
              vedomost?.rows.map((r) => (
                <tr key={r.employee.id}>
                  <td>
                    {r.employee.lastName} {r.employee.firstName}
                  </td>
                  <td>{money(r.base)}</td>
                  <td>{money(r.bonus)}</td>
                  <td>{money(r.penalty)}</td>
                  <td>{money(r.advance)}</td>
                  <td>
                    <strong>{money(r.net)}</strong>
                  </td>
                </tr>
              ))}
            {tab === 'vedomost' && vedomost ? (
              <tr>
                <td>
                  <strong>Итого</strong>
                </td>
                <td>{money(vedomost.totals.base)}</td>
                <td>—</td>
                <td>{money(vedomost.totals.penalty)}</td>
                <td>{money(vedomost.totals.advance)}</td>
                <td>
                  <strong>{money(vedomost.totals.net)}</strong>
                </td>
              </tr>
            ) : null}
            {tab === 'advances' &&
              advances.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.employee
                      ? `${a.employee.lastName} ${a.employee.firstName}`
                      : '—'}
                  </td>
                  <td>{money(a.amount)}</td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>{a.paidAt ? String(a.paidAt).slice(0, 10) : '—'}</td>
                  <td>
                    {a.period
                      ? `${a.period.year}-${String(a.period.month).padStart(2, '0')}`
                      : '—'}
                  </td>
                  <td>{a.note ?? '—'}</td>
                  <td>
                    {a.status === 'draft' ? (
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => payAdvance(a.id)}
                      >
                        Выплатить
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            {tab === 'manual' &&
              lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.employee
                      ? `${l.employee.lastName} ${l.employee.firstName}`
                      : '—'}
                  </td>
                  <td>
                    <span className={styles.badge}>{l.type}</span>
                  </td>
                  <td>{money(l.amount)}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                  <td>{l.description ?? '—'}</td>
                  <td>
                    {l.status === 'draft' ? (
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => postLine(l.id)}
                      >
                        Провести
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            {((tab === 'timesheet' && sheet.length === 0) ||
              (tab === 'policies' && policies.length === 0) ||
              (tab === 'periods' && periods.length === 0) ||
              (tab === 'advances' && advances.length === 0) ||
              (tab === 'manual' && lines.length === 0) ||
              (tab === 'vedomost' && !vedomost?.rows?.length)) && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  Пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
