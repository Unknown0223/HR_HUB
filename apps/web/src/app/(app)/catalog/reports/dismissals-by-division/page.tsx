'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadMatrixXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import matrix from './page.module.css';

type Tab = 'filter' | 'view';
type DivisionCol = { id: string; name: string };
type MatrixRow = { id: string; position: string; counts: number[]; total: number };
type Payload = {
  title: string;
  printTitle: string;
  from: string;
  to: string;
  generatedAt?: string;
  divisions: DivisionCol[];
  rows: MatrixRow[];
  colTotals: number[];
  grandTotal: number;
};

const MONTHS_LONG = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const CORNER = 'Подразделения / Должности';
const FILE_BASE = 'Увольнение-по-подразделению';

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function monthStart(d = new Date()) {
  return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function fmtLongRange(from: string, to: string) {
  const one = (d: Date) => `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${one(parseIso(from))} - ${one(parseIso(to))}`;
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

function fileStamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}+${hh}_${mi}_${ss}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function monthCells(view: Date) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const out: { ymd: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month, 1 - startOffset + i);
    out.push({ ymd: isoDay(d), inMonth: d.getMonth() === month });
  }
  return out;
}

function lastWeekRange() {
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7;
  const thisMonday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const prevMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  const prevSunday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1);
  return { from: isoDay(prevMonday), to: isoDay(prevSunday) };
}

function PeriodRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [picking, setPicking] = useState<'from' | 'to'>('from');
  const [view, setView] = useState(() => new Date(parseIso(from).getFullYear(), parseIso(from).getMonth(), 1));

  useEffect(() => {
    if (!open) return;
    setDraftFrom(from);
    setDraftTo(to);
    setView(new Date(parseIso(from).getFullYear(), parseIso(from).getMonth(), 1));
    setPicking('from');
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function applyPreset(nextFrom: string, nextTo: string) {
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    onChange(nextFrom, nextTo);
    setOpen(false);
  }

  function pickDay(ymd: string) {
    if (picking === 'from' || ymd < draftFrom) {
      setDraftFrom(ymd);
      setDraftTo(ymd);
      setPicking('to');
      return;
    }
    setDraftTo(ymd);
    setPicking('from');
  }

  const today = isoDay(new Date());
  const yest = isoDay(new Date(Date.now() - 86400000));
  const month0 = monthStart();
  const prevMonth0 = isoDay(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 0));
  const last7 = isoDay(new Date(Date.now() - 6 * 86400000));
  const last30 = isoDay(new Date(Date.now() - 29 * 86400000));
  const week = lastWeekRange();
  const left = view;
  const right = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  function cal(month: Date) {
    return (
      <div>
        <div className={extra.calHead}>
          <button
            type="button"
            className={extra.calNav}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <span>
            {MONTHS_LONG[month.getMonth()]} {month.getFullYear()}
          </span>
          <button
            type="button"
            className={extra.calNav}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>
        <div className={extra.week}>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className={extra.days}>
          {monthCells(month).map((c, i) => {
            const on = c.ymd === draftFrom || c.ymd === draftTo;
            const inRange = c.ymd > draftFrom && c.ymd < draftTo;
            const cls = on ? extra.dayOn : inRange ? extra.dayIn : c.inMonth ? extra.day : extra.dayMuted;
            return (
              <button type="button" key={`${c.ymd}-${i}`} className={cls} onClick={() => pickDay(c.ymd)}>
                {Number(c.ymd.slice(8))}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={extra.periodWrap} ref={wrapRef}>
      <button type="button" className={extra.periodBtn} onClick={() => setOpen((v) => !v)}>
        {fmtLongRange(from, to)}
      </button>
      {open ? (
        <div className={extra.popup}>
          <div className={extra.presets}>
            <button type="button" className={extra.preset} onClick={() => applyPreset(today, today)}>
              Сегодня
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(yest, yest)}>
              Вчера
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(last7, today)}>
              Последние 7 дней
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(week.from, week.to)}>
              Прошлая неделя
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(last30, today)}>
              Последние 30 дней
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(month0, today)}>
              Текущий месяц
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(prevMonth0, prevMonth1)}>
              Прошлый месяц
            </button>
            <button type="button" className={extra.presetOn}>
              Пользовательский диапазон
            </button>
          </div>
          <div className={extra.calendars}>
            <div className={extra.inputs}>
              <input value={draftFrom.split('-').reverse().join('.')} readOnly />
              <input value={draftTo.split('-').reverse().join('.')} readOnly />
            </div>
            <div className={extra.calRow}>
              {cal(left)}
              {cal(right)}
            </div>
            <div className={extra.footer}>
              <button type="button" className={extra.cancel} onClick={() => setOpen(false)}>
                Отменить
              </button>
              <button
                type="button"
                className={extra.apply}
                onClick={() => {
                  onChange(draftFrom, draftTo);
                  setOpen(false);
                }}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function colCount(report: Payload) {
  return 1 + report.divisions.length + 1;
}

function emptyCells(n: number) {
  return '<c></c>'.repeat(n);
}

function csvText(report: Payload) {
  const width = colCount(report);
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const blank = ';'.repeat(width - 1);
  const dataLine = (label: string, values: number[], total: number) => {
    const cells = values.map((n) => (n ? q(n) : ''));
    return `${q(label)};${cells.join(';')};${q(total)}`;
  };
  const header = [q(CORNER), ...report.divisions.map((d) => q(d.name)), q('Итого')].join(';');
  const total = `${q('Итого')};${report.colTotals.map((n) => String(n)).join(';')};${report.grandTotal}`;
  const lines = [
    blank,
    `${q(`Дата начала: ${fmtRu(report.from)}`)}${';'.repeat(width - 1)}`,
    `${q(`Дата окончания: ${fmtRu(report.to)}`)}${';'.repeat(width - 1)}`,
    blank,
    header,
    ...report.rows.map((r) => dataLine(r.position, r.counts, r.total)),
    total,
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const width = colCount(report);
  const cell = (v: string, number = false) =>
    number ? `<c type="number">${v}</c>` : `<c>${escapeHtml(v)}</c>`;
  const pad = (first: string) => `${cell(first)}${emptyCells(width - 1)}`;
  const header = `<r>${cell(CORNER)}${report.divisions.map((d) => cell(d.name)).join('')}${cell('Итого')}</r>`;
  const body = report.rows
    .map((r) => {
      const cells = r.counts.map((n) => (n ? cell(String(n), true) : '<c></c>')).join('');
      return `<r>${cell(r.position)}${cells}${cell(String(r.total), true)}</r>`;
    })
    .join('\n');
  const footerCells = report.colTotals.map((n) => `<c>${n}</c>`).join('');
  const footer = `<r>${cell('Итого')}${footerCells}${cell(String(report.grandTotal), true)}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
<r>${emptyCells(width)}</r>
<r>${pad(`Дата начала: ${fmtRu(report.from)}`)}</r>
<r>${pad(`Дата окончания: ${fmtRu(report.to)}`)}</r>
<r>${emptyCells(width)}</r>
${header}
${body}
${footer}
</t>
`;
}

function tableInner(report: Payload) {
  const heads = report.divisions.map((d) => `<th class="rot">${escapeHtml(d.name)}</th>`).join('');
  const body = report.rows
    .map((r) => {
      const tds = r.counts.map((n) => `<td class="num">${n ? n : ''}</td>`).join('');
      return `<tr><td class="pos">${escapeHtml(r.position)}</td>${tds}<td class="num">${r.total}</td></tr>`;
    })
    .join('');
  const totals = report.colTotals.map((n) => `<td class="num">${n}</td>`).join('');
  return `<table>
<thead><tr><th class="corner">${CORNER}</th>${heads}<th class="rot">Итого</th></tr></thead>
<tbody>${body}<tr class="total"><td class="pos">Итого</td>${totals}<td class="num">${report.grandTotal}</td></tr></tbody>
</table>`;
}

function printHtml(report: Payload) {
  const gen = fmtGen(report.generatedAt);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.printTitle)}</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{font-weight:800;color:#009ef7;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:12px}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap}
th{background:#f5f8fa}
.corner,.pos{position:sticky;left:0;background:#fff;text-align:left;min-width:180px;z-index:2}
.corner{background:#f5f8fa;text-align:center;z-index:3}
.rot{writing-mode:vertical-rl;transform:rotate(180deg);height:140px;min-width:26px;font-size:11px;text-align:left;vertical-align:bottom;padding:6px 2px}
.num{text-align:center}
.total td{background:#f5f8fa;font-weight:700}
.total .pos{background:#f5f8fa}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.printTitle)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta"><span>Дата начала</span><span>${escapeHtml(fmtRu(report.from))}</span><span>Дата окончания</span><span>${escapeHtml(fmtRu(report.to))}</span></div>
<div class="wrap">${tableInner(report)}</div>
</body></html>`;
}

export default function DismissalsByDivisionPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    return p.toString();
  }, [from, to]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/dismissals-by-division?${queryQs}`);
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

  async function exportExcel(data?: Payload | null) {
    const payload = data ?? (await ensureReport());
    if (!payload) return;
    await downloadMatrixXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: payload.printTitle,
      meta: [`Дата начала: ${fmtRu(payload.from)}`, `Дата окончания: ${fmtRu(payload.to)}`],
      corner: CORNER,
      columns: [...payload.divisions.map((d) => d.name), 'Итого'],
      rows: payload.rows.map((r) => ({
        label: r.position,
        values: [...r.counts.map((n) => (n ? n : '')), r.total],
      })),
      footer: {
        label: 'Итого',
        values: [...payload.colTotals, payload.grandTotal],
      },
    });
  }

  function exportCsv(data: Payload) {
    downloadBlob(
      `${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`,
      new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }),
    );
  }

  function exportXml(data: Payload) {
    downloadBlob(
      `${FILE_BASE}(${fileStamp(data.generatedAt)}).xml`,
      new Blob([xmlText(data)], { type: 'application/xml;charset=utf-8' }),
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
        `${FILE_BASE}(${fileStamp(data.generatedAt)}).html`,
        new Blob([printHtml(data)], { type: 'text/html;charset=utf-8' }),
      );
      return;
    }
    w.document.open();
    w.document.write(printHtml(data));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    w.document.getElementById('btnExcel')?.addEventListener('click', () => void exportExcel(data));
  }

  const exportBtns = (ghost = false) => (
    <div className={ghost ? undefined : extra.exportLinks} style={ghost ? { display: 'flex', gap: 8 } : undefined}>
      <button type="button" className={ghost ? extra.exportGhost : undefined} disabled={busy} onClick={() => void openHtml()}>
        HTML
      </button>
      <button type="button" className={ghost ? extra.exportGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>
        Excel
      </button>
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportCsv(d))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportXml(d))}
      >
        XML
      </button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет увольнений по подразделениям</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>
          Фильтр
        </button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report) void generate();
          }}
        >
          Просмотреть
        </button>
        {tab === 'view' ? (
          <>
            <button type="button" className={layout.iconBtn} disabled={busy} aria-label="Обновить" onClick={() => void load()}>
              <i className="fas fa-sync-alt" aria-hidden />
            </button>
            {exportBtns(true)}
          </>
        ) : null}
      </div>
      {error ? <p className={layout.error}>{error}</p> : null}

      {tab === 'filter' ? (
        <form className={layout.card} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Период</label>
            <PeriodRangePicker
              from={from}
              to={to}
              onChange={(a, b) => {
                setFrom(a);
                setTo(b);
              }}
            />
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <div className={matrix.meta}>
                <span>Дата начала</span>
                <span>{fmtRu(report.from)}</span>
                <span>Дата окончания</span>
                <span>{fmtRu(report.to)}</span>
              </div>
              <div className={matrix.tableWrap}>
                <table className={matrix.table}>
                  <thead>
                    <tr>
                      <th className={matrix.corner}>{CORNER}</th>
                      {report.divisions.map((d) => (
                        <th key={d.id || d.name} className={matrix.rot}>
                          {d.name}
                        </th>
                      ))}
                      <th className={matrix.rot}>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.id}>
                        <td className={matrix.pos}>{r.position}</td>
                        {r.counts.map((n, i) => (
                          <td key={`${r.id}-${i}`} className={matrix.num}>
                            {n || ''}
                          </td>
                        ))}
                        <td className={matrix.num}>{r.total}</td>
                      </tr>
                    ))}
                    <tr className={matrix.total}>
                      <td className={matrix.pos}>Итого</td>
                      {report.colTotals.map((n, i) => (
                        <td key={`t-${i}`} className={matrix.num}>
                          {n}
                        </td>
                      ))}
                      <td className={matrix.num}>{report.grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
