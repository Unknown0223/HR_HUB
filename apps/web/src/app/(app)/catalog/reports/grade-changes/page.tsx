'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickSearchText, toPickItem, type EmployeePickItem } from '@/components/employee-pick';
import pick from '@/components/employee-pick.module.css';
import { apiFetch } from '@/lib/api';
import { downloadMultiSheetXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type EmpOpt = EmployeePickItem & { employmentType?: string };
type Line = {
  date: string;
  division: string;
  position: string;
  slot: string;
  source: string;
  grade: string;
};
type Group = { employeeId: string; employee: string; lines: Line[] };
type Payload = {
  title: string;
  from: string;
  to: string;
  generatedAt?: string;
  groups: Group[];
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
const FILE_BASE = 'Отчет-по-изменению-разрядов';
const XML_WIDTH = 15;
const PREVIEW = 80;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
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

function fmtShort(iso?: string) {
  if (!iso) return '';
  const dt = parseIso(iso);
  return `${String(dt.getDate()).padStart(2, '0')} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

function fmtPeriodLine(from: string, to: string) {
  return `Период: ${fmtShort(from)} - ${fmtShort(to)}`;
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

function empTypeLabel(v?: string) {
  if (v === 'gph') return 'Договор ГПХ';
  return 'Основное место работы';
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

function lastWeekRange(now = new Date()) {
  const day = (now.getDay() + 6) % 7;
  const thisMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const prevMon = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 7);
  const prevSun = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 1);
  return [isoDay(prevMon), isoDay(prevSun)] as const;
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
  const last7 = isoDay(new Date(Date.now() - 6 * 86400000));
  const last30 = isoDay(new Date(Date.now() - 29 * 86400000));
  const month0 = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const prevMonth0 = isoDay(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 0));
  const [weekFrom, weekTo] = lastWeekRange();
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(weekFrom, weekTo)}>
              Прошлая неделя
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(last30, today)}>
              Последние 30 дней
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

function EmployeeFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: EmpOpt[];
  onChange: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    const list = qq ? options.filter((o) => pickSearchText(o).includes(qq)) : options;
    return showAll ? list : list.slice(0, PREVIEW);
  }, [options, draft, showAll]);

  const more =
    !showAll &&
    (draft.trim()
      ? options.filter((o) => pickSearchText(o).includes(draft.trim().toLowerCase())).length
      : options.length) > PREVIEW;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className={pick.lookup} ref={wrapRef}>
      <input
        className={pick.lookupInput}
        value={open ? draft : selected?.name || ''}
        placeholder="Поиск..."
        onFocus={() => {
          setDraft('');
          setShowAll(false);
          setOpen(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setShowAll(false);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {value && !open ? (
        <button type="button" className={pick.lookupClear} aria-label="Очистить" onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
      {open ? (
        <div className={`${pick.drop} ${pick.dropDown}`}>
          <div className={`${pick.dropHead} ${s.dropHead3}`}>
            <span>Табельный номер</span>
            <span>Сотрудник</span>
            <span>Вид занятости</span>
          </div>
          <div className={pick.dropBody}>
            {filtered.length === 0 ? <div className={pick.dropEmpty}>Нет данных</div> : null}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${pick.dropOpt} ${s.dropRow3} ${o.id === value ? pick.dropOptOn : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className={pick.dropTab}>{o.tabNumber || '—'}</span>
                <span className={pick.dropName}>{o.name}</span>
                <span className={s.empType}>{empTypeLabel(o.employmentType)}</span>
              </button>
            ))}
          </div>
          <div className={pick.dropFoot}>
            {more ? (
              <button
                type="button"
                className={pick.showAll}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowAll(true)}
              >
                Показать все
              </button>
            ) : (
              <span />
            )}
            <input
              className={pick.dropSearch}
              placeholder="Поиск..."
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setShowAll(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function csvText(report: Payload) {
  const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const blank = ';'.repeat(XML_WIDTH - 1);
  const pad = (n: number) => ';'.repeat(n);
  const lines = [
    blank,
    `${q(fmtPeriodLine(report.from, report.to))}${pad(XML_WIDTH - 1)}`,
    blank,
    `${q('Сотрудник')};${q('Подразделение')};${q('Должность')};${q('Позиция')};${q('Дата')};${q('Источник')};${q('Разряд')}${pad(XML_WIDTH - 7)}`,
    ...report.groups.flatMap((g) =>
      g.lines.map(
        (l, i) =>
          `${q(i === 0 ? g.employee : '')};${q(l.division)};${q(l.position)};${q(l.slot)};${q(fmtRu(l.date))};${q(l.source)};${q(l.grade)}${pad(XML_WIDTH - 7)}`,
      ),
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string, type?: 'date') =>
    type ? `<c type="${type}">${escapeHtml(v)}</c>` : `<c>${escapeHtml(v)}</c>`;
  const empty = '<c></c>'.repeat(XML_WIDTH);
  const pad = (n = XML_WIDTH - 7) => '<c></c>'.repeat(n);
  const body = report.groups
    .flatMap((g) =>
      g.lines.map(
        (l, i) =>
          `<r>${cell(i === 0 ? g.employee : '')}${cell(l.division)}${cell(l.position)}${cell(l.slot)}${cell(fmtRu(l.date), 'date')}${cell(l.source)}${cell(l.grade)}${pad()}</r>`,
      ),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
<r>${empty}</r>
<r>${cell(fmtPeriodLine(report.from, report.to))}${pad(XML_WIDTH - 1)}</r>
<r>${empty}</r>
<r>${cell('Сотрудник')}${cell('Подразделение')}${cell('Должность')}${cell('Позиция')}${cell('Дата')}${cell('Источник')}${cell('Разряд')}${pad()}</r>
${body}
</t>
`;
}

function tableInner(report: Payload) {
  const body = report.groups
    .map((g) => {
      const span = Math.max(1, g.lines.length);
      return g.lines
        .map(
          (l, i) =>
            `<tr>${i === 0 ? `<td rowspan="${span}">${escapeHtml(g.employee)}</td>` : ''}<td>${escapeHtml(l.division)}</td><td>${escapeHtml(l.position)}</td><td>${escapeHtml(l.slot)}</td><td>${escapeHtml(fmtRu(l.date))}</td><td>${escapeHtml(l.source)}</td><td>${escapeHtml(l.grade)}</td></tr>`,
        )
        .join('');
    })
    .join('');
  return `<table>
<thead><tr><th>Сотрудник</th><th>Подразделение</th><th>Должность</th><th>Позиция</th><th>Дата</th><th>Источник</th><th>Разряд</th></tr></thead>
<tbody>${body || `<tr><td colspan="7">Нет данных</td></tr>`}</tbody>
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
.meta{padding:10px 16px;font-size:13px}
.wrap{padding:0 16px 16px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #cfd3da;padding:5px 8px}
th{background:#f5f8fa}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(fmtPeriodLine(report.from, report.to))}</div>
<div class="wrap">${tableInner(report)}</div>
</body></html>`;
}

function excelSheets(report: Payload) {
  const rows: (string | number)[][] = [];
  const merges: Array<[number, number]> = [];
  let idx = 0;
  for (const g of report.groups) {
    const start = idx;
    g.lines.forEach((l) => {
      rows.push([g.employee, l.division, l.position, l.slot, fmtRu(l.date), l.source, l.grade]);
      idx += 1;
    });
    if (idx - 1 > start) merges.push([start, idx - 1]);
  }
  return [
    {
      name: report.title,
      columns: ['Сотрудник', 'Подразделение', 'Должность', 'Позиция', 'Дата', 'Источник', 'Разряд'],
      rows,
      mergeFirstCol: merges,
      colWidths: [28, 28, 22, 36, 14, 22, 14],
    },
  ];
}

export default function GradeChangesReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState('1990-01-01');
  const [to, setTo] = useState(isoDay(new Date()));
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{
            employees?: Array<{
              id: string;
              label?: string;
              tabNumber?: string;
              lastName?: string;
              firstName?: string;
              middleName?: string | null;
              employmentType?: string;
              positionName?: string;
              divisionId?: string;
            }>;
            divisions?: { id: string; label: string }[];
          }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setEmployees(
          (lookups.employees || []).map((e) => ({
            ...toPickItem(e),
            employmentType: e.employmentType,
          })),
        );
        if (Array.isArray(divisions) && divisions.length) setTree(divisions);
        else setTree((lookups.divisions || []).map((d) => ({ id: d.id, name: d.label, children: [] })));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (selected.size) p.set('divisionIds', [...selected].join(','));
    if (employeeId) p.set('employeeIds', employeeId);
    return p.toString();
  }, [from, to, selected, employeeId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/grade-changes?${queryQs}`);
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
      dateLine: fmtPeriodLine(payload.from, payload.to),
      sheets: excelSheets(payload),
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
      <h1 className={layout.h1}>Отчет по изменению разрядов</h1>
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
          <div className={layout.field}>
            <label>Период</label>
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          </div>
          <div className={layout.field}>
            <label>Подразделения</label>
            <DivisionTree nodes={tree} selected={selected} onChange={setSelected} />
          </div>
          <div className={layout.field}>
            <label>Сотрудники</label>
            <div className={s.lookup}>
              <EmployeeFilter value={employeeId} options={employees} onChange={setEmployeeId} />
            </div>
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
              <p className={layout.dateLine}>{fmtPeriodLine(report.from, report.to)}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Подразделение</th>
                      <th>Должность</th>
                      <th>Позиция</th>
                      <th>Дата</th>
                      <th>Источник</th>
                      <th>Разряд</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.groups.length === 0 ? (
                      <tr>
                        <td className={layout.muted} colSpan={7}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      report.groups.map((g) =>
                        g.lines.map((l, i) => (
                          <tr key={`${g.employeeId}-${l.date}-${i}`}>
                            {i === 0 ? (
                              <td className={s.nameCell} rowSpan={g.lines.length}>
                                {g.employee}
                              </td>
                            ) : null}
                            <td className={s.left}>{l.division}</td>
                            <td className={s.left}>{l.position}</td>
                            <td className={s.left}>{l.slot}</td>
                            <td className={s.date}>{fmtRu(l.date)}</td>
                            <td className={s.left}>{l.source}</td>
                            <td className={s.left}>{l.grade}</td>
                          </tr>
                        )),
                      )
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
