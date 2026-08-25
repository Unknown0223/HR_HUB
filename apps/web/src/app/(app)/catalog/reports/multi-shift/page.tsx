'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import empS from '../employees/page.module.css';
import att from '../attendance-overview/page.module.css';
import local from './page.module.css';

type Tab = 'filter' | 'view';
type Opt = {
  id: string;
  label: string;
  name?: string;
  tabNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  kind?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type DetailRow = {
  date: string;
  dateLabel: string;
  employeeId: string;
  tabNumber: string;
  employee: string;
  schedule: string;
  shift: string;
  planIn: string;
  planOut: string;
  planHours: number | null;
  factIn: string;
  factOut: string;
  factHours: number | null;
  night: boolean;
};
type SummaryRow = {
  n: number;
  employeeId: string;
  tabNumber: string;
  employee: string;
  schedule: string;
  shifts: number;
  plan: number;
  fact: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  details: boolean;
  periodLine: string;
  generatedAt?: string;
  rows: DetailRow[] | SummaryRow[];
  detailRows: DetailRow[];
  summary: SummaryRow[];
};

const TITLE = 'Отчет посещений по многосменным графикам';
const FILE_BASE = 'Отчет-посещений-по-многосменным-графикам';
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
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
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
function isDetail(payload: Payload): payload is Payload & { rows: DetailRow[] } {
  return payload.details;
}
function fmtNum(n: number | null | undefined) {
  return n == null || Number.isNaN(n) ? '' : String(n);
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
  function cal(month: Date) {
    return (
      <div>
        <div className={extra.calHead}>
          <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
          <span>{MONTHS_LONG[month.getMonth()]} {month.getFullYear()}</span>
          <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
        </div>
        <div className={extra.week}>{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(today, today)}>Сегодня</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(yest, yest)}>Вчера</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(last7, today)}>Последние 7 дней</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(lastMonday, lastSunday)}>Прошлая неделя</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(month0, mid)}>Первая половина месяца</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(midNext, monthEnd)}>Вторая половина месяца</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(last30, today)}>Последние 30 дней</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(month0, today)}>Текущий месяц</button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(prevMonth0, prevMonth1)}>Прошлый месяц</button>
            <button type="button" className={extra.presetOn}>Пользовательский диапазон</button>
          </div>
          <div className={extra.calendars}>
            <div className={extra.inputs}>
              <input value={draftFrom.split('-').reverse().join('.')} readOnly />
              <input value={draftTo.split('-').reverse().join('.')} readOnly />
            </div>
            <div className={extra.calRow}>
              {cal(view)}
              {cal(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            </div>
            <div className={extra.footer}>
              <button type="button" className={extra.apply} onClick={() => { onChange(draftFrom, draftTo); setOpen(false); }}>Применить</button>
              <button type="button" className={extra.cancel} onClick={() => setOpen(false)}>Отменить</button>
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
  emptyLabel = 'Поиск...',
}: {
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
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
  const chosen = options.filter((o) => selected.includes(o.id));
  const fieldText = chosen.length === 1 ? chosen[0].label : chosen.length ? `Выбрано: ${chosen.length}` : emptyLabel;
  return (
    <div className={`${att.dropWrap}${open ? ` ${att.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`} onClick={() => setOpen((v) => { if (v) setQ(''); return !v; })}>
        {fieldText}
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
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)}`.toLowerCase().includes(needle))
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
            <div className={att.empHead} style={{ gridTemplateColumns: '28px 140px 1fr' }}>
              <span />
              <span>Табельный номер</span>
              <span>Сотрудник</span>
            </div>
            {filtered.length === 0 ? <div className={empS.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${att.empRow} ${att.empOn}` : att.empRow} style={{ gridTemplateColumns: '28px 140px 1fr' }} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={att.box} readOnly checked={on} tabIndex={-1} />
                  <span>{o.tabNumber || '—'}</span>
                  <span>{empName(o)}</span>
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

export default function MultiShiftReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [scheduleIds, setScheduleIds] = useState<string[]>([]);
  const [details, setDetails] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [schedules, setSchedules] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{
        employees?: Opt[];
        positions?: Opt[];
        schedules?: Opt[];
      }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
        positions: [] as Opt[],
        schedules: [] as Opt[],
      }));
      let emps = lookups.employees || [];
      let poss = lookups.positions || [];
      if (!emps.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/employees?limit=500').catch(() => [] as Opt[]);
        emps = Array.isArray(raw) ? raw : raw.items || [];
      }
      if (!poss.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/organization/positions').catch(() => [] as Opt[]);
        const list = Array.isArray(raw) ? raw : raw.items || [];
        poss = list.map((p) => ({ id: p.id, label: p.label || (p as { name?: string }).name || p.id }));
      }
      const allSched = (lookups.schedules || []).map((s) => ({
        id: s.id,
        label: (s.label || s.name || s.id).toString(),
        kind: s.kind,
      }));
      const multi = allSched.filter((s) => s.kind === 'multi_shift' || s.kind === 'advanced_multi_shift');
      setSchedules(multi.length ? multi : allSched);
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
    p.set('details', details ? '1' : '0');
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (scheduleIds.length) p.set('scheduleIds', scheduleIds.join(','));
    return p.toString();
  }, [from, to, details, divisionIds, positionIds, employeeIds, scheduleIds]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/multi-shift?${queryQs}`);
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
    if (!scheduleIds.length) {
      setError('Укажите график работы');
      setTab('filter');
      return;
    }
    const data = await load();
    if (data) setTab('view');
  }
  async function ensureReport() {
    if (!scheduleIds.length) {
      setError('Укажите график работы');
      setTab('filter');
      return null;
    }
    if (report && loadedQs === queryQs) return report;
    return load();
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    if (payload.details) {
      await downloadStyledXlsx({
        filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
        title: TITLE,
        preamble: [payload.periodLine, ''],
        topHeader: ['Дата', 'Табельный номер', 'Сотрудник', 'Смена', 'План', 'План', 'План', 'Факт', 'Факт', 'Факт'],
        columns: ['Дата', 'Табельный номер', 'Сотрудник', 'Смена', 'Приход', 'Уход', 'Часы', 'Приход', 'Уход', 'Часы'],
        rows: payload.detailRows.map((r) => {
          const nightFill = r.night ? { fill: 'FFEAD6F5' } : undefined;
          const planFill = r.night ? { fill: 'FFD4F1FB' } : undefined;
          return [
            { v: r.dateLabel, s: { fontColor: 'FF3699FF' } },
            r.tabNumber,
            { v: r.employee, s: { align: 'left' } },
            { v: r.shift, s: nightFill },
            { v: r.planIn, s: planFill },
            { v: r.planOut, s: planFill },
            { v: fmtNum(r.planHours), s: planFill },
            r.factIn,
            r.factOut,
            fmtNum(r.factHours),
          ];
        }),
        colWidths: [12, 16, 42, 16, 10, 10, 10, 10, 10, 10],
      });
      return;
    }
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: TITLE,
      preamble: [payload.periodLine, ''],
      columns: ['№', 'Табельный номер', 'Сотрудник', 'График', 'Смен', 'План', 'Факт'],
      rows: payload.summary.map((r) => [
        r.n,
        r.tabNumber,
        { v: r.employee, s: { align: 'left' } },
        r.schedule,
        r.shifts,
        r.plan,
        r.fact,
      ]),
      colWidths: [8, 16, 42, 28, 10, 10, 10],
    });
  }
  function csvText(data: Payload) {
    if (data.details) {
      const head = ['Дата', 'Табельный номер', 'Сотрудник', 'Смена', 'План приход', 'План уход', 'План', 'Факт приход', 'Факт уход', 'Факт'];
      const lines = [
        data.periodLine,
        head.map((c) => `"${c}"`).join(';'),
        ...data.detailRows.map((r) =>
          [r.dateLabel, r.tabNumber, r.employee, r.shift, r.planIn, r.planOut, fmtNum(r.planHours), r.factIn, r.factOut, fmtNum(r.factHours)]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(';'),
        ),
      ];
      return `\ufeff${lines.join('\n')}`;
    }
    const head = ['№', 'Табельный номер', 'Сотрудник', 'График', 'Смен', 'План', 'Факт'];
    const lines = [
      data.periodLine,
      head.map((c) => `"${c}"`).join(';'),
      ...data.summary.map((r) =>
        [r.n, r.tabNumber, r.employee, r.schedule, r.shifts, r.plan, r.fact]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];
    return `\ufeff${lines.join('\n')}`;
  }
  function xmlText(data: Payload) {
    const body = data.details
      ? data.detailRows
          .map((r) => `<row date="${r.date}" tab="${escapeHtml(r.tabNumber)}" employee="${escapeHtml(r.employee)}" shift="${escapeHtml(r.shift)}" plan="${fmtNum(r.planHours)}" fact="${fmtNum(r.factHours)}"/>`)
          .join('')
      : data.summary
          .map((r) => `<row tab="${escapeHtml(r.tabNumber)}" employee="${escapeHtml(r.employee)}" schedule="${escapeHtml(r.schedule)}" shifts="${r.shifts}" plan="${r.plan}" fact="${r.fact}"/>`)
          .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}">${body}</report>`;
  }
  function printHtml(data: Payload) {
    const table = data.details
      ? `<thead><tr><th rowspan="2">Дата</th><th rowspan="2">Табельный номер</th><th rowspan="2">Сотрудник</th><th rowspan="2">Смена</th><th colspan="3">План</th><th colspan="3">Факт</th></tr>
<tr><th>Приход</th><th>Уход</th><th>Часы</th><th>Приход</th><th>Уход</th><th>Часы</th></tr></thead>
<tbody>${data.detailRows.map((r) => `<tr>
<td><a href="/attendance/marks?employeeId=${encodeURIComponent(r.employeeId)}&dateFrom=${r.date}&dateTo=${r.date}">${escapeHtml(r.dateLabel)}</a></td>
<td>${escapeHtml(r.tabNumber)}</td>
<td class="name">${escapeHtml(r.employee)}</td>
<td${r.night ? ' class="night"' : ''}>${escapeHtml(r.shift)}</td>
<td${r.night ? ' class="nplan"' : ''}>${escapeHtml(r.planIn)}</td>
<td${r.night ? ' class="nplan"' : ''}>${escapeHtml(r.planOut)}</td>
<td${r.night ? ' class="nplan"' : ''}>${fmtNum(r.planHours)}</td>
<td>${escapeHtml(r.factIn)}</td>
<td>${escapeHtml(r.factOut)}</td>
<td>${fmtNum(r.factHours)}</td>
</tr>`).join('') || '<tr><td colspan="10">Нет данных</td></tr>'}</tbody>`
      : `<thead><tr><th>№</th><th>Табельный номер</th><th>Сотрудник</th><th>График</th><th>Смен</th><th>План</th><th>Факт</th></tr></thead>
<tbody>${data.summary.map((r) => `<tr>
<td>${r.n}</td>
<td>${escapeHtml(r.tabNumber)}</td>
<td class="name">${escapeHtml(r.employee)}</td>
<td>${escapeHtml(r.schedule)}</td>
<td>${r.shifts}</td>
<td>${r.plan}</td>
<td>${r.fact}</td>
</tr>`).join('') || '<tr><td colspan="7">Нет данных</td></tr>'}</tbody>`;
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.wrap{padding:16px}
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;text-align:center;vertical-align:middle}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}
.night{background:#ead6f5}
.nplan{background:#d4f1fb}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px;text-align:center">${escapeHtml(data.periodLine)}</p>
<div class="wrap"><table>${table}</table></div></body></html>`;
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
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>Excel</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).csv`, new Blob([csvText(d)], { type: 'text/csv;charset=utf-8' })))}>CSV</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).xml`, new Blob([xmlText(d)], { type: 'application/xml;charset=utf-8' })))}>XML</button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>{TITLE}</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>Фильтр</button>
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
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
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
          <div className={layout.field}>
            <label className={local.req}>График работы</label>
            <FilterPick options={schedules} selected={scheduleIds} onChange={setScheduleIds} />
          </div>
          <div className={layout.field}>
            <label>Вид отчета</label>
            <div className={local.toggleRow}>
              <span className={local.toggleLabel}>С деталями</span>
              <button
                type="button"
                className={`${local.switch}${details ? ` ${local.switchOn}` : ''}`}
                aria-pressed={details}
                onClick={() => setDetails((v) => !v)}
              />
            </div>
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
              <p className={local.meta}>{report.periodLine}</p>
              <div className={local.tableWrap}>
                {isDetail(report) ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>Дата</th>
                        <th rowSpan={2}>Табельный номер</th>
                        <th rowSpan={2}>Сотрудник</th>
                        <th rowSpan={2}>Смена</th>
                        <th colSpan={3}>План</th>
                        <th colSpan={3}>Факт</th>
                      </tr>
                      <tr>
                        <th>Приход</th>
                        <th>Уход</th>
                        <th>Часы</th>
                        <th>Приход</th>
                        <th>Уход</th>
                        <th>Часы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.detailRows.length === 0 ? (
                        <tr>
                          <td colSpan={10}>Нет данных</td>
                        </tr>
                      ) : (
                        report.detailRows.map((r) => (
                          <tr key={`${r.employeeId}-${r.date}`}>
                            <td>
                              <Link
                                className={local.dateLink}
                                href={`/attendance/marks?employeeId=${encodeURIComponent(r.employeeId)}&dateFrom=${encodeURIComponent(r.date)}&dateTo=${encodeURIComponent(r.date)}`}
                              >
                                {r.dateLabel}
                              </Link>
                            </td>
                            <td>{r.tabNumber}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={r.night ? local.night : undefined}>{r.shift}</td>
                            <td className={r.night ? local.nightPlan : undefined}>{r.planIn}</td>
                            <td className={r.night ? local.nightPlan : undefined}>{r.planOut}</td>
                            <td className={r.night ? local.nightPlan : undefined}>{fmtNum(r.planHours)}</td>
                            <td>{r.factIn}</td>
                            <td>{r.factOut}</td>
                            <td>{fmtNum(r.factHours)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Табельный номер</th>
                        <th>Сотрудник</th>
                        <th>График</th>
                        <th>Смен</th>
                        <th>План</th>
                        <th>Факт</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.summary.length === 0 ? (
                        <tr>
                          <td colSpan={7}>Нет данных</td>
                        </tr>
                      ) : (
                        report.summary.map((r) => (
                          <tr key={r.employeeId}>
                            <td>{r.n}</td>
                            <td>{r.tabNumber}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={local.name}>{r.schedule}</td>
                            <td>{r.shifts}</td>
                            <td>{r.plan}</td>
                            <td>{r.fact}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
