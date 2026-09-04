'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadAttendanceLikeXlsx, XLSX_COLORS, type XlsxCell } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from '../relatives/page.module.css';
import local from './page.module.css';
import { SettingsPanel } from './SettingsPanel';
import { T13SettingsPanel } from './T13SettingsPanel';
import {
  AttSettings,
  DEFAULT_SETTINGS,
  fmtAttHours,
  fmtAttMinutes,
  identityCols,
  identityColsT13,
  mergeSettings,
  metricCols,
  metricColsT13,
  settingsPayload,
  T13_DEFAULT_SETTINGS,
} from './settings';

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
type CellKind = 'work' | 'late' | 'partial' | 'absent' | 'off' | 'leave';
type DayCol = { iso: string; day: string; weekday: string; sunday: boolean };
type Cell = { iso: string; text: string; kind: CellKind; hours: number };
type Row = {
  n: number;
  employee: string;
  tabNumber: string;
  position: string;
  staffPos?: string;
  department?: string;
  division: string;
  divisionCode?: string;
  divisionGroup?: string;
  location?: string;
  region?: string;
  grade?: string;
  schedule?: string;
  hiredAt?: string;
  employmentType: string;
  phone?: string;
  email?: string;
  legalEntity?: string;
  pinfl?: string;
  altName?: string;
  manager?: string;
  cells: Cell[];
  planned: number;
  onTime: number;
  absentReason: number;
  absentNoReason: number;
  total: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  overtime?: number;
  offSchedule?: number;
  hoursWorked?: number;
  workCoeff?: number;
  daysWorked?: number;
  plannedDays?: number;
  customNormDays?: number;
  customNormHours?: number;
  daysCoeff?: number;
  consecutiveAbsent?: number;
  hoursPerDay?: number;
  requestTime?: string;
  fineLate?: number;
  fineTime?: number;
  workedWithFines?: number;
  fineEarly?: number;
  fineAbsent?: number;
  origFineLate?: number;
  origFineEarly?: number;
  origFineAbsent?: number;
  origFine?: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  periodLine: string;
  generatedAt?: string;
  days: DayCol[];
  rows: Row[];
};
type Template = {
  name: string;
  from: string;
  to: string;
  divisionIds: string[];
  groupIds?: string[];
  positionIds: string[];
  locationIds: string[];
  employeeIds: string[];
};
const FILE_DEFAULT = 'Отчет-по-посещениям-сотрудников';
const FILE_T13 = 'Отчет-по-посещениям-сотрудников-(T-13)';
const SETTINGS_KEY = 'hrhub.attendance-overview.settings';
const SETTINGS_KEY_T13 = 'hrhub.attendance-t13.settings.v2';
const TEMPLATES_KEY = 'hrhub.attendance-overview.templates';
const TEMPLATES_KEY_T13 = 'hrhub.attendance-t13.templates';
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
const EXTRA_LOCATIONS: Opt[] = [
  { id: 'Andijan 1', label: 'Andijan 1' },
  { id: 'Andijan 2', label: 'Andijan 2' },
  { id: 'Buxoro 1', label: 'Buxoro 1' },
  { id: 'Buxoro 2 (Zarafshan)', label: 'Buxoro 2 (Zarafshan)' },
  { id: 'Buxoro 3', label: 'Buxoro 3' },
  { id: 'Chimkent', label: 'Chimkent' },
  { id: 'DENOV', label: 'DENOV' },
  { id: 'Fargona 1', label: 'Fargona 1' },
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
const FILL: Record<CellKind, string> = {
  work: XLSX_COLORS.white,
  late: XLSX_COLORS.factBg,
  partial: XLSX_COLORS.factBg,
  absent: XLSX_COLORS.noShowBg,
  off: XLSX_COLORS.weekendBg,
  leave: 'FFE8F5E9',
};

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
function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function cellClass(kind: CellKind) {
  if (kind === 'off') return local.off;
  if (kind === 'absent') return local.absent;
  if (kind === 'late' || kind === 'partial') return local.late;
  if (kind === 'leave') return local.leave;
  return local.work;
}
function displayCell(cell: Cell, settings: AttSettings) {
  if (cell.kind === 'off' || cell.kind === 'absent' || cell.kind === 'leave') return cell.text;
  if ((settings.showHhMm || settings.showMinutes) && cell.hours && !cell.text.includes('-') && !cell.text.includes('\n')) {
    return fmtAttHours(cell.hours, settings);
  }
  return cell.text;
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
              <button type="button" className={extra.apply} onClick={() => { onChange(draftFrom, draftTo); setOpen(false); }}>
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
        <input
          className={local.dropSearch}
          placeholder="Поиск..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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

function extraValue(r: Row, key: string, settings?: AttSettings) {
  const v = (r as Record<string, unknown>)[key];
  if (v == null || v === '') return '';
  if (settings && (key === 'lateMinutes' || key === 'earlyMinutes')) return fmtAttMinutes(Number(v), settings);
  if (settings && (key === 'overtime' || key === 'hoursWorked' || key === 'customNormHours')) {
    return fmtAttHours(Number(v), settings);
  }
  return String(v);
}

export function AttendanceOverviewReport({ variant = 'default' }: { variant?: 'default' | 't13' }) {
  const isT13 = variant === 't13';
  const title = isT13 ? 'Отчет по посещениям сотрудников (Т-13)' : 'Отчет по посещениям сотрудников';
  const fileBase = isT13 ? FILE_T13 : FILE_DEFAULT;
  const settingsKey = isT13 ? SETTINGS_KEY_T13 : SETTINGS_KEY;
  const templatesKey = isT13 ? TEMPLATES_KEY_T13 : TEMPLATES_KEY;
  const [tab, setTab] = useState<Tab>('filter');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [settings, setSettings] = useState<AttSettings>(DEFAULT_SETTINGS);
  const [divisionGroups, setDivisionGroups] = useState<Opt[]>([]);
  const [timeTypes, setTimeTypes] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tplRef = useOutsideClose(tplOpen, () => setTplOpen(false));

  useEffect(() => {
    setSettings(mergeSettings(loadJson(settingsKey, isT13 ? T13_DEFAULT_SETTINGS : DEFAULT_SETTINGS)));
    try {
      const raw = localStorage.getItem(templatesKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setTemplates(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{
        employees?: Opt[];
        positions?: Opt[];
        locations?: Opt[];
        divisionGroups?: Opt[];
        timeTypes?: Opt[];
      }>('/api/catalog/lookups').catch(() => ({
        employees: [] as Opt[],
        positions: [] as Opt[],
        locations: [] as Opt[],
        divisionGroups: [] as Opt[],
        timeTypes: [] as Opt[],
      }));
      setDivisionGroups(lookups.divisionGroups || []);
      setTimeTypes(lookups.timeTypes || []);
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
      setLocations(mergeOpts(locs.map((l) => ({ id: l.id, label: l.label || l.id })), EXTRA_LOCATIONS));
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
    if (isT13 && groupIds.length) p.set('groupIds', groupIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (locationIds.length) p.set('locationIds', locationIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (settings.showDismissed) p.set('includeInactive', '1');
    p.set('cfg', JSON.stringify(settingsPayload(settings)));
    return p.toString();
  }, [from, to, divisionIds, groupIds, positionIds, locationIds, employeeIds, settings, isT13]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/attendance-overview?${queryQs}`);
      if (isT13) data.title = title;
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

  const extras = isT13 ? identityColsT13(settings) : identityCols(settings);
  const metrics = isT13 ? metricColsT13(settings) : metricCols(settings);
  const planLabel = isT13 ? 'По плану (часы)' : 'По плану';
  function sumText(n: number) {
    if (n == null || Number.isNaN(n)) return '';
    return isT13 ? fmtAttHours(n, settings) : String(n);
  }
  function colText(r: Row, key: string) {
    return extraValue(r, key, isT13 ? settings : undefined);
  }
  const viewRows = useMemo(() => {
    if (!report) return [];
    const rows = [...report.rows];
    if (settings.sortByDivision) {
      rows.sort((a, b) => a.division.localeCompare(b.division, 'ru') || a.employee.localeCompare(b.employee, 'ru'));
    }
    return rows;
  }, [report, settings.sortByDivision]);

  function saveSettings() {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    if (report) {
      setTab('view');
      void load();
    }
  }
  function resetSettings() {
    const next = isT13 ? T13_DEFAULT_SETTINGS : DEFAULT_SETTINGS;
    setSettings(next);
    localStorage.setItem(settingsKey, JSON.stringify(next));
  }
  function createTemplate() {
    const name = window.prompt('Название шаблона');
    if (!name?.trim()) return;
    const next = [
      ...templates,
      { name: name.trim(), from, to, divisionIds, groupIds, positionIds, locationIds, employeeIds },
    ];
    setTemplates(next);
    localStorage.setItem(templatesKey, JSON.stringify(next));
    setTplOpen(false);
  }
  function applyTemplate(t: Template) {
    setFrom(t.from);
    setTo(t.to);
    setDivisionIds(t.divisionIds);
    setGroupIds(t.groupIds || []);
    setPositionIds(t.positionIds);
    setLocationIds(t.locationIds);
    setEmployeeIds(t.employeeIds);
    setTplOpen(false);
  }

  function styledCell(cell: Cell): XlsxCell {
    const text = displayCell(cell, settings);
    return {
      v: text,
      s: {
        fill: FILL[cell.kind],
        fontColor: cell.kind === 'absent' ? XLSX_COLORS.noShowFg : XLSX_COLORS.titleFg,
        bold: cell.kind === 'absent' || cell.kind === 'off',
        align: 'center',
      },
    };
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data ?? (await ensureReport());
    if (!payload) return;
    const rows = settings.sortByDivision
      ? [...payload.rows].sort((a, b) => a.division.localeCompare(b.division, 'ru') || a.employee.localeCompare(b.employee, 'ru'))
      : payload.rows;
    const topHeader = [
      { label: '№', span: 1 },
      { label: 'ФИО', span: 1 },
      ...extras.map((c) => ({ label: c.label, span: 1 })),
      ...payload.days.map((d) => ({ label: d.day, span: 1 })),
      { label: planLabel, span: 1 },
      { label: 'Вовремя', span: 1 },
      { label: 'Отсутствие', span: 2 },
      { label: 'Итого', span: 1 },
      ...metrics.map((c) => ({ label: c.label, span: 1 })),
    ];
    const subHeader = [
      { label: '' },
      { label: '' },
      ...extras.map(() => ({ label: '' })),
      ...payload.days.map((d) => ({ label: d.weekday, fill: d.sunday ? XLSX_COLORS.weekendBg : undefined })),
      { label: '' },
      { label: '' },
      { label: 'По причине' },
      { label: 'Без причины' },
      { label: '' },
      ...metrics.map(() => ({ label: '' })),
    ];
    await downloadAttendanceLikeXlsx({
      filename: `${fileBase}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: payload.title,
      subtitle: payload.periodLine,
      topHeader,
      subHeader,
      rows: rows.map((r) => ({
        cells: [
          r.n,
          { v: r.employee, s: { align: 'left' } },
          ...extras.map((c) => colText(r, c.key)),
          ...r.cells.map(styledCell),
          sumText(r.planned),
          sumText(r.onTime),
          r.absentReason || '',
          sumText(r.absentNoReason),
          sumText(r.total),
          ...metrics.map((c) => colText(r, c.key)),
        ],
      })),
    });
  }

  function csvText(payload: Payload) {
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const extrasH = extras.map((c) => c.label);
    const metricsH = metrics.map((c) => c.label);
    const head = ['№', 'ФИО', ...extrasH, ...payload.days.map((d) => `${d.day} ${d.weekday}`), planLabel, 'Вовремя', 'По причине', 'Без причины', 'Итого', ...metricsH];
    const lines = payload.rows.map((r) =>
      [
        r.n,
        r.employee,
        ...extras.map((c) => colText(r, c.key)),
        ...r.cells.map((c) => displayCell(c, settings)),
        sumText(r.planned),
        sumText(r.onTime),
        r.absentReason,
        sumText(r.absentNoReason),
        sumText(r.total),
        ...metrics.map((c) => colText(r, c.key)),
      ].map((v) => q(String(v))),
    );
    return `\uFEFF${[head.map(q).join(';'), ...lines.map((l) => l.join(';'))].join('\n')}`;
  }
  function xmlText(payload: Payload) {
    const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
    const extrasH = extras.map((c) => c.label);
    const metricsH = metrics.map((c) => c.label);
    const head = ['№', 'ФИО', ...extrasH, ...payload.days.map((d) => `${d.day} ${d.weekday}`), planLabel, 'Вовремя', 'По причине', 'Без причины', 'Итого', ...metricsH];
    const rows = payload.rows.map((r) =>
      [
        String(r.n),
        r.employee,
        ...extras.map((c) => colText(r, c.key)),
        ...r.cells.map((c) => displayCell(c, settings)),
        sumText(r.planned),
        sumText(r.onTime),
        String(r.absentReason || ''),
        sumText(r.absentNoReason),
        sumText(r.total),
        ...metrics.map((c) => colText(r, c.key)),
      ],
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<t>\n<r>${head.map(cell).join('')}</r>\n${rows.map((r) => `<r>${r.map(cell).join('')}</r>`).join('\n')}\n</t>\n`;
  }
  function printHtml(payload: Payload) {
    const extrasH = extras.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const metricsH = metrics.map((c) => `<th rowspan="2">${escapeHtml(c.label)}</th>`).join('');
    const dayTop = payload.days.map((d) => `<th>${d.day}</th>`).join('');
    const daySub = payload.days
      .map((d) => `<th${d.sunday ? ' style="background:#e7f3ff"' : ''}>${d.weekday}</th>`)
      .join('');
    const extraPad = extras.map(() => '<th></th>').join('');
    const body = payload.rows
      .map((r) => {
        const extraTd = extras.map((c) => `<td>${escapeHtml(colText(r, c.key))}</td>`).join('');
        const days = r.cells
          .map((c) => {
            const bg =
              c.kind === 'off'
                ? '#e7f3ff'
                : c.kind === 'absent'
                  ? '#fce4ec'
                  : c.kind === 'late' || c.kind === 'partial'
                    ? '#fff2cc'
                    : c.kind === 'leave'
                      ? '#e8f5e9'
                      : '#fff';
            return `<td style="background:${bg};text-align:center">${escapeHtml(displayCell(c, settings))}</td>`;
          })
          .join('');
        const metricTd = metrics.map((c) => `<td>${escapeHtml(colText(r, c.key))}</td>`).join('');
        return `<tr><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td>${extraTd}${days}<td>${sumText(r.planned)}</td><td>${sumText(r.onTime)}</td><td>${r.absentReason || ''}</td><td>${sumText(r.absentNoReason)}</td><td>${sumText(r.total)}</td>${metricTd}</tr>`;
      })
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title>
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
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(payload.title)}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<p style="padding:0 16px">${escapeHtml(payload.periodLine)}</p>
<div class="wrap"><table>
<thead>
<tr><th>№</th><th>ФИО</th>${extrasH}${dayTop}<th>${escapeHtml(planLabel)}</th><th>Вовремя</th><th colspan="2">Отсутствие</th><th>Итого</th>${metricsH}</tr>
<tr><th></th><th></th>${extraPad}${daySub}<th></th><th></th><th>По причине</th><th>Без причины</th><th></th></tr>
</thead>
<tbody>${body || `<tr><td colspan="${7 + extras.length + payload.days.length}">Нет данных</td></tr>`}</tbody>
</table></div></body></html>`;
  }

  function exportCsv(data: Payload) {
    downloadBlob(`${fileBase}(${fileStamp(data.generatedAt)}).csv`, new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }));
  }
  function exportXml(data: Payload) {
    downloadBlob(`${fileBase}(${fileStamp(data.generatedAt)}).xml`, new Blob([xmlText(data)], { type: 'application/xml;charset=utf-8' }));
  }
  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    if (!w) {
      downloadBlob(`${fileBase}(${fileStamp(data.generatedAt)}).html`, new Blob([printHtml(data)], { type: 'text/html;charset=utf-8' }));
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
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportCsv(d))}>CSV</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && exportXml(d))}>XML</button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>{title}</h1>
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
        <button type="button" className={tab === 'settings' ? layout.tabOn : layout.tab} onClick={() => setTab('settings')}>
          Настройки
        </button>
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
          <div className={local.periodRow}>
            <div className={layout.field}>
              <label>Период</label>
              <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
            </div>
            <div className={layout.field}>
              <label>Шаблоны</label>
              <div className={local.tplWrap} ref={tplRef}>
                <button type="button" className={local.tplBtn} onClick={() => setTplOpen((v) => !v)}>
                  Создать шаблон
                </button>
                {tplOpen ? (
                  <div className={local.tplMenu}>
                    <button type="button" className={local.tplItem} onClick={createTemplate}>
                      Создать шаблон
                    </button>
                    {templates.map((t) => (
                      <button type="button" key={t.name} className={local.tplItem} onClick={() => applyTemplate(t)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {isT13 ? (
            <div className={layout.field}>
              <label>Группы подразделений</label>
              <FilterPick options={divisionGroups} selected={groupIds} onChange={setGroupIds} />
            </div>
          ) : null}
          <div className={layout.field}>
            <label>{isT13 ? 'Подразделения' : 'Подразделение'}</label>
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
              <p className={local.periodLine}>{report.periodLine}</p>
              {settings.showColorDesc ? (
                <div className={extra.legend}>
                  <span><i className={extra.swatch} style={{ background: '#e7f3ff' }} />Выходной</span>
                  <span><i className={extra.swatch} style={{ background: '#fce4ec' }} />Отсутствие</span>
                  <span><i className={extra.swatch} style={{ background: '#fff2cc' }} />Опоздание / неполный день</span>
                </div>
              ) : null}
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>№</th>
                      <th rowSpan={2}>ФИО</th>
                      {extras.map((c) => (
                        <th key={c.key} rowSpan={2}>{c.label}</th>
                      ))}
                      {report.days.map((d) => (
                        <th key={d.iso} className={d.sunday ? local.off : undefined}>{d.day}</th>
                      ))}
                      <th rowSpan={2}>{planLabel}</th>
                      <th rowSpan={2}>Вовремя</th>
                      <th colSpan={2}>Отсутствие</th>
                      <th rowSpan={2}>Итого</th>
                      {metrics.map((c) => (
                        <th key={c.key} rowSpan={2}>{c.label}</th>
                      ))}
                    </tr>
                    <tr>
                      {report.days.map((d) => (
                        <th key={`${d.iso}-w`} className={d.sunday ? local.off : undefined}>{d.weekday}</th>
                      ))}
                      <th>По причине</th>
                      <th>Без причины</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRows.length === 0 ? (
                      <tr>
                        <td className={s.empty} colSpan={7 + extras.length + metrics.length + report.days.length}>Нет данных</td>
                      </tr>
                    ) : (
                      viewRows.map((r) => (
                        <tr key={`${r.n}-${r.employee}`}>
                          <td>{r.n}</td>
                          <td className={local.name}>{r.employee}</td>
                          {extras.map((c) => (
                            <td key={c.key}>{colText(r, c.key)}</td>
                          ))}
                          {r.cells.map((c) => (
                            <td key={c.iso} className={`${cellClass(c.kind)}${settings.checkMarks || settings.markSchedule || settings.infoByRows || settings.markDetails || settings.dayMarkDetails ? ` ${local.cellPre}` : ''}`}>{displayCell(c, settings)}</td>
                          ))}
                          <td className={local.sum}>{sumText(r.planned)}</td>
                          <td className={local.sum}>{sumText(r.onTime)}</td>
                          <td>{r.absentReason || ''}</td>
                          <td>{sumText(r.absentNoReason)}</td>
                          <td className={local.sum}>{sumText(r.total)}</td>
                          {metrics.map((c) => (
                            <td key={c.key}>{colText(r, c.key)}</td>
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

      {tab === 'settings' ? (
        isT13 ? (
          <T13SettingsPanel settings={settings} setSettings={setSettings} divisionGroups={divisionGroups} />
        ) : (
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          divisionGroups={divisionGroups}
          timeTypes={timeTypes}
        />
        )
      ) : null}
    </div>
  );
}
