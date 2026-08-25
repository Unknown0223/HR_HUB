'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadAttendanceLikeXlsx, downloadMultiSheetXlsx, XLSX_COLORS } from '@/lib/xlsx-download';
import { buildZipBlob } from '@/lib/zip-download';
import {
  DISCIPLINE_TABS,
  columnsFor,
  filterRows,
  fmtGen,
  type DisciplineRow,
  type DisciplineTab,
} from '@/components/DisciplineReportSheet';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from '../relatives/page.module.css';
import local from './page.module.css';

type PageTab = 'filter' | 'view';
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
type Payload = {
  title: string;
  generatedAt?: string;
  from: string;
  to: string;
  periodLine?: string;
  rows: DisciplineRow[];
};
type DayRow = {
  iso: string;
  date: string;
  weekday: string;
  sunday: boolean;
  dayOff: boolean;
  planIn: string;
  planOut: string;
  planNorm: number | null;
  factIn: string;
  factOut: string;
  worked: number | null;
  absenceReason: string;
  onTime: number | null;
  absenceByReason: number | null;
  absenceNoReason: number | null;
  total: number | null;
  late: boolean;
  missingOut: boolean;
};
type Detail = {
  title: string;
  generatedAt?: string;
  from: string;
  to: string;
  periodLine?: string;
  employee: { id: string; tabNumber: string; fullName: string; division: string; position: string };
  days: DayRow[];
  totals: {
    planNorm: number;
    worked: number;
    onTime: number;
    absenceByReason: number;
    absenceNoReason: number;
    total: number;
  };
};

const FILE_BASE = 'Отчет-по-дисциплине-посещений';
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
function addDays(iso: string, n: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
function mondayOf(d: Date) {
  const x = new Date(d);
  const offset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - offset);
  return isoDay(x);
}
function fmtLongRange(from: string, to: string) {
  const one = (iso: string) => {
    const d = parseIso(iso);
    return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };
  return `${one(from)} - ${one(to)}`;
}
function empName(o: Opt) {
  const name = [o.lastName, o.firstName, o.middleName].filter(Boolean).join(' ').trim();
  return (name || o.label || '').toUpperCase();
}
function empType(t?: string) {
  if (t === 'gph') return 'ГПХ';
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
function csvCell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}
function emptyCsvLine(n: number) {
  return Array.from({ length: n }, () => '').join(';');
}
function numOrBlank(v: number | null | undefined) {
  return v == null || v === 0 ? '' : String(v);
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

  const now = new Date();
  const today = isoDay(now);
  const yest = addDays(today, -1);
  const last7 = addDays(today, -6);
  const last30 = addDays(today, -29);
  const thisMonday = mondayOf(now);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);
  const month0 = monthStart(now);
  const mid = isoDay(new Date(now.getFullYear(), now.getMonth(), 15));
  const midNext = isoDay(new Date(now.getFullYear(), now.getMonth(), 16));
  const monthEnd = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const prevMonth0 = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(lastMonday, lastSunday)}>
              Прошлая неделя
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(month0, mid)}>
              Первая половина месяца
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(midNext, monthEnd)}>
              Вторая половина месяца
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
              <button type="button" className={extra.cancel} onClick={() => setOpen(false)}>
                Отменить
              </button>
            </div>
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
  const wrapRef = useOutsideClose(menuOpen, () => {
    setMenuOpen(false);
    setQ('');
  });
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
        <div className={`${extra.treeRow} ${selected.has(node.id) ? local.treeOn : ''}`} style={{ paddingLeft: depth * 14 }}>
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
          <input type="checkbox" className={local.box} checked={selected.has(node.id)} onChange={() => toggleOne(node.id)} />
          <button type="button" className={selected.has(node.id) ? `${local.treeName} ${local.treeNameOn}` : local.treeName} onClick={() => toggleOne(node.id)}>
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
    <div className={`${local.dropWrap}${menuOpen ? ` ${local.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${local.dropField}${selected.size ? '' : ` ${local.dropEmpty}`}`}
        onClick={() =>
          setMenuOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.size ? `Выбрано: ${selected.size}` : 'Поиск...'}
      </button>
      <div className={local.dropPanel} hidden={!menuOpen}>
        {menuOpen ? (
          <>
            <input className={local.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {visible.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
            {visible.map((n) => (
              <Row key={n.id} node={n} depth={0} />
            ))}
          </>
        ) : null}
      </div>
      {selected.size ? (
        <div className={s.chips}>
          <span className={s.chip}>Выбрано: {selected.size}</span>
        </div>
      ) : null}
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
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${local.dropWrap}${open ? ` ${local.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${local.dropField}${selected.length ? '' : ` ${local.dropEmpty}`}`}
        onClick={() =>
          setOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={local.dropPanel} hidden={!open}>
        <input className={local.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
        {open && filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
        {open
          ? filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${local.listRow} ${local.listOn}` : local.listRow} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={local.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.label}</span>
                </button>
              );
            })
          : null}
      </div>
      {selected.length ? (
        <div className={s.chips}>
          {selected.map((id) => {
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
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)}`.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className={`${local.dropWrap}${open ? ` ${local.dropOpen}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`${local.dropField}${selected.length ? '' : ` ${local.dropEmpty}`}`}
        onClick={() =>
          setOpen((v) => {
            if (v) setQ('');
            return !v;
          })
        }
      >
        {selected.length ? `Выбрано: ${selected.length}` : 'Поиск...'}
      </button>
      <div className={`${local.dropPanel} ${local.empWide}`} hidden={!open}>
        {open ? (
          <>
            <input className={local.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className={local.empHead}>
              <span />
              <span>Табельный номер</span>
              <span>ФИО</span>
              <span>Вид занятости</span>
            </div>
            {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${local.empRow} ${local.empOn}` : local.empRow} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={local.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.tabNumber || '—'}</span>
                  <span>{empName(o)}</span>
                  <span>{empType(o.employmentType)}</span>
                </button>
              );
            })}
            <button type="button" className={local.showAll} onClick={() => onChange(filtered.map((o) => o.id))}>
              Показать все
            </button>
          </>
        ) : null}
      </div>
      {selected.length ? (
        <div className={s.chips}>
          {selected.map((id) => {
            const o = options.find((x) => x.id === id);
            return (
              <button key={id} type="button" className={s.chip} onClick={() => toggle(id)}>
                {o ? empName(o) : id} ×
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function sheetRows(rows: DisciplineRow[], tab: DisciplineTab) {
  const cols = columnsFor(tab);
  const visible = filterRows(rows, tab);
  return {
    cols,
    visible,
    header: ['№', ...cols.map((c) => c.label)],
    data: visible.map((row, i) => [i + 1, ...cols.map((c) => c.render(row))]),
  };
}

export default function DisciplineReportPage() {
  const [tab, setTab] = useState<PageTab>('filter');
  const [sub, setSub] = useState<DisciplineTab>('late');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
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
      let poss = lookups.positions || [];
      if (!emps.length) {
        const raw = await apiFetch<{ items?: Array<Opt & { name?: string }> } | Array<Opt & { name?: string }>>(
          '/api/employees?limit=500',
        ).catch(() => [] as Opt[]);
        emps = Array.isArray(raw) ? raw : raw.items || [];
      }
      if (!poss.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/organization/positions').catch(() => [] as Opt[]);
        const list = Array.isArray(raw) ? raw : raw.items || [];
        poss = list.map((p) => ({ id: p.id, label: p.label || (p as { name?: string }).name || p.id }));
      }
      setPositions(
        mergeOpts(
          poss.map((p) => ({ id: p.id, label: (p.label || (p as { name?: string }).name || p.id).toUpperCase() })),
          EXTRA_POSITIONS,
        ),
      );
      setEmployees(
        emps
          .map((e) => ({ ...e, tabNumber: e.tabNumber || '', label: empName(e) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [from, to, divisionIds, positionIds, employeeIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/discipline?${queryQs}`);
      setReport(data);
      setLoadedQs(queryQs);
      setDetail(null);
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

  async function openEmployee(row: DisciplineRow) {
    if (!row.employeeId) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Detail>(
        `/api/catalog/analytics/discipline/employee/${row.employeeId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка детализации');
    } finally {
      setBusy(false);
    }
  }

  function periodLine(payload: Payload | Detail) {
    return payload.periodLine || `Период: ${payload.from} - ${payload.to}`;
  }

  function csvForTab(payload: Payload, tabId: DisciplineTab) {
    const { header, data } = sheetRows(payload.rows, tabId);
    const n = header.length;
    const lines = [
      emptyCsvLine(n),
      `${csvCell(periodLine(payload))}${';'.repeat(n - 1)}`,
      emptyCsvLine(n),
      header.map(csvCell).join(';'),
      emptyCsvLine(n),
      ...data.map((r) => r.map(csvCell).join(';')),
    ];
    return `\uFEFF${lines.join('\n')}\n`;
  }

  function xmlForTab(payload: Payload, tabId: DisciplineTab) {
    const { header, data } = sheetRows(payload.rows, tabId);
    const n = header.length;
    const empty = `<r>${Array.from({ length: n }, () => '<c></c>').join('')}</r>`;
    const cell = (v: string | number, number = false) =>
      number && v !== '' && Number.isFinite(Number(v))
        ? `<c type="number">${escapeHtml(String(v))}</c>`
        : `<c>${escapeHtml(String(v))}</c>`;
    const period = `<r><c>${escapeHtml(periodLine(payload))}</c>${Array.from({ length: n - 1 }, () => '<c></c>').join('')}</r>`;
    const head = `<r>${header.map((h) => cell(h)).join('')}</r>`;
    const body = data
      .map((r) => `<r>${r.map((v, i) => cell(v, i === 0 || typeof v === 'number')).join('')}</r>`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<t>\n${empty}\n${period}\n${empty}\n${head}\n${empty}\n${body}\n</t>\n`;
  }

  function detailCsv(d: Detail) {
    const header = [
      'Дата',
      'День',
      'План приход',
      'План уход',
      'Норма',
      'Факт приход',
      'Факт уход',
      'Отработано',
      'Отсутствие по причине',
      'Вовремя',
      'По причине',
      'Без причины',
      'Итого',
    ];
    const rows = d.days.map((r) =>
      r.dayOff
        ? [r.date, r.weekday, 'Выходной день', '', '', '', '', '', '', '', '', '', '']
        : [
            r.date,
            r.weekday,
            r.planIn,
            r.planOut,
            r.planNorm ?? '',
            r.factIn,
            r.factOut,
            r.worked ?? '',
            r.absenceReason,
            r.onTime ?? '',
            r.absenceByReason ?? '',
            r.absenceNoReason ?? '',
            r.total ?? '',
          ],
    );
    return `\uFEFF${[header.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))].join('\n')}\n`;
  }

  async function exportExcel(data?: Payload | null) {
    if (detail) {
      await downloadAttendanceLikeXlsx({
        filename: `${FILE_BASE}(${fileStamp(detail.generatedAt)}).xlsx`,
        title: detail.title,
        subtitle: `${detail.employee.fullName} · ${periodLine(detail)}`,
        topHeader: [
          { label: 'Дата', span: 1 },
          { label: 'День', span: 1 },
          { label: 'План', span: 3 },
          { label: 'Факт', span: 3 },
          { label: 'Отсутствие по причине', span: 1 },
          { label: 'Вовремя', span: 1 },
          { label: 'Отсутствие', span: 2 },
          { label: 'Итого', span: 1 },
        ],
        subHeader: [
          { label: '' },
          { label: '' },
          { label: 'Приход' },
          { label: 'Уход' },
          { label: 'Норма' },
          { label: 'Приход' },
          { label: 'Уход' },
          { label: 'Отработано' },
          { label: '' },
          { label: '' },
          { label: 'По причине' },
          { label: 'Без причины' },
          { label: '' },
        ],
        rows: detail.days.map((r) =>
          r.dayOff
            ? {
                cells: [
                  r.date,
                  r.weekday,
                  { v: 'Выходной день', s: { fill: XLSX_COLORS.weekendBg } },
                  { v: '', s: { fill: XLSX_COLORS.weekendBg } },
                  { v: '', s: { fill: XLSX_COLORS.weekendBg } },
                  { v: '', s: { fill: XLSX_COLORS.weekendBg } },
                  { v: '', s: { fill: XLSX_COLORS.weekendBg } },
                  { v: '', s: { fill: XLSX_COLORS.weekendBg } },
                  '',
                  '',
                  '',
                  '',
                  '',
                ],
                kind: 'weekend',
              }
            : {
                cells: [
                  r.date,
                  r.weekday,
                  r.planIn,
                  r.planOut,
                  r.planNorm ?? '',
                  { v: r.factIn, s: r.late ? { fill: XLSX_COLORS.factBg } : undefined },
                  r.factOut,
                  r.worked ?? '',
                  r.absenceReason,
                  r.onTime ?? '',
                  r.absenceByReason ?? '',
                  r.absenceNoReason ?? '',
                  r.total ?? '',
                ],
              },
        ),
        footer: [
          'Итого',
          '',
          '',
          '',
          detail.totals.planNorm,
          '',
          '',
          detail.totals.worked,
          '',
          detail.totals.onTime,
          detail.totals.absenceByReason || '',
          detail.totals.absenceNoReason,
          detail.totals.total,
        ],
      });
      return;
    }
    const payload = data ?? (await ensureReport());
    if (!payload) return;
    await downloadMultiSheetXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      dateLine: periodLine(payload),
      sheets: DISCIPLINE_TABS.map((t) => {
        const { header, data: rows } = sheetRows(payload.rows, t.id);
        return { name: t.label, columns: header, rows, colWidths: [6, 14, 32, 20, 18, 10, 14, 14, 14] };
      }),
    });
  }

  function exportCsv(payload: Payload) {
    if (detail) {
      downloadBlob(`${FILE_BASE}(${fileStamp(detail.generatedAt)}).csv`, new Blob([detailCsv(detail)], { type: 'text/csv;charset=utf-8' }));
      return;
    }
    const zip = buildZipBlob(
      DISCIPLINE_TABS.map((t) => ({
        name: `${t.label}.csv`,
        data: csvForTab(payload, t.id),
      })),
    );
    downloadBlob(`${FILE_BASE}(${fileStamp(payload.generatedAt)}).zip`, zip);
  }

  function exportXml(payload: Payload) {
    if (detail) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<t>\n${detail.days
        .map((r) => `<r><c>${escapeHtml(r.date)}</c><c>${escapeHtml(r.weekday)}</c><c>${escapeHtml(r.dayOff ? 'Выходной день' : r.factIn)}</c></r>`)
        .join('\n')}\n</t>\n`;
      downloadBlob(`${FILE_BASE}(${fileStamp(detail.generatedAt)}).xml`, new Blob([xml], { type: 'application/xml;charset=utf-8' }));
      return;
    }
    const zip = buildZipBlob(
      DISCIPLINE_TABS.map((t) => ({
        name: `${t.label}.xml`,
        data: xmlForTab(payload, t.id),
      })),
    );
    downloadBlob(`${FILE_BASE}(${fileStamp(payload.generatedAt)}).zip`, zip);
  }

  function printHtml(payload: Payload, active: DisciplineTab) {
    const gen = fmtGen(payload.generatedAt);
    const tabs = DISCIPLINE_TABS.map(
      (t) =>
        `<button type="button" class="tab${t.id === active ? ' on' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`,
    ).join('');
    const panels = DISCIPLINE_TABS.map((t) => {
      const { cols, visible } = sheetRows(payload.rows, t.id);
      const head = `<tr><th>№</th>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>`;
      const body = visible.length
        ? visible
            .map(
              (row, i) =>
                `<tr><td>${i + 1}</td>${cols
                  .map((c) => `<td${c.key === 'fullName' || c.key === 'division' || c.key === 'position' ? ' class="name"' : ''}>${escapeHtml(String(c.render(row)))}</td>`)
                  .join('')}</tr>`,
            )
            .join('')
        : `<tr><td colspan="${cols.length + 1}">Нет данных</td></tr>`;
      return `<div class="panel" data-tab="${t.id}"${t.id === active ? '' : ' hidden'}>
<table>${head}${body}</table>
</div>`;
    }).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${escapeHtml(payload.title)}</title>
<style>
body{font-family:Arial,sans-serif;color:#181c32;margin:16px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #d8dbe0;padding:6px 8px;text-align:center;white-space:normal}
th{background:#eef0f4}
td.name{text-align:left}
h1{font-size:18px;margin:0}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px}
.btn{border:1px solid #e4e6ef;background:#fff;padding:6px 10px;margin-left:6px;cursor:pointer}
.tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid #eff2f5;margin:12px 0 8px}
.tab{appearance:none;border:0;background:transparent;color:#5e6278;padding:10px 14px;font:inherit;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:#009ef7}
.tab.on{color:#009ef7;font-weight:600;border-bottom-color:#009ef7;background:#f1faff}
@media print{.btn,.tabs{display:none!important}.panel[hidden]{display:none!important}}
</style></head>
<body>
<div class="bar"><h1>${escapeHtml(payload.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1><div><button class="btn" id="btnPrint">Печать</button><button class="btn" id="btnExcel">Excel</button></div></div>
<div class="tabs">${tabs}</div>
<p><strong>Период:</strong> ${escapeHtml(periodLine(payload).replace('Период: ', ''))}</p>
${panels}
<script>
(function(){
  function show(id){
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('on', t.getAttribute('data-tab')===id); });
    document.querySelectorAll('.panel').forEach(function(p){ p.hidden = p.getAttribute('data-tab')!==id; });
  }
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){ show(t.getAttribute('data-tab')); });
  });
})();
</script>
</body></html>`;
  }

  function printDetailHtml(d: Detail) {
    const gen = fmtGen(d.generatedAt);
    const rows = d.days
      .map((r) => {
        if (r.dayOff) {
          return `<tr class="off"><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.weekday)}</td><td colspan="6">Выходной день</td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
        return `<tr>
          <td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.weekday)}</td>
          <td>${escapeHtml(r.planIn)}</td><td>${escapeHtml(r.planOut)}</td><td>${r.planNorm ?? ''}</td>
          <td${r.late ? ' class="late"' : ''}>${escapeHtml(r.factIn)}</td><td>${escapeHtml(r.factOut)}</td><td>${r.worked ?? ''}</td>
          <td>${escapeHtml(r.absenceReason)}</td><td>${r.onTime ?? ''}</td>
          <td>${r.absenceByReason ?? ''}</td><td>${r.absenceNoReason ?? ''}</td><td>${r.total ?? ''}</td>
        </tr>`;
      })
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${escapeHtml(d.title)}</title>
<style>body{font-family:Arial,sans-serif;color:#181c32;margin:16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dbe0;padding:6px 8px;text-align:center}th{background:#eef0f4}.late{background:#fff2cc}.off{background:#e7f3ff}.btn{border:1px solid #e4e6ef;background:#fff;padding:6px 10px;margin-left:6px;cursor:pointer}</style></head>
<body>
<div style="display:flex;justify-content:space-between"><h1>${escapeHtml(d.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1><div><button class="btn" id="btnPrint">Печать</button><button class="btn" id="btnExcel">Excel</button></div></div>
<p><strong>Сотрудник:</strong> ${escapeHtml(d.employee.fullName)} · ${escapeHtml(periodLine(d))}</p>
<table>
<tr><th rowspan="2">Дата</th><th rowspan="2">День</th><th colspan="3">План</th><th colspan="3">Факт</th><th rowspan="2">Отсутствие по причине</th><th rowspan="2">Вовремя</th><th colspan="2">Отсутствие</th><th rowspan="2">Итого</th></tr>
<tr><th>Приход</th><th>Уход</th><th>Норма</th><th>Приход</th><th>Уход</th><th>Отработано</th><th>По причине</th><th>Без причины</th></tr>
${rows}
<tr><th>Итого</th><td></td><td></td><td></td><td>${d.totals.planNorm}</td><td></td><td></td><td>${d.totals.worked}</td><td></td><td>${d.totals.onTime}</td><td>${numOrBlank(d.totals.absenceByReason)}</td><td>${d.totals.absenceNoReason}</td><td>${d.totals.total}</td></tr>
</table></body></html>`;
  }

  async function openHtml() {
    const w = window.open('', '_blank');
    if (detail) {
      const html = printDetailHtml(detail);
      if (!w) {
        downloadBlob(`${FILE_BASE}(${fileStamp(detail.generatedAt)}).html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
      w.document.getElementById('btnExcel')?.addEventListener('click', () => void exportExcel());
      return;
    }
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    const html = printHtml(data, sub);
    if (!w) {
      downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      return;
    }
    w.document.open();
    w.document.write(html);
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

  const cols = columnsFor(sub);
  const visible = report ? filterRows(report.rows, sub) : [];

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет по дисциплине посещений</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>
          Фильтр
        </button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report || loadedQs !== queryQs) void generate();
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
        <form className={`${layout.card} ${local.card}`} onSubmit={(e) => void generate(e)}>
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
          <div className={layout.field}>
            <label>Подразделения</label>
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
          {busy && !report && !detail ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : detail ? (
            <>
              <button type="button" className={local.back} onClick={() => setDetail(null)}>
                ← К списку
              </button>
              <div className={local.meta}>
                <span>
                  <strong>Сотрудник:</strong> {detail.employee.fullName}
                </span>
                <span>
                  <strong>Период:</strong> {periodLine(detail).replace('Период: ', '')}
                </span>
              </div>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Дата</th>
                      <th rowSpan={2}>День</th>
                      <th colSpan={3}>План</th>
                      <th colSpan={3}>Факт</th>
                      <th rowSpan={2}>Отсутствие по причине</th>
                      <th rowSpan={2}>Вовремя</th>
                      <th colSpan={2}>Отсутствие</th>
                      <th rowSpan={2}>Итого</th>
                    </tr>
                    <tr>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>Норма</th>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>Отработано</th>
                      <th>По причине</th>
                      <th>Без причины</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.days.map((r) =>
                      r.dayOff ? (
                        <tr key={r.iso} className={local.off}>
                          <td>{r.date}</td>
                          <td>{r.weekday}</td>
                          <td colSpan={6}>Выходной день</td>
                          <td />
                          <td />
                          <td />
                          <td />
                          <td />
                        </tr>
                      ) : (
                        <tr key={r.iso}>
                          <td>{r.date}</td>
                          <td>{r.weekday}</td>
                          <td>{r.planIn}</td>
                          <td>{r.planOut}</td>
                          <td>{r.planNorm ?? ''}</td>
                          <td className={r.late ? local.late : undefined}>{r.factIn}</td>
                          <td>{r.factOut}</td>
                          <td>{r.worked ?? ''}</td>
                          <td>{r.absenceReason}</td>
                          <td>{r.onTime ?? ''}</td>
                          <td>{r.absenceByReason ?? ''}</td>
                          <td>{r.absenceNoReason ?? ''}</td>
                          <td>{r.total ?? ''}</td>
                        </tr>
                      ),
                    )}
                    <tr className={local.foot}>
                      <td>Итого</td>
                      <td />
                      <td />
                      <td />
                      <td>{detail.totals.planNorm}</td>
                      <td />
                      <td />
                      <td>{detail.totals.worked}</td>
                      <td />
                      <td>{detail.totals.onTime}</td>
                      <td>{numOrBlank(detail.totals.absenceByReason)}</td>
                      <td>{detail.totals.absenceNoReason}</td>
                      <td>{detail.totals.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className={local.tabs}>
                {DISCIPLINE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={sub === t.id ? local.tabOn : local.tab}
                    onClick={() => setSub(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className={local.periodLine}>
                <strong>Период:</strong> {periodLine(report).replace('Период: ', '')}
              </p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th>№</th>
                      {cols.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td className={local.empty} colSpan={cols.length + 1}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      visible.map((row, i) => (
                        <tr key={String(row.employeeId || row.tabNumber || i)}>
                          <td>{i + 1}</td>
                          {cols.map((c) => (
                            <td key={c.key} className={c.key === 'fullName' || c.key === 'division' || c.key === 'position' ? local.name : undefined}>
                              {c.key === 'fullName' && row.employeeId ? (
                                <button type="button" className={local.nameLink} onClick={() => void openEmployee(row)}>
                                  {c.render(row)}
                                </button>
                              ) : (
                                c.render(row)
                              )}
                            </td>
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
