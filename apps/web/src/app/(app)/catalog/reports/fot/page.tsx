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
type ViewKind = 'byEmployee' | 'byEmpLocation' | 'byLocation';
type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  name?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Settings = {
  withNightTime: boolean;
  showExtraAttendance: boolean;
  showOvertime: boolean;
};
type EmpRow = {
  n: number;
  employee: string;
  division: string;
  position: string;
  grade: string;
  salary: number;
  totalHours: number;
  accrued: number;
};
type EmpLocRow = {
  n: number;
  location: string;
  employee: string;
  division: string;
  hiredAt: string;
  position: string;
  grade: string;
  salary: number;
  totalHours: number;
  accrued: number;
};
type LocRow = {
  n: number;
  location: string;
  totalHours: number;
  accrued: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  periodLine: string;
  generatedAt?: string;
  byEmployee: EmpRow[];
  byEmpLocation: EmpLocRow[];
  byLocation: LocRow[];
};
type FilterTpl = {
  id: string;
  name: string;
  from: string;
  to: string;
  locationIds: string[];
  divisionIds: string[];
  positionIds: string[];
  gradeIds: string[];
  employeeIds: string[];
};

const TITLE = 'ФОТ отчет';
const FILE_BASE = 'ФОТ-отчет';
const SETTINGS_KEY = 'hrhub.fot.settings.v1';
const FILTER_TPL_KEY = 'hrhub.fot.filter-templates.v1';
const DEFAULT_SETTINGS: Settings = {
  withNightTime: true,
  showExtraAttendance: true,
  showOvertime: true,
};
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
    byEmployee: Array.isArray(r.byEmployee) ? r.byEmployee : [],
    byEmpLocation: Array.isArray(r.byEmpLocation) ? r.byEmpLocation : [],
    byLocation: Array.isArray(r.byLocation) ? r.byLocation : [],
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

export default function FotReportPage() {
  const today = useMemo(() => isoDay(new Date()), []);
  const [tab, setTab] = useState<Tab>('filter');
  const [viewKind, setViewKind] = useState<ViewKind>('byEmployee');
  const [from, setFrom] = useState(() => monthStart());
  const [to, setTo] = useState(today);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [grades, setGrades] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [gradeIds, setGradeIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [tplNew, setTplNew] = useState(false);
  const [tplName, setTplName] = useState('');
  const [templates, setTemplates] = useState<FilterTpl[]>([]);
  const tplRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSettings(loadSettings());
    try {
      const raw = localStorage.getItem(FILTER_TPL_KEY);
      if (raw) setTemplates(JSON.parse(raw) as FilterTpl[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!tplOpen) return;
    const close = (e: PointerEvent) => {
      if (!tplRef.current?.contains(e.target as Node)) {
        setTplOpen(false);
        setTplNew(false);
        setTplName('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [tplOpen]);

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{
        employees?: Opt[];
        positions?: Opt[];
        locations?: Opt[];
        grades?: Opt[];
      }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
        positions: [] as Opt[],
        locations: [] as Opt[],
        grades: [] as Opt[],
      }));
      setLocations(
        (lookups.locations || [])
          .map((l) => ({ id: l.id, label: l.label || l.name || l.id }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
      setGrades(
        (lookups.grades || [])
          .map((g) => ({ id: g.id, label: g.label || g.name || g.id }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
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
    if (locationIds.length) p.set('locationIds', locationIds.join(','));
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (gradeIds.length) p.set('gradeIds', gradeIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    p.set('cfg', JSON.stringify(settings));
    return p.toString();
  }, [from, to, locationIds, divisionIds, positionIds, gradeIds, employeeIds, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/fot?${queryQs}`);
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

  function saveTemplate() {
    const name = tplName.trim();
    if (!name) return;
    const next = [
      ...templates,
      {
        id: `${Date.now()}`,
        name,
        from,
        to,
        locationIds,
        divisionIds,
        positionIds,
        gradeIds,
        employeeIds,
      },
    ];
    setTemplates(next);
    localStorage.setItem(FILTER_TPL_KEY, JSON.stringify(next));
    setTplName('');
    setTplNew(false);
    setTplOpen(false);
  }

  function applyTemplate(t: FilterTpl) {
    setFrom(t.from);
    setTo(t.to);
    setLocationIds(t.locationIds || []);
    setDivisionIds(t.divisionIds || []);
    setPositionIds(t.positionIds || []);
    setGradeIds(t.gradeIds || []);
    setEmployeeIds(t.employeeIds || []);
    setTplOpen(false);
    setTplNew(false);
  }

  const viewLabel =
    viewKind === 'byEmpLocation'
      ? 'По локациям сотрудника'
      : viewKind === 'byLocation'
        ? 'По локациям'
        : 'По сотрудникам';

  function empMatrix(data: Payload) {
    const head = ['№', 'Сотрудник', 'Подразделение', 'Должность', 'Разряд', 'Оклад', 'Всего часов', 'Всего начислено'];
    const rows = data.byEmployee.map((r) => [
      String(r.n),
      r.employee,
      r.division,
      r.position,
      r.grade,
      money(r.salary),
      hours(r.totalHours),
      money(r.accrued),
    ]);
    return { head, rows };
  }

  function empLocMatrix(data: Payload) {
    const head = [
      '№',
      'Локация',
      'Сотрудник',
      'Подразделение',
      'Дата приема',
      'Должность',
      'Разряд',
      'Оклад',
      'Всего часов',
      'Всего начислено',
    ];
    const rows = data.byEmpLocation.map((r) => [
      String(r.n),
      r.location,
      r.employee,
      r.division,
      r.hiredAt || '',
      r.position,
      r.grade,
      money(r.salary),
      hours(r.totalHours),
      money(r.accrued),
    ]);
    return { head, rows };
  }

  function locMatrix(data: Payload) {
    const head = ['№', 'Локация', 'Отработано часов', 'Всего начислено'];
    const rows = data.byLocation.map((r) => [String(r.n), r.location, hours(r.totalHours), money(r.accrued)]);
    return { head, rows };
  }

  function activeMatrix(data: Payload) {
    if (viewKind === 'byEmpLocation') return empLocMatrix(data);
    if (viewKind === 'byLocation') return locMatrix(data);
    return empMatrix(data);
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    const m = activeMatrix(payload);
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: viewLabel.slice(0, 31),
      title: TITLE,
      subtitle: payload.periodLine,
      preamble: [payload.periodLine, viewLabel, ''],
      columns: m.head,
      rows: m.rows,
      colWidths: m.head.map((_, i) => (i === 0 ? 6 : i <= 4 ? 22 : 14)),
    });
  }

  function csvText(data: Payload) {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const m = activeMatrix(data);
    return `\ufeff${[data.periodLine, viewLabel, m.head.map(q).join(';'), ...m.rows.map((r) => r.map(q).join(';'))].join('\n')}`;
  }

  function xmlText(data: Payload) {
    const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
    const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
    const m = activeMatrix(data);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<report title="${escapeHtml(TITLE)}" view="${viewKind}">\n${row([data.periodLine])}\n${row([viewLabel])}\n${row(m.head)}\n${m.rows.map((r) => row(r)).join('\n')}\n</report>`;
  }

  function printHtml(data: Payload) {
    const gen = data.generatedAt ? new Date(data.generatedAt).toLocaleString('ru-RU') : '';
    const m = activeMatrix(data);
    const nameIdx =
      viewKind === 'byLocation'
        ? [1]
        : viewKind === 'byEmpLocation'
          ? [1, 2, 3, 5, 6]
          : [1, 2, 3, 4];
    const numFrom = viewKind === 'byLocation' ? 2 : viewKind === 'byEmpLocation' ? 7 : 5;
    const thead = `<tr>${m.head.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
    const body = m.rows
      .map(
        (r) =>
          `<tr>${r
            .map((c, i) => {
              const cls = nameIdx.includes(i) ? 'name' : i >= numFrom || (viewKind === 'byLocation' && i >= 2) ? 'num' : '';
              return `<td class="${cls}">${escapeHtml(c)}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
tbody tr:nth-child(even){background:#fafbfc}
.name{text-align:left;white-space:normal}
.num{text-align:right}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(data.periodLine)} · ${escapeHtml(viewLabel)}</div>
<div class="wrap"><table><thead>${thead}</thead>
<tbody>${body || `<tr><td colspan="${m.head.length}">Нет данных</td></tr>`}</tbody></table></div>
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
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>
          ФИЛЬТР
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

      {tab === 'filter' ? (
        <form className={`${layout.card} ${local.card}`} onSubmit={(e) => void generate(e)}>
          <div className={local.filterGrid}>
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
              <label>Шаблоны</label>
              <div className={local.tplWrap} ref={tplRef}>
                <button
                  type="button"
                  className={local.tplBtn}
                  onClick={() => {
                    setTplOpen((v) => !v);
                    setTplNew(false);
                  }}
                >
                  Создать шаблон
                </button>
                {tplOpen ? (
                  <div className={local.tplPanel}>
                    {!tplNew ? (
                      <>
                        {templates.map((t) => (
                          <button type="button" key={t.id} className={att.listRow} onClick={() => applyTemplate(t)}>
                            {t.name}
                          </button>
                        ))}
                        <button type="button" className={layout.linkBtn} onClick={() => setTplNew(true)}>
                          + Новый шаблон
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Новый шаблон</div>
                        <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Название" />
                        <div className={local.tplActions}>
                          <button type="button" className="save" onClick={saveTemplate}>
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTplNew(false);
                              setTplName('');
                            }}
                          >
                            Отменить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className={layout.field}>
            <label>Локации</label>
            <FilterPick options={locations} selected={locationIds} onChange={setLocationIds} />
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
            <label>Разряд</label>
            <FilterPick options={grades} selected={gradeIds} onChange={setGradeIds} />
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
            <p className={layout.muted}>Сначала сформируйте отчёт на вкладке «ФИЛЬТР»</p>
          ) : (
            <>
              <div className={local.subTabs}>
                <button
                  type="button"
                  className={viewKind === 'byEmployee' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('byEmployee')}
                >
                  По сотрудникам
                </button>
                <button
                  type="button"
                  className={viewKind === 'byEmpLocation' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('byEmpLocation')}
                >
                  По локациям сотрудника
                </button>
                <button
                  type="button"
                  className={viewKind === 'byLocation' ? `${local.subTab} ${local.subOn}` : local.subTab}
                  onClick={() => setViewKind('byLocation')}
                >
                  По локациям
                </button>
              </div>
              <p className={local.periodLine}>{report.periodLine}</p>
              <div className={local.tableWrap}>
                {viewKind === 'byEmployee' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Сотрудник</th>
                        <th>Подразделение</th>
                        <th>Должность</th>
                        <th>Разряд</th>
                        <th>Оклад</th>
                        <th>Всего часов</th>
                        <th>Всего начислено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byEmployee.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={8}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.byEmployee.map((r) => (
                          <tr key={`emp-${r.n}-${r.employee}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={local.name}>{r.division}</td>
                            <td className={local.name}>{r.position}</td>
                            <td className={local.name}>{r.grade}</td>
                            <td className={local.num}>{money(r.salary)}</td>
                            <td className={local.num}>{hours(r.totalHours)}</td>
                            <td className={local.num}>{money(r.accrued)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewKind === 'byEmpLocation' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Локация</th>
                        <th>Сотрудник</th>
                        <th>Подразделение</th>
                        <th>Дата приема</th>
                        <th>Должность</th>
                        <th>Разряд</th>
                        <th>Оклад</th>
                        <th>Всего часов</th>
                        <th>Всего начислено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byEmpLocation.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={10}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.byEmpLocation.map((r) => (
                          <tr key={`el-${r.n}-${r.employee}-${r.location}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.location}</td>
                            <td className={local.name}>{r.employee}</td>
                            <td className={local.name}>{r.division}</td>
                            <td>{r.hiredAt || ''}</td>
                            <td className={local.name}>{r.position}</td>
                            <td className={local.name}>{r.grade}</td>
                            <td className={local.num}>{money(r.salary)}</td>
                            <td className={local.num}>{hours(r.totalHours)}</td>
                            <td className={local.num}>{money(r.accrued)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : null}

                {viewKind === 'byLocation' ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Локация</th>
                        <th>Отработано часов</th>
                        <th>Всего начислено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byLocation.length === 0 ? (
                        <tr>
                          <td className={local.empty} colSpan={4}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        report.byLocation.map((r) => (
                          <tr key={`loc-${r.n}-${r.location}`}>
                            <td>{r.n}</td>
                            <td className={local.name}>{r.location}</td>
                            <td className={local.num}>{hours(r.totalHours)}</td>
                            <td className={local.num}>{money(r.accrued)}</td>
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
              checked={settings.withNightTime}
              onChange={(e) => setSettings((p) => ({ ...p, withNightTime: e.target.checked }))}
            />
            <span>С ночным временем</span>
          </label>
          <label className={local.check}>
            <input
              type="checkbox"
              checked={settings.showExtraAttendance}
              onChange={(e) => setSettings((p) => ({ ...p, showExtraAttendance: e.target.checked }))}
            />
            <span>Показывать дополнительную явку</span>
          </label>
          <label className={local.check}>
            <input
              type="checkbox"
              checked={settings.showOvertime}
              onChange={(e) => setSettings((p) => ({ ...p, showOvertime: e.target.checked }))}
            />
            <span>Показывать сверхурочные</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
