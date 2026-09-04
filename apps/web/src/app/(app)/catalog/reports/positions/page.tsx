'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadMultiSheetXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type ViewKind = 'division' | 'position' | 'divisionOnly';
type LookupOpt = { id: string; label: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };

type PosLine = {
  position: string;
  planned: number;
  reserved: number;
  occupied: number;
  available: number;
};

type DivisionGroup = {
  id: string;
  name: string;
  color: string;
  depth: number;
  planned: number;
  reserved: number;
  occupied: number;
  available: number;
  lines: PosLine[];
};

type PositionRow = {
  position: string;
  planned: number;
  occupied: number;
  available: number;
};

type DivisionOnlyRow = {
  id: string;
  name: string;
  planned: number;
  occupied: number;
  available: number;
  occupancyPct: number;
};

type Payload = {
  title: string;
  date: string;
  generatedAt?: string;
  byDivision: DivisionGroup[];
  byPosition: PositionRow[];
  byDivisionOnly: DivisionOnlyRow[];
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
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const FILE_BASE = 'Отчёт-по-позициям';
const VIEWS: { id: ViewKind; label: string }[] = [
  { id: 'division', label: 'По подразделениям' },
  { id: 'position', label: 'По должностям' },
  { id: 'divisionOnly', label: 'Только по подразделениям' },
];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function fmtRu(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function fmtDateShort(iso?: string) {
  if (!iso) return '';
  const dt = parseIso(iso);
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

function dateLine(iso?: string) {
  return `Дата: ${fmtDateShort(iso)}`;
}

function fmtGen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
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

function escapeHtml(v: string) {
  return v
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

function DatePicker({ value, onChange }: { value: string; onChange: (ymd: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(parseIso(value).getFullYear(), parseIso(value).getMonth(), 1));

  useEffect(() => {
    if (!open) return;
    setView(new Date(parseIso(value).getFullYear(), parseIso(value).getMonth(), 1));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className={extra.periodWrap} ref={wrapRef}>
      <button type="button" className={extra.periodBtn} onClick={() => setOpen((v) => !v)}>
        {fmtRu(value)}
      </button>
      {open ? (
        <div className={s.datePopup}>
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
              {MONTHS_LONG[view.getMonth()]} {view.getFullYear()}
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
            {monthCells(view).map((c, i) => {
              const on = c.ymd === value;
              const cls = on ? extra.dayOn : c.inMonth ? extra.day : extra.dayMuted;
              return (
                <button
                  type="button"
                  key={`${c.ymd}-${i}`}
                  className={cls}
                  onClick={() => {
                    onChange(c.ymd);
                    setOpen(false);
                  }}
                >
                  {Number(c.ymd.slice(8))}
                </button>
              );
            })}
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

function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children || []).flatMap(collectIds)];
}

function DivisionTree({
  nodes,
  selected,
  onChange,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const visible = useMemo(() => flattenTree(nodes, q), [nodes, q]);

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectBranch(node: TreeNode) {
    const next = new Set(selected);
    for (const id of collectIds(node)) next.add(id);
    onChange(next);
  }

  function selectVisible() {
    const next = new Set(selected);
    for (const n of visible) for (const id of collectIds(n)) next.add(id);
    onChange(next);
  }

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
          <input type="checkbox" checked={selected.has(node.id)} onChange={() => toggleOne(node.id)} />
          <span>{node.name}</span>
          {kids.length ? (
            <button type="button" className={treeS.selectAll} onClick={() => selectBranch(node)}>
              выбрать все
            </button>
          ) : null}
        </div>
        {expanded ? kids.map((c) => <Row key={c.id} node={c} depth={depth + 1} />) : null}
      </>
    );
  }

  return (
    <div>
      <div className={treeS.treeHead}>
        <button type="button" className={treeS.selectAll} onClick={selectVisible}>
          выбрать все
        </button>
      </div>
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

function divisionTableHtml(report: Payload) {
  const body = report.byDivision
    .map((g) => {
      const span = 1 + g.lines.length;
      const lines = g.lines
        .map(
          (l) =>
            `<tr><td>${escapeHtml(l.position)}</td><td class="num">${l.planned}</td><td class="num">${l.reserved}</td><td class="num">${l.occupied}</td><td class="num">${l.available}</td></tr>`,
        )
        .join('');
      return `<tr class="group" style="background:${escapeHtml(g.color)}"><td rowspan="${span}">${escapeHtml(g.name)}</td><td></td><td class="num">${g.planned}</td><td class="num">${g.reserved}</td><td class="num">${g.occupied}</td><td class="num">${g.available}</td></tr>${lines}`;
    })
    .join('');
  return `<table>
<thead><tr><th>Подразделение</th><th>Должность</th><th>Запланировано</th><th>Забронировано</th><th>Занято</th><th>Доступно</th></tr></thead>
<tbody>${body || `<tr><td colspan="6">Нет данных</td></tr>`}</tbody>
</table>`;
}

function positionTableHtml(report: Payload) {
  const body = report.byPosition
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'zebra' : ''}"><td>${escapeHtml(r.position)}</td><td class="num">${r.planned}</td><td class="num">${r.occupied}</td><td class="num">${r.available}</td></tr>`,
    )
    .join('');
  return `<table>
<thead><tr><th>Должность</th><th>Запланировано</th><th>Занято</th><th>Доступно</th></tr></thead>
<tbody>${body || `<tr><td colspan="4">Нет данных</td></tr>`}</tbody>
</table>`;
}

function divisionOnlyTableHtml(report: Payload) {
  const body = report.byDivisionOnly
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'zebra' : ''}"><td>${escapeHtml(r.name)}</td><td class="num">${r.planned}</td><td class="num">${r.occupied}</td><td class="num">${r.available}</td><td class="num">${r.occupancyPct}%</td></tr>`,
    )
    .join('');
  return `<table>
<thead><tr><th>Подразделение</th><th>Запланировано</th><th>Занято</th><th>Доступно</th><th>Укомплектованность (%)</th></tr></thead>
<tbody>${body || `<tr><td colspan="5">Нет данных</td></tr>`}</tbody>
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
.tabs{display:flex;gap:4px;padding:8px 16px 0;border-bottom:1px solid #e4e6ef}
.tab{border:0;background:transparent;padding:8px 12px;cursor:pointer;color:#5e6278;font:inherit;font-size:13px;font-weight:600}
.tab.on{color:#0a85e2;border-bottom:2px solid #0a85e2}
.meta{padding:10px 16px;font-size:13px}
.wrap{padding:0 16px 16px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #cfd3da;padding:5px 8px}
th{background:#f5f8fa}
.zebra td{background:#f9fafb}
.num{text-align:right}
tr.group td{font-weight:700}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="tabs">
<button class="tab on" data-tab="division">По подразделениям</button>
<button class="tab" data-tab="position">По должностям</button>
<button class="tab" data-tab="divisionOnly">Только по подразделениям</button>
</div>
<div class="meta">${escapeHtml(dateLine(report.date))}</div>
<div class="wrap">
<div class="panel" id="panel-division">${divisionTableHtml(report)}</div>
<div class="panel" id="panel-position" style="display:none">${positionTableHtml(report)}</div>
<div class="panel" id="panel-divisionOnly" style="display:none">${divisionOnlyTableHtml(report)}</div>
</div>
<script>
document.querySelectorAll('.tab').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab').forEach(function(b){ b.classList.remove('on'); });
    btn.classList.add('on');
    document.querySelectorAll('.panel').forEach(function(p){ p.style.display='none'; });
    var el=document.getElementById('panel-'+btn.getAttribute('data-tab'));
    if(el) el.style.display='block';
  });
});
</script>
</body></html>`;
}

function buildExcelSheets(report: Payload) {
  const mergeFirstCol: Array<[number, number]> = [];
  const rows: (string | number)[][] = [];
  const fills: (string | undefined)[] = [];
  let idx = 0;
  for (const g of report.byDivision) {
    const start = idx;
    rows.push([g.name, '', g.planned, g.reserved, g.occupied, g.available]);
    fills.push(g.color);
    idx += 1;
    for (const l of g.lines) {
      rows.push([g.name, l.position, l.planned, l.reserved, l.occupied, l.available]);
      fills.push(g.color);
      idx += 1;
    }
    mergeFirstCol.push([start, idx - 1]);
  }
  return [
    {
      name: 'По подразделениям',
      columns: ['Подразделение', 'Должность', 'Запланировано', 'Забронировано', 'Занято', 'Доступно'],
      rows,
      rowFills: fills,
      mergeFirstCol,
      colWidths: [28, 28, 14, 14, 12, 12],
    },
    {
      name: 'По должностям',
      columns: ['Должность', 'Запланировано', 'Занято', 'Доступно'],
      rows: report.byPosition.map((r) => [r.position, r.planned, r.occupied, r.available]),
      colWidths: [28, 14, 12, 12],
    },
    {
      name: 'Только по подразделениям',
      columns: ['Подразделение', 'Запланировано', 'Занято', 'Доступно', 'Укомплектованность (%)'],
      rows: report.byDivisionOnly.map((r) => [r.name, r.planned, r.occupied, r.available, `${r.occupancyPct}%`]),
      colWidths: [28, 14, 12, 12, 22],
    },
  ];
}

export default function PositionsReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [view, setView] = useState<ViewKind>('division');
  const [date, setDate] = useState(isoDay(new Date()));
  const [divisionGroupId, setDivisionGroupId] = useState('');
  const [positionGroupId, setPositionGroupId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [divisionGroups, setDivisionGroups] = useState<LookupOpt[]>([]);
  const [positionGroups, setPositionGroups] = useState<LookupOpt[]>([]);
  const [positions, setPositions] = useState<LookupOpt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{
            divisionGroups?: LookupOpt[];
            positionGroups?: LookupOpt[];
            positions?: LookupOpt[];
            divisions?: LookupOpt[];
          }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setDivisionGroups(lookups.divisionGroups || []);
        setPositionGroups(lookups.positionGroups || []);
        setPositions(lookups.positions || []);
        if (Array.isArray(divisions) && divisions.length) setTree(divisions);
        else setTree((lookups.divisions || []).map((d) => ({ id: d.id, name: d.label, children: [] })));
      } catch {
        /* ignore bootstrap */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    if (divisionGroupId) p.set('divisionGroupId', divisionGroupId);
    if (selected.size) p.set('divisionIds', [...selected].join(','));
    if (positionGroupId) p.set('positionGroupId', positionGroupId);
    if (positionId) p.set('positionId', positionId);
    return p.toString();
  }, [date, divisionGroupId, selected, positionGroupId, positionId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/positions?${queryQs}`);
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
    await downloadMultiSheetXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      dateLine: dateLine(payload.date),
      sheets: buildExcelSheets(payload),
    });
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
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчёт по позициям</h1>
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
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
          <div className={s.stack}>
            <div className={layout.field}>
              <label>Период</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className={layout.field}>
              <label>Группы подразделений</label>
              <div className={s.lookup}>
                <SearchLookup
                  value={divisionGroupId}
                  options={divisionGroups}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setDivisionGroupId}
                />
              </div>
            </div>
            <div className={layout.field}>
              <label>Подразделения</label>
              <DivisionTree nodes={tree} selected={selected} onChange={setSelected} />
            </div>
            <div className={layout.field}>
              <label>Группы должностей</label>
              <div className={s.lookup}>
                <SearchLookup
                  value={positionGroupId}
                  options={positionGroups}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setPositionGroupId}
                />
              </div>
            </div>
            <div className={layout.field}>
              <label>Должности</label>
              <div className={s.lookup}>
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
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns()}
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
              <div className={s.subtabs}>
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={view === v.id ? s.subOn : s.sub}
                    onClick={() => setView(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className={layout.dateLine}>{dateLine(report.date)}</p>
              {view === 'division' ? <DivisionTable groups={report.byDivision} /> : null}
              {view === 'position' ? <PositionTable rows={report.byPosition} /> : null}
              {view === 'divisionOnly' ? <DivisionOnlyTable rows={report.byDivisionOnly} /> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DivisionTable({ groups }: { groups: DivisionGroup[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Подразделение</th>
            <th>Должность</th>
            <th>Запланировано</th>
            <th>Забронировано</th>
            <th>Занято</th>
            <th>Доступно</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td className={layout.muted} colSpan={6}>
                Нет данных
              </td>
            </tr>
          ) : (
            groups.map((g) => {
              const span = 1 + g.lines.length;
              return (
                <FragmentGroup key={g.id} group={g} span={span} />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({ group, span }: { group: DivisionGroup; span: number }) {
  return (
    <>
      <tr className={s.groupRow} style={{ background: group.color }}>
        <td className={s.divCell} rowSpan={span} style={{ background: group.color }}>
          {group.name}
        </td>
        <td />
        <td className={s.num}>{group.planned}</td>
        <td className={s.num}>{group.reserved}</td>
        <td className={s.num}>{group.occupied}</td>
        <td className={s.num}>{group.available}</td>
      </tr>
      {group.lines.map((l) => (
        <tr key={`${group.id}-${l.position}`}>
          <td className={s.posCell}>{l.position}</td>
          <td className={s.num}>{l.planned}</td>
          <td className={s.num}>{l.reserved}</td>
          <td className={s.num}>{l.occupied}</td>
          <td className={s.num}>{l.available}</td>
        </tr>
      ))}
    </>
  );
}

function PositionTable({ rows }: { rows: PositionRow[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Должность</th>
            <th>Запланировано</th>
            <th>Занято</th>
            <th>Доступно</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={layout.muted} colSpan={4}>
                Нет данных
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.position} className={i % 2 ? s.zebra : undefined}>
                <td className={s.posCell}>{r.position}</td>
                <td className={s.num}>{r.planned}</td>
                <td className={s.num}>{r.occupied}</td>
                <td className={s.num}>{r.available}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DivisionOnlyTable({ rows }: { rows: DivisionOnlyRow[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Подразделение</th>
            <th>Запланировано</th>
            <th>Занято</th>
            <th>Доступно</th>
            <th>Укомплектованность (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={layout.muted} colSpan={5}>
                Нет данных
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.id} className={i % 2 ? s.zebra : undefined}>
                <td className={s.posCell}>{r.name}</td>
                <td className={s.num}>{r.planned}</td>
                <td className={s.num}>{r.occupied}</td>
                <td className={s.num}>{r.available}</td>
                <td className={s.num}>{r.occupancyPct}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
