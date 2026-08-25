'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx, type XlsxCell } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import empS from '../employees/page.module.css';
import att from '../attendance-overview/page.module.css';
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
  name?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  n: number;
  tabNumber: string;
  employee: string;
  pinfl: string;
  inn: string;
  inps: string;
  division: string;
  position: string;
  grade: string;
  salary: number;
  plannedSalary: number;
  workedDays: number;
  workedHours: number;
  openingBalance: number;
  accruedBase: number;
  accruedOther: number;
  accruedTotal: number;
  taxIncome: number;
  taxInps: number;
  deductionOther: number;
  fineLate: number;
  fineEarly: number;
  fineAbsent: number;
  fineSkipDay: number;
  loan: number;
  deductionTotal: number;
  advance: number;
  paymentOther: number;
  paidTotal: number;
  closingBalance: number;
  socialTax: number;
  ytdIncome: number;
  ytdIncomeTax: number;
  ytdSocialTax: number;
};
type Payload = {
  title: string;
  year: number;
  month: number;
  from: string;
  to: string;
  periodLine: string;
  generatedAt?: string;
  rows: Row[];
};

const TITLE = 'Книга начисления заработной платы';
const FILE_BASE = 'Книга-начисления-заработной-платы';
const MONTHS_LONG = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];
const MONTHS_SHORT = [
  'янв.', 'февр.', 'март', 'апр.', 'май', 'июнь',
  'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
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

const GROUP_HEADERS: { label: string; span: number }[] = [
  { label: 'Порядковый номер', span: 1 },
  { label: 'Табельный номер', span: 1 },
  { label: 'Сотрудник', span: 1 },
  { label: 'ПИНФЛ', span: 1 },
  { label: 'ИНН', span: 1 },
  { label: 'ИНПС', span: 1 },
  { label: 'Подразделение', span: 1 },
  { label: 'Должность', span: 1 },
  { label: 'Разряд', span: 1 },
  { label: 'Оклад, сум', span: 1 },
  { label: 'Плановый оклад', span: 1 },
  { label: 'Отработано', span: 2 },
  { label: 'Сальдо на начало', span: 1 },
  { label: 'Начислено, сум', span: 3 },
  { label: 'Удержано, сум', span: 9 },
  { label: 'Оплата, сум', span: 3 },
  { label: 'Сальдо на конец', span: 1 },
  { label: 'Социальный налог', span: 1 },
  { label: 'Доход с начала года', span: 1 },
  { label: 'Налог на доходы с начала года', span: 1 },
  { label: 'Социальный налог с начала года', span: 1 },
];

const SUB_ONLY = [
  'дней', 'часов',
  'По окладу', 'Прочие начисления', 'Всего',
  'Налог на доходы', 'В том числе ИНПС', 'Прочие удержания',
  'Штрафное время за опоздание', 'Штрафное время за ранний уход',
  'Штраф за отсутствие', 'Штраф за пропуск дня', 'Заем', 'Всего',
  'Аванс', 'Прочие', 'Всего выплачено',
];

const SUB_HEADERS = [
  'Порядковый номер', 'Табельный номер', 'Сотрудник', 'ПИНФЛ', 'ИНН', 'ИНПС',
  'Подразделение', 'Должность', 'Разряд', 'Оклад, сум', 'Плановый оклад',
  'дней', 'часов', 'Сальдо на начало',
  'По окладу', 'Прочие начисления', 'Всего',
  'Налог на доходы', 'В том числе ИНПС', 'Прочие удержания',
  'Штрафное время за опоздание', 'Штрафное время за ранний уход',
  'Штраф за отсутствие', 'Штраф за пропуск дня', 'Заем', 'Всего',
  'Аванс', 'Прочие', 'Всего выплачено',
  'Сальдо на конец', 'Социальный налог', 'Доход с начала года',
  'Налог на доходы с начала года', 'Социальный налог с начала года',
];

const GROUPED = new Set(['Отработано', 'Начислено, сум', 'Удержано, сум', 'Оплата, сум']);

function money(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function empName(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
}

function empKind(t?: string) {
  if (!t) return 'Основное место работы';
  const x = t.toLowerCase();
  if (x === 'gph') return 'ГПХ';
  if (x.includes('совм') || x === 'part_time' || x === 'secondary') return 'Совместительство';
  return 'Основное место работы';
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

function rowCells(r: Row): (string | number)[] {
  return [
    r.n, r.tabNumber, r.employee, r.pinfl, r.inn, r.inps, r.division, r.position, r.grade,
    r.salary, r.plannedSalary, r.workedDays, r.workedHours, r.openingBalance,
    r.accruedBase, r.accruedOther, r.accruedTotal,
    r.taxIncome, r.taxInps, r.deductionOther, r.fineLate, r.fineEarly, r.fineAbsent, r.fineSkipDay, r.loan, r.deductionTotal,
    r.advance, r.paymentOther, r.paidTotal, r.closingBalance, r.socialTax, r.ytdIncome, r.ytdIncomeTax, r.ytdSocialTax,
  ];
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
    <div className={s.monthWrap} ref={wrapRef}>
      <button type="button" className={s.monthBtn} onClick={() => setOpen((v) => !v)}>
        <span>{MONTHS_LONG[month - 1]} {year}</span>
        <i className="fa fa-calendar" aria-hidden />
      </button>
      {open ? (
        <div className={s.monthPopup}>
          <div className={s.monthYear}>
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Предыдущий год">‹</button>
            <span>{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="Следующий год">›</button>
          </div>
          <div className={s.monthGrid}>
            {MONTHS_SHORT.map((label, i) => {
              const m = i + 1;
              const on = viewYear === year && m === month;
              return (
                <button
                  type="button"
                  key={label}
                  className={on ? `${s.monthCell} ${s.monthOn}` : s.monthCell}
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
            <button type="button" className={extra.exp} onClick={() => setOpen((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            })}>
              {expanded ? '−' : '+'}
            </button>
          ) : <span className={extra.exp} />}
          <input type="checkbox" className={att.box} checked={selected.has(node.id)} onChange={() => toggleOne(node.id)} />
          <button type="button" className={selected.has(node.id) ? `${att.treeName} ${att.treeNameOn}` : att.treeName} onClick={() => toggleOne(node.id)}>
            {node.name}
          </button>
          {kids.length ? <button type="button" className={treeS.selectAll} onClick={() => selectBranch(node)}>выбрать все</button> : null}
        </div>
        {expanded ? kids.map((c) => <Row key={c.id} node={c} depth={depth + 1} />) : null}
      </>
    );
  }
  return (
    <div className={`${att.dropWrap}${menuOpen ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.size ? '' : ` ${att.dropEmpty}`}`} onClick={() => setMenuOpen((v) => { if (v) setQ(''); return !v; })}>
        {selected.size ? `${selected.size} выбранных` : 'Поиск...'}
      </button>
      <div className={att.dropPanel} hidden={!menuOpen}>
        {menuOpen ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {visible.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {visible.map((n) => <Row key={n.id} node={n} depth={0} />)}
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
      <button type="button" className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => { if (v) setQ(''); return !v; })}>
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
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>Показать все</button>
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
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)} ${empKind(o.employmentType)}`.toLowerCase().includes(needle))
      : options;
    return showAll || needle ? list : list.slice(0, 8);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => { if (v) setQ(''); return !v; })}>
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={`${att.dropPanel} ${att.empWide}`} hidden={!open}>
        {open ? (
          <>
            <input className={att.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className={att.empHead} style={{ gridTemplateColumns: '28px 140px 1fr 1fr' }}>
              <span />
              <span>Табельный номер</span>
              <span>Сотрудник</span>
              <span>Вид занятости</span>
            </div>
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${att.empRow} ${att.empOn}` : att.empRow} style={{ gridTemplateColumns: '28px 140px 1fr 1fr' }} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.tabNumber || '—'}</span>
                  <span>{empName(o)}</span>
                  <span>{empKind(o.employmentType)}</span>
                </button>
              );
            })}
            {!showAll && !q.trim() && options.length > 8 ? (
              <button type="button" className={att.showAll} onClick={() => setShowAll(true)}>Показать все</button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function csvText(report: Payload) {
  const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const top = GROUP_HEADERS.flatMap((g) => Array.from({ length: g.span }, () => g.label));
  const lines = [
    `${q(report.periodLine)};${';'.repeat(33)}`,
    top.map(q).join(';'),
    SUB_HEADERS.map(q).join(';'),
    ...report.rows.map((r) => rowCells(r).map((v) => q(String(v))).join(';')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  const top = GROUP_HEADERS.flatMap((g) => Array.from({ length: g.span }, () => g.label));
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([report.periodLine, ...Array(33).fill('')])}
${row(top)}
${row(SUB_HEADERS)}
${report.rows.map((r) => row(rowCells(r).map(String))).join('\n')}
</t>
`;
}

function printHtml(report: Payload) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const head1 = GROUP_HEADERS.map((g) =>
    GROUPED.has(g.label)
      ? `<th colspan="${g.span}">${escapeHtml(g.label)}</th>`
      : `<th rowspan="2">${escapeHtml(g.label)}</th>`,
  ).join('');
  const head2 = SUB_ONLY.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = report.rows
    .map((r) => {
      const cells = rowCells(r);
      return `<tr>${cells
        .map((v, i) => {
          const cls = i === 2 || i === 6 || i === 7 ? 'name' : i >= 9 ? 'num' : '';
          const text = typeof v === 'number' && i >= 9 && i !== 11 && i !== 12 ? money(v) : String(v);
          return `<td class="${cls}">${escapeHtml(text)}</td>`;
        })
        .join('')}</tr>`;
    })
    .join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:10px}
th,td{border:1px solid #cfd3da;padding:2px 4px;white-space:nowrap;text-align:center}
th{background:#5e6278;color:#fff}
.name{text-align:left;white-space:normal}
.num{text-align:right}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(report.periodLine)}</div>
<div class="wrap"><table><thead><tr>${head1}</tr><tr>${head2}</tr></thead>
<tbody>${body || `<tr><td colspan="34">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
}

export default function PayrollBookReportPage() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>('filter');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [divisionIds, setDivisionIds] = useState<Set<string>>(new Set());
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
          apiFetch<{ positions?: Opt[]; employees?: Opt[] }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setTree(divisions);
        setPositions(
          mergeOpts(
            (lookups.positions || []).map((p) => ({ id: p.id, label: (p.label || p.name || p.id).toUpperCase() })),
            EXTRA_POSITIONS,
          ),
        );
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
      } catch {
        /* optional */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('year', String(year));
    p.set('month', String(month));
    if (divisionIds.size) p.set('divisionIds', [...divisionIds].join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [year, month, divisionIds, positionIds, employeeIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/payroll-book?${queryQs}`);
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
    const top = GROUP_HEADERS.flatMap((g) => Array.from({ length: g.span }, () => g.label));
    const rows: XlsxCell[][] = payload.rows.map((r) =>
      rowCells(r).map((v, i) => (typeof v === 'number' && i >= 9 && i !== 11 && i !== 12 ? money(v) : v)),
    );
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: 'Книга начисления заработной платы',
      preamble: [payload.periodLine],
      topHeader: top,
      columns: SUB_HEADERS,
      rows,
      colWidths: [8, 12, 32, 14, 12, 12, 20, 16, 10, 12, 12, 8, 8, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 10, 12, 10, 10, 12, 12, 12, 12, 12, 12],
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
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void openHtml()}>HTML</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>EXCEL</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportCsv(d))}>CSV</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportXml(d))}>XML</button>
    </div>
  );

  function renderRow(r: Row) {
    const cells = rowCells(r);
    return (
      <tr key={r.n}>
        {cells.map((v, i) => {
          const cls = i === 2 || i === 6 || i === 7 ? s.name : i >= 9 ? s.num : undefined;
          const text = typeof v === 'number' && i >= 9 && i !== 11 && i !== 12 ? money(v) : String(v ?? '');
          return (
            <td key={i} className={cls}>
              {text}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>{TITLE}</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>ФИЛЬТР</button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report) void generate();
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
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Месяц <span className={s.req}>*</span></label>
            <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
          <div className={layout.field}>
            <label>Подразделение</label>
            <DivisionPick nodes={tree} selected={divisionIds} onChange={setDivisionIds} />
          </div>
          <div className={layout.field}>
            <label>Должность</label>
            <FilterPick options={positions} selected={positionIds} onChange={setPositionIds} />
          </div>
          <div className={layout.field}>
            <label>Сотрудник</label>
            <EmpPick options={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Генерировать'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала сформируйте отчёт на вкладке «ФИЛЬТР»</p>
          ) : (
            <>
              <p className={s.periodLine}>{report.periodLine}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {GROUP_HEADERS.map((g) =>
                        GROUPED.has(g.label) ? (
                          <th key={g.label} colSpan={g.span}>{g.label}</th>
                        ) : (
                          <th key={g.label} rowSpan={2}>{g.label}</th>
                        ),
                      )}
                    </tr>
                    <tr>
                      {SUB_ONLY.map((h, i) => (
                        <th key={`${h}-${i}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr><td className={s.empty} colSpan={34}>Нет данных</td></tr>
                    ) : (
                      report.rows.map(renderRow)
                    )}
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
