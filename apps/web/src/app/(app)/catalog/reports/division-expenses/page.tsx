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

type Tab = 'params' | 'view' | 'settings';
type ViewKind = 'detailed' | 'additional' | 'byDivision';
type Opt = { id: string; label: string; tabNumber?: string; lastName?: string; firstName?: string; middleName?: string; name?: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Settings = { showUserPlanFact: boolean };
type DayMeta = { iso: string; dd: string; weekday: string; weekend: boolean };
type DetailedRow = {
  n: number;
  division: string;
  employee: string;
  position: string;
  salary: number;
  hours: number[];
  totalHours: number;
  accrued: number;
  extraHours: number[];
  extraTotalHours: number;
  extraAccrued: number;
  travel: number;
  oneTimeTotal: number;
};
type AdditionalRow = {
  n: number;
  workedDivision: string;
  employee: string;
  position: string;
  salary: number;
  homeDivision: string;
  hours: number[];
  totalHours: number;
  travel: number;
  accrued: number;
};
type ByDivisionRow = {
  n: number;
  division: string;
  primaryHours: number;
  primaryAccrued: number;
  tripHours: number;
  tripAccrued: number;
  hoursAccrued: number;
  travel: number;
  oneTimeTotal: number;
  total: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  periodLine: string;
  generatedAt?: string;
  days: DayMeta[];
  detailed: DetailedRow[];
  additional: AdditionalRow[];
  byDivision: ByDivisionRow[];
};

const TITLE = 'Расходы по подразделениям';
const FILE_BASE = 'Расходы-по-подразделениям';
const SETTINGS_KEY = 'hrhub.division-expenses.settings.v1';
const DEFAULT_SETTINGS: Settings = { showUserPlanFact: true };
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
function money(n: number) {
  const v = Number(n) || 0;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
function hours(n: number) {
  const v = Number(n) || 0;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function normalizePayload(raw: Partial<Payload> | null | undefined): Payload {
  const r = raw || {};
  return {
    title: r.title || TITLE,
    from: r.from || '',
    to: r.to || '',
    periodLine: r.periodLine || '',
    generatedAt: r.generatedAt,
    days: Array.isArray(r.days) ? r.days : [],
    detailed: Array.isArray(r.detailed) ? r.detailed : [],
    additional: Array.isArray(r.additional) ? r.additional : [],
    byDivision: Array.isArray(r.byDivision) ? r.byDivision : [],
  };
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
          <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
            ‹
          </button>
          <span>
            {MONTHS_LONG[month.getMonth()]} {month.getFullYear()}
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


export default function DivisionExpensesReportPage() {
  const today = useMemo(() => isoDay(new Date()), []);
  const [tab, setTab] = useState<Tab>('params');
  const [viewKind, setViewKind] = useState<ViewKind>('detailed');
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(today);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [divisionGroups, setDivisionGroups] = useState<Opt[]>([]);
  const [positionGroups, setPositionGroups] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [divisionGroupIds, setDivisionGroupIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionGroupIds, setPositionGroupIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
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
      const lookups = await apiFetch<{
        employees?: Opt[];
        positions?: Opt[];
        divisionGroups?: Opt[];
        positionGroups?: Opt[];
      }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
        positions: [] as Opt[],
        divisionGroups: [] as Opt[],
        positionGroups: [] as Opt[],
      }));
      setDivisionGroups((lookups.divisionGroups || []).map((g) => ({ id: g.id, label: g.label || g.name || g.id })));
      setPositionGroups((lookups.positionGroups || []).map((g) => ({ id: g.id, label: g.label || g.name || g.id })));
      let poss = lookups.positions || [];
      if (!poss.length) {
        const raw = await apiFetch<{ items?: Opt[] } | Opt[]>('/api/organization/positions').catch(() => [] as Opt[]);
        const list = Array.isArray(raw) ? raw : raw.items || [];
        poss = list.map((p) => ({ id: p.id, label: p.label || p.name || p.id }));
      }
      setPositions(
        poss
          .map((p) => ({ id: p.id, label: (p.label || p.name || p.id).toUpperCase() }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
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
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (divisionGroupIds.length) p.set('divisionGroupIds', divisionGroupIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (positionGroupIds.length) p.set('positionGroupIds', positionGroupIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    p.set('cfg', JSON.stringify({ showUserPlanFact: settings.showUserPlanFact }));
    return p.toString();
  }, [from, to, divisionIds, divisionGroupIds, positionIds, positionGroupIds, employeeIds, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/division-expenses?${queryQs}`);
      const normalized = normalizePayload(data);
      setReport(normalized);
      setLoadedQs(queryQs);
      return normalized;
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

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (report) {
      setTab('view');
      void load();
    }
  }
  function resetSettings() {
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  function detailedMatrix(data: Payload) {
    const head1 = [
      '№',
      'Подразделение',
      'Сотрудник',
      'Должность',
      'Оклад',
      ...data.days.map((d) => d.dd),
      'Всего часов',
      'Всего начислено',
      ...data.days.map((d) => d.dd),
      'Всего часов',
      'Всего начислено',
      'Дорожные начисления',
      'Всего',
    ];
    const head2 = [
      '',
      '',
      '',
      '',
      '',
      ...data.days.map((d) => d.weekday),
      '',
      '',
      ...data.days.map((d) => d.weekday),
      '',
      '',
      '',
      '',
    ];
    const rows = data.detailed.map((r) => [
      String(r.n),
      r.division,
      r.employee,
      r.position,
      money(r.salary),
      ...(r.hours || []).map((h) => hours(h)),
      hours(r.totalHours),
      money(r.accrued),
      ...(r.extraHours || []).map((h) => hours(h)),
      hours(r.extraTotalHours),
      money(r.extraAccrued),
      money(r.travel),
      money(r.oneTimeTotal),
    ]);
    return { head1, head2, rows };
  }

  function additionalMatrix(data: Payload) {
    const head1 = [
      '№',
      'Отработанное подразделение',
      'Сотрудник',
      'Должность',
      'Оклад',
      'Подразделение сотрудника',
      ...data.days.map((d) => d.dd),
      'Всего часов',
      'Дорожные начисления',
      'Всего начислено',
    ];
    const head2 = ['', '', '', '', '', '', ...data.days.map((d) => d.weekday), '', '', ''];
    const rows = data.additional.map((r) => [
      String(r.n),
      r.workedDivision,
      r.employee,
      r.position,
      money(r.salary),
      r.homeDivision,
      ...(r.hours || []).map((h) => hours(h)),
      hours(r.totalHours),
      money(r.travel),
      money(r.accrued),
    ]);
    return { head1, head2, rows };
  }

  function byDivisionMatrix(data: Payload) {
    const head = [
      '№',
      'Подразделение',
      'Основные сотрудники (отработано часов)',
      'Основные сотрудники (начисления)',
      'Внутренняя командировка (отработано часов)',
      'Внутренняя командировка (начисления)',
      'Всего начислений за отработанные часы',
      'Дорожные начисления',
      'Всего (разовые)',
      'Итого',
    ];
    const rows = data.byDivision.map((r) => [
      String(r.n),
      r.division,
      hours(r.primaryHours),
      money(r.primaryAccrued),
      hours(r.tripHours),
      money(r.tripAccrued),
      money(r.hoursAccrued),
      money(r.travel),
      money(r.oneTimeTotal),
      money(r.total),
    ]);
    return { head, rows };
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    if (viewKind === 'byDivision') {
      const m = byDivisionMatrix(payload);
      await downloadStyledXlsx({
        filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
        sheetName: 'По подразделениям',
        title: TITLE,
        subtitle: payload.periodLine,
        preamble: [payload.periodLine, 'По подразделениям', ''],
        columns: m.head,
        rows: m.rows,
        colWidths: [6, 28, 16, 16, 16, 16, 16, 14, 12, 12],
      });
      return;
    }
    const m = viewKind === 'additional' ? additionalMatrix(payload) : detailedMatrix(payload);
    const label = viewKind === 'additional' ? 'Дополнительный по сотрудникам' : 'Развернутый по сотрудникам';
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: label.slice(0, 31),
      title: TITLE,
      subtitle: payload.periodLine,
      preamble: [payload.periodLine, label, ''],
      topHeader: m.head1,
      columns: m.head2,
      rows: m.rows,
      colWidths: m.head1.map((_, i) => (i < 5 ? 18 : 8)),
    });
  }

  function csvText(data: Payload) {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    if (viewKind === 'byDivision') {
      const m = byDivisionMatrix(data);
      return `\ufeff${[data.periodLine, m.head.map(q).join(';'), ...m.rows.map((r) => r.map(q).join(';'))].join('\n')}`;
    }
    const m = viewKind === 'additional' ? additionalMatrix(data) : detailedMatrix(data);
    return `\ufeff${[data.periodLine, m.head1.map(q).join(';'), m.head2.map(q).join(';'), ...m.rows.map((r) => r.map(q).join(';'))].join('\n')}`;
  }

  function xmlText(data: Payload) {
    const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
    const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
    if (viewKind === 'byDivision') {
      const m = byDivisionMatrix(data);
      return `<?xml version="1.0" encoding="UTF-8"?>\n<report title="${escapeHtml(TITLE)}" view="byDivision">\n${row([data.periodLine])}\n${row(m.head)}\n${m.rows.map((r) => row(r)).join('\n')}\n</report>`;
    }
    const m = viewKind === 'additional' ? additionalMatrix(data) : detailedMatrix(data);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<report title="${escapeHtml(TITLE)}" view="${viewKind}">\n${row([data.periodLine])}\n${row(m.head1)}\n${row(m.head2)}\n${m.rows.map((r) => row(r)).join('\n')}\n</report>`;
  }

  function printHtml(data: Payload) {
    const gen = data.generatedAt ? new Date(data.generatedAt).toLocaleString('ru-RU') : '';
    let thead = '';
    let body = '';
    let colCount = 10;
    const viewLabel =
      viewKind === 'additional'
        ? 'Дополнительный по сотрудникам'
        : viewKind === 'byDivision'
          ? 'По подразделениям'
          : 'Развернутый по сотрудникам';
    if (viewKind === 'byDivision') {
      const m = byDivisionMatrix(data);
      colCount = m.head.length;
      thead = `<tr>${m.head.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      body = m.rows
        .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 1 ? 'name' : i >= 2 ? 'num' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`)
        .join('');
    } else {
      const m = viewKind === 'additional' ? additionalMatrix(data) : detailedMatrix(data);
      colCount = m.head1.length;
      thead = `<tr>${m.head1.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr><tr>${m.head2.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      const nameIdx = viewKind === 'additional' ? [1, 2, 3, 5] : [1, 2, 3];
      body = m.rows
        .map(
          (r) =>
            `<tr>${r
              .map((c, i) => {
                const cls = nameIdx.includes(i) ? 'name' : i === 0 ? '' : 'num';
                return `<td class="${cls}">${escapeHtml(c)}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('');
    }
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:11px}
th,td{border:1px solid #cfd3da;padding:2px 4px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}
.num{text-align:right}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(data.periodLine)} · ${escapeHtml(viewLabel)}</div>
<div class="wrap"><table><thead>${thead}</thead>
<tbody>${body || `<tr><td colspan="${colCount}">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
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
        <button type="button" className={tab === 'params' ? layout.tabOn : layout.tab} onClick={() => setTab('params')}>
          ПАРАМЕТРЫ
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
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>
          НАСТРОЙКИ
        </button>
        {tab === 'settings' ? (
          <>
            <button type="button" className={layout.tab} onClick={saveSettings}>
              Сохранить
            </button>
            <button type="button" className={layout.tab} onClick={resetSettings}>
              Сбросить
            </button>
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

      {tab === 'params' ? (
        <form className={`${layout.card} ${local.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Дата</label>
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
            <label>Группы подразделений</label>
            <FilterPick options={divisionGroups} selected={divisionGroupIds} onChange={setDivisionGroupIds} />
          </div>
          <div className={layout.field}>
            <label>Подразделения</label>
            <DivisionPick nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
          </div>
          <div className={layout.field}>
            <label>Группы должностей</label>
            <FilterPick options={positionGroups} selected={positionGroupIds} onChange={setPositionGroupIds} />
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
            <p className={layout.muted}>Сначала сформируйте отчёт на вкладке «ПАРАМЕТРЫ»</p>
          ) : (
            <>
              <div className={local.subTabs}>
                <button
                  type="button"
                  className={viewKind === 'detailed' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('detailed')}
                >
                  Развернутый по сотрудникам
                </button>
                <button
                  type="button"
                  className={viewKind === 'additional' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('additional')}
                >
                  Дополнительный по сотрудникам
                </button>
                <button
                  type="button"
                  className={viewKind === 'byDivision' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('byDivision')}
                >
                  По подразделениям
                </button>
              </div>
              <p className={local.periodLine}>{report.periodLine}</p>
              <div className={local.tableWrap}>
                {viewKind === 'detailed' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>№</th>
                        <th rowSpan={2}>Подразделение</th>
                        <th rowSpan={2}>Сотрудник</th>
                        <th rowSpan={2}>Должность</th>
                        <th rowSpan={2}>Оклад</th>
                        {report.days.map((d) => (
                          <th key={`d1-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.dd}
                          </th>
                        ))}
                        <th rowSpan={2}>Всего часов</th>
                        <th rowSpan={2}>Всего начислено</th>
                        {report.days.map((d) => (
                          <th key={`d2-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.dd}
                          </th>
                        ))}
                        <th rowSpan={2}>Всего часов</th>
                        <th rowSpan={2}>Всего начислено</th>
                        <th rowSpan={2}>Дорожные начисления</th>
                        <th rowSpan={2}>Всего</th>
                      </tr>
                      <tr>
                        {report.days.map((d) => (
                          <th key={`w1-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.weekday}
                          </th>
                        ))}
                        {report.days.map((d) => (
                          <th key={`w2-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.weekday}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.detailed.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={13 + report.days.length * 2}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.detailed.map((r) => (
                          <tr key={`det-${r.n}-${r.employee}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.division}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={local.name}>{r.position}</td>
                            <td className={local.num}>{money(r.salary)}</td>
                            {(r.hours || []).map((h, i) => (
                              <td key={`h-${r.n}-${i}`} className={`${local.num}${report.days[i]?.weekend ? ` ${local.weekend}` : ''}`}>
                                {hours(h)}
                              </td>
                            ))}
                            <td className={local.num}>{hours(r.totalHours)}</td>
                            <td className={local.num}>{money(r.accrued)}</td>
                            {(r.extraHours || []).map((h, i) => (
                              <td key={`eh-${r.n}-${i}`} className={`${local.num}${report.days[i]?.weekend ? ` ${local.weekend}` : ''}`}>
                                {hours(h)}
                              </td>
                            ))}
                            <td className={local.num}>{hours(r.extraTotalHours)}</td>
                            <td className={local.num}>{money(r.extraAccrued)}</td>
                            <td className={local.num}>{money(r.travel)}</td>
                            <td className={local.num}>{money(r.oneTimeTotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewKind === 'additional' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>№</th>
                        <th rowSpan={2}>Отработанное подразделение</th>
                        <th rowSpan={2}>Сотрудник</th>
                        <th rowSpan={2}>Должность</th>
                        <th rowSpan={2}>Оклад</th>
                        <th rowSpan={2}>Подразделение сотрудника</th>
                        {report.days.map((d) => (
                          <th key={`ad-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.dd}
                          </th>
                        ))}
                        <th rowSpan={2}>Всего часов</th>
                        <th rowSpan={2}>Дорожные начисления</th>
                        <th rowSpan={2}>Всего начислено</th>
                      </tr>
                      <tr>
                        {report.days.map((d) => (
                          <th key={`aw-${d.iso}`} className={`${local.day}${d.weekend ? ` ${local.weekend}` : ''}`}>
                            {d.weekday}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.additional.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={9 + report.days.length}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.additional.map((r) => (
                          <tr key={`add-${r.n}-${r.employee}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.workedDivision}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={local.name}>{r.position}</td>
                            <td className={local.num}>{money(r.salary)}</td>
                            <td className={local.name}>{r.homeDivision}</td>
                            {(r.hours || []).map((h, i) => (
                              <td key={`ah-${r.n}-${i}`} className={`${local.num}${report.days[i]?.weekend ? ` ${local.weekend}` : ''}`}>
                                {hours(h)}
                              </td>
                            ))}
                            <td className={local.num}>{hours(r.totalHours)}</td>
                            <td className={local.num}>{money(r.travel)}</td>
                            <td className={local.num}>{money(r.accrued)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewKind === 'byDivision' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Подразделение</th>
                        <th>Основные сотрудники (отработано часов)</th>
                        <th>Основные сотрудники (начисления)</th>
                        <th>Внутренняя командировка (отработано часов)</th>
                        <th>Внутренняя командировка (начисления)</th>
                        <th>Всего начислений за отработанные часы</th>
                        <th>Дорожные начисления</th>
                        <th>Всего (разовые)</th>
                        <th>Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byDivision.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={10}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.byDivision.map((r) => (
                          <tr key={`bd-${r.n}-${r.division}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.division}</td>
                            <td className={local.num}>{hours(r.primaryHours)}</td>
                            <td className={local.num}>{money(r.primaryAccrued)}</td>
                            <td className={local.num}>{hours(r.tripHours)}</td>
                            <td className={local.num}>{money(r.tripAccrued)}</td>
                            <td className={local.num}>{money(r.hoursAccrued)}</td>
                            <td className={local.num}>{money(r.travel)}</td>
                            <td className={local.num}>{money(r.oneTimeTotal)}</td>
                            <td className={local.num}>{money(r.total)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={local.settings}>
          <label className={local.check}>
            <input
              type="checkbox"
              checked={settings.showUserPlanFact}
              onChange={(e) => setSettings((p) => ({ ...p, showUserPlanFact: e.target.checked }))}
            />
            <span>Показывать факт часов по пользовательскому плану</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
