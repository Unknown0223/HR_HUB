'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';

type LookupOpt = { id: string; label: string };

type StaffingLine = {
  kind: 'group' | 'line';
  groupIndex: number;
  division: string;
  position: string;
  units: number;
  rates: number;
  occupied: number;
  vacant: number;
  ratePerUnit: number | null;
  actualRates: number;
  positionSalary: number | null;
  totalSalary: number;
  actualSalary: number | null;
  totalActualSalary: number;
};

type StaffingGroup = {
  division: string;
  index: number;
  totals: StaffingLine;
  lines: StaffingLine[];
};

type StaffingPayload = {
  title: string;
  date: string;
  generatedAt?: string;
  groups: StaffingGroup[];
  rows: StaffingLine[];
};

type Tab = 'filter' | 'view';

const UNIT_SUB = [
  'Общее количество штатных единиц',
  'Общее количество ставок',
  'Общее количество занятых штатных единиц',
  'Общее количество вакантных штатных единиц',
  'Ставка на штатную единицу',
  'Общее количество фактических ставок',
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRu(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function fmtGen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(s: string) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvRows(report: StaffingPayload): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const g of report.groups) {
    const push = (r: StaffingLine, isGroup: boolean) => {
      out.push({
        '№': isGroup ? g.index : '',
        Подразделение: r.division,
        Должность: r.position,
        'Общее количество штатных единиц': r.units,
        'Общее количество ставок': r.rates,
        'Общее количество занятых штатных единиц': r.occupied,
        'Общее количество вакантных штатных единиц': r.vacant,
        'Ставка на штатную единицу': r.ratePerUnit ?? '',
        'Общее количество фактических ставок': r.actualRates,
        'Оклад позиции': r.positionSalary ?? '',
        'Общая заработная плата': r.totalSalary,
        'Фактическая заработная плата': r.actualSalary ?? '',
        'Общая фактическая заработная плата': r.totalActualSalary,
      });
    };
    push(g.totals, true);
    g.lines.forEach((l) => push(l, false));
  }
  return out;
}

function xmlText(report: StaffingPayload) {
  const rows = csvRows(report)
    .map(
      (r) => `  <row>
    <n>${escapeXml(String(r['№'] ?? ''))}</n>
    <division>${escapeXml(String(r['Подразделение'] ?? ''))}</division>
    <position>${escapeXml(String(r['Должность'] ?? ''))}</position>
    <units>${escapeXml(String(r['Общее количество штатных единиц'] ?? ''))}</units>
    <rates>${escapeXml(String(r['Общее количество ставок'] ?? ''))}</rates>
    <occupied>${escapeXml(String(r['Общее количество занятых штатных единиц'] ?? ''))}</occupied>
    <vacant>${escapeXml(String(r['Общее количество вакантных штатных единиц'] ?? ''))}</vacant>
    <ratePerUnit>${escapeXml(String(r['Ставка на штатную единицу'] ?? ''))}</ratePerUnit>
    <actualRates>${escapeXml(String(r['Общее количество фактических ставок'] ?? ''))}</actualRates>
    <positionSalary>${escapeXml(String(r['Оклад позиции'] ?? ''))}</positionSalary>
    <totalSalary>${escapeXml(String(r['Общая заработная плата'] ?? ''))}</totalSalary>
    <actualSalary>${escapeXml(String(r['Фактическая заработная плата'] ?? ''))}</actualSalary>
    <totalActualSalary>${escapeXml(String(r['Общая фактическая заработная плата'] ?? ''))}</totalActualSalary>
  </row>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<staffingReport date="${escapeXml(report.date)}" title="${escapeXml(report.title)}">
${rows}
</staffingReport>
`;
}

function cells(r: StaffingLine) {
  return [
    r.units,
    r.rates,
    r.occupied,
    r.vacant,
    r.ratePerUnit,
    r.actualRates,
    r.positionSalary,
    r.totalSalary,
    r.actualSalary,
    r.totalActualSalary,
  ];
}

function tableInnerHtml(report: StaffingPayload) {
  const body = report.groups
    .map((g) => {
      const span = 1 + g.lines.length;
      const totalTds = cells(g.totals)
        .map((n) => `<td class="num">${fmtNum(n)}</td>`)
        .join('');
      const lineRows = g.lines
        .map((l) => {
          const tds = cells(l)
            .map((n) => `<td class="num">${fmtNum(n)}</td>`)
            .join('');
          return `<tr><td>${escapeHtml(l.position)}</td>${tds}</tr>`;
        })
        .join('');
      return `<tr class="total"><td rowspan="${span}">${g.index}</td><td rowspan="${span}">${escapeHtml(g.division)}</td><td></td>${totalTds}</tr>${lineRows}`;
    })
    .join('');
  const sub = UNIT_SUB.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  return `<table>
<thead>
<tr>
<th rowspan="2">№</th>
<th rowspan="2">Подразделение</th>
<th rowspan="2">Должность</th>
<th colspan="6">Количество штатных единиц и ставок</th>
<th rowspan="2">Оклад позиции</th>
<th rowspan="2">Общая заработная плата</th>
<th rowspan="2">Фактическая заработная плата</th>
<th rowspan="2">Общая фактическая заработная плата</th>
</tr>
<tr>${sub}</tr>
</thead>
<tbody>${body || `<tr><td colspan="13">Нет данных</td></tr>`}</tbody>
</table>`;
}

function printDocumentHtml(report: StaffingPayload) {
  const gen = fmtGen(report.generatedAt);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  body { margin: 0; font-family: Segoe UI, Arial, sans-serif; color: #181c32; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 10px 16px; border-bottom: 1px solid #e4e6ef; }
  .brand { font-weight: 800; letter-spacing: .04em; color: #009ef7; margin-right: 10px; }
  h1 { margin: 0; font-size: 15px; font-weight: 700; display: inline; }
  .actions { display: flex; gap: 8px; position: relative; }
  .btn { appearance: none; border: 1px solid #e4e6ef; background: #fff; color: #5e6278; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; cursor: pointer; }
  .menu { display: none; position: absolute; right: 0; top: 100%; background: #fff; border: 1px solid #e4e6ef; border-radius: 4px; min-width: 90px; z-index: 2; }
  .menu button { display: block; width: 100%; border: 0; background: #fff; text-align: left; padding: 8px 12px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
  .menu button:hover { background: #f5f8fa; }
  .date { padding: 10px 16px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #cfd3da; padding: 4px 6px; }
  th { background: #f5f8fa; font-weight: 600; text-align: center; }
  td.num { text-align: right; white-space: nowrap; }
  tr.total td { background: #eef0f4; font-weight: 600; }
  @media print { .actions { display: none !important; } .top { border: 0; } }
</style></head>
<body>
  <div class="top">
    <div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
    <div class="actions">
      <button class="btn" id="btnPrint">Печать</button>
      <div>
        <button class="btn" id="btnExcel">Excel</button>
        <div class="menu" id="excelMenu">
          <button type="button" id="btnCsv">CSV</button>
          <button type="button" id="btnXml">XML</button>
        </div>
      </div>
    </div>
  </div>
  <div class="date">Дата: ${escapeHtml(fmtRu(report.date))}</div>
  ${tableInnerHtml(report)}
</body></html>`;
}

export default function StaffingReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(todayIso);
  const [divisionId, setDivisionId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [divisions, setDivisions] = useState<LookupOpt[]>([]);
  const [positions, setPositions] = useState<LookupOpt[]>([]);
  const [report, setReport] = useState<StaffingPayload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{ divisions?: LookupOpt[]; positions?: LookupOpt[] }>(
          '/api/catalog/lookups',
        );
        setDivisions(data.divisions || []);
        setPositions(data.positions || []);
      } catch {
        /* ignore bootstrap */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    if (divisionId) p.set('divisionId', divisionId);
    if (positionId) p.set('positionId', positionId);
    return p.toString();
  }, [date, divisionId, positionId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<StaffingPayload>(
        `/api/catalog/analytics/staffing${queryQs ? `?${queryQs}` : ''}`,
      );
      setReport(data);
      setLoadedQs(queryQs);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка формирования');
      setReport(null);
      setLoadedQs(null);
      return null;
    } finally {
      setBusy(false);
    }
  }, [queryQs]);

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    const data = await load();
    if (data) setTab('view');
  }

  async function ensureReport() {
    if (report && loadedQs === queryQs) return report;
    return load();
  }

  async function exportExcel() {
    const data = await ensureReport();
    if (!data) return;
    try {
      await downloadXlsxViaApi(
        `/api/catalog/analytics/staffing/export.xlsx${queryQs ? `?${queryQs}` : ''}`,
        'Отчет-по-штатному-расписанию.xlsx',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    }
  }

  function exportCsv() {
    if (!report?.groups.length) return;
    downloadCsv('Отчет-по-штатному-расписанию', csvRows(report));
  }

  function exportXml() {
    if (!report) return;
    downloadBlob(
      'Отчет-по-штатному-расписанию.xml',
      new Blob([xmlText(report)], { type: 'application/xml;charset=utf-8' }),
    );
  }

  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    if (!w) {
      downloadBlob(
        'Отчет-по-штатному-расписанию.html',
        new Blob([printDocumentHtml(data)], { type: 'text/html;charset=utf-8' }),
      );
      return;
    }
    w.document.open();
    w.document.write(printDocumentHtml(data));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    const menu = w.document.getElementById('excelMenu');
    w.document.getElementById('btnExcel')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      void exportExcel();
    });
    w.document.getElementById('btnCsv')?.addEventListener('click', () => exportCsv());
    w.document.getElementById('btnXml')?.addEventListener('click', () => exportXml());
  }

  const exportDisabled = busy;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Отчет по штатному расписанию</h1>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={tab === 'filter' ? styles.tabOn : styles.tab}
          onClick={() => setTab('filter')}
        >
          Фильтр
        </button>
        <button
          type="button"
          className={tab === 'view' ? styles.tabOn : styles.tab}
          onClick={() => setTab('view')}
        >
          Просмотр
        </button>
        {tab === 'view' ? (
          <>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={busy}
              aria-label="Обновить"
              onClick={() => void load()}
            >
              <i className="fas fa-sync-alt" aria-hidden />
            </button>
            <div className={styles.exportBtns}>
              <button type="button" className={styles.exportBtnGhost} disabled={exportDisabled} onClick={() => void openHtml()}>
                HTML
              </button>
              <button type="button" className={styles.exportBtnGhost} disabled={exportDisabled} onClick={() => void exportExcel()}>
                Excel
              </button>
              <button type="button" className={styles.exportBtnGhost} disabled={exportDisabled || !report} onClick={exportCsv}>
                CSV
              </button>
              <button type="button" className={styles.exportBtnGhost} disabled={exportDisabled || !report} onClick={exportXml}>
                XML
              </button>
            </div>
          </>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'filter' ? (
        <form className={styles.card} onSubmit={(e) => void generate(e)}>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="staffing-date">Дата</label>
              <input
                id="staffing-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Подразделение</label>
              <div className={styles.lookup}>
                <SearchLookup
                  value={divisionId}
                  options={divisions}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setDivisionId}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Должности</label>
              <div className={styles.lookup}>
                <SearchLookup
                  value={positionId}
                  options={positions}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setPositionId}
                />
              </div>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            <button type="button" className={styles.exportBtn} disabled={exportDisabled} onClick={() => void openHtml()}>
              HTML
            </button>
            <button type="button" className={styles.exportBtn} disabled={exportDisabled} onClick={() => void exportExcel()}>
              Excel
            </button>
            <button
              type="button"
              className={styles.exportBtn}
              disabled={exportDisabled}
              onClick={() => void ensureReport().then((d) => d && downloadCsv('Отчет-по-штатному-расписанию', csvRows(d)))}
            >
              CSV
            </button>
            <button
              type="button"
              className={styles.exportBtn}
              disabled={exportDisabled}
              onClick={() =>
                void ensureReport().then((d) => {
                  if (!d) return;
                  downloadBlob(
                    'Отчет-по-штатному-расписанию.xml',
                    new Blob([xmlText(d)], { type: 'application/xml;charset=utf-8' }),
                  );
                })
              }
            >
              XML
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.viewArea}>
          {busy && !report ? (
            <p className={styles.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={styles.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <p className={styles.dateLine}>Дата: {fmtRu(report.date)}</p>
              <StaffingTable groups={report.groups} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StaffingTable({ groups }: { groups: StaffingGroup[] }) {
  if (!groups.length) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <HeaderRows />
          </thead>
          <tbody>
            <tr>
              <td className={styles.muted} colSpan={13}>
                Нет данных
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <HeaderRows />
        </thead>
        <tbody>
          {groups.map((g) => {
            const span = 1 + g.lines.length;
            return (
              <GroupRows key={`${g.index}-${g.division}`} group={g} span={span} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeaderRows() {
  return (
    <>
      <tr>
        <th rowSpan={2}>№</th>
        <th rowSpan={2}>Подразделение</th>
        <th rowSpan={2}>Должность</th>
        <th className={styles.groupHead} colSpan={6}>
          Количество штатных единиц и ставок
        </th>
        <th rowSpan={2}>Оклад позиции</th>
        <th rowSpan={2}>Общая заработная плата</th>
        <th rowSpan={2}>Фактическая заработная плата</th>
        <th rowSpan={2}>Общая фактическая заработная плата</th>
      </tr>
      <tr>
        {UNIT_SUB.map((h) => (
          <th key={h} className={styles.subHead}>
            {h}
          </th>
        ))}
      </tr>
    </>
  );
}

function NumCells({ row }: { row: StaffingLine }) {
  return (
    <>
      {cells(row).map((n, i) => (
        <td key={i} className={styles.num}>
          {fmtNum(n)}
        </td>
      ))}
    </>
  );
}

function GroupRows({ group, span }: { group: StaffingGroup; span: number }) {
  return (
    <>
      <tr className={styles.totalRow}>
        <td className={styles.idx} rowSpan={span}>
          {group.index}
        </td>
        <td className={styles.divCell} rowSpan={span}>
          {group.division}
        </td>
        <td className={styles.posCell} />
        <NumCells row={group.totals} />
      </tr>
      {group.lines.map((line, i) => (
        <tr key={`${group.index}-${i}-${line.position}`}>
          <td className={styles.posCell}>{line.position}</td>
          <NumCells row={line} />
        </tr>
      ))}
    </>
  );
}
