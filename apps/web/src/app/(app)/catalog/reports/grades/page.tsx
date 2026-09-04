'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import posS from '../positions/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  employmentType?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  n: number;
  employee: string;
  division: string;
  position: string;
  slot: string;
  prevDate: string;
  prevGrade: string;
  date: string;
  grade: string;
};
type Payload = {
  title: string;
  date: string;
  dateLabel: string;
  generatedAt?: string;
  rows: Row[];
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
const FILE_BASE = 'Отчет-по-разрядам';
const COLUMNS = [
  '№',
  'Сотрудник',
  'Подразделение',
  'Должность',
  'Позиция',
  'Предыдущая дата',
  'Предыдущий разряд',
  'Дата',
  'Действующий разряд',
];
const EXTRA_POSITIONS: Opt[] = [
  { id: 'ANALITIK', label: 'ANALITIK' },
  { id: 'AUDIT OPERATOR', label: 'AUDIT OPERATOR' },
  { id: 'AUDITOR', label: 'AUDITOR' },
  { id: 'BIZNES ANALITIK', label: 'BIZNES ANALITIK' },
  { id: 'BIZNES TRENER', label: 'BIZNES TRENER' },
  { id: 'BRAND MANAGER', label: 'BRAND MANAGER' },
  { id: 'BUXGALTER', label: 'BUXGALTER' },
  { id: 'CEO', label: 'CEO' },
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
function empTypeLabel(t?: string) {
  if (t === 'gph') return 'Договор ГПХ';
  return 'Основное место работы';
}
function empName(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
}
function mergeOpts(base: Opt[], extra: Opt[]) {
  const seen = new Set(base.map((o) => o.label.toLowerCase()));
  const out = [...base];
  for (const o of extra) {
    if (!seen.has(o.label.toLowerCase())) {
      seen.add(o.label.toLowerCase());
      out.push(o);
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
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
function rowValues(r: Row) {
  return [String(r.n), r.employee, r.division, r.position, r.slot, r.prevDate, r.prevGrade, r.date, r.grade];
}
function csvText(report: Payload) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return `\uFEFF${[`Период: ${report.dateLabel}`, '', COLUMNS.map(q).join(';'), ...report.rows.map((r) => rowValues(r).map(q).join(';'))].join('\n')}`;
}
function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([`Период: ${report.dateLabel}`])}
${row(COLUMNS)}
${report.rows.map((r) => row(rowValues(r))).join('\n')}
</t>
`;
}
function printHtml(report: Payload) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'z' : ''}"><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td><td>${escapeHtml(r.division)}</td><td>${escapeHtml(r.position)}</td><td>${escapeHtml(r.slot)}</td><td>${escapeHtml(r.prevDate)}</td><td>${escapeHtml(r.prevGrade)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.grade)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:12px;width:100%}
th,td{border:1px solid #cfd3da;padding:4px 8px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.z td{background:#f9fafb}
.name{text-align:left}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? `(${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">Период: ${escapeHtml(report.dateLabel)}</div>
<div class="wrap"><table><thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${COLUMNS.length}">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={extra.periodWrap} ref={wrapRef}>
      <button type="button" className={s.periodBtn} onClick={() => setOpen((v) => !v)}>
        {fmtRu(value)}
      </button>
      {open ? (
        <div className={posS.datePopup}>
          <div className={extra.calHead}>
            <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
              ‹
            </button>
            <span>
              {MONTHS_LONG[view.getMonth()]} {view.getFullYear()}
            </span>
            <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
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
        if (!qq || n.name.toLowerCase().includes(qq) || kids.length) return { ...n, children: kids };
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
      <input className={extra.treeSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={`${extra.treeBox} ${s.treeTall}`}>
        {visible.map((n) => (
          <Row key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return wrapRef;
}

function FilterPick({
  options,
  selected,
  placeholder,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  placeholder?: string;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
    setShowAll(false);
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return showAll ? list : list.slice(0, 12);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  const summary = selected.length ? `Выбрано: ${selected.length}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder={placeholder || 'Поиск...'}
        value={open ? q : summary}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className={s.pickMenu}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button type="button" key={o.id} className={selected.includes(o.id) ? `${s.pickOpt} ${s.pickOptOn}` : s.pickOpt} onClick={() => toggle(o.id)}>
              <input type="checkbox" readOnly checked={selected.includes(o.id)} />
              {o.label}
            </button>
          ))}
          {!showAll && options.length > 12 ? (
            <button type="button" className={s.pickAll} onClick={() => setShowAll(true)}>
              Показать все
            </button>
          ) : null}
        </div>
      ) : null}
      {selected.length && !open ? (
        <div className={s.chips}>
          {selected.slice(0, 4).map((id) => {
            const label = options.find((o) => o.id === id)?.label || id;
            return (
              <button key={id} type="button" className={s.chip} onClick={() => toggle(id)}>
                {label} ×
              </button>
            );
          })}
        </div>
      ) : null}
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
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
    setShowAll(false);
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)} ${empTypeLabel(o.employmentType)}`.toLowerCase().includes(needle))
      : options;
    return showAll ? list : list.slice(0, 12);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  const summary = selected.length ? `Выбрано: ${selected.length}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder="Поиск..."
        value={open ? q : summary}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className={`${s.pickMenu} ${s.pickMenuWide}`}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className={s.empHead}>
            <span />
            <span>Табельный номер</span>
            <span>Сотрудник</span>
            <span>Вид занятости</span>
          </div>
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button
              type="button"
              key={o.id}
              className={selected.includes(o.id) ? `${s.empRow} ${s.empOn}` : s.empRow}
              onClick={() => toggle(o.id)}
            >
              <input type="checkbox" readOnly checked={selected.includes(o.id)} />
              <span>{o.tabNumber || ''}</span>
              <span>{empName(o)}</span>
              <span>{empTypeLabel(o.employmentType)}</span>
            </button>
          ))}
          {!showAll && options.length > 12 ? (
            <button type="button" className={s.pickAll} onClick={() => setShowAll(true)}>
              Показать все
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function GradesReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [filterByDept, setFilterByDept] = useState(true);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{ employees?: Opt[]; positions?: Opt[] }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setTree(divisions);
        setPositions(mergeOpts(lookups.positions || [], EXTRA_POSITIONS));
        setEmployees(
          (lookups.employees || [])
            .map((e) => ({ ...e, label: empName(e) }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
        );
      } catch {
        /* optional */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('date', date);
    if (filterByDept && divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    p.set('filterByDept', filterByDept ? '1' : '0');
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [date, divisionIds, filterByDept, positionIds, employeeIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/grades?${queryQs}`);
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
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: 'Отчет по разрядам',
      preamble: [`Период: ${payload.dateLabel}`],
      columns: COLUMNS,
      rows: payload.rows.map(rowValues),
      colWidths: [6, 40, 22, 18, 28, 16, 18, 12, 20],
    });
  }
  function exportCsv(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`, new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }));
  }
  function exportXml(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).xml`, new Blob([xmlText(data)], { type: 'application/xml;charset=utf-8' }));
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
        Excel
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportCsv(d))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportXml(d))}
      >
        XML
      </button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет по разрядам</h1>
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
          Просмотр
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
          <div className={layout.field}>
            <label>Период</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className={layout.field}>
            <div className={s.labelRow}>
              <label>Подразделение</label>
              <button type="button" className={s.switchBtn} onClick={() => setFilterByDept((v) => !v)}>
                <span>Фильтровать по Департаментам</span>
                <span className={filterByDept ? `${s.switch} ${s.switchOn}` : s.switch}>
                  <span className={s.knob} />
                </span>
              </button>
            </div>
            <DivisionTree nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
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
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <p className={s.periodLine}>Период: {report.dateLabel}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className={s.empty} colSpan={COLUMNS.length}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={`${r.n}-${r.employee}`} className={i % 2 ? s.zebra : undefined}>
                          <td>{r.n}</td>
                          <td className={s.rowName}>{r.employee}</td>
                          <td>{r.division}</td>
                          <td>{r.position}</td>
                          <td>{r.slot}</td>
                          <td>{r.prevDate}</td>
                          <td>{r.prevGrade}</td>
                          <td>{r.date}</td>
                          <td>{r.grade}</td>
                        </tr>
                      ))
                    )}
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
