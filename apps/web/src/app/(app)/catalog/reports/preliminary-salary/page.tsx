'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import empS from '../employees/page.module.css';
import att from '../attendance-overview/page.module.css';
import local from './page.module.css';

type Tab = 'filter' | 'view';
type Opt = { id: string; label: string; tabNumber?: string; lastName?: string; firstName?: string; middleName?: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  n: number;
  employeeId: string;
  employee: string;
  division: string;
  position: string;
  schedule: string;
  accrued: number;
  deduction: number;
  total: number;
  paid: number;
  remaining: number;
};
type Payload = {
  title: string;
  year: number;
  month: number;
  periodLine: string;
  from: string;
  to: string;
  generatedAt?: string;
  rows: Row[];
  totals: { accrued: number; deduction: number; total: number; paid: number; remaining: number; count: number };
};

const TITLE = 'Отчет по предварительному окладу';
const FILE_BASE = 'Отчет-по-предварительному-окладу';
const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_TITLE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function empName(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
}
function flattenTree(nodes: TreeNode[], q: string): TreeNode[] {
  const qq = q.trim().toLowerCase();
  const walk = (list: TreeNode[]): TreeNode[] =>
    list
      .map((n) => {
        const kids = walk(n.children || []);
        if (!qq || n.name.toLowerCase().includes(qq) || kids.length) return { ...n, children: kids };
        return null;
      })
      .filter(Boolean) as TreeNode[];
  return walk(nodes);
}
function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children || []).flatMap(collectIds)];
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
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
/** 3-digit grouping; zero stays plain 0 (Verifix). */
function money(n: number) {
  const v = Number(n) || 0;
  if (!v) return '0';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function MonthPicker({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  useEffect(() => {
    if (open) setViewYear(year);
  }, [open, year]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className={local.monthWrap} ref={wrapRef}>
      <button type="button" className={local.monthBtn} onClick={() => setOpen((v) => !v)}>
        <span>
          {MONTHS_TITLE[month - 1]} {year}
        </span>
        <i className="fa fa-calendar" aria-hidden />
      </button>
      {open ? (
        <div className={local.monthPopup}>
          <div className={local.monthYear}>
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Предыдущий год">
              ‹
            </button>
            <span>{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="Следующий год">
              ›
            </button>
          </div>
          <div className={local.monthGrid}>
            {MONTHS_SHORT.map((label, i) => {
              const m = i + 1;
              const on = viewYear === year && m === month;
              return (
                <button
                  type="button"
                  key={label}
                  className={on ? `${local.monthCell} ${local.monthOn}` : local.monthCell}
                  onClick={() => {
                    onChange(viewYear, m);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DivisionPick({
  nodes,
  selected,
  onChange,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setQ('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);
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
  function Row({ node, depth }: { node: TreeNode; depth: number }) {
    const kids = node.children || [];
    const expanded = open.has(node.id) || !!q || depth === 0;
    return (
      <>
        <div className={`${extra.treeRow} ${selected.has(node.id) ? att.treeOn : ''}`} style={{ paddingLeft: depth * 14 }}>
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
          <input type="checkbox" className={att.box} checked={selected.has(node.id)} onChange={() => toggleOne(node.id)} />
          <button
            type="button"
            className={selected.has(node.id) ? `${att.treeName} ${att.treeNameOn}` : att.treeName}
            onClick={() => toggleOne(node.id)}
          >
            {node.name}
          </button>
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
    <div className={`${att.dropWrap}${menuOpen ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${att.dropField}${selected.size ? '' : ` ${att.dropEmpty}`}`}
        onClick={() =>
          setMenuOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.size ? `${selected.size} выбранных` : 'Поиск...'}
      </button>
      <div className={att.dropPanel} hidden={!menuOpen}>
        {menuOpen ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {visible.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {visible.map((n) => (
              <Row key={n.id} node={n} depth={0} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function FilterPick({
  options,
  selected,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return showAll || needle ? list : list.slice(0, 8);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`}
        onClick={() =>
          setOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={att.dropPanel} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${att.listRow} ${att.listOn}` : att.listRow} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.label}</span>
                </button>
              );
            })}
            {!showAll && !q.trim() && options.length > 8 ? (
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>
                Показать все
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmpPick({
  options,
  selected,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)}`.toLowerCase().includes(needle))
      : options;
    return showAll || needle ? list : list.slice(0, 8);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`}
        onClick={() =>
          setOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={`${att.dropPanel} ${att.empWide}`} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className={att.empHead} style={{ gridTemplateColumns: '28px 140px 1fr' }}>
              <span />
              <span>Табельный номер</span>
              <span>Сотрудник</span>
            </div>
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  type="button"
                  key={o.id}
                  className={on ? `${att.empRow} ${att.empOn}` : att.empRow}
                  style={{ gridTemplateColumns: '28px 140px 1fr' }}
                  onClick={() => toggle(o.id)}
                >
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.tabNumber || '—'}</span>
                  <span>{empName(o)}</span>
                </button>
              );
            })}
            {!showAll && !q.trim() && options.length > 8 ? (
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>
                Показать все
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function PreliminarySalaryReportPage() {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>('filter');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{ employees?: Opt[]; positions?: Opt[] }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
        positions: [] as Opt[],
      }));
      let emps = lookups.employees || [];
      if (!emps.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/employees?limit=500').catch(() => [] as Opt[]);
        emps = Array.isArray(raw) ? raw : raw.items || [];
      }
      setEmployees(
        emps
          .map((e) => ({ ...e, tabNumber: e.tabNumber || '', label: empName(e) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
      let pos = lookups.positions || [];
      if (!pos.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/catalog/positions?limit=500').catch(() => [] as Opt[]);
        pos = Array.isArray(raw) ? raw : raw.items || [];
      }
      setPositions(
        pos
          .map((p) => ({ ...p, label: (p.label || '').toUpperCase() || p.id }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('year', String(year));
    p.set('month', String(month));
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [year, month, divisionIds, positionIds, employeeIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/preliminary-salary?${queryQs}`);
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

  function moneyCells(r: Pick<Row, 'accrued' | 'deduction' | 'total' | 'paid' | 'remaining'>) {
    return [money(r.accrued), money(r.deduction), money(r.total), money(r.paid), money(r.remaining)];
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: 'Отчет по предварительному оклад',
      preamble: [payload.periodLine, ''],
      topHeader: ['№', 'Сотрудник', 'Подразделение', 'Должность', 'График работы', 'К оплате', '', '', 'Выплачено', 'Осталось'],
      columns: ['№', 'Сотрудник', 'Подразделение', 'Должность', 'График работы', 'Начисление', 'Удержание', 'ИТОГО', 'Выплачено', 'Осталось'],
      rows: [
        ...payload.rows.map((r) => [r.n, r.employee, r.division, r.position, r.schedule, ...moneyCells(r)]),
        ['ИТОГО', '', '', '', '', ...moneyCells(payload.totals)],
      ],
      colWidths: [6, 36, 22, 18, 28, 14, 12, 14, 12, 14],
    });
  }

  function csvText(data: Payload) {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['№', 'Сотрудник', 'Подразделение', 'Должность', 'График работы', 'Начисление', 'Удержание', 'ИТОГО', 'Выплачено', 'Осталось'];
    const lines = [
      data.periodLine,
      head.map(q).join(';'),
      ...data.rows.map((r) => [r.n, r.employee, r.division, r.position, r.schedule, ...moneyCells(r)].map(q).join(';')),
      ['ИТОГО', '', '', '', '', ...moneyCells(data.totals)].map(q).join(';'),
    ];
    return `\ufeff${lines.join('\n')}`;
  }

  function xmlText(data: Payload) {
    const body = data.rows
      .map(
        (r) =>
          `<row n="${r.n}" employee="${escapeHtml(r.employee)}" division="${escapeHtml(r.division)}" position="${escapeHtml(r.position)}" schedule="${escapeHtml(r.schedule)}" accrued="${r.accrued}" deduction="${r.deduction}" total="${r.total}" paid="${r.paid}" remaining="${r.remaining}"/>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}" year="${data.year}" month="${data.month}" accrued="${data.totals.accrued}" deduction="${data.totals.deduction}" total="${data.totals.total}" paid="${data.totals.paid}" remaining="${data.totals.remaining}">${body}</report>`;
  }

  function printHtml(data: Payload) {
    const body = data.rows
      .map(
        (r) =>
          `<tr><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td><td class="name">${escapeHtml(r.division)}</td><td class="name">${escapeHtml(r.position)}</td><td class="name">${escapeHtml(r.schedule)}</td><td class="num">${money(r.accrued)}</td><td class="num">${money(r.deduction)}</td><td class="num">${money(r.total)}</td><td class="num">${money(r.paid)}</td><td class="num">${money(r.remaining)}</td></tr>`,
      )
      .join('');
    const foot = `<tr class="total"><td colspan="5">ИТОГО</td><td class="num">${money(data.totals.accrued)}</td><td class="num">${money(data.totals.deduction)}</td><td class="num">${money(data.totals.total)}</td><td class="num">${money(data.totals.paid)}</td><td class="num">${money(data.totals.remaining)}</td></tr>`;
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.wrap{padding:16px}
.meta{text-align:center;margin:0.5rem 0;font-size:13px}
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}
.num{text-align:right}
.total td{font-weight:700;background:#f5f6f8}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p class="meta">${escapeHtml(data.periodLine)}</p>
<div class="wrap"><table>
<thead>
<tr><th rowspan="2">№</th><th rowspan="2">Сотрудник</th><th rowspan="2">Подразделение</th><th rowspan="2">Должность</th><th rowspan="2">График работы</th><th colspan="3">К оплате</th><th rowspan="2">Выплачено</th><th rowspan="2">Осталось</th></tr>
<tr><th>Начисление</th><th>Удержание</th><th>ИТОГО</th></tr>
</thead>
<tbody>${body || ''}${foot}</tbody>
</table></div></body></html>`;
  }

  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    if (!w) {
      downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).html`, new Blob([printHtml(data)], { type: 'text/html;charset=utf-8' }));
      return;
    }
    w.document.open();
    w.document.write(printHtml(data));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    w.document.getElementById('btnExcel')?.addEventListener('click', () => void exportExcel(data));
  }

  const exportBtns = (ghost = false) => (
    <div className={ghost ? layout.exportBtns : extra.exportLinks}>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void openHtml()}>
        HTML
      </button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>
        EXCEL
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() =>
          void ensureReport().then(
            (d) => d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).csv`, new Blob([csvText(d)], { type: 'text/csv;charset=utf-8' })),
          )
        }
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() =>
          void ensureReport().then(
            (d) =>
              d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).xml`, new Blob([xmlText(d)], { type: 'application/xml;charset=utf-8' })),
          )
        }
      >
        XML
      </button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>{TITLE}</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>
          ФИЛЬТР
        </button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report || loadedQs !== queryQs) void generate();
          }}
        >
          ПРОСМОТР
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
        <form className={`${layout.card} ${local.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>
              Месяц <span className={local.req}>*</span>
            </label>
            <MonthPicker
              year={year}
              month={month}
              onChange={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
            />
          </div>
          <div className={layout.field}>
            <label>Подразделение</label>
            <DivisionPick nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
          </div>
          <div className={layout.field}>
            <label>Должности</label>
            <FilterPick options={positions} selected={positionIds} onChange={setPositionIds} />
          </div>
          <div className={layout.field}>
            <label>Сотрудники</label>
            <EmpPick options={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : null}

      {tab === 'view' ? (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала сформируйте отчёт на вкладке «ФИЛЬТР»</p>
          ) : (
            <>
              <p className={local.meta}>{report.periodLine}</p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>№</th>
                      <th rowSpan={2}>Сотрудник</th>
                      <th rowSpan={2}>Подразделение</th>
                      <th rowSpan={2}>Должность</th>
                      <th rowSpan={2}>График работы</th>
                      <th colSpan={3}>К оплате</th>
                      <th rowSpan={2}>Выплачено</th>
                      <th rowSpan={2}>Осталось</th>
                    </tr>
                    <tr>
                      <th>Начисление</th>
                      <th>Удержание</th>
                      <th>ИТОГО</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className={local.empty} colSpan={10}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r) => (
                        <tr key={r.employeeId}>
                          <td>{r.n}</td>
                          <td className={local.name}>{r.employee}</td>
                          <td className={local.name}>{r.division}</td>
                          <td className={local.name}>{r.position}</td>
                          <td className={local.name}>{r.schedule}</td>
                          <td className={local.num}>{money(r.accrued)}</td>
                          <td className={local.num}>{money(r.deduction)}</td>
                          <td className={local.num}>{money(r.total)}</td>
                          <td className={local.num}>{money(r.paid)}</td>
                          <td className={local.num}>{money(r.remaining)}</td>
                        </tr>
                      ))
                    )}
                    <tr className={local.totalRow}>
                      <td colSpan={5}>ИТОГО</td>
                      <td className={local.num}>{money(report.totals.accrued)}</td>
                      <td className={local.num}>{money(report.totals.deduction)}</td>
                      <td className={local.num}>{money(report.totals.total)}</td>
                      <td className={local.num}>{money(report.totals.paid)}</td>
                      <td className={local.num}>{money(report.totals.remaining)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
