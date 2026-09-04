'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadAttendanceLikeXlsx, type XlsxCell } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import posS from '../positions/page.module.css';
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
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Settings = {
  tabNumber: boolean;
  division: boolean;
  position: boolean;
  locations: boolean;
  showMinutes: boolean;
  showHhMm: boolean;
};
type Row = {
  n: number;
  employee: string;
  tabNumber: string;
  division: string;
  position: string;
  location: string;
  dayOff: boolean;
  planIn: string;
  planOut: string;
  planNorm: number | null;
  factIn: string;
  factOut: string;
  worked: number | null;
  marksPlan: string;
  marksFact: string;
  markStart: string;
  markEnd: string;
  markedBy: string;
  markLocation: string;
};
type Payload = {
  title: string;
  date: string;
  dateLabel: string;
  periodLine: string;
  divisionLine: string;
  generatedAt?: string;
  rows: Row[];
};

const TITLE = 'Детальный отчет по отметкам';
const FILE_BASE = 'Детальный-отчет-по-отметкам';
const SETTINGS_KEY = 'hrhub.marks-detail.settings';
const DEFAULT_SETTINGS: Settings = {
  tabNumber: true,
  division: true,
  position: true,
  locations: true,
  showMinutes: true,
  showHhMm: true,
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
function fmtRu(iso: string) {
  const d = parseIso(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
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
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function fmtHours(n: number | null, s: Settings) {
  if (n == null || Number.isNaN(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (s.showHhMm) {
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (s.showMinutes) return `${sign}${Math.round(abs * 100) / 100}`;
  return `${sign}${Math.round(abs)}`;
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
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className={extra.periodWrap} ref={wrapRef}>
      <button type="button" className={local.periodBtn} onClick={() => setOpen((v) => !v)}>
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
                <button
                  type="button"
                  key={`${c.ymd}-${i}`}
                  className={cls}
                  onClick={() => {
                    onChange(c.ymd);
                    setOpen(false);
                  }}
                >
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
          <button type="button" className={selected.has(node.id) ? `${att.treeName} ${att.treeNameOn}` : att.treeName} onClick={() => toggleOne(node.id)}>
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
      {selected.length ? (
        <div className={empS.chips}>
          {selected.map((id) => {
            const o = options.find((x) => x.id === id);
            return (
              <button key={id} type="button" className={empS.chip} onClick={() => toggle(id)}>
                {o ? empName(o) : id} ×
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Check({
  on,
  label,
  onChange,
  disabled = false,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${local.check}${disabled ? ` ${local.dim}` : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={local.box} aria-hidden />
      <span>{label}</span>
    </label>
  );
}

export default function MarksDetailPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
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
      const lookups = await apiFetch<{
        employees?: Opt[];
        positions?: Opt[];
        locations?: Opt[];
      }>('/api/catalog/lookups').catch(() => ({ employees: [] as Opt[], positions: [] as Opt[], locations: [] as Opt[] }));
      let emps = lookups.employees || [];
      let poss = lookups.positions || [];
      let locs = lookups.locations || [];
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
      if (!locs.length) {
        const raw = await apiFetch<Opt[] | { items?: Opt[] }>('/api/attendance/locations').catch(() => [] as Opt[]);
        const list = Array.isArray(raw) ? raw : raw.items || [];
        locs = list.map((l) => ({ id: l.id, label: l.label || (l as { name?: string }).name || l.id }));
      }
      setPositions(
        mergeOpts(
          poss.map((p) => ({ id: p.id, label: (p.label || (p as { name?: string }).name || p.id).toUpperCase() })),
          EXTRA_POSITIONS,
        ),
      );
      setLocations(locs.map((l) => ({ id: l.id, label: l.label || l.id })));
      setEmployees(
        emps
          .map((e) => ({ ...e, tabNumber: e.tabNumber || '', label: empName(e) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('date', date);
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (locationIds.length) p.set('locationIds', locationIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [date, divisionIds, positionIds, locationIds, employeeIds]);

  const extras = useMemo(() => {
    const cols: { key: keyof Row; label: string }[] = [];
    if (settings.tabNumber) cols.push({ key: 'tabNumber', label: 'Табельный номер' });
    if (settings.division) cols.push({ key: 'division', label: 'Подразделение' });
    if (settings.position) cols.push({ key: 'position', label: 'Должность' });
    if (settings.locations) cols.push({ key: 'location', label: 'Локации' });
    return cols;
  }, [settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/marks-detail?${queryQs}`);
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
  function hours(n: number | null) {
    return fmtHours(n, settings);
  }

  const topHeader = useMemo(
    () => [
      { label: '№', span: 1 },
      { label: 'Сотрудник', span: 1 },
      ...extras.map((c) => ({ label: c.label, span: 1 })),
      { label: 'План', span: 3 },
      { label: 'Факт', span: 3 },
      { label: 'Отметки', span: 6 },
    ],
    [extras],
  );
  const subHeader = useMemo(
    () => [
      { label: '' },
      { label: '' },
      ...extras.map(() => ({ label: '' })),
      { label: 'Приход' },
      { label: 'Уход' },
      { label: 'Норма' },
      { label: 'Приход' },
      { label: 'Уход' },
      { label: 'Отработано' },
      { label: 'План' },
      { label: 'Факт' },
      { label: 'Начало' },
      { label: 'Конец' },
      { label: 'Отметился' },
      { label: 'Локация' },
    ],
    [extras],
  );

  function rowCells(r: Row): XlsxCell[] {
    const extraCells: XlsxCell[] = extras.map((c) => String(r[c.key] ?? ''));
    return [
      r.n,
      r.employee,
      ...extraCells,
      r.planIn,
      r.planOut,
      hours(r.planNorm),
      r.factIn,
      r.factOut,
      hours(r.worked),
      r.marksPlan,
      r.marksFact,
      r.markStart,
      r.markEnd,
      r.markedBy,
      r.markLocation,
    ];
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    await downloadAttendanceLikeXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: payload.divisionLine || TITLE,
      subtitle: payload.periodLine,
      topHeader,
      subHeader,
      rows: payload.rows.map((r) => ({
        cells: rowCells(r),
        kind: r.dayOff ? 'weekend' : 'normal',
      })),
    });
  }

  function csvText(data: Payload) {
    const head1 = ['№', 'Сотрудник', ...extras.map((c) => c.label), 'План', '', '', 'Факт', '', '', 'Отметки', '', '', '', '', ''];
    const head2 = ['', '', ...extras.map(() => ''), 'Приход', 'Уход', 'Норма', 'Приход', 'Уход', 'Отработано', 'План', 'Факт', 'Начало', 'Конец', 'Отметился', 'Локация'];
    const lines = [
      data.divisionLine,
      data.periodLine,
      head1.map((c) => `"${c}"`).join(';'),
      head2.map((c) => `"${c}"`).join(';'),
      ...data.rows.map((r) => rowCells(r).map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')),
    ];
    return `\ufeff${lines.join('\n')}`;
  }
  function xmlText(data: Payload) {
    const body = data.rows
      .map(
        (r) =>
          `<row n="${r.n}" employee="${escapeHtml(r.employee)}" planIn="${r.planIn}" planOut="${r.planOut}" norm="${hours(r.planNorm)}" factIn="${r.factIn}" factOut="${r.factOut}" worked="${hours(r.worked)}" start="${r.markStart}" end="${r.markEnd}" markedBy="${escapeHtml(r.markedBy)}" location="${escapeHtml(r.markLocation)}"/>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}" date="${data.date}">${body}</report>`;
  }
  function printHtml(data: Payload) {
    const extrasH = extras.map((c) => `<th rowspan="2">${escapeHtml(c.label)}</th>`).join('');
    const extraPad = extras.map(() => '<th></th>').join('');
    const body = data.rows
      .map((r) => {
        const extraTd = extras.map((c) => `<td>${escapeHtml(String(r[c.key] ?? ''))}</td>`).join('');
        const cls = r.dayOff ? ' style="background:#e7f3ff"' : '';
        return `<tr${cls}><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td>${extraTd}<td>${r.planIn}</td><td>${r.planOut}</td><td>${hours(r.planNorm)}</td><td>${r.factIn}</td><td>${r.factOut}</td><td>${hours(r.worked)}</td><td>${r.marksPlan}</td><td>${r.marksFact}</td><td>${r.markStart}</td><td>${r.markEnd}</td><td>${escapeHtml(r.markedBy)}</td><td>${escapeHtml(r.markLocation)}</td></tr>`;
      })
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(TITLE)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.wrap{padding:16px}
table{border-collapse:collapse;font-size:11px}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.name{text-align:left;white-space:normal;max-width:220px}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px">${escapeHtml(data.divisionLine)}<br/>${escapeHtml(data.periodLine)}</p>
<div class="wrap"><table>
<thead>
<tr><th rowspan="2">№</th><th rowspan="2">Сотрудник</th>${extrasH}<th colspan="3">План</th><th colspan="3">Факт</th><th colspan="6">Отметки</th></tr>
<tr>${extraPad}<th>Приход</th><th>Уход</th><th>Норма</th><th>Приход</th><th>Уход</th><th>Отработано</th><th>План</th><th>Факт</th><th>Начало</th><th>Конец</th><th>Отметился</th><th>Локация</th></tr>
</thead>
<tbody>${body || `<tr><td colspan="${14 + extras.length}">Нет данных</td></tr>`}</tbody>
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
        onClick={() => void ensureReport().then((d) => d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).csv`, new Blob([csvText(d)], { type: 'text/csv;charset=utf-8' })))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && downloadBlob(`${FILE_BASE}(${fileStamp(d.generatedAt)}).xml`, new Blob([xmlText(d)], { type: 'application/xml;charset=utf-8' })))}
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
          Просмотреть
        </button>
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>
          Настройки
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
          <div className={layout.field}>
            <label>Дата</label>
            <DatePicker value={date} onChange={setDate} />
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
            <label>Локации</label>
            <FilterPick options={locations} selected={locationIds} onChange={setLocationIds} />
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
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              {report.divisionLine ? <p className={local.meta}>{report.divisionLine}</p> : null}
              <p className={local.meta}>{report.periodLine}</p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>№</th>
                      <th rowSpan={2}>Сотрудник</th>
                      {extras.map((c) => (
                        <th key={c.key} rowSpan={2}>
                          {c.label}
                        </th>
                      ))}
                      <th colSpan={3}>План</th>
                      <th colSpan={3}>Факт</th>
                      <th colSpan={6}>Отметки</th>
                    </tr>
                    <tr>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>Норма</th>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>Отработано</th>
                      <th>План</th>
                      <th>Факт</th>
                      <th>Начало</th>
                      <th>Конец</th>
                      <th>Отметился</th>
                      <th>Локация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={14 + extras.length}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.map((r) => (
                        <tr key={`${r.n}-${r.employee}`}>
                          <td>{r.n}</td>
                          <td className={local.name}>{r.employee}</td>
                          {extras.map((c) => (
                            <td key={c.key}>{r[c.key] || ''}</td>
                          ))}
                          <td className={r.dayOff ? local.off : undefined}>{r.planIn}</td>
                          <td className={r.dayOff ? local.off : undefined}>{r.planOut}</td>
                          <td className={r.dayOff ? local.off : undefined}>{hours(r.planNorm)}</td>
                          <td>{r.factIn}</td>
                          <td>{r.factOut}</td>
                          <td>{hours(r.worked)}</td>
                          <td>{r.marksPlan}</td>
                          <td>{r.marksFact}</td>
                          <td>{r.markStart}</td>
                          <td>{r.markEnd}</td>
                          <td className={local.name}>{r.markedBy}</td>
                          <td>{r.markLocation}</td>
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
        <div className={local.settings}>
          <div className={local.col}>
            <h3>Настройки отчета</h3>
            <Check on={settings.tabNumber} onChange={(v) => setSettings((p) => ({ ...p, tabNumber: v }))} label="Табельный номер" />
            <Check on={settings.division} onChange={(v) => setSettings((p) => ({ ...p, division: v }))} label="Подразделение" />
            <Check on={settings.position} onChange={(v) => setSettings((p) => ({ ...p, position: v }))} label="Должность" />
            <Check on={settings.locations} onChange={(v) => setSettings((p) => ({ ...p, locations: v }))} label="Локации" />
          </div>
          <div className={local.col}>
            <h3>Настройки времени</h3>
            <Check
              on={settings.showMinutes}
              onChange={(v) => setSettings((p) => ({ ...p, showMinutes: v, showHhMm: v ? p.showHhMm : false }))}
              label="Показать минуты"
            />
            <Check
              on={settings.showHhMm}
              onChange={(v) => setSettings((p) => ({ ...p, showHhMm: v }))}
              disabled={!settings.showMinutes}
              label="Показать (чч:мин)"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
