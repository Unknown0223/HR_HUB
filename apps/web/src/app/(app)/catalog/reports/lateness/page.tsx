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

type Tab = 'filter' | 'view' | 'settings';
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
type TimeRule = { from: string; to: string; amount: string };
type MinuteRule = { from: string; to: string; amount: string };
type Settings = {
  mode: 'time' | 'minutes';
  timeRules: TimeRule[];
  minuteRules: MinuteRule[];
};
type Template = { id: string; name: string; settings: Settings };
type Row = {
  n: number;
  employeeId: string;
  tabNumber: string;
  employee: string;
  division: string;
  position: string;
  lateCount: number;
  totalAmount: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  periodLine: string;
  generatedAt?: string;
  rows: Row[];
};

const TITLE = 'Отчет по опозданиям';
const FILE_BASE = 'Отчет-по-опозданиям';
const SETTINGS_KEY = 'hrhub.lateness.settings';
const FILTER_TPL_KEY = 'hrhub.lateness.filter-templates';
const SETTINGS_TPL_KEY = 'hrhub.lateness.settings-templates';
const emptyTime = (): TimeRule => ({ from: '', to: '', amount: '' });
const emptyMinute = (): MinuteRule => ({ from: '', to: '', amount: '' });
const DEFAULT_SETTINGS: Settings = {
  mode: 'time',
  timeRules: [emptyTime()],
  minuteRules: [emptyMinute()],
};
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
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...(fallback as object), ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}
function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
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

export default function LatenessReportPage() {
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
  const [filterTpls, setFilterTpls] = useState<Template[]>([]);
  const [settingsTpls, setSettingsTpls] = useState<Template[]>([]);
  const [filterTplOpen, setFilterTplOpen] = useState(false);
  const [filterTplNew, setFilterTplNew] = useState(false);
  const [filterTplName, setFilterTplName] = useState('');
  const [settingsTplOpen, setSettingsTplOpen] = useState(false);
  const [settingsTplNew, setSettingsTplNew] = useState(false);
  const [settingsTplName, setSettingsTplName] = useState('');
  const [settingsErr, setSettingsErr] = useState('');
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = loadJson<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
    setSettings({
      mode: s.mode === 'minutes' ? 'minutes' : 'time',
      timeRules: s.timeRules?.length ? s.timeRules : [emptyTime()],
      minuteRules: s.minuteRules?.length ? s.minuteRules : [emptyMinute()],
    });
    setFilterTpls(loadList<Template>(FILTER_TPL_KEY));
    setSettingsTpls(loadList<Template>(SETTINGS_TPL_KEY));
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
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    p.set('cfg', JSON.stringify({
      mode: settings.mode,
      timeRules: settings.timeRules.map((r) => ({ from: r.from, to: r.to, amount: Number(r.amount) || 0 })),
      minuteRules: settings.minuteRules.map((r) => ({ from: r.from, to: r.to, amount: Number(r.amount) || 0 })),
    }));
    return p.toString();
  }, [from, to, divisionIds, positionIds, employeeIds, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/lateness?${queryQs}`);
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

  function validateSettings(): boolean {
    if (settings.mode === 'time') {
      for (const r of settings.timeRules) {
        if (!r.from || !r.to) {
          setSettingsErr('Обнаружены пустые поля');
          return false;
        }
        if (!r.amount.trim()) {
          setSettingsErr('Значение для суммы отсутствует');
          return false;
        }
      }
    } else {
      for (const r of settings.minuteRules) {
        if (r.from === '' || r.to === '') {
          setSettingsErr('Обнаружены пустые поля');
          return false;
        }
        if (!r.amount.trim()) {
          setSettingsErr('Значение для суммы отсутствует');
          return false;
        }
      }
    }
    setSettingsErr('');
    return true;
  }
  function saveSettings() {
    if (!validateSettings()) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (report) {
      setTab('view');
      void load();
    }
  }
  function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS, timeRules: [emptyTime()], minuteRules: [emptyMinute()] });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    setSettingsErr('');
  }

  function saveFilterTemplate() {
    const name = filterTplName.trim();
    if (!name) return;
    const payload = [
      ...loadList<Template & { filter?: unknown }>(FILTER_TPL_KEY),
      {
        id: `${Date.now()}`,
        name,
        settings: { mode: settings.mode, timeRules: [], minuteRules: [] },
        filter: { from, to, divisionIds, positionIds, employeeIds, mode: settings.mode },
      },
    ];
    localStorage.setItem(FILTER_TPL_KEY, JSON.stringify(payload));
    setFilterTpls(payload);
    setFilterTplName('');
    setFilterTplNew(false);
    setFilterTplOpen(false);
  }
  function applyFilterTemplate(t: Template & { filter?: { from?: string; to?: string; divisionIds?: string[]; positionIds?: string[]; employeeIds?: string[]; mode?: 'time' | 'minutes' } }) {
    const f = t.filter;
    if (f) {
      if (f.from) setFrom(f.from);
      if (f.to) setTo(f.to);
      setDivisionIds(f.divisionIds || []);
      setPositionIds(f.positionIds || []);
      setEmployeeIds(f.employeeIds || []);
      if (f.mode) setSettings((p) => ({ ...p, mode: f.mode! }));
    }
    setFilterTplOpen(false);
  }
  function saveSettingsTemplate() {
    const name = settingsTplName.trim();
    if (!name) return;
    if (!validateSettings()) return;
    const payload = [...settingsTpls, { id: `${Date.now()}`, name, settings: JSON.parse(JSON.stringify(settings)) as Settings }];
    localStorage.setItem(SETTINGS_TPL_KEY, JSON.stringify(payload));
    setSettingsTpls(payload);
    setSettingsTplName('');
    setSettingsTplNew(false);
    setSettingsTplOpen(false);
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: TITLE,
      preamble: [payload.periodLine, ''],
      columns: ['№', 'Табельный номер', 'Сотрудник', 'Организационная единица', 'Должность', 'Количество опозданий', 'Общая сумма'],
      rows: payload.rows.map((r) => [
        r.n,
        r.tabNumber,
        { v: r.employee, s: { align: 'left' } },
        { v: r.division, s: { align: 'left' } },
        { v: r.position, s: { align: 'left' } },
        r.lateCount,
        r.totalAmount,
      ]),
      colWidths: [8, 16, 42, 28, 20, 18, 14],
    });
  }
  function csvText(data: Payload) {
    const head = ['№', 'Табельный номер', 'Сотрудник', 'Организационная единица', 'Должность', 'Количество опозданий', 'Общая сумма'];
    const lines = [
      data.periodLine,
      head.map((c) => `"${c}"`).join(';'),
      ...data.rows.map((r) =>
        [r.n, r.tabNumber, r.employee, r.division, r.position, r.lateCount, r.totalAmount]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];
    return `\ufeff${lines.join('\n')}`;
  }
  function xmlText(data: Payload) {
    const body = data.rows
      .map((r) => `<row n="${r.n}" tab="${escapeHtml(r.tabNumber)}" employee="${escapeHtml(r.employee)}" late="${r.lateCount}" sum="${r.totalAmount}"/>`)
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}">${body}</report>`;
  }
  function printHtml(data: Payload) {
    const body = data.rows
      .map((r) => `<tr>
<td>${r.n}</td>
<td>${escapeHtml(r.tabNumber)}</td>
<td class="name">${escapeHtml(r.employee)}</td>
<td class="name">${escapeHtml(r.division)}</td>
<td class="name">${escapeHtml(r.position)}</td>
<td>${r.lateCount}</td>
<td>${r.totalAmount}</td>
</tr>`)
      .join('');
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
tr:nth-child(even){background:#f9fafb}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px;text-align:center">${escapeHtml(data.periodLine)}</p>
<div class="wrap"><table>
<thead><tr><th>№</th><th>Табельный номер</th><th>Сотрудник</th><th>Организационная единица</th><th>Должность</th><th>Количество опозданий</th><th>Общая сумма</th></tr></thead>
<tbody>${body || '<tr><td colspan="7">Нет данных</td></tr>'}</tbody>
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
          <div className={local.filterGrid}>
            <div className={layout.field}>
              <label>Период</label>
              <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
            </div>
            <div className={local.tplBox}>
              <span className={local.tplLabel}>Шаблоны</span>
              <div className={local.tplMenu}>
                <button type="button" className={local.tplBtn} onClick={() => { setFilterTplOpen((v) => !v); setFilterTplNew(false); }}>
                  Создать шаблон ▾
                </button>
                {filterTplOpen && !filterTplNew ? (
                  <div className={local.tplDrop}>
                    <button type="button" className={local.tplItem} onClick={() => setFilterTplNew(true)}>Новый шаблон</button>
                    {filterTpls.map((t) => (
                      <button type="button" key={t.id} className={local.tplItem} onClick={() => applyFilterTemplate(t as Template & { filter?: never })}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {filterTplNew ? (
                  <div className={local.tplPopover}>
                    <p className={local.tplTitle}>Новый шаблон</p>
                    <input className={local.tplInput} value={filterTplName} onChange={(e) => setFilterTplName(e.target.value)} placeholder="Название" />
                    <div className={local.tplActions}>
                      <button type="button" className={local.tplSave} onClick={saveFilterTemplate}>Сохранить</button>
                      <button type="button" className={local.tplCancel} onClick={() => { setFilterTplNew(false); setFilterTplOpen(false); }}>Отменить</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
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
          <div className={layout.field}>
            <label>Настройки фильтра</label>
            <div className={local.radioGroup}>
              <label className={local.radio}>
                <input type="radio" name="lateMode" checked={settings.mode === 'time'} onChange={() => setSettings((p) => ({ ...p, mode: 'time' }))} />
                по времени
              </label>
              <label className={local.radio}>
                <input type="radio" name="lateMode" checked={settings.mode === 'minutes'} onChange={() => setSettings((p) => ({ ...p, mode: 'minutes' }))} />
                по минутам
              </label>
            </div>
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
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Табельный номер</th>
                      <th>Сотрудник</th>
                      <th>Организационная единица</th>
                      <th>Должность</th>
                      <th>Количество опозданий</th>
                      <th>Общая сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr><td colSpan={7}>Нет данных</td></tr>
                    ) : (
                      report.rows.map((r) => (
                        <tr key={r.employeeId}>
                          <td>{r.n}</td>
                          <td>{r.tabNumber}</td>
                          <td className={local.name}>{r.employee}</td>
                          <td className={local.name}>{r.division}</td>
                          <td className={local.name}>{r.position}</td>
                          <td className={local.num}>{r.lateCount}</td>
                          <td className={local.num}>{r.totalAmount}</td>
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

      {tab === 'settings' ? (
        <div className={`${layout.card} ${local.settings}`}>
          <div className={local.settingsHead}>
            <div className={local.tplBox}>
              <span className={local.tplLabel}>Шаблон настроек</span>
              <div className={local.tplMenu}>
                <button type="button" className={local.tplBtn} onClick={() => { setSettingsTplOpen((v) => !v); setSettingsTplNew(false); }}>
                  Создать шаблон ▾
                </button>
                {settingsTplOpen && !settingsTplNew ? (
                  <div className={local.tplDrop}>
                    <button type="button" className={local.tplItem} onClick={() => setSettingsTplNew(true)}>Новый шаблон</button>
                    {settingsTpls.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={local.tplItem}
                        onClick={() => {
                          setSettings(JSON.parse(JSON.stringify(t.settings)) as Settings);
                          setSettingsTplOpen(false);
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {settingsTplNew ? (
                  <div className={local.tplPopover}>
                    <p className={local.tplTitle}>Новый шаблон</p>
                    <input className={local.tplInput} value={settingsTplName} onChange={(e) => setSettingsTplName(e.target.value)} placeholder="Название" />
                    <div className={local.tplActions}>
                      <button type="button" className={local.tplSave} onClick={saveSettingsTemplate}>Сохранить</button>
                      <button type="button" className={local.tplCancel} onClick={() => { setSettingsTplNew(false); setSettingsTplOpen(false); }}>Отменить</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <h3 className={local.sectionTitle}>Настройки по времени</h3>
            {settings.timeRules.map((r, i) => (
              <div key={`t-${i}`} className={local.ruleRow}>
                <div className={local.ruleField}>
                  <label>от</label>
                  <input className={local.ruleInput} type="time" value={r.from} onChange={(e) => setSettings((p) => {
                    const timeRules = [...p.timeRules];
                    timeRules[i] = { ...timeRules[i], from: e.target.value };
                    return { ...p, timeRules };
                  })} />
                </div>
                <div className={local.ruleField}>
                  <label>до</label>
                  <input className={local.ruleInput} type="time" value={r.to} onChange={(e) => setSettings((p) => {
                    const timeRules = [...p.timeRules];
                    timeRules[i] = { ...timeRules[i], to: e.target.value };
                    return { ...p, timeRules };
                  })} />
                </div>
                <div className={local.ruleField}>
                  <label>Сумма</label>
                  <input className={local.ruleInput} type="number" value={r.amount} onChange={(e) => setSettings((p) => {
                    const timeRules = [...p.timeRules];
                    timeRules[i] = { ...timeRules[i], amount: e.target.value };
                    return { ...p, timeRules };
                  })} />
                </div>
                {i === settings.timeRules.length - 1 ? (
                  <button type="button" className={local.addBtn} onClick={() => setSettings((p) => ({ ...p, timeRules: [...p.timeRules, emptyTime()] }))}>+</button>
                ) : (
                  <button type="button" className={local.delBtn} onClick={() => setSettings((p) => ({ ...p, timeRules: p.timeRules.filter((_, j) => j !== i) }))}>×</button>
                )}
              </div>
            ))}
          </div>

          <div>
            <h3 className={local.sectionTitle}>Настройки по минутам</h3>
            {settings.minuteRules.map((r, i) => (
              <div key={`m-${i}`} className={local.ruleRow}>
                <div className={local.ruleField}>
                  <label>от</label>
                  <input className={local.ruleInput} type="number" min={0} value={r.from} onChange={(e) => setSettings((p) => {
                    const minuteRules = [...p.minuteRules];
                    minuteRules[i] = { ...minuteRules[i], from: e.target.value };
                    return { ...p, minuteRules };
                  })} />
                </div>
                <div className={local.ruleField}>
                  <label>до</label>
                  <input className={local.ruleInput} type="number" min={0} value={r.to} onChange={(e) => setSettings((p) => {
                    const minuteRules = [...p.minuteRules];
                    minuteRules[i] = { ...minuteRules[i], to: e.target.value };
                    return { ...p, minuteRules };
                  })} />
                </div>
                <div className={local.ruleField}>
                  <label>Сумма</label>
                  <input className={local.ruleInput} type="number" value={r.amount} onChange={(e) => setSettings((p) => {
                    const minuteRules = [...p.minuteRules];
                    minuteRules[i] = { ...minuteRules[i], amount: e.target.value };
                    return { ...p, minuteRules };
                  })} />
                </div>
                {i === settings.minuteRules.length - 1 ? (
                  <button type="button" className={local.addBtn} onClick={() => setSettings((p) => ({ ...p, minuteRules: [...p.minuteRules, emptyMinute()] }))}>+</button>
                ) : (
                  <button type="button" className={local.delBtn} onClick={() => setSettings((p) => ({ ...p, minuteRules: p.minuteRules.filter((_, j) => j !== i) }))}>×</button>
                )}
              </div>
            ))}
          </div>
          {settingsErr ? <p className={local.fieldErr}>{settingsErr}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
