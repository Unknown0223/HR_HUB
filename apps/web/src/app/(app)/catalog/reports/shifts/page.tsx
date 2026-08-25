'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx, XLSX_COLORS } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import empS from '../employees/page.module.css';
import att from '../attendance-overview/page.module.css';
import local from './page.module.css';

type Tab = 'filter' | 'view' | 'settings';
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
type Settings = { startTime: string; endTime: string; showEmpty: boolean };
type Row = {
  date: string;
  dateLabel: string;
  employeeId: string;
  tabNumber: string;
  employee: string;
  shiftType: string;
  planIn: string;
  planOut: string;
  planHours: string;
  factIn: string;
  factOut: string;
  factHours: string;
  marksIn: string[];
  marksOut: string[];
  dateWarn: boolean;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  periodLine: string;
  warnLine: string;
  generatedAt?: string;
  rows: Row[];
};

const TITLE = 'Отчет посещений сотрудников по сменам';
const FILE_BASE = 'Отчет-посещений-сотрудников-по-сменам';
const SETTINGS_KEY = 'hrhub.shifts.settings';
const DEFAULT_SETTINGS: Settings = { startTime: '08:00', endTime: '20:00', showEmpty: false };
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
function empKind(t?: string) {
  return t === 'gph' ? 'ГПХ' : 'Основное место работы';
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
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function normTime(s: string) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : '';
}
function markLines(r: Row) {
  const n = Math.max(r.marksIn.length, r.marksOut.length, 1);
  return Array.from({ length: n }, (_, i) => ({
    inn: r.marksIn[i] || '--',
    out: r.marksOut[i] || '--',
  }));
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

export default function ShiftsReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

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
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/employees?limit=500').catch(() => [] as Opt[]);
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
    p.set('startTime', normTime(settings.startTime) || '08:00');
    p.set('endTime', normTime(settings.endTime) || '20:00');
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    p.set('cfg', JSON.stringify({
      startTime: normTime(settings.startTime) || '08:00',
      endTime: normTime(settings.endTime) || '20:00',
      showEmpty: settings.showEmpty,
    }));
    return p.toString();
  }, [from, to, divisionIds, positionIds, employeeIds, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/shifts?${queryQs}`);
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

  function timesOk() {
    return Boolean(normTime(settings.startTime) && normTime(settings.endTime));
  }
  async function generate(e?: FormEvent) {
    e?.preventDefault();
    if (!timesOk()) {
      setError('Укажите время начала и конца смены');
      setTab('settings');
      return;
    }
    const data = await load();
    if (data) setTab('view');
  }
  async function ensureReport() {
    if (report && loadedQs === queryQs) return report;
    return load();
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (report) {
      setTab('view');
      void load();
    }
  }
  function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: TITLE,
      preamble: [payload.periodLine, payload.warnLine, ''],
      topHeader: ['Дата', 'Табельный номер', 'Сотрудник', 'Тип смены', 'План', 'План', 'План', 'Факт', 'Факт', 'Факт', 'Отметки', 'Отметки'],
      columns: ['Дата', 'Табельный номер', 'Сотрудник', 'Тип смены', 'Приход', 'Уход', 'По плану', 'Приход', 'Уход', 'Факт', 'Приход', 'Уход'],
      rows: payload.rows.flatMap((r) => {
        const night = r.shiftType === 'Ночь';
        const nightFill = { fill: 'FFEAD6F5' };
        const planFill = night ? { fill: 'FFD4F1FB' } : undefined;
        const warnFill = r.dateWarn ? { fill: XLSX_COLORS.offDay } : undefined;
        return markLines(r).map((line) => [
          { v: r.dateLabel, s: r.dateWarn ? { fill: XLSX_COLORS.offDay, fontColor: 'FFC27D00', bold: true } : undefined },
          r.tabNumber,
          { v: r.employee, s: { align: 'left' } },
          { v: r.shiftType, s: night ? nightFill : undefined },
          { v: r.planIn, s: planFill },
          { v: r.planOut, s: planFill },
          { v: r.planHours, s: planFill },
          r.factIn,
          r.factOut,
          r.factHours,
          { v: line.inn, s: warnFill },
          { v: line.out, s: warnFill },
        ]);
      }),
      colWidths: [12, 16, 42, 12, 10, 10, 10, 10, 10, 10, 12, 12],
    });
  }
  function csvText(data: Payload) {
    const head = ['Дата', 'Табельный номер', 'Сотрудник', 'Тип смены', 'План приход', 'План уход', 'По плану', 'Факт приход', 'Факт уход', 'Факт', 'Отметки приход', 'Отметки уход'];
    const lines = [
      data.periodLine,
      data.warnLine,
      head.map((c) => `"${c}"`).join(';'),
      ...data.rows.map((r) =>
        [r.dateLabel, r.tabNumber, r.employee, r.shiftType, r.planIn, r.planOut, r.planHours, r.factIn, r.factOut, r.factHours, r.marksIn.join(', '), r.marksOut.join(', ')]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];
    return `\ufeff${lines.join('\n')}`;
  }
  function xmlText(data: Payload) {
    const body = data.rows
      .map((r) => `<row date="${r.date}" tab="${escapeHtml(r.tabNumber)}" employee="${escapeHtml(r.employee)}" shift="${escapeHtml(r.shiftType)}" fact="${escapeHtml(r.factHours)}"/>`)
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}">${body}</report>`;
  }
  function printHtml(data: Payload) {
    const body = data.rows
      .map((r) => {
        const lines = markLines(r);
        const night = r.shiftType === 'Ночь';
        return lines
          .map((line, i) => {
            const head = i === 0
              ? `<td rowspan="${lines.length}"${r.dateWarn ? ' class="warn"' : ''}><a href="/attendance/marks?employeeId=${encodeURIComponent(r.employeeId)}&dateFrom=${r.date}&dateTo=${r.date}">${escapeHtml(r.dateLabel)}</a></td>
          <td rowspan="${lines.length}">${escapeHtml(r.tabNumber)}</td>
          <td rowspan="${lines.length}" class="name">${escapeHtml(r.employee)}</td>
          <td rowspan="${lines.length}"${night ? ' class="night"' : ''}>${escapeHtml(r.shiftType)}</td>
          <td rowspan="${lines.length}"${night ? ' class="nplan"' : ''}>${escapeHtml(r.planIn)}</td>
          <td rowspan="${lines.length}"${night ? ' class="nplan"' : ''}>${escapeHtml(r.planOut)}</td>
          <td rowspan="${lines.length}"${night ? ' class="nplan"' : ''}>${escapeHtml(r.planHours)}</td>
          <td rowspan="${lines.length}">${escapeHtml(r.factIn)}</td>
          <td rowspan="${lines.length}">${escapeHtml(r.factOut)}</td>
          <td rowspan="${lines.length}">${escapeHtml(r.factHours)}</td>`
              : '';
            return `<tr>${head}<td${r.dateWarn ? ' class="my"' : ''}>${escapeHtml(line.inn)}</td><td${r.dateWarn ? ' class="my"' : ''}>${escapeHtml(line.out)}</td></tr>`;
          })
          .join('');
      })
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.wrap{padding:16px}
.warnbox{background:#fff8dd;border:1px solid #ffe8a3;padding:8px 10px;font-size:12px;margin:0 16px 12px}
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;text-align:center;vertical-align:middle}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}
.warn{background:#fff3cd;color:#c27d00;font-weight:700}
.night{background:#ead6f5}
.nplan{background:#d4f1fb}
.my{background:#fff3cd}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px;text-align:center">${escapeHtml(data.periodLine)}</p>
<p class="warnbox">${escapeHtml(data.warnLine)}</p>
<div class="wrap"><table>
<thead><tr><th rowspan="2">Дата</th><th rowspan="2">Табельный номер</th><th rowspan="2">Сотрудник</th><th rowspan="2">Тип смены</th><th colspan="3">План</th><th colspan="3">Факт</th><th colspan="2">Отметки</th></tr>
<tr><th>Приход</th><th>Уход</th><th>По плану</th><th>Приход</th><th>Уход</th><th>Факт</th><th>Приход</th><th>Уход</th></tr></thead>
<tbody>${body || '<tr><td colspan="12">Нет данных</td></tr>'}</tbody>
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
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>Настройки</button>
        {tab === 'settings' ? (
          <>
            <button type="button" className={layout.tab} onClick={saveSettings}>Сохранить</button>
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

      {tab === 'filter' ? (
        <form className={`${layout.card} ${local.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Период</label>
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
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
              {busy ? 'Формирование…' : 'Генерировать'}
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
              <p className={local.warn}>{report.warnLine}</p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Дата</th>
                      <th rowSpan={2}>Табельный номер</th>
                      <th rowSpan={2}>Сотрудник</th>
                      <th rowSpan={2}>Тип смены</th>
                      <th colSpan={3}>План</th>
                      <th colSpan={3}>Факт</th>
                      <th colSpan={2}>Отметки</th>
                    </tr>
                    <tr>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>По плану</th>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>Факт</th>
                      <th>Приход</th>
                      <th>Уход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={12}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.flatMap((r) => {
                        const lines = markLines(r);
                        const night = r.shiftType === 'Ночь';
                        return lines.map((line, i) => (
                          <tr key={`${r.employeeId}-${r.date}-${i}`}>
                            {i === 0 ? (
                              <>
                                <td rowSpan={lines.length} className={r.dateWarn ? local.dateWarn : undefined}>
                                  <Link
                                    className={local.dateLink}
                                    href={`/attendance/marks?employeeId=${encodeURIComponent(r.employeeId)}&dateFrom=${encodeURIComponent(r.date)}&dateTo=${encodeURIComponent(r.date)}`}
                                  >
                                    {r.dateLabel}
                                  </Link>
                                </td>
                                <td rowSpan={lines.length}>{r.tabNumber}</td>
                                <td rowSpan={lines.length} className={local.name}>{r.employee}</td>
                                <td rowSpan={lines.length} className={night ? local.night : undefined}>{r.shiftType}</td>
                                <td rowSpan={lines.length} className={night ? local.nightPlan : undefined}>{r.planIn}</td>
                                <td rowSpan={lines.length} className={night ? local.nightPlan : undefined}>{r.planOut}</td>
                                <td rowSpan={lines.length} className={night ? local.nightPlan : undefined}>{r.planHours}</td>
                                <td rowSpan={lines.length}>{r.factIn}</td>
                                <td rowSpan={lines.length}>{r.factOut}</td>
                                <td rowSpan={lines.length}>{r.factHours}</td>
                              </>
                            ) : null}
                            <td className={r.dateWarn ? local.markWarn : undefined}>{line.inn}</td>
                            <td className={r.dateWarn ? local.markWarn : undefined}>{line.out}</td>
                          </tr>
                        ));
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={local.settings}>
          <div className={local.times}>
            <div className={layout.field}>
              <label className={local.req}>Начало</label>
              <input
                className={`${local.timeInput}${settings.startTime ? '' : ` ${local.timeBad}`}`}
                type="time"
                value={settings.startTime}
                required
                onChange={(e) => setSettings((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div className={layout.field}>
              <label className={local.req}>Конец</label>
              <input
                className={`${local.timeInput}${settings.endTime ? '' : ` ${local.timeBad}`}`}
                type="time"
                value={settings.endTime}
                required
                onChange={(e) => setSettings((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>
          <label className={local.check}>
            <input
              type="checkbox"
              checked={settings.showEmpty}
              onChange={(e) => setSettings((p) => ({ ...p, showEmpty: e.target.checked }))}
            />
            <span className={local.box} aria-hidden />
            <span>Настройка отображения дней без отметок</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
