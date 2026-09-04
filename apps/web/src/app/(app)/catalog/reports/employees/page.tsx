'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import posS from '../positions/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view' | 'settings';
type Opt = { id: string; label: string; lastName?: string; firstName?: string; middleName?: string; name?: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  n: number;
  fullName: string;
  hiredAt: string;
  code: string;
  divisionGroup: string;
  division: string;
  position: string;
  staffPosition: string;
  salary: number | null;
  grade: string;
  gender: string;
  region: string;
  inps: string;
  pinfl: string;
  inn: string;
  birthDate: string;
  address: string;
  phone: string;
  schedule: string;
  passport: string;
  passportIssuer: string;
  educationType: string;
  educationInstitution: string;
  educationSpecialty: string;
  educationCourse: string;
  familyRelation: string;
  familyName: string;
};
type Payload = {
  title: string;
  date: string;
  dateLabel: string;
  generatedAt?: string;
  totalSalary: number;
  rows: Row[];
};
type Leaf = { id: string; key: keyof Row; label: string; group?: string; sub?: string };

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
const FILE_BASE = 'Отчет-по-сотрудникам';
const SETTINGS_KEY = 'hr-hub-employees-report-settings';
const SETTINGS_FIELDS: { id: string; label: string }[] = [
  { id: 'hiredAt', label: 'Дата приема' },
  { id: 'code', label: 'Код' },
  { id: 'divisionGroup', label: 'Группа подразделений' },
  { id: 'division', label: 'Подразделение' },
  { id: 'position', label: 'Должность' },
  { id: 'staffPosition', label: 'Позиция' },
  { id: 'salary', label: 'Зарплата' },
  { id: 'grade', label: 'Разряд' },
  { id: 'gender', label: 'Пол' },
  { id: 'region', label: 'Регион' },
  { id: 'inps', label: 'ИНН' },
  { id: 'pinfl', label: 'ПИНФЛ' },
  { id: 'birthDate', label: 'Дата рождения' },
  { id: 'address', label: 'Адрес' },
  { id: 'phone', label: 'Номер телефона' },
  { id: 'schedule', label: 'График работы' },
  { id: 'passport', label: 'Серия документа' },
  { id: 'passportIssuer', label: 'Паспорт выдан' },
  { id: 'education', label: 'Вид образования' },
  { id: 'family', label: 'Семья' },
];
const COL_LEAVES: Leaf[] = [
  { id: 'hiredAt', key: 'hiredAt', label: 'Дата приема' },
  { id: 'code', key: 'code', label: 'Код' },
  { id: 'divisionGroup', key: 'divisionGroup', label: 'Группа подразделений' },
  { id: 'division', key: 'division', label: 'Подразделение' },
  { id: 'position', key: 'position', label: 'Должность' },
  { id: 'staffPosition', key: 'staffPosition', label: 'Позиция' },
  { id: 'salary', key: 'salary', label: 'Зарплата' },
  { id: 'grade', key: 'grade', label: 'Разряд' },
  { id: 'gender', key: 'gender', label: 'Пол' },
  { id: 'region', key: 'region', label: 'Регион' },
  { id: 'inps', key: 'inps', label: 'ИНПС' },
  { id: 'pinfl', key: 'pinfl', label: 'ПИНФЛ' },
  { id: 'birthDate', key: 'birthDate', label: 'Дата рождения' },
  { id: 'address', key: 'address', label: 'Адрес' },
  { id: 'phone', key: 'phone', label: 'Номер телефона' },
  { id: 'schedule', key: 'schedule', label: 'График работы' },
  { id: 'passport', key: 'passport', label: 'Серия и номер паспорта' },
  { id: 'passportIssuer', key: 'passportIssuer', label: 'Паспорт выдан' },
  { id: 'education', key: 'educationType', label: 'Вид образования', group: 'Вид образования', sub: 'Вид' },
  { id: 'education', key: 'educationInstitution', label: 'Вид образования', group: 'Вид образования', sub: 'Заведение' },
  { id: 'education', key: 'educationSpecialty', label: 'Вид образования', group: 'Вид образования', sub: 'Специальность' },
  { id: 'education', key: 'educationCourse', label: 'Вид образования', group: 'Вид образования', sub: 'Курс' },
  { id: 'family', key: 'familyRelation', label: 'Семья', group: 'Семья', sub: 'Название степени родства' },
  { id: 'family', key: 'familyName', label: 'Семья', group: 'Семья', sub: 'Имя родственника' },
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
function defaultVisible(): Record<string, boolean> {
  return Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.id, true]));
}
function loadVisible(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultVisible();
    const p = JSON.parse(raw) as Record<string, boolean>;
    const next = defaultVisible();
    for (const f of SETTINGS_FIELDS) {
      if (typeof p[f.id] === 'boolean') next[f.id] = p[f.id];
    }
    return next;
  } catch {
    return defaultVisible();
  }
}
function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-US');
}
function cellText(r: Row, key: keyof Row) {
  const v = r[key];
  if (key === 'salary') return fmtMoney(typeof v === 'number' ? v : null);
  return v == null ? '' : String(v);
}
function empLabel(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
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
                <button type="button" key={`${c.ymd}-${i}`} className={cls} onClick={() => { onChange(c.ymd); setOpen(false); }}>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return showAll ? list : list.slice(0, 12);
  }, [options, q, showAll]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
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

function visibleLeaves(visible: Record<string, boolean>) {
  return COL_LEAVES.filter((c) => visible[c.id] !== false);
}

function groupSpans(leaves: Leaf[]) {
  const out: { label: string; span: number; grouped: boolean }[] = [];
  for (const leaf of leaves) {
    const grouped = !!leaf.group;
    const label = leaf.group || leaf.label;
    const last = out[out.length - 1];
    if (last && last.label === label && last.grouped === grouped) last.span += 1;
    else out.push({ label, span: 1, grouped });
  }
  return out;
}

function rowValues(r: Row, leaves: Leaf[]) {
  return [String(r.n), r.fullName, ...leaves.map((c) => cellText(r, c.key))];
}

function csvText(report: Payload, leaves: Leaf[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const top = ['#', 'Ф.И.О.', ...leaves.map((c) => c.group || c.label)];
  const sub = ['#', 'Ф.И.О.', ...leaves.map((c) => c.sub || c.label)];
  const lines = [
    q(`Дата: ${report.dateLabel}`),
    q(`Общая зарплата: ${report.totalSalary}`),
    top.map(q).join(';'),
    sub.map(q).join(';'),
    ...report.rows.map((r) => rowValues(r, leaves).map(q).join(';')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload, leaves: Leaf[]) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  const top = ['#', 'Ф.И.О.', ...leaves.map((c) => c.group || c.label)];
  const sub = ['#', 'Ф.И.О.', ...leaves.map((c) => c.sub || c.label)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([`Дата: ${report.dateLabel}`])}
${row([`Общая зарплата: ${report.totalSalary}`])}
${row(top)}
${row(sub)}
${report.rows.map((r) => row(rowValues(r, leaves))).join('\n')}
</t>
`;
}

function printHtml(report: Payload, leaves: Leaf[]) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const groups = groupSpans(leaves);
  const groupedLeaves = leaves.filter((c) => c.group);
  const sub = groupedLeaves.map((c) => c.sub || c.label);
  const colCount = 2 + leaves.length;
  const groupCells = groups
    .map((g) =>
      groupedLeaves.length && g.grouped
        ? `<th colspan="${g.span}">${escapeHtml(g.label)}</th>`
        : groupedLeaves.length
          ? `<th rowspan="2">${escapeHtml(g.label)}</th>`
          : `<th>${escapeHtml(g.label)}</th>`,
    )
    .join('');
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'z' : ''}"><td>${r.n}</td><td class="name">${escapeHtml(r.fullName)}</td>${leaves
          .map((c) => `<td>${escapeHtml(cellText(r, c.key))}</td>`)
          .join('')}</tr>`,
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
table{border-collapse:collapse;font-size:11px}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.z td{background:#f9fafb}
.name{text-align:left}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? `(${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">Дата: ${escapeHtml(report.dateLabel)} &nbsp; Общая зарплата: ${fmtMoney(report.totalSalary)}</div>
<div class="wrap"><table><thead>
<tr><th${groupedLeaves.length ? ' rowspan="2"' : ''}>#</th><th${groupedLeaves.length ? ' rowspan="2"' : ''}>Ф.И.О.</th>${groupCells}</tr>
${groupedLeaves.length ? `<tr>${sub.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>` : ''}
</thead>
<tbody>${body || `<tr><td colspan="${colCount}">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
}

export default function EmployeesReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(isoDay(new Date()));
  const [divisionGroupIds, setDivisionGroupIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [filterByDept, setFilterByDept] = useState(true);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [educationTypes, setEducationTypes] = useState<string[]>([]);
  const [scheduleIds, setScheduleIds] = useState<string[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>(defaultVisible);
  const [savedNote, setSavedNote] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [divisionGroups, setDivisionGroups] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [eduOpts, setEduOpts] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setVisible(loadVisible());
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{
            employees?: Opt[];
            positions?: Opt[];
            divisionGroups?: Opt[];
            schedules?: Opt[];
            educationTypes?: Opt[];
          }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setTree(divisions);
        setDivisionGroups(lookups.divisionGroups || []);
        setPositions(mergeOpts(lookups.positions || [], EXTRA_POSITIONS));
        setEmployees(
          (lookups.employees || []).map((e) => ({ ...e, label: empLabel(e) })).sort((a, b) => a.label.localeCompare(b.label, 'ru')),
        );
        setEduOpts(
          (lookups.educationTypes || []).filter((o, i, arr) => arr.findIndex((x) => x.label === o.label) === i),
        );
        setSchedules((lookups.schedules || []).map((x) => ({ id: x.id, label: x.name || x.label })));
      } catch {
        /* optional */
      }
    })();
  }, []);

  const leaves = useMemo(() => visibleLeaves(visible), [visible]);
  const groups = useMemo(() => groupSpans(leaves), [leaves]);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('date', date);
    if (divisionGroupIds.length) p.set('divisionGroupIds', divisionGroupIds.join(','));
    if (filterByDept && divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    p.set('filterByDept', filterByDept ? '1' : '0');
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (educationTypes.length) p.set('educationType', educationTypes.join(','));
    if (scheduleIds.length) p.set('scheduleIds', scheduleIds.join(','));
    return p.toString();
  }, [date, divisionGroupIds, divisionIds, filterByDept, positionIds, employeeIds, educationTypes, scheduleIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/employees?${queryQs}`);
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
    const top = ['#', 'Ф.И.О.', ...leaves.map((c) => c.group || c.label)];
    const cols = ['#', 'Ф.И.О.', ...leaves.map((c) => c.sub || c.label)];
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: 'Сотрудники',
      preamble: [`Дата: ${payload.dateLabel}`, `Общая зарплата: ${payload.totalSalary}`],
      topHeader: top,
      columns: cols,
      rows: payload.rows.map((r) => rowValues(r, leaves)),
      colWidths: [6, 36, ...leaves.map((c) => Math.min(28, Math.max(12, c.label.length + 4)))],
    });
  }
  function exportCsv(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`, new Blob([csvText(data, leaves)], { type: 'text/csv;charset=utf-8' }));
  }
  function exportXml(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).xml`, new Blob([xmlText(data, leaves)], { type: 'application/xml;charset=utf-8' }));
  }
  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    if (!w) {
      downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).html`, new Blob([printHtml(data, leaves)], { type: 'text/html;charset=utf-8' }));
      return;
    }
    w.document.open();
    w.document.write(printHtml(data, leaves));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    w.document.getElementById('btnExcel')?.addEventListener('click', () => void exportExcel(data));
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(visible));
    setSavedNote('Сохранено');
    setTimeout(() => setSavedNote(''), 2000);
  }
  function resetSettings() {
    const next = defaultVisible();
    setVisible(next);
    localStorage.removeItem(SETTINGS_KEY);
    setSavedNote('Сброшено');
    setTimeout(() => setSavedNote(''), 2000);
  }

  const exportBtns = (ghost = false) => (
    <div className={ghost ? layout.exportBtns : extra.exportLinks}>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void openHtml()}>HTML</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>Excel</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportCsv(d))}>CSV</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportXml(d))}>XML</button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет по сотрудникам</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>Фильтр</button>
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
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>Настройки</button>
        {tab === 'settings' ? (
          <>
            <button type="button" className={layout.tabOn} onClick={saveSettings}>Сохранить</button>
            <button type="button" className={layout.tab} onClick={resetSettings}>Сбросить</button>
          </>
        ) : null}
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
      {savedNote ? <p className={s.saved}>{savedNote}</p> : null}

      {tab === 'filter' ? (
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Дата</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className={layout.field}>
            <label>Группы подразделений</label>
            <FilterPick options={divisionGroups} selected={divisionGroupIds} onChange={setDivisionGroupIds} />
          </div>
          <div className={layout.field}>
            <div className={s.labelRow}>
              <label>Подразделения</label>
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
            <FilterPick options={employees} selected={employeeIds} onChange={setEmployeeIds} />
          </div>
          <div className={layout.field}>
            <label>Виды образования</label>
            <FilterPick options={eduOpts} selected={educationTypes} onChange={setEducationTypes} />
          </div>
          <div className={layout.field}>
            <label>График работы</label>
            <FilterPick options={schedules} selected={scheduleIds} onChange={setScheduleIds} />
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>{busy ? 'Формирование…' : 'Составить отчет'}</button>
            {exportBtns(false)}
          </div>
        </form>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${layout.card} ${s.settingsCard}`}>
          <div className={s.checkGrid}>
            {SETTINGS_FIELDS.map((f) => (
              <label key={f.id} className={s.check}>
                <input
                  type="checkbox"
                  checked={visible[f.id] !== false}
                  onChange={() => setVisible((p) => ({ ...p, [f.id]: p[f.id] === false }))}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'view' ? (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <p className={s.periodLine}>
                Дата: {report.dateLabel} &nbsp; Общая зарплата: {fmtMoney(report.totalSalary)}
              </p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.num} rowSpan={groups.some((g) => g.grouped) ? 2 : 1}>#</th>
                      <th className={s.rowName} rowSpan={groups.some((g) => g.grouped) ? 2 : 1}>Ф.И.О.</th>
                      {groups.map((g) =>
                        g.grouped ? (
                          <th key={g.label} colSpan={g.span}>{g.label}</th>
                        ) : (
                          <th key={g.label} rowSpan={groups.some((x) => x.grouped) ? 2 : 1}>{g.label}</th>
                        ),
                      )}
                    </tr>
                    {leaves.some((c) => c.group) ? (
                      <tr>
                        {leaves.filter((c) => c.group).map((c, i) => (
                          <th key={`${c.key}-${i}`}>{c.sub || c.label}</th>
                        ))}
                      </tr>
                    ) : null}
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className={s.empty} colSpan={2 + leaves.length}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={`${r.n}-${r.fullName}`} className={i % 2 ? s.zebra : undefined}>
                          <td className={s.num}>{r.n}</td>
                          <td className={s.rowName}>{r.fullName}</td>
                          {leaves.map((c, j) => (
                            <td key={`${c.key}-${j}`}>{cellText(r, c.key)}</td>
                          ))}
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
