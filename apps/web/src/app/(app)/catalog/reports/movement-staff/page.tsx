'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { pickSearchText, toPickItem, type EmployeePickItem } from '@/components/employee-pick';
import pick from '@/components/employee-pick.module.css';
import { apiFetch } from '@/lib/api';
import { downloadSectionedXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type Kind = 'hireNew' | 'hire' | 'dismiss' | 'transferIn' | 'transferOut' | 'rehired';
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type EmpOpt = EmployeePickItem & { employmentType?: string };
type MoveRow = {
  n: number;
  divisionGroup: string;
  division: string;
  position: string;
  positionGroup: string;
  slot: string;
  employee: string;
  employeeId: string;
  date: string;
  note: string;
  dismissedAt?: string;
};
type Section = {
  kind: Kind | string;
  title: string;
  extra: 'note' | 'dismissedAt' | string;
  extraLabel: string;
  rows: MoveRow[];
};
type Payload = {
  title: string;
  from: string;
  to: string;
  generatedAt?: string;
  headcount: number;
  sections: Section[];
};

const ALL_KINDS: Kind[] = ['hireNew', 'hire', 'dismiss', 'transferIn', 'transferOut', 'rehired'];
const KIND_META: Record<Kind, { label: string; hint: string }> = {
  hireNew: {
    label: 'Принятые на работу (Новые)',
    hint: 'сотрудники, принятые на работу в указанном периоде (исключая бывших сотрудников)',
  },
  hire: {
    label: 'Принятые на работу',
    hint: 'сотрудники, принятые на работу в указанном периоде',
  },
  dismiss: {
    label: 'Увольнение',
    hint: 'сотрудники, уволенные в указанном периоде',
  },
  transferIn: {
    label: 'Перемещенные (Прибывшие)',
    hint: 'сотрудники, перемещенные на новую должность / подразделение',
  },
  transferOut: {
    label: 'Перемещенные (Ушедшие)',
    hint: 'сотрудники, перемещенные с текущей должности / подразделения',
  },
  rehired: {
    label: 'Повторно принятые',
    hint: 'сотрудники, которые были уволены, а затем повторно приняты в указанном периоде',
  },
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
const FILE_BASE = 'Отчет-по-движению-сотрудников-(штаты)';
const XML_WIDTH = 9;
const PREVIEW = 80;
const KPI_LABEL = 'Кол-во сотрудников на конец периода';

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

function extraValue(sec: Section, row: MoveRow) {
  if (sec.extra === 'dismissedAt') return fmtRu(row.dismissedAt);
  return row.note || '';
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
  const now = new Date();
  const yest = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const last7 = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const last30 = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const month0 = monthStart(now);
  const prevMonth0 = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const week = lastWeekRange();
  const left = view;
  const right = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  function cal(month: Date) {
    return (
      <div className={extra.cal}>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const visible = useMemo(() => flattenTree(nodes, q), [nodes, q]);

  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropOpen]);

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
    <div className={s.lookup} ref={wrapRef}>
      <input
        className={extra.treeSearch}
        style={{ marginBottom: 0 }}
        placeholder="Поиск..."
        value={dropOpen ? q : ''}
        onFocus={() => {
          setQ('');
          setDropOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setDropOpen(true);
        }}
        autoComplete="off"
      />
      {selected.size && !dropOpen ? (
        <button type="button" className={pick.lookupClear} aria-label="Очистить" onClick={() => onChange(new Set())}>
          ×
        </button>
      ) : null}
      {dropOpen ? (
        <div className={s.dropPanel}>
          <div className={treeS.treeHead}>
            <button type="button" className={treeS.selectAll} onClick={selectVisible}>
              выбрать все
            </button>
          </div>
          <div className={extra.treeBox} style={{ maxHeight: 200 }}>
            {visible.map((n) => (
              <Row key={n.id} node={n} depth={0} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckLookup<T extends { id: string }>({
  options,
  selected,
  onChange,
  searchText,
  renderRow,
  columns,
}: {
  options: T[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  searchText: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  columns?: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const qq = draft.trim().toLowerCase();
    const list = qq ? options.filter((o) => searchText(o).includes(qq)) : options;
    return showAll ? list : list.slice(0, PREVIEW);
  }, [options, draft, showAll, searchText]);

  const more =
    !showAll &&
    (draft.trim() ? options.filter((o) => searchText(o).includes(draft.trim().toLowerCase())).length : options.length) >
      PREVIEW;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className={pick.lookup} ref={wrapRef}>
      <input
        className={pick.lookupInput}
        value={open ? draft : ''}
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
      {selected.size && !open ? (
        <button type="button" className={pick.lookupClear} aria-label="Очистить" onClick={() => onChange(new Set())}>
          ×
        </button>
      ) : null}
      {open ? (
        <div className={`${pick.drop} ${pick.dropDown}`}>
          {columns ? (
            <div className={s.dropHeadEmp}>
              <span />
              {columns.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          ) : null}
          <div className={pick.dropBody}>
            {filtered.length === 0 ? <div className={pick.dropEmpty}>Нет данных</div> : null}
            {filtered.map((o) => (
              <label key={o.id} className={columns ? s.checkRowEmp : s.checkRow}>
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                {renderRow(o)}
              </label>
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

function csvCell(v: string | number) {
  const t = String(v ?? '');
  if (!t) return '';
  return `"${t.replace(/"/g, '""')}"`;
}

function csvLine(cells: Array<string | number>) {
  const padded = [...cells];
  while (padded.length < XML_WIDTH) padded.push('');
  return padded.slice(0, XML_WIDTH).map(csvCell).join(';');
}

function csvText(report: Payload) {
  const lines = [csvLine([KPI_LABEL]), csvLine([report.headcount]), csvLine([])];
  for (const sec of report.sections) {
    lines.push(csvLine([sec.title]));
    lines.push(
      csvLine(['#', 'Группа подразделений', 'Подразделение', 'Должность', 'Группа позиций', 'Позиция', 'Сотрудник', 'Дата движения', sec.extraLabel]),
    );
    for (const r of sec.rows) {
      lines.push(
        csvLine([
          r.n,
          r.divisionGroup,
          r.division,
          r.position,
          r.positionGroup,
          r.slot,
          r.employee,
          fmtRu(r.date),
          extraValue(sec, r),
        ]),
      );
    }
    lines.push(csvLine([]));
  }
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string, type?: 'date' | 'number') =>
    type ? `<c type="${type}">${escapeHtml(v)}</c>` : `<c>${escapeHtml(v)}</c>`;
  const empty = '<c></c>'.repeat(XML_WIDTH);
  const pad = (first: string, type?: 'date' | 'number') => `${cell(first, type)}${'<c></c>'.repeat(XML_WIDTH - 1)}`;
  const parts = [pad(KPI_LABEL), pad(String(report.headcount), 'number'), empty];
  for (const sec of report.sections) {
    parts.push(pad(sec.title));
    parts.push(
      `<r>${cell('#')}${cell('Группа подразделений')}${cell('Подразделение')}${cell('Должность')}${cell('Группа позиций')}${cell('Позиция')}${cell('Сотрудник')}${cell('Дата движения')}${cell(sec.extraLabel)}</r>`,
    );
    for (const r of sec.rows) {
      parts.push(
        `<r>${cell(String(r.n))}${cell(r.divisionGroup)}${cell(r.division)}${cell(r.position)}${cell(r.positionGroup)}${cell(r.slot)}${cell(r.employee)}${cell(fmtRu(r.date), 'date')}${
          sec.extra === 'dismissedAt' && r.dismissedAt ? cell(fmtRu(r.dismissedAt), 'date') : cell(extraValue(sec, r))
        }</r>`,
      );
    }
    parts.push(empty);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${parts.map((p) => (p.startsWith('<r>') ? p : `<r>${p}</r>`)).join('\n')}
</t>
`;
}

function tableInner(report: Payload) {
  const kpi = `<table class="kpi"><thead><tr><th>${escapeHtml(KPI_LABEL)}</th></tr></thead><tbody><tr><td>${report.headcount.toLocaleString('ru-RU')}</td></tr></tbody></table>`;
  const sections = report.sections
    .map((sec) => {
      const body = sec.rows
        .map(
          (r) =>
            `<tr><td class="num">${r.n}</td><td>${escapeHtml(r.divisionGroup)}</td><td>${escapeHtml(r.division)}</td><td>${escapeHtml(r.position)}</td><td>${escapeHtml(r.positionGroup)}</td><td>${escapeHtml(r.slot)}</td><td>${escapeHtml(r.employee)}</td><td class="date">${escapeHtml(fmtRu(r.date))}</td><td>${escapeHtml(extraValue(sec, r))}</td></tr>`,
        )
        .join('');
      return `<table>
<thead>
<tr><th class="caption" colspan="9">${escapeHtml(sec.title)}</th></tr>
<tr><th>#</th><th>Группа подразделений</th><th>Подразделение</th><th>Должность</th><th>Группа позиций</th><th>Позиция</th><th>Сотрудник</th><th>Дата движения</th><th>${escapeHtml(sec.extraLabel)}</th></tr>
</thead>
<tbody>${body}</tbody>
</table>`;
    })
    .join('');
  return `${kpi}${sections}`;
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
.wrap{padding:12px 16px 16px}
.kpi{width:auto;border-collapse:collapse;margin:0 0 16px;font-size:13px}
.kpi th,.kpi td{border:1px solid #cfd3da;padding:5px 14px;text-align:center;white-space:nowrap}
.kpi th{background:#f5f8fa}
table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:14px}
th,td{border:1px solid #cfd3da;padding:4px 6px;white-space:nowrap}
th{background:#f5f8fa;text-align:center}
.caption{background:#f0f0f0;text-align:left;font-weight:600;font-size:13px}
.num,.date{text-align:center}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? `(${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="wrap">${tableInner(report)}</div>
</body></html>`;
}

export default function MovementStaffReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(ALL_KINDS));
  const [divisionGroupId, setDivisionGroupId] = useState('');
  const [positionGroupId, setPositionGroupId] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedDiv, setSelectedDiv] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<{ id: string; label: string }[]>([]);
  const [selectedPos, setSelectedPos] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Set<string>>(new Set());
  const [divisionGroups, setDivisionGroups] = useState<{ id: string; label: string }[]>([]);
  const [positionGroups, setPositionGroups] = useState<{ id: string; label: string }[]>([]);
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
            positions?: { id: string; label: string }[];
            divisionGroups?: { id: string; label: string }[];
            positionGroups?: { id: string; label: string }[];
          }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setEmployees(
          (lookups.employees || [])
            .filter((e) => !e.employmentType || e.employmentType === 'staff')
            .map((e) => ({
              ...toPickItem(e),
              employmentType: e.employmentType,
            })),
        );
        setPositions(lookups.positions || []);
        setDivisionGroups(lookups.divisionGroups || []);
        setPositionGroups(lookups.positionGroups || []);
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
    const enabled = ALL_KINDS.filter((k) => kinds.has(k));
    if (enabled.length && enabled.length < ALL_KINDS.length) p.set('kinds', enabled.join(','));
    if (divisionGroupId) p.set('divisionGroupId', divisionGroupId);
    if (positionGroupId) p.set('positionGroupId', positionGroupId);
    if (selectedDiv.size) p.set('divisionIds', [...selectedDiv].join(','));
    if (selectedPos.size) p.set('positionIds', [...selectedPos].join(','));
    if (selectedEmp.size) p.set('employeeIds', [...selectedEmp].join(','));
    return p.toString();
  }, [from, to, kinds, divisionGroupId, positionGroupId, selectedDiv, selectedPos, selectedEmp]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/movement-staff?${queryQs}`);
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
    await downloadSectionedXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: payload.title,
      kpi: { label: KPI_LABEL, value: payload.headcount },
      sections: payload.sections.map((sec) => ({
        title: sec.title,
        columns: [
          '#',
          'Группа подразделений',
          'Подразделение',
          'Должность',
          'Группа позиций',
          'Позиция',
          'Сотрудник',
          'Дата движения',
          sec.extraLabel,
        ],
        rows: sec.rows.map((r) => [
          r.n,
          r.divisionGroup,
          r.division,
          r.position,
          r.positionGroup,
          r.slot,
          r.employee,
          fmtRu(r.date),
          extraValue(sec, r),
        ]),
      })),
      colWidths: [6, 22, 22, 16, 18, 36, 32, 14, 22],
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
    <div className={ghost ? layout.exportBtns : s.exportRow}>
      <button type="button" className={ghost ? s.viewExport : s.exportBtn} disabled={busy} onClick={() => void openHtml()}>
        HTML
      </button>
      <button type="button" className={ghost ? s.viewExport : s.exportBtn} disabled={busy} onClick={() => void exportExcel()}>
        Excel
      </button>
      <button
        type="button"
        className={ghost ? s.viewExport : s.exportBtn}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportCsv(d))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? s.viewExport : s.exportBtn}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportXml(d))}
      >
        XML
      </button>
    </div>
  );

  function toggleKind(k: Kind) {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setKinds(next);
  }

  return (
    <div className={s.wrap}>
      <h1 className={s.title}>Отчет по движению сотрудников (штаты)</h1>
      <div className={s.toolbar}>
        <button type="button" className={tab === 'filter' ? s.tabOn : s.tab} onClick={() => setTab('filter')}>
          Фильтр
        </button>
        <button
          type="button"
          className={tab === 'view' ? s.tabOn : s.tab}
          onClick={() => {
            setTab('view');
            if (!report) void generate();
          }}
        >
          Просмотреть
        </button>
        {tab === 'view' ? (
          <>
            <button type="button" className={s.refresh} disabled={busy} aria-label="Обновить" onClick={() => void load()}>
              <i className="fas fa-sync-alt" aria-hidden />
            </button>
            {exportBtns(true)}
          </>
        ) : null}
      </div>
      {error ? <p className={layout.error}>{error}</p> : null}

      {tab === 'filter' ? (
        <form className={s.filterCard} onSubmit={(e) => void generate(e)}>
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
          <div className={s.checks}>
            {ALL_KINDS.map((k) => (
              <label key={k} className={s.check}>
                <input type="checkbox" checked={kinds.has(k)} onChange={() => toggleKind(k)} />
                <span className={s.checkBody}>
                  <span className={s.checkTitle}>{KIND_META[k].label}</span>
                  <span className={s.hint}>{KIND_META[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className={s.fields}>
            <div className={layout.field}>
              <label>Группа подразделений</label>
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
              <label>Группа позиций</label>
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
              <label>Подразделения</label>
              <DivisionTree nodes={tree} selected={selectedDiv} onChange={setSelectedDiv} />
            </div>
            <div className={layout.field}>
              <label>Должности</label>
              <div className={s.lookup}>
                <CheckLookup
                  options={positions}
                  selected={selectedPos}
                  onChange={setSelectedPos}
                  searchText={(o) => o.label.toLowerCase()}
                  renderRow={(o) => <span>{o.label}</span>}
                />
              </div>
            </div>
            <div className={`${layout.field} ${s.span2}`}>
              <label>Сотрудники</label>
              <div className={s.lookup}>
                <CheckLookup
                  options={employees}
                  selected={selectedEmp}
                  onChange={setSelectedEmp}
                  searchText={(o) => pickSearchText(o)}
                  columns={['Табельный номер', 'Сотрудник', 'Вид занятости']}
                  renderRow={(o) => (
                    <>
                      <span className={pick.dropTab}>{o.tabNumber || '—'}</span>
                      <span className={pick.dropName}>{o.name}</span>
                      <span>{empTypeLabel(o.employmentType)}</span>
                    </>
                  )}
                />
              </div>
            </div>
          </div>
          <div className={s.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : (
        <div className={s.view}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <div className={s.kpiBox}>
                <div className={s.kpiHead}>
                  <span>{KPI_LABEL}</span>
                </div>
                <div className={s.kpiVal}>
                  <span>{report.headcount.toLocaleString('ru-RU')}</span>
                </div>
              </div>
              {report.sections.map((sec) => (
                <div key={sec.kind} className={s.block}>
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th colSpan={9}>{sec.title}</th>
                        </tr>
                        <tr>
                          <th>#</th>
                          <th>Группа подразделений</th>
                          <th>Подразделение</th>
                          <th>Должность</th>
                          <th>Группа позиций</th>
                          <th>Позиция</th>
                          <th>Сотрудник</th>
                          <th>Дата движения</th>
                          <th>{sec.extraLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.rows.map((r) => (
                          <tr key={`${sec.kind}-${r.employeeId}-${r.date}-${r.n}`}>
                            <td>{r.n}</td>
                            <td>{r.divisionGroup}</td>
                            <td>{r.division}</td>
                            <td>{r.position}</td>
                            <td>{r.positionGroup}</td>
                            <td>{r.slot}</td>
                            <td>{r.employee}</td>
                            <td>{fmtRu(r.date)}</td>
                            <td>{extraValue(sec, r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
