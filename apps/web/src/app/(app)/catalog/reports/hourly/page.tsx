'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx, XLSX_COLORS, type XlsxCell } from '@/lib/xlsx-download';
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
type Settings = {
  tabNumber: boolean;
  position: boolean;
  division: boolean;
  staffPosition: boolean;
  showMinutes: boolean;
  showHhMm: boolean;
  showOnlyMinutes: boolean;
};
type DayCol = { iso: string; dd: string; weekday: string; weekend: boolean; dateLabel: string };
type DayDetail = {
  iso: string;
  dateLabel: string;
  weekday: string;
  weekend: boolean;
  dayOff: boolean;
  planIn: string;
  planOut: string;
  planHours: number | null;
  fact: number | null;
};
type Row = {
  n: number;
  employeeId: string;
  employee: string;
  tabNumber: string;
  division: string;
  position: string;
  staffPosition: string;
  employment: string;
  hours: (number | null)[];
  total: number | null;
  planTotal: number;
  days: DayDetail[];
};
type Payload = {
  title: string;
  from: string;
  to: string;
  startTime: string;
  endTime: string;
  periodLine: string;
  timeLine: string;
  generatedAt?: string;
  days: DayCol[];
  rows: Row[];
};

const TITLE = 'Почасовой отчет по посещениям';
const FILE_BASE = 'Почасовой-отчет-по-посещениям';
const SETTINGS_KEY = 'hrhub.hourly.settings';
const DEFAULT_SETTINGS: Settings = {
  tabNumber: false,
  position: false,
  division: false,
  staffPosition: false,
  showMinutes: true,
  showHhMm: false,
  showOnlyMinutes: false,
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
function empKind(t?: string) {
  return t === 'gph' ? 'ГПХ' : 'Основное место работы';
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
function fmtHours(n: number | null | undefined, s: Settings) {
  if (n == null || Number.isNaN(n)) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (s.showOnlyMinutes) return `${sign}${Math.round(abs * 60)}`;
  if (s.showHhMm) {
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${hh}:${String(mm).padStart(2, '0')}`;
  }
  if (s.showMinutes) {
    const r = Math.round(abs * 100) / 100;
    return `${sign}${r}`;
  }
  return `${sign}${Math.round(abs)}`;
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
        onClick={() => setMenuOpen((v) => { if (v) setQ(''); return !v; })}
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
      <button
        type="button"
        className={`${att.dropField}${selected.length ? '' : ` ${att.dropEmpty}`}`}
        onClick={() => setOpen((v) => { if (v) setQ(''); return !v; })}
      >
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
                <button
                  type="button"
                  key={o.id}
                  className={on ? `${att.empRow} ${att.empOn}` : att.empRow}
                  style={{ gridTemplateColumns: '28px 140px 1fr 1fr' }}
                  onClick={() => toggle(o.id)}
                >
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

function Check({
  on,
  label,
  onChange,
  disabled,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${local.check}${disabled ? ` ${local.checkOff}` : ''}`}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={local.box} aria-hidden />
      <span>{label}</span>
    </label>
  );
}

export default function HourlyAttendanceReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{ employees?: Opt[] }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
      }));
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
    p.set('startTime', normTime(startTime) || '09:00');
    p.set('endTime', normTime(endTime) || '18:00');
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    return p.toString();
  }, [from, to, startTime, endTime, divisionIds, employeeIds]);

  const extras = useMemo(() => {
    const cols: { key: keyof Row; label: string }[] = [];
    if (settings.tabNumber) cols.push({ key: 'tabNumber', label: 'Табельный номер' });
    if (settings.position) cols.push({ key: 'position', label: 'Должность' });
    if (settings.division) cols.push({ key: 'division', label: 'Подразделение' });
    if (settings.staffPosition) cols.push({ key: 'staffPosition', label: 'Позиция' });
    return cols;
  }, [settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/hourly?${queryQs}`);
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
    return Boolean(normTime(startTime) && normTime(endTime));
  }

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    if (!timesOk()) {
      setError('Укажите время начала и время конца');
      return;
    }
    const data = await load();
    if (data) {
      setSelectedEmp(null);
      setTab('view');
    }
  }
  async function ensureReport() {
    if (report && loadedQs === queryQs) return report;
    return load();
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (report) {
      setTab('view');
    }
  }
  function resetSettings() {
    setSettings({ ...DEFAULT_SETTINGS });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }

  const selectedRow = report?.rows.find((r) => r.employeeId === selectedEmp) || null;

  function weekendCell(v: string | number, weekend: boolean): XlsxCell {
    if (!weekend) return v;
    return { v, s: { fill: XLSX_COLORS.weekendBg } };
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data || (await ensureReport());
    if (!payload) return;
    const stamp = fileStamp(payload.generatedAt);
    if (selectedRow) {
      const cols = ['Дата', 'День', 'Приход', 'Уход', 'По плану', 'Факт'];
      await downloadStyledXlsx({
        filename: `${FILE_BASE}(${stamp}).xlsx`,
        title: TITLE,
        subtitle: selectedRow.employee,
        preamble: [selectedRow.employee, payload.periodLine, payload.timeLine, ''],
        topHeader: ['Дата', 'День', 'План', 'План', 'План', 'Факт'],
        columns: cols,
        rows: [
          ...selectedRow.days.map((d) => [
            d.dateLabel,
            { v: d.weekday, s: d.weekend ? { fill: XLSX_COLORS.weekendBg } : undefined },
            d.dayOff ? 'Выходной день' : d.planIn,
            d.dayOff ? '' : d.planOut,
            d.dayOff ? '' : fmtHours(d.planHours, settings),
            fmtHours(d.fact, settings),
          ]),
          [
            'Итого',
            '',
            '',
            '',
            fmtHours(selectedRow.planTotal, settings),
            fmtHours(selectedRow.total, settings),
          ],
        ],
        colWidths: [14, 8, 12, 12, 12, 12],
      });
      return;
    }
    const extraHeads = extras.map((c) => c.label);
    const dateHeads = payload.days.map((d) => d.dd);
    const weekHeads = payload.days.map((d) => d.weekday);
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${stamp}).xlsx`,
      title: TITLE,
      preamble: [payload.periodLine, payload.timeLine, ''],
      topHeader: ['№', 'Сотрудник', ...extraHeads, ...dateHeads, 'Отработано'],
      columns: ['№', 'Сотрудник', ...extraHeads, ...weekHeads, 'Отработано'],
      rows: payload.rows.map((r) => [
        r.n,
        { v: r.employee, s: { align: 'left' } },
        ...extras.map((c) => String(r[c.key] ?? '')),
        ...payload.days.map((d, i) => weekendCell(fmtHours(r.hours[i], settings), d.weekend)),
        fmtHours(r.total, settings),
      ]),
      colWidths: [6, 42, ...extras.map(() => 18), ...payload.days.map(() => 6), 12],
    });
  }

  function csvText(data: Payload) {
    if (selectedRow) {
      const head = ['Дата', 'День', 'Приход', 'Уход', 'По плану', 'Факт'];
      const lines = [
        selectedRow.employee,
        data.periodLine,
        data.timeLine,
        head.map((c) => `"${c}"`).join(';'),
        ...selectedRow.days.map((d) =>
          [
            d.dateLabel,
            d.weekday,
            d.dayOff ? 'Выходной день' : d.planIn,
            d.dayOff ? '' : d.planOut,
            d.dayOff ? '' : fmtHours(d.planHours, settings),
            fmtHours(d.fact, settings),
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(';'),
        ),
        ['Итого', '', '', '', fmtHours(selectedRow.planTotal, settings), fmtHours(selectedRow.total, settings)]
          .map((c) => `"${c}"`)
          .join(';'),
      ];
      return `\ufeff${lines.join('\n')}`;
    }
    const head = ['№', 'Сотрудник', ...extras.map((c) => c.label), ...data.days.map((d) => d.dd), 'Отработано'];
    const lines = [
      data.periodLine,
      data.timeLine,
      head.map((c) => `"${c}"`).join(';'),
      ...data.rows.map((r) =>
        [r.n, r.employee, ...extras.map((c) => r[c.key]), ...r.hours.map((h) => fmtHours(h, settings)), fmtHours(r.total, settings)]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ];
    return `\ufeff${lines.join('\n')}`;
  }
  function xmlText(data: Payload) {
    if (selectedRow) {
      const body = selectedRow.days
        .map((d) => `<day date="${d.iso}" weekday="${d.weekday}" plan="${d.dayOff ? 'off' : d.planHours ?? ''}" fact="${d.fact ?? ''}"/>`)
        .join('');
      return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}" employee="${escapeHtml(selectedRow.employee)}">${body}</report>`;
    }
    const body = data.rows
      .map((r) => `<row n="${r.n}" employee="${escapeHtml(r.employee)}" total="${fmtHours(r.total, settings)}"/>`)
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><report title="${escapeHtml(TITLE)}" from="${data.from}" to="${data.to}">${body}</report>`;
  }
  function printHtml(data: Payload) {
    const meta = [data.periodLine, data.timeLine].map((l) => escapeHtml(l)).join('<br/>');
    if (selectedRow) {
      const body = selectedRow.days
        .map((d) => {
          const wk = d.weekend ? ' class="wk"' : '';
          const plan = d.dayOff
            ? `<td colspan="3" class="off">Выходной день</td>`
            : `<td>${escapeHtml(d.planIn)}</td><td>${escapeHtml(d.planOut)}</td><td>${escapeHtml(fmtHours(d.planHours, settings))}</td>`;
          return `<tr${wk}><td>${escapeHtml(d.dateLabel)}</td><td>${escapeHtml(d.weekday)}</td>${plan}<td>${escapeHtml(fmtHours(d.fact, settings))}</td></tr>`;
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
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;text-align:center}
th{background:#eef0f4}
.wk td,.off{background:#e7f3ff}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px;text-align:center">${escapeHtml(selectedRow.employee)}<br/>${meta}</p>
<div class="wrap"><table>
<thead><tr><th rowspan="2">Дата</th><th rowspan="2">День</th><th colspan="3">План</th><th rowspan="2">Факт</th></tr>
<tr><th>Приход</th><th>Уход</th><th>По плану</th></tr></thead>
<tbody>${body}<tr><td colspan="4">Итого</td><td>${escapeHtml(fmtHours(selectedRow.planTotal, settings))}</td><td>${escapeHtml(fmtHours(selectedRow.total, settings))}</td></tr></tbody>
</table></div></body></html>`;
    }
    const extrasH = extras.map((c) => `<th rowspan="2">${escapeHtml(c.label)}</th>`).join('');
    const datesH = data.days.map((d) => `<th${d.weekend ? ' class="wk"' : ''}>${escapeHtml(d.dd)}</th>`).join('');
    const weeksH = data.days.map((d) => `<th${d.weekend ? ' class="wk"' : ''}>${escapeHtml(d.weekday)}</th>`).join('');
    const body = data.rows
      .map((r) => {
        const extraTd = extras.map((c) => `<td>${escapeHtml(String(r[c.key] ?? ''))}</td>`).join('');
        const dayTd = data.days
          .map((d, i) => `<td${d.weekend ? ' class="wk"' : ''}>${escapeHtml(fmtHours(r.hours[i], settings))}</td>`)
          .join('');
        return `<tr><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td>${extraTd}${dayTd}<td>${escapeHtml(fmtHours(r.total, settings))}</td></tr>`;
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
table{border-collapse:collapse;font-size:11px;width:100%}
th,td{border:1px solid #cfd3da;padding:3px 6px;text-align:center;white-space:nowrap}
th{background:#eef0f4}
.name{text-align:left;white-space:normal}
.wk{background:#e7f3ff}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(TITLE)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px;text-align:center">${meta}</p>
<div class="wrap"><table>
<thead><tr><th rowspan="2">№</th><th rowspan="2">Сотрудник</th>${extrasH}${datesH}<th rowspan="2">Отработано</th></tr>
<tr>${weeksH}</tr></thead>
<tbody>${body || `<tr><td colspan="${3 + extras.length + data.days.length}">Нет данных</td></tr>`}</tbody>
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
            if (!timesOk()) {
              setError('Укажите время начала и время конца');
              return;
            }
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
            <label>Дата</label>
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          </div>
          <div className={local.times}>
            <div className={layout.field}>
              <label className={local.req}>Время начала</label>
              <input
                className={`${local.timeInput}${startTime ? '' : ` ${local.timeBad}`}`}
                type="time"
                value={startTime}
                required
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className={layout.field}>
              <label className={local.req}>Время конца</label>
              <input
                className={`${local.timeInput}${endTime ? '' : ` ${local.timeBad}`}`}
                type="time"
                value={endTime}
                required
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className={layout.field}>
            <label>Подразделения</label>
            <DivisionPick nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
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
          ) : selectedRow ? (
            <>
              <button type="button" className={local.back} onClick={() => setSelectedEmp(null)}>
                ← Все сотрудники
              </button>
              <p className={local.meta}>{selectedRow.employee}</p>
              <p className={local.meta}>{report.periodLine}</p>
              <p className={local.meta}>{report.timeLine}</p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Дата</th>
                      <th rowSpan={2}>День</th>
                      <th colSpan={3}>План</th>
                      <th rowSpan={2}>Факт</th>
                    </tr>
                    <tr>
                      <th>Приход</th>
                      <th>Уход</th>
                      <th>По плану</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRow.days.map((d) => (
                      <tr key={d.iso}>
                        <td className={d.weekend ? local.weekend : undefined}>
                          <Link
                            className={local.dateLink}
                            href={`/attendance/marks?employeeId=${encodeURIComponent(selectedRow.employeeId)}&dateFrom=${encodeURIComponent(d.iso)}&dateTo=${encodeURIComponent(d.iso)}`}
                          >
                            {d.dateLabel}
                          </Link>
                        </td>
                        <td className={d.weekend ? local.weekend : undefined}>{d.weekday}</td>
                        {d.dayOff ? (
                          <td className={local.off} colSpan={3}>Выходной день</td>
                        ) : (
                          <>
                            <td>{d.planIn}</td>
                            <td>{d.planOut}</td>
                            <td>{fmtHours(d.planHours, settings)}</td>
                          </>
                        )}
                        <td>{fmtHours(d.fact, settings)}</td>
                      </tr>
                    ))}
                    <tr className={local.total}>
                      <td colSpan={4}>Итого</td>
                      <td>{fmtHours(selectedRow.planTotal, settings)}</td>
                      <td>{fmtHours(selectedRow.total, settings)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p className={local.meta}>{report.periodLine}</p>
              <p className={local.meta}>{report.timeLine}</p>
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>№</th>
                      <th rowSpan={2}>Сотрудник</th>
                      {extras.map((c) => (
                        <th key={c.key} rowSpan={2}>{c.label}</th>
                      ))}
                      {report.days.map((d) => (
                        <th key={`d-${d.iso}`} className={d.weekend ? local.weekend : undefined}>{d.dd}</th>
                      ))}
                      <th rowSpan={2}>Отработано</th>
                    </tr>
                    <tr>
                      {report.days.map((d) => (
                        <th key={`w-${d.iso}`} className={d.weekend ? local.weekend : undefined}>{d.weekday}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={3 + extras.length + report.days.length}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.map((r) => (
                        <tr key={r.employeeId}>
                          <td>{r.n}</td>
                          <td className={local.name}>
                            <button type="button" className={local.nameBtn} onClick={() => setSelectedEmp(r.employeeId)}>
                              {r.employee}
                            </button>
                          </td>
                          {extras.map((c) => (
                            <td key={c.key}>{String(r[c.key] ?? '')}</td>
                          ))}
                          {report.days.map((d, i) => (
                            <td key={d.iso} className={d.weekend ? local.weekend : undefined}>
                              {fmtHours(r.hours[i], settings)}
                            </td>
                          ))}
                          <td className={local.num}>{fmtHours(r.total, settings)}</td>
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
            <h3>Настройки фильтра</h3>
            <Check on={settings.tabNumber} onChange={(v) => setSettings((p) => ({ ...p, tabNumber: v }))} label="Табельный номер" />
            <Check on={settings.position} onChange={(v) => setSettings((p) => ({ ...p, position: v }))} label="Показать должность" />
            <Check on={settings.division} onChange={(v) => setSettings((p) => ({ ...p, division: v }))} label="Показать подразделение" />
            <Check on={settings.staffPosition} onChange={(v) => setSettings((p) => ({ ...p, staffPosition: v }))} label="Позиция" />
          </div>
          <div className={local.col}>
            <h3>Настройки отчета</h3>
            <Check
              on={settings.showMinutes}
              onChange={(v) => setSettings((p) => ({ ...p, showMinutes: v }))}
              label="Показать минуты"
            />
            <Check
              on={settings.showHhMm}
              onChange={(v) => setSettings((p) => ({ ...p, showHhMm: v, showOnlyMinutes: v ? false : p.showOnlyMinutes }))}
              label="Показать (чч:мин)"
            />
            <Check
              on={settings.showOnlyMinutes}
              onChange={(v) => setSettings((p) => ({ ...p, showOnlyMinutes: v, showHhMm: v ? false : p.showHhMm }))}
              label="Показать только минуты"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
