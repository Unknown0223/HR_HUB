'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilterPanel, type FilterFieldDef } from '@/components/FilterPanel';
import { apiFetch } from '@/lib/api';
import { downloadXlsxViaApi } from '@/lib/excel';
import { useUrlParam } from '@/lib/use-url-state';
import styles from '../../page-shared.module.css';

type Tab = 'overview' | 't13' | 'lateness' | 'marks' | 'hr' | 'fot';
const TABS = ['overview', 't13', 'lateness', 'marks', 'hr', 'fot'] as const;

type Period = { id: string; year: number; month: number; status: string };

function toCsv(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
    )
    .join('\n');
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob(['\ufeff' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function qsFromTo(from: string, to: string) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function ReportsPage() {
  const [tab, setTab] = useUrlParam('tab', 'overview', TABS);
  const [groupBy, setGroupBy] = useUrlParam('groupBy', 'division');
  const [year] = useUrlParam('year', String(new Date().getFullYear()));
  const [month] = useUrlParam('month', String(new Date().getMonth() + 1));
  const [periodId, setPeriodId] = useUrlParam('periodId', '');
  const [dateFrom] = useUrlParam('dateFrom', '');
  const [dateTo] = useUrlParam('dateTo', '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);

  const yearNum = Number(year) || new Date().getFullYear();
  const monthNum = Math.min(12, Math.max(1, Number(month) || new Date().getMonth() + 1));

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => {
      const v = String(y - 3 + i);
      return { value: v, label: v };
    });
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1).padStart(2, '0'),
      })),
    [],
  );

  const periodOptions = useMemo(
    () =>
      periods.map((p) => ({
        value: p.id,
        label: `${p.year}-${String(p.month).padStart(2, '0')} (${p.status})`,
      })),
    [periods],
  );

  const filterFields = useMemo((): FilterFieldDef[] => {
    if (tab === 't13') {
      return [
        { type: 'select', key: 'year', label: 'Год', options: yearOptions },
        { type: 'select', key: 'month', label: 'Месяц', options: monthOptions },
      ];
    }
    if (tab === 'lateness' || tab === 'marks') {
      return [{ type: 'dateFrom' }, { type: 'dateTo' }];
    }
    if (tab === 'hr') {
      return [{ type: 'select', key: 'year', label: 'Год', options: yearOptions }];
    }
    if (tab === 'fot') {
      return [{ type: 'select', key: 'periodId', label: 'Период', options: periodOptions }];
    }
    return [];
  }, [tab, yearOptions, monthOptions, periodOptions]);

  async function load() {
    setError('');
    try {
      const rangeQs = qsFromTo(dateFrom, dateTo);
      const map: Record<Tab, string> = {
        overview: '/api/reports/overview',
        t13: `/api/reports/attendance/t13?year=${yearNum}&month=${monthNum}`,
        lateness: `/api/reports/attendance/lateness${rangeQs}`,
        marks: `/api/reports/attendance/marks${rangeQs}`,
        hr: `/api/reports/hr/movement?year=${yearNum}&groupBy=${groupBy === 'staff' ? 'staff' : 'division'}`,
        fot: `/api/reports/payroll/fot${periodId ? `?periodId=${periodId}` : ''}`,
      };
      setData(await apiFetch(map[tab as Tab]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setData(null);
    }
  }

  useEffect(() => {
    load();
  }, [tab, yearNum, monthNum, periodId, groupBy, dateFrom, dateTo]);

  useEffect(() => {
    apiFetch<Period[]>('/api/payroll/periods')
      .then((p) => {
        setPeriods(p);
        if (p[0] && !periodId) setPeriodId(p[0].id);
      })
      .catch(() => undefined);
  }, []);

  function printReport() {
    if (tab !== 't13' || !data) return;
    window.print();
  }

  async function exportXlsx() {
    if (!data) return;
    try {
      const rangeQs = qsFromTo(dateFrom, dateTo);
      if (tab === 't13') {
        await downloadXlsxViaApi(
          `/api/reports/attendance/t13.xlsx?year=${yearNum}&month=${monthNum}`,
          `t13-${yearNum}-${String(monthNum).padStart(2, '0')}.xlsx`,
        );
        return;
      }
      if (tab === 'lateness') {
        await downloadXlsxViaApi(
          `/api/reports/attendance/lateness.xlsx${rangeQs}`,
          `lateness-${yearNum}-${monthNum}.xlsx`,
        );
        return;
      }
      if (tab === 'marks') {
        await downloadXlsxViaApi(
          `/api/reports/attendance/marks.xlsx${rangeQs}`,
          `marks-${yearNum}-${monthNum}.xlsx`,
        );
        return;
      }
      if (tab === 'hr') {
        await downloadXlsxViaApi(
          `/api/reports/hr/movement.xlsx?year=${yearNum}`,
          `hr-movement-${yearNum}.xlsx`,
        );
        return;
      }
      if (tab === 'fot') {
        const q = periodId ? `?periodId=${periodId}` : '';
        await downloadXlsxViaApi(`/api/reports/payroll/fot.xlsx${q}`, `fot-${yearNum}-${monthNum}.xlsx`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excel export failed');
    }
  }

  function exportReport() {
    if (!data) return;
    const base = `hrhub-${tab}-${yearNum}-${monthNum}`;

    if (tab === 't13') {
      const t13 = data as {
        daysInMonth?: number;
        rows?: {
          employee: { tabNumber: string; lastName: string; firstName: string };
          cells: Record<string, string>;
          worked: number;
          late: number;
          absent: number;
        }[];
      };
      const days = t13.daysInMonth ?? 0;
      const header = [
        'Tab№',
        'F.I.O.',
        ...Array.from({ length: days }, (_, i) => String(i + 1)),
        'Я',
        'О',
        'Н',
      ];
      const rows = (t13.rows ?? []).map((r) => [
        r.employee.tabNumber,
        `${r.employee.lastName} ${r.employee.firstName}`,
        ...Array.from({ length: days }, (_, i) => {
          const key = String(i + 1).padStart(2, '0');
          return r.cells[key] ?? '';
        }),
        r.worked,
        r.late,
        r.absent,
      ]);
      downloadText(`${base}.csv`, toCsv([header, ...rows]), 'text/csv;charset=utf-8');
      return;
    }

    if (tab === 'lateness') {
      const lateness = data as {
        summary?: {
          employee: { lastName: string; firstName: string };
          count: number;
          totalMinutes: number;
        }[];
      };
      const rows = [
        ['Сотрудник', 'Дни', 'Всего мин'],
        ...(lateness.summary ?? []).map((r) => [
          `${r.employee.lastName} ${r.employee.firstName}`,
          r.count,
          r.totalMinutes,
        ]),
      ];
      downloadText(`${base}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    if (tab === 'fot') {
      const fot = data as {
        byDivision?: { name: string; amount: number }[];
        byType?: Record<string, number>;
        total?: number;
        penalties?: number;
      };
      const rows = [
        ['Метрика', 'Значение'],
        ['Итого ФОТ', fot.total ?? 0],
        ['Штрафы', fot.penalties ?? 0],
        ...Object.entries(fot.byType ?? {}).map(([t, n]) => [`Тип: ${t}`, n]),
        ...((fot.byDivision ?? []).map((d) => [`Подразделение: ${d.name}`, d.amount]) as [
          string,
          number,
        ][]),
      ];
      downloadText(`${base}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    if (tab === 'marks') {
      const marks = data as {
        marks?: {
          occurredAt: string;
          source: string;
          direction: string;
          employee?: { lastName: string; firstName: string } | null;
        }[];
      };
      const rows = [
        ['Время', 'Сотрудник', 'Направление', 'Источник'],
        ...(marks.marks ?? []).map((m) => [
          String(m.occurredAt),
          m.employee ? `${m.employee.lastName} ${m.employee.firstName}` : '',
          m.direction,
          m.source,
        ]),
      ];
      downloadText(`${base}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    if (tab === 'hr') {
      const hr = data as {
        hired?: number;
        dismissed?: number;
        byDivision?: { name: string; count: number }[];
      };
      const rows = [
        ['Метрика', 'Значение'],
        ['Приёмы', hr.hired ?? 0],
        ['Увольнения', hr.dismissed ?? 0],
        ...(hr.byDivision ?? []).map((d) => [d.name, d.count]),
      ];
      downloadText(`${base}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    downloadText(
      `${base}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  }

  const overview = data as {
    employees?: number;
    marksToday?: number;
    pendingRequests?: number;
    openProblems?: number;
    periods?: number;
  } | null;

  const t13 = data as {
    title?: string;
    daysInMonth?: number;
    legend?: Record<string, string>;
    rows?: {
      employee: { lastName: string; firstName: string; tabNumber: string };
      cells: Record<string, string>;
      worked: number;
      late: number;
      absent: number;
    }[];
  } | null;

  const lateness = data as {
    summary?: {
      employee: { lastName: string; firstName: string };
      count: number;
      totalMinutes: number;
    }[];
  } | null;

  const marks = data as {
    total?: number;
    bySource?: Record<string, number>;
    marks?: {
      id: string;
      occurredAt: string;
      source: string;
      direction: string;
      employee?: { lastName: string; firstName: string } | null;
    }[];
  } | null;

  const hr = data as {
    hired?: number;
    dismissed?: number;
    byDivision?: { name: string; count: number }[];
    byStaff?: { name: string; count: number }[];
    rows?: { name: string; count: number }[];
    gender?: { gender: string | null; _count: number }[];
    documents?: {
      id: string;
      title: string;
      type: string;
      documentDate: string;
      employee?: { lastName: string; firstName: string };
    }[];
  } | null;

  const fot = data as {
    empty?: boolean;
    message?: string;
    title?: string;
    total?: number;
    penalties?: number;
    byType?: Record<string, number>;
    byDivision?: { name: string; amount: number }[];
  } | null;

  return (
    <div className={styles.wrap}>
      <header className={styles.header} data-no-print>
        <div>
          <h1 className={styles.h1}>Отчетность</h1>
          <p className={styles.lead}>
            T-13, kechikish, belgilar, HR harakat, ФОТ — CSV + Excel; T-13 print/PDF.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }} data-no-print>
          {tab === 't13' ? (
            <button type="button" className={styles.btnSecondary} onClick={printReport}>
              PDF / Chop etish
            </button>
          ) : null}
          {(tab === 't13' ||
            tab === 'lateness' ||
            tab === 'marks' ||
            tab === 'hr' ||
            tab === 'fot') &&
          data ? (
            <button type="button" className={styles.btnSecondary} onClick={exportXlsx}>
              Экспорт Excel
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={exportReport}
            disabled={!data}
          >
            Экспорт CSV
          </button>
        </div>
      </header>

      <div className={styles.tabs} data-no-print>
        {(
          [
            ['overview', 'Panel'],
            ['t13', 'T-13'],
            ['lateness', 'Опоздания'],
            ['marks', 'Belgilar'],
            ['hr', 'HR harakat'],
            ['fot', 'ФОТ'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? styles.tabActive : styles.tab}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {filterFields.length > 0 ? (
        <FilterPanel
          open={filtersOpen}
          onToggle={() => setFiltersOpen((o) => !o)}
          fields={filterFields}
        />
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'overview' && overview ? (
        <div className={styles.grid}>
          <div className={styles.card}>
            <h2>Активные сотрудники</h2>
            <p className={styles.stat}>{overview.employees ?? 0}</p>
          </div>
          <div className={styles.card}>
            <h2>Отметки сегодня</h2>
            <p className={styles.stat}>{overview.marksToday ?? 0}</p>
          </div>
          <div className={styles.card}>
            <h2>Ожидающие заявки</h2>
            <p className={styles.stat}>{overview.pendingRequests ?? 0}</p>
          </div>
          <div className={styles.card}>
            <h2>Проблемные отметки</h2>
            <p className={styles.stat}>{overview.openProblems ?? 0}</p>
          </div>
          <div className={styles.card}>
            <h2>Расчётные периоды</h2>
            <p className={styles.stat}>{overview.periods ?? 0}</p>
          </div>
        </div>
      ) : null}

      {tab === 't13' && t13 ? (
        <div className={styles.panel} data-print="report">
          <div style={{ padding: '0.85rem 1rem' }} className={styles.muted}>
            {t13.title} —{' '}
            {t13.legend
              ? Object.entries(t13.legend)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ')
              : null}
          </div>
          <table>
            <thead>
              <tr>
                <th>Tab№</th>
                <th>F.I.O.</th>
                {Array.from({ length: t13.daysInMonth ?? 0 }, (_, i) => (
                  <th key={i}>{i + 1}</th>
                ))}
                <th>Я</th>
                <th>О</th>
                <th>Н</th>
              </tr>
            </thead>
            <tbody>
              {(t13.rows ?? []).map((r) => (
                <tr key={r.employee.tabNumber}>
                  <td>{r.employee.tabNumber}</td>
                  <td>
                    {r.employee.lastName} {r.employee.firstName}
                  </td>
                  {Array.from({ length: t13.daysInMonth ?? 0 }, (_, i) => {
                    const key = String(i + 1).padStart(2, '0');
                    return <td key={key}>{r.cells[key]}</td>;
                  })}
                  <td>{r.worked}</td>
                  <td>{r.late}</td>
                  <td>{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'lateness' && lateness ? (
        <div className={styles.panel}>
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Дни</th>
                <th>Всего мин</th>
              </tr>
            </thead>
            <tbody>
              {(lateness.summary ?? []).map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.employee.lastName} {r.employee.firstName}
                  </td>
                  <td>{r.count}</td>
                  <td>{r.totalMinutes}</td>
                </tr>
              ))}
              {(lateness.summary ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.muted}>
                    Опозданий нет
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'marks' && marks ? (
        <>
          <div className={styles.grid} style={{ marginBottom: '1rem' }}>
            <div className={styles.card}>
              <h2>Итого</h2>
              <p className={styles.stat}>{marks.total ?? 0}</p>
            </div>
            {Object.entries(marks.bySource ?? {}).map(([src, n]) => (
              <div className={styles.card} key={src}>
                <h2>{src}</h2>
                <p className={styles.stat}>{n}</p>
              </div>
            ))}
          </div>
          <div className={styles.panel}>
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Сотрудник</th>
                  <th>Направление</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {(marks.marks ?? []).slice(0, 100).map((m) => (
                  <tr key={m.id}>
                    <td>{String(m.occurredAt).replace('T', ' ').slice(0, 19)}</td>
                    <td>
                      {m.employee
                        ? `${m.employee.lastName} ${m.employee.firstName}`
                        : '—'}
                    </td>
                    <td>{m.direction}</td>
                    <td>
                      <span className={styles.badge}>{m.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'hr' && hr ? (
        <>
          <div className={styles.rowActions} style={{ marginBottom: '0.75rem' }} data-no-print>
            <button
              type="button"
              className={groupBy !== 'staff' ? styles.tabActive : styles.tab}
              onClick={() => setGroupBy('division')}
            >
              По подразделениям
            </button>
            <button
              type="button"
              className={groupBy === 'staff' ? styles.tabActive : styles.tab}
              onClick={() => setGroupBy('staff')}
            >
              По штатам
            </button>
          </div>
          <div className={styles.grid} style={{ marginBottom: '1rem' }}>
            <div className={styles.card}>
              <h2>Приёмы</h2>
              <p className={styles.stat}>{hr.hired ?? 0}</p>
            </div>
            <div className={styles.card}>
              <h2>Увольнения</h2>
              <p className={styles.stat}>{hr.dismissed ?? 0}</p>
            </div>
            {(
              (groupBy === 'staff' ? hr.byStaff : hr.byDivision) ??
              hr.rows ??
              hr.byDivision ??
              []
            ).map((d) => (
              <div className={styles.card} key={d.name}>
                <h2>{d.name}</h2>
                <p className={styles.stat}>{d.count}</p>
              </div>
            ))}
          </div>
          <div className={styles.panel}>
            <table>
              <thead>
                <tr>
                  <th>Документ</th>
                  <th>Тип</th>
                  <th>Сотрудник</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {(hr.documents ?? []).map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>{d.type}</td>
                    <td>
                      {d.employee
                        ? `${d.employee.lastName} ${d.employee.firstName}`
                        : '—'}
                    </td>
                    <td>{String(d.documentDate).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'fot' && fot ? (
        fot.empty ? (
          <p className={styles.muted}>{fot.message}</p>
        ) : (
          <>
            <div className={styles.grid} style={{ marginBottom: '1rem' }}>
              <div className={styles.card}>
                <h2>{fot.title}</h2>
                <p className={styles.stat}>
                  {(fot.total ?? 0).toLocaleString('ru-RU')}
                </p>
              </div>
              <div className={styles.card}>
                <h2>Штрафы</h2>
                <p className={styles.stat}>
                  {(fot.penalties ?? 0).toLocaleString('ru-RU')}
                </p>
              </div>
              {Object.entries(fot.byType ?? {}).map(([t, n]) => (
                <div className={styles.card} key={t}>
                  <h2>{t}</h2>
                  <p className={styles.stat}>{Number(n).toLocaleString('ru-RU')}</p>
                </div>
              ))}
            </div>
            <div className={styles.panel}>
              <table>
                <thead>
                  <tr>
                    <th>Подразделение</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {(fot.byDivision ?? []).map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td>{d.amount.toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
