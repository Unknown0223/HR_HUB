'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadAttendanceLikeXlsx, XLSX_COLORS } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from './page.module.css';

type Tab = 'filter' | 'view';
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type MovementRow = {
  id: string;
  division: string;
  hired: number;
  hiredPct: number;
  dismissed: number;
  dismissedPct: number;
  transferIn: number;
  transferInPct: number;
  transferOut: number;
  transferOutPct: number;
};
type Extrema = { min: number; max: number };
type Payload = {
  title: string;
  from: string;
  to: string;
  generatedAt?: string;
  extrema: {
    hired: Extrema;
    dismissed: Extrema;
    transferIn: Extrema;
    transferOut: Extrema;
  };
  rows: MovementRow[];
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
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const FILL_MIN = 'FFD6ECFF';
const FILL_MAX = 'FFFFDFD2';
const FILL_PCT = 'FFE8F5E0';

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
  const a = parseIso(from);
  const b = parseIso(to);
  const one = (d: Date) => `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${one(a)} - ${one(b)}`;
}

function fmtPeriodLine(from: string, to: string) {
  const one = (iso: string) => {
    const d = parseIso(iso);
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  };
  return `Период: ${one(from)} - ${one(to)}`;
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

function tone(n: number, ext: Extrema): 'min' | 'max' | null {
  if (ext.min === ext.max) return ext.min === n ? 'min' : null;
  if (n === ext.max) return 'max';
  if (n === ext.min) return 'min';
  return null;
}

function qtyClass(n: number, ext: Extrema) {
  const t = tone(n, ext);
  if (t === 'max') return `${extra.num} ${extra.max}`;
  if (t === 'min') return `${extra.num} ${extra.min}`;
  return extra.num;
}

function fillFor(n: number, ext: Extrema) {
  const t = tone(n, ext);
  if (t === 'max') return FILL_MAX;
  if (t === 'min') return FILL_MIN;
  return XLSX_COLORS.white;
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(month0, today)}>
              Этот месяц
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

function flattenTree(nodes: TreeNode[], q: string): TreeNode[] {
  const qq = q.trim().toLowerCase();
  const walk = (list: TreeNode[]): TreeNode[] =>
    list
      .map((n) => {
        const kids = walk(n.children || []);
        if (!qq || n.name.toLowerCase().includes(qq) || kids.length) {
          return { ...n, children: kids };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  return walk(nodes);
}

function DivisionTree({
  nodes,
  selected,
  onToggle,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const visible = useMemo(() => flattenTree(nodes, q), [nodes, q]);

  function Row({ node, depth }: { node: TreeNode; depth: number }) {
    const kids = node.children || [];
    const expanded = open.has(node.id) || !!q;
    return (
      <>
        <div className={extra.treeRow} style={{ paddingLeft: depth * 14 }}>
          {kids.length ? (
            <button
              type="button"
              className={extra.exp}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span className={extra.exp} />
          )}
          <input type="checkbox" checked={selected.has(node.id)} onChange={() => onToggle(node.id)} />
          <span>{node.name}</span>
        </div>
        {expanded ? kids.map((c) => <Row key={c.id} node={c} depth={depth + 1} />) : null}
      </>
    );
  }

  return (
    <div>
      <input
        className={extra.treeSearch}
        placeholder="Поиск..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={extra.treeBox}>
        {visible.map((n) => (
          <Row key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}

function csvText(report: Payload) {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [
    ';;;;;;;;',
    `${q(fmtPeriodLine(report.from, report.to))};;;;;${q('Подразделение имеет документы')};;;`,
    `;;;;;${q('Минимальное количество для столбца')};;;`,
    `;;;;;${q('Максимальное количество для столбца')};;;`,
    `;;;;;${q('Показывает процент')};;;`,
    ';;;;;;;;',
    `${q('Подразделение')};${q('Принятые на работу (Новые)')};;${q('Уволенные')};;${q('Перемещенные (Прибывшие)')};;${q('Перемещенные (Ушедшие)')};`,
    `;${q('Кол-во')};${q('Кол-во %')};${q('Кол-во')};${q('Кол-во %')};${q('Кол-во')};${q('Кол-во %')};${q('Кол-во')};${q('Кол-во %')}`,
    ...report.rows.map(
      (r) =>
        `${q(r.division)};${q(r.hired)};${q(r.hiredPct)};${q(r.dismissed)};${q(r.dismissedPct)};${q(r.transferIn)};${q(r.transferInPct)};${q(r.transferOut)};${q(r.transferOutPct)}`,
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string, number = false) =>
    number ? `<c type="number">${v}</c>` : `<c>${escapeHtml(v)}</c>`;
  const empty = () => `<c></c>`.repeat(9);
  const legend = (text: string) =>
    `<r>${cell('')}${cell('')}${cell('')}${cell('')}${cell('')}${cell(text)}${cell('')}${cell('')}${cell('')}</r>`;
  const row = (r: MovementRow) =>
    `<r>${cell(r.division)}${cell(String(r.hired), true)}${cell(String(r.hiredPct), true)}${cell(String(r.dismissed), true)}${cell(String(r.dismissedPct), true)}${cell(String(r.transferIn), true)}${cell(String(r.transferInPct), true)}${cell(String(r.transferOut), true)}${cell(String(r.transferOutPct), true)}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
<r>${empty()}</r>
<r>${cell(fmtPeriodLine(report.from, report.to))}${cell('')}${cell('')}${cell('')}${cell('')}${cell('Подразделение имеет документы')}${cell('')}${cell('')}${cell('')}</r>
${legend('Минимальное количество для столбца')}
${legend('Максимальное количество для столбца')}
${legend('Показывает процент')}
<r>${empty()}</r>
<r>${cell('Подразделение')}${cell('Принятые на работу (Новые)')}${cell('')}${cell('Уволенные')}${cell('')}${cell('Перемещенные (Прибывшие)')}${cell('')}${cell('Перемещенные (Ушедшие)')}${cell('')}</r>
<r>${cell('')}${cell('Кол-во')}${cell('Кол-во %')}${cell('Кол-во')}${cell('Кол-во %')}${cell('Кол-во')}${cell('Кол-во %')}${cell('Кол-во')}${cell('Кол-во %')}</r>
${report.rows.map(row).join('\n')}
</t>
`;
}

function tableInner(report: Payload) {
  const body = report.rows
    .map((r) => {
      const td = (n: number, ext: Extrema, pct = false) => {
        if (pct) return `<td class="pct">${n}</td>`;
        const t = tone(n, ext);
        const cls = t === 'max' ? 'max' : t === 'min' ? 'min' : 'num';
        return `<td class="${cls}">${n}</td>`;
      };
      return `<tr><td>${escapeHtml(r.division)}</td>${td(r.hired, report.extrema.hired)}${td(r.hiredPct, report.extrema.hired, true)}${td(r.dismissed, report.extrema.dismissed)}${td(r.dismissedPct, report.extrema.dismissed, true)}${td(r.transferIn, report.extrema.transferIn)}${td(r.transferInPct, report.extrema.transferIn, true)}${td(r.transferOut, report.extrema.transferOut)}${td(r.transferOutPct, report.extrema.transferOut, true)}</tr>`;
    })
    .join('');
  return `<table>
<thead>
<tr><th rowspan="2">Подразделение</th><th colspan="2">Принятые на работу (Новые)</th><th colspan="2">Уволенные</th><th colspan="2">Перемещенные (Прибывшие)</th><th colspan="2">Перемещенные (Ушедшие)</th></tr>
<tr><th>Кол-во</th><th>Кол-во %</th><th>Кол-во</th><th>Кол-во %</th><th>Кол-во</th><th>Кол-во %</th><th>Кол-во</th><th>Кол-во %</th></tr>
</thead>
<tbody>${body || `<tr><td colspan="9">Нет данных</td></tr>`}</tbody>
</table>`;
}

function printHtml(report: Payload) {
  const gen = fmtGen(report.generatedAt);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{font-weight:800;color:#009ef7;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px}
.legend span{margin-right:16px;font-size:12px;color:#5e6278}
.sw{display:inline-block;width:12px;height:12px;border:1px solid #d8dbe0;margin-right:4px;vertical-align:-1px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #cfd3da;padding:4px 6px}
th{background:#f5f8fa}
.num{text-align:right}
.min{background:#d6ecff;text-align:right}
.max{background:#ffdfd2;text-align:right}
.pct{background:#e8f5e0;text-align:right}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(fmtPeriodLine(report.from, report.to))}</div>
<div class="legend meta">
<span><i class="sw" style="background:#fff"></i>Подразделение имеет документы</span>
<span><i class="sw" style="background:#d6ecff"></i>Минимальное количество для столбца</span>
<span><i class="sw" style="background:#ffdfd2"></i>Максимальное количество для столбца</span>
<span><i class="sw" style="background:#e8f5e0"></i>Показывает процент</span>
</div>
${tableInner(report)}
</body></html>`;
}

export default function MovementDivisionsPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<TreeNode[]>('/api/organization/divisions/tree');
        setTree(Array.isArray(data) ? data : []);
      } catch {
        try {
          const lookups = await apiFetch<{ divisions?: { id: string; label: string }[] }>(
            '/api/catalog/lookups',
          );
          setTree((lookups.divisions || []).map((d) => ({ id: d.id, name: d.label, children: [] })));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (selected.size) p.set('divisionIds', [...selected].join(','));
    return p.toString();
  }, [from, to, selected]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/movement-divisions?${queryQs}`);
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
    const name = `Отчет-по-движению-сотрудников-(подразделения)(${fileStamp(payload.generatedAt)}).xlsx`;
    await downloadAttendanceLikeXlsx({
      filename: name,
      title: payload.title,
      subtitle: fmtPeriodLine(payload.from, payload.to),
      topHeader: [
        { label: 'Подразделение', span: 1 },
        { label: 'Принятые на работу (Новые)', span: 2 },
        { label: 'Уволенные', span: 2 },
        { label: 'Перемещенные (Прибывшие)', span: 2 },
        { label: 'Перемещенные (Ушедшие)', span: 2 },
      ],
      subHeader: [
        { label: '' },
        { label: 'Кол-во' },
        { label: 'Кол-во %', fill: FILL_PCT },
        { label: 'Кол-во' },
        { label: 'Кол-во %', fill: FILL_PCT },
        { label: 'Кол-во' },
        { label: 'Кол-во %', fill: FILL_PCT },
        { label: 'Кол-во' },
        { label: 'Кол-во %', fill: FILL_PCT },
      ],
      rows: payload.rows.map((r) => ({
        cells: [
          r.division,
          { v: r.hired, s: { fill: fillFor(r.hired, payload.extrema.hired), align: 'right' } },
          { v: r.hiredPct, s: { fill: FILL_PCT, align: 'right' } },
          { v: r.dismissed, s: { fill: fillFor(r.dismissed, payload.extrema.dismissed), align: 'right' } },
          { v: r.dismissedPct, s: { fill: FILL_PCT, align: 'right' } },
          { v: r.transferIn, s: { fill: fillFor(r.transferIn, payload.extrema.transferIn), align: 'right' } },
          { v: r.transferInPct, s: { fill: FILL_PCT, align: 'right' } },
          { v: r.transferOut, s: { fill: fillFor(r.transferOut, payload.extrema.transferOut), align: 'right' } },
          { v: r.transferOutPct, s: { fill: FILL_PCT, align: 'right' } },
        ],
      })),
    });
  }

  function exportCsv(data: Payload) {
    downloadBlob(
      `Отчет-по-движению-сотрудников-(подразделения)(${fileStamp(data.generatedAt)}).csv`,
      new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }),
    );
  }

  function exportXml(data: Payload) {
    downloadBlob(
      `Отчет-по-движению-сотрудников-(подразделения)(${fileStamp(data.generatedAt)}).xml`,
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
        `Отчет-по-движению-сотрудников-(подразделения)(${fileStamp(data.generatedAt)}).html`,
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
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void openHtml()}
      >
        HTML
      </button>
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void exportExcel()}
      >
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
      <h1 className={layout.h1}>Отчет по движению сотрудников (подразделения)</h1>
      <div className={layout.toolbar}>
        <button
          type="button"
          className={tab === 'filter' ? layout.tabOn : layout.tab}
          onClick={() => setTab('filter')}
        >
          Фильтр
        </button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => setTab('view')}
        >
          Просмотреть
        </button>
        {tab === 'view' ? (
          <>
            <button
              type="button"
              className={layout.iconBtn}
              disabled={busy}
              aria-label="Обновить"
              onClick={() => void load()}
            >
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
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          </div>
          <div className={layout.field}>
            <label>Подразделение</label>
            <DivisionTree
              nodes={tree}
              selected={selected}
              onToggle={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
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
              <p className={extra.periodLine}>{fmtPeriodLine(report.from, report.to)}</p>
              <div className={extra.legend}>
                <span>
                  <i className={extra.swatch} style={{ background: '#fff' }} />
                  Подразделение имеет документы
                </span>
                <span>
                  <i className={extra.swatch} style={{ background: '#d6ecff' }} />
                  Минимальное количество для столбца
                </span>
                <span>
                  <i className={extra.swatch} style={{ background: '#ffdfd2' }} />
                  Максимальное количество для столбца
                </span>
                <span>
                  <i className={extra.swatch} style={{ background: '#e8f5e0' }} />
                  Показывает процент
                </span>
              </div>
              <div className={extra.tableWrap}>
                <table className={extra.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Подразделение</th>
                      <th colSpan={2}>Принятые на работу (Новые)</th>
                      <th colSpan={2}>Уволенные</th>
                      <th colSpan={2}>Перемещенные (Прибывшие)</th>
                      <th colSpan={2}>Перемещенные (Ушедшие)</th>
                    </tr>
                    <tr>
                      <th>Кол-во</th>
                      <th>Кол-во %</th>
                      <th>Кол-во</th>
                      <th>Кол-во %</th>
                      <th>Кол-во</th>
                      <th>Кол-во %</th>
                      <th>Кол-во</th>
                      <th>Кол-во %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.division}</td>
                        <td className={qtyClass(r.hired, report.extrema.hired)}>{r.hired}</td>
                        <td className={extra.pct}>{r.hiredPct}</td>
                        <td className={qtyClass(r.dismissed, report.extrema.dismissed)}>{r.dismissed}</td>
                        <td className={extra.pct}>{r.dismissedPct}</td>
                        <td className={qtyClass(r.transferIn, report.extrema.transferIn)}>{r.transferIn}</td>
                        <td className={extra.pct}>{r.transferInPct}</td>
                        <td className={qtyClass(r.transferOut, report.extrema.transferOut)}>{r.transferOut}</td>
                        <td className={extra.pct}>{r.transferOutPct}</td>
                      </tr>
                    ))}
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
