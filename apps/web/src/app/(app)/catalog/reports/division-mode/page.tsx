'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { downloadAttendanceLikeXlsx, XLSX_COLORS } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from '../relatives/page.module.css';
import local from './page.module.css';

type PageTab = 'filter' | 'view' | 'settings';
type Opt = { id: string; label: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type DayCol = { iso: string; label?: string; day?: string; weekday?: string; sunday: boolean };
type Hours = { planned: number; worked: number; diff: number };
type Cell = Hours & { iso: string; off?: boolean };
type CalCell = { iso: string; text: string; kind: string; hours: number; absent?: number };
type Row = {
  n: number;
  id: string;
  division: string;
  schedule: string;
  group?: string;
  manager?: string;
  cells: Array<Cell & Partial<CalCell>>;
  totals?: Hours;
  absentTotal?: number;
};
type Payload = {
  title: string;
  layout?: string;
  generatedAt?: string;
  from: string;
  to: string;
  periodLine?: string;
  days: DayCol[];
  rows: Row[];
  totals?: { cells: CalCell[]; absentTotal: number };
};
type Settings = { useGroups: boolean; showMinutes: boolean; showHhMm: boolean };
type CalSettings = {
  showGroup: boolean;
  showManager: boolean;
  managerGroupId: string;
  showMinutes: boolean;
  showHhMm: boolean;
};

const fileBase_PERIOD = 'Отчет-по-режиму-работы-подразделения';
const fileBase_CAL = 'Отчет-по-режиму-работы-подразделений';
const SETTINGS_KEY = 'hrhub.division-mode.settings';
const CAL_SETTINGS_KEY = 'hrhub.division-mode.calendar.settings';
const DEFAULT_SETTINGS: Settings = { useGroups: false, showMinutes: false, showHhMm: false };
const DEFAULT_CAL_SETTINGS: CalSettings = {
  showGroup: false,
  showManager: false,
  managerGroupId: '',
  showMinutes: false,
  showHhMm: false,
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
function fileStamp(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}+${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}`;
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
function fmtHours(
  n: number,
  settings: { showMinutes: boolean; showHhMm: boolean },
  blankZeroWorked = false,
) {
  if (blankZeroWorked && n === 0) return '';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (settings.showMinutes && settings.showHhMm) {
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (settings.showMinutes) return `${sign}${Math.round(abs * 100) / 100}`;
  return `${sign}${Math.round(abs)}`;
}
function fmtCalHours(n: number, settings: { showMinutes: boolean; showHhMm: boolean }) {
  if (!settings.showMinutes) return '';
  return fmtHours(n, settings);
}
function calCellText(c: CalCell | (Cell & Partial<CalCell>), settings: { showMinutes: boolean; showHhMm: boolean }) {
  if (c.kind === 'off') return 'В';
  if (c.kind === 'absent') return settings.showMinutes ? fmtHours(8, settings) : 'X';
  if (c.kind === 'work' || c.kind === 'late') return fmtCalHours(c.hours || 0, settings);
  return c.text || '';
}
function calCellClass(kind?: string) {
  if (kind === 'off') return local.off;
  if (kind === 'absent') return local.absent;
  if (kind === 'late') return local.late;
  return undefined;
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
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
  const prevMonth0 = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const left = view;
  const right = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  function cal(month: Date) {
    return (
      <div>
        <div className={extra.calHead}>
          <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Предыдущий месяц">
            ‹
          </button>
          <span>
            {MONTHS_LONG[month.getMonth()]} {month.getFullYear()}
          </span>
          <button type="button" className={extra.calNav} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Следующий месяц">
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
              {cal(left)}
              {cal(right)}
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
    </div>
  );
}

function GroupPick({ options, value, onChange }: { options: Opt[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useOutsideClose(open, () => setOpen(false));
  const chosen = options.find((o) => o.id === value);
  const visible = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className={`${local.dropWrap}${open ? ` ${local.dropOpen}` : ''}`} ref={wrapRef}>
      <button type="button" className={`${local.dropField}${chosen ? '' : ` ${local.dropEmpty}`}`} onClick={() => setOpen((v) => !v)}>
        {chosen?.label || 'Поиск...'}
      </button>
      <div className={local.dropPanel} hidden={!open}>
        {open ? (
          <>
            <input className={local.dropSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
            {visible.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
            {visible.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${local.listRow}${o.id === value ? ` ${local.listOn}` : ''}`}
                onClick={() => {
                  onChange(o.id === value ? '' : o.id);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Inner() {
  const search = useSearchParams();
  const periodTitle = search.get('period') === '1';
  const title = periodTitle ? 'Отчет по режиму работы подразделения (период)' : 'Отчет по режиму работы подразделений';
  const fileBase = periodTitle ? fileBase_PERIOD : fileBase_CAL;
  const [tab, setTab] = useState<PageTab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [groups, setGroups] = useState<Opt[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [calSettings, setCalSettings] = useState<CalSettings>(DEFAULT_CAL_SETTINGS);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      const cal = localStorage.getItem(CAL_SETTINGS_KEY);
      if (cal) setCalSettings({ ...DEFAULT_CAL_SETTINGS, ...JSON.parse(cal) });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{ divisionGroups?: Opt[] }>('/api/catalog/lookups').catch(() => ({ divisionGroups: [] as Opt[] }));
      setGroups(lookups.divisionGroups || []);
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (periodTitle) {
      if (settings.useGroups) p.set('useGroups', '1');
    } else {
      p.set('layout', 'calendar');
      if (calSettings.managerGroupId) p.set('managerGroupId', calSettings.managerGroupId);
    }
    return p.toString();
  }, [from, to, divisionIds, periodTitle, settings.useGroups, calSettings.managerGroupId]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/division-mode?${queryQs}`);
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
    if (periodTitle) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    else localStorage.setItem(CAL_SETTINGS_KEY, JSON.stringify(calSettings));
    if (report) {
      setTab('view');
      void load();
    }
  }
  function resetSettings() {
    if (periodTitle) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } else {
      setCalSettings(DEFAULT_CAL_SETTINGS);
      localStorage.setItem(CAL_SETTINGS_KEY, JSON.stringify(DEFAULT_CAL_SETTINGS));
    }
  }

  function periodLine(payload: Payload) {
    return payload.periodLine || `Период: ${payload.from} - ${payload.to}`;
  }
  function cellText(c: Cell | Hours, key: 'planned' | 'worked' | 'diff', blankOff = true) {
    if (blankOff && 'off' in c && c.off) return '';
    return fmtHours(c[key], settings, key === 'worked');
  }
  function rowTotals(r: Row): Hours {
    if (r.totals) return r.totals;
    return r.cells.reduce(
      (acc, c) => {
        if (c.off) return acc;
        acc.planned += c.planned;
        acc.worked += c.worked;
        acc.diff += c.diff;
        return acc;
      },
      { planned: 0, worked: 0, diff: 0 },
    );
  }

  function extraCols() {
    const cols: { key: 'group' | 'manager'; label: string }[] = [];
    if (!periodTitle && calSettings.showGroup) cols.push({ key: 'group', label: 'Группа подразделений' });
    if (!periodTitle && calSettings.showManager) cols.push({ key: 'manager', label: 'Руководитель' });
    return cols;
  }
  function extraVal(r: Row, key: 'group' | 'manager') {
    return key === 'group' ? r.group || '' : r.manager || '';
  }
  function absentText(n: number) {
    if (!n) return '';
    return calSettings.showMinutes ? fmtHours(n * 8, calSettings) : String(n);
  }

  async function exportExcel(data?: Payload | null) {
    const payload = data ?? (await ensureReport());
    if (!payload) return;
    if (!periodTitle) {
      const extras = extraCols();
      const topHeader = [
        { label: 'Подразделение', span: 1 },
        ...extras.map((c) => ({ label: c.label, span: 1 })),
        { label: 'График работы', span: 1 },
        ...payload.days.map((d) => ({ label: d.day || d.label || '', span: 1, fill: d.sunday ? XLSX_COLORS.weekendBg : undefined })),
        { label: 'Итого отсутствия', span: 1 },
      ];
      const subHeader = [
        { label: '' },
        ...extras.map(() => ({ label: '' })),
        { label: '' },
        ...payload.days.map((d) => ({ label: d.weekday || '', fill: d.sunday ? XLSX_COLORS.weekendBg : undefined })),
        { label: '' },
      ];
      await downloadAttendanceLikeXlsx({
        filename: `${fileBase}(${fileStamp(payload.generatedAt)}).xlsx`,
        title: payload.title,
        subtitle: periodLine(payload),
        topHeader,
        subHeader,
        rows: [
          ...payload.rows.map((r) => ({
            cells: [
              { v: r.division, s: { align: 'left' as const } },
              ...extras.map((c) => extraVal(r, c.key)),
              { v: r.schedule, s: { align: 'left' as const } },
              ...r.cells.map((c) => calCellText(c as CalCell, calSettings)),
              absentText(r.absentTotal || 0),
            ],
          })),
          {
            cells: [
              { v: 'Всего', s: { align: 'left' as const } },
              ...extras.map(() => ''),
              '',
              ...(payload.totals?.cells || []).map((c) => c.text || ''),
              absentText(payload.totals?.absentTotal || 0),
            ],
          },
        ],
      });
      return;
    }
    const topHeader = [
      { label: '№', span: 1 },
      { label: 'Подразделение', span: 1 },
      { label: 'График работы', span: 1 },
      ...payload.days.map((d) => ({ label: d.label || d.day || '', span: 3, fill: d.sunday ? XLSX_COLORS.weekendBg : undefined })),
      { label: 'Итого', span: 3 },
    ];
    const subHeader = [
      { label: '' },
      { label: '' },
      { label: '' },
      ...payload.days.flatMap((d) => [
        { label: 'По плану (часы)', fill: d.sunday ? XLSX_COLORS.weekendBg : undefined },
        { label: 'Отработано (часы)', fill: d.sunday ? XLSX_COLORS.weekendBg : undefined },
        { label: 'Разница (часы)', fill: d.sunday ? XLSX_COLORS.weekendBg : undefined },
      ]),
      { label: 'По плану (часы)' },
      { label: 'Отработано (часы)' },
      { label: 'Разница (часы)' },
    ];
    await downloadAttendanceLikeXlsx({
      filename: `${fileBase}(${fileStamp(payload.generatedAt)}).xlsx`,
      title: payload.title,
      subtitle: periodLine(payload),
      topHeader,
      subHeader,
      rows: payload.rows.map((r) => {
        const t = rowTotals(r);
        return {
          cells: [
            r.n,
            { v: r.division, s: { align: 'left' as const } },
            { v: r.schedule, s: { align: 'left' as const } },
            ...r.cells.flatMap((c) => [cellText(c, 'planned'), cellText(c, 'worked'), cellText(c, 'diff')]),
            cellText(t, 'planned', false),
            cellText(t, 'worked', false),
            cellText(t, 'diff', false),
          ],
        };
      }),
    });
  }

  function csvText(payload: Payload) {
    const q = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    if (!periodTitle) {
      const extras = extraCols();
      const head = [
        'Подразделение',
        ...extras.map((c) => c.label),
        'График работы',
        ...payload.days.map((d) => `${d.day || ''} ${d.weekday || ''}`.trim()),
        'Итого отсутствия',
      ];
      const lines = [
        ...payload.rows.map((r) =>
          [r.division, ...extras.map((c) => extraVal(r, c.key)), r.schedule, ...r.cells.map((c) => calCellText(c as CalCell, calSettings)), absentText(r.absentTotal || 0)].map((v) =>
            q(String(v)),
          ),
        ),
        ['Всего', ...extras.map(() => ''), '', ...(payload.totals?.cells || []).map((c) => c.text || ''), absentText(payload.totals?.absentTotal || 0)].map((v) => q(String(v))),
      ];
      return `\uFEFF${[head.map(q).join(';'), ...lines.map((l) => l.join(';'))].join('\n')}`;
    }
    const head = [
      '№',
      'Подразделение',
      'График работы',
      ...payload.days.flatMap((d) => [`${d.label} план`, `${d.label} отработано`, `${d.label} разница`]),
      'Итого план',
      'Итого отработано',
      'Итого разница',
    ];
    const lines = payload.rows.map((r) => {
      const t = rowTotals(r);
      return [
        r.n,
        r.division,
        r.schedule,
        ...r.cells.flatMap((c) => [cellText(c, 'planned'), cellText(c, 'worked'), cellText(c, 'diff')]),
        cellText(t, 'planned', false),
        cellText(t, 'worked', false),
        cellText(t, 'diff', false),
      ].map((v) => q(String(v)));
    });
    return `\uFEFF${[head.map(q).join(';'), ...lines.map((l) => l.join(';'))].join('\n')}`;
  }
  function xmlText(payload: Payload) {
    const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
    if (!periodTitle) {
      const extras = extraCols();
      const head = [
        'Подразделение',
        ...extras.map((c) => c.label),
        'График работы',
        ...payload.days.map((d) => `${d.day || ''} ${d.weekday || ''}`.trim()),
        'Итого отсутствия',
      ];
      const rows = [
        ...payload.rows.map((r) => [r.division, ...extras.map((c) => extraVal(r, c.key)), r.schedule, ...r.cells.map((c) => calCellText(c as CalCell, calSettings)), absentText(r.absentTotal || 0)]),
        ['Всего', ...extras.map(() => ''), '', ...(payload.totals?.cells || []).map((c) => c.text || ''), absentText(payload.totals?.absentTotal || 0)],
      ];
      return `<?xml version="1.0" encoding="UTF-8"?>\n<t>\n<r>${head.map(cell).join('')}</r>\n${rows.map((r) => `<r>${r.map(cell).join('')}</r>`).join('\n')}\n</t>\n`;
    }
    const head = [
      '№',
      'Подразделение',
      'График работы',
      ...payload.days.flatMap((d) => [`${d.label} план`, `${d.label} отработано`, `${d.label} разница`]),
      'Итого план',
      'Итого отработано',
      'Итого разница',
    ];
    const rows = payload.rows.map((r) => {
      const t = rowTotals(r);
      return [
        String(r.n),
        r.division,
        r.schedule,
        ...r.cells.flatMap((c) => [cellText(c, 'planned'), cellText(c, 'worked'), cellText(c, 'diff')]),
        cellText(t, 'planned', false),
        cellText(t, 'worked', false),
        cellText(t, 'diff', false),
      ];
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<t>\n<r>${head.map(cell).join('')}</r>\n${rows.map((r) => `<r>${r.map(cell).join('')}</r>`).join('\n')}\n</t>\n`;
  }
  function printHtml(payload: Payload) {
    if (!periodTitle) {
      const extras = extraCols();
      const extraTh = extras.map((c) => `<th rowspan="2">${escapeHtml(c.label)}</th>`).join('');
      const dayTop = payload.days.map((d) => `<th${d.sunday ? ' class="off"' : ''}>${escapeHtml(d.day || '')}</th>`).join('');
      const daySub = payload.days.map((d) => `<th${d.sunday ? ' class="off"' : ''}>${escapeHtml(d.weekday || '')}</th>`).join('');
      const body = payload.rows
        .map(
          (r) =>
            `<tr><td class="name">${escapeHtml(r.division)}</td>${extras.map((c) => `<td class="name">${escapeHtml(extraVal(r, c.key))}</td>`).join('')}<td class="name">${escapeHtml(r.schedule)}</td>${r.cells
              .map((c) => `<td class="${c.kind || ''}">${escapeHtml(calCellText(c as CalCell, calSettings))}</td>`)
              .join('')}<td>${escapeHtml(absentText(r.absentTotal || 0))}</td></tr>`,
        )
        .join('');
      const total = `<tr><td class="name">Всего</td>${extras.map(() => '<td></td>').join('')}<td></td>${(payload.totals?.cells || [])
        .map((c) => `<td>${escapeHtml(c.text || '')}</td>`)
        .join('')}<td>${escapeHtml(absentText(payload.totals?.absentTotal || 0))}</td></tr>`;
      return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${escapeHtml(payload.title)}</title>
<style>body{font-family:Arial,sans-serif;color:#181c32;margin:16px}table{border-collapse:collapse;font-size:11px}th,td{border:1px solid #d8dbe0;padding:4px 6px;text-align:center}th{background:#eef0f4}.name{text-align:left}.off,.В{background:#e7f3ff}.absent{background:#fce4ec}.late{background:#fff2cc}.btn{border:1px solid #e4e6ef;background:#fff;padding:6px 10px;margin-left:6px;cursor:pointer}</style></head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center"><h1>HR Hub · ${escapeHtml(payload.title)}</h1><div><button class="btn" id="btnPrint">Печать</button><button class="btn" id="btnExcel">Excel</button></div></div>
<p>${escapeHtml(periodLine(payload))}</p>
<table>
<tr><th rowspan="2">Подразделение</th>${extraTh}<th rowspan="2">График работы</th>${dayTop}<th rowspan="2">Итого отсутствия</th></tr>
<tr>${daySub}</tr>
${body}${total}
</table></body></html>`;
    }
    const dayTop = `${payload.days.map((d) => `<th colspan="3"${d.sunday ? ' class="off"' : ''}>${escapeHtml(d.label || '')}</th>`).join('')}<th colspan="3">Итого</th>`;
    const daySub = `${payload.days
      .map(
        (d) =>
          `<th${d.sunday ? ' class="off"' : ''}>По плану (часы)</th><th${d.sunday ? ' class="off"' : ''}>Отработано (часы)</th><th${d.sunday ? ' class="off"' : ''}>Разница (часы)</th>`,
      )
      .join('')}<th>По плану (часы)</th><th>Отработано (часы)</th><th>Разница (часы)</th>`;
    const body = payload.rows
      .map((r) => {
        const t = rowTotals(r);
        return `<tr><td>${r.n}</td><td class="name">${escapeHtml(r.division)}</td><td class="name">${escapeHtml(r.schedule)}</td>${r.cells
          .map((c) => `<td>${escapeHtml(cellText(c, 'planned'))}</td><td>${escapeHtml(cellText(c, 'worked'))}</td><td>${escapeHtml(cellText(c, 'diff'))}</td>`)
          .join('')}<td>${escapeHtml(cellText(t, 'planned', false))}</td><td>${escapeHtml(cellText(t, 'worked', false))}</td><td>${escapeHtml(cellText(t, 'diff', false))}</td></tr>`;
      })
      .join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${escapeHtml(payload.title)}</title>
<style>body{font-family:Arial,sans-serif;color:#181c32;margin:16px}table{border-collapse:collapse;font-size:11px}th,td{border:1px solid #d8dbe0;padding:4px 6px;text-align:center}th{background:#eef0f4}.name{text-align:left}.off{background:#e7f3ff}.btn{border:1px solid #e4e6ef;background:#fff;padding:6px 10px;margin-left:6px;cursor:pointer}</style></head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center"><h1>HR Hub · ${escapeHtml(payload.title)}</h1><div><button class="btn" id="btnPrint">Печать</button><button class="btn" id="btnExcel">Excel</button></div></div>
<p>${escapeHtml(periodLine(payload))}</p>
<table>
<tr><th rowspan="2">№</th><th rowspan="2">Подразделение</th><th rowspan="2">График работы</th>${dayTop}</tr>
<tr>${daySub}</tr>
${body || '<tr><td colspan="6">Нет данных</td></tr>'}
</table></body></html>`;
  }

  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    const html = printHtml(data);
    if (!w) {
      downloadBlob(`${fileBase}(${fileStamp(data.generatedAt)}).html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
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
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void openHtml()}>HTML</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>Excel</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && downloadBlob(`${fileBase}(${fileStamp(d.generatedAt)}).csv`, new Blob([csvText(d)], { type: 'text/csv;charset=utf-8' })))}>CSV</button>
      <button type="button" className={ghost ? layout.exportBtnGhost : undefined} disabled={busy} onClick={() => void ensureReport().then((d) => d && downloadBlob(`${fileBase}(${fileStamp(d.generatedAt)}).xml`, new Blob([xmlText(d)], { type: 'application/xml;charset=utf-8' })))}>XML</button>
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
          <div className={layout.field}>
            <label>Дата</label>
            <PeriodRangePicker from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          </div>
          <div className={layout.field}>
            <label>{periodTitle ? 'Подразделения' : 'Подразделение'}</label>
            <DivisionPick nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
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
              <p className={local.periodLine}>{periodLine(report)}</p>
              <div className={local.tableWrap}>
                {!periodTitle ? (
                  <table className={local.table}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>Подразделение</th>
                        {extraCols().map((c) => (
                          <th key={c.key} rowSpan={2}>{c.label}</th>
                        ))}
                        <th rowSpan={2}>График работы</th>
                        {report.days.map((d) => (
                          <th key={d.iso} className={d.sunday ? local.off : undefined}>{d.day}</th>
                        ))}
                        <th rowSpan={2}>Итого отсутствия</th>
                      </tr>
                      <tr>
                        {report.days.map((d) => (
                          <th key={`${d.iso}-w`} className={d.sunday ? local.off : undefined}>{d.weekday}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.id}>
                          <td className={local.name}>{r.division}</td>
                          {extraCols().map((c) => (
                            <td key={c.key} className={local.name}>{extraVal(r, c.key)}</td>
                          ))}
                          <td className={local.sched}>{r.schedule}</td>
                          {r.cells.map((c) => (
                            <td key={c.iso} className={calCellClass(c.kind)}>{calCellText(c as CalCell, calSettings)}</td>
                          ))}
                          <td>{absentText(r.absentTotal || 0)}</td>
                        </tr>
                      ))}
                      <tr className={local.totalRow}>
                        <td className={local.name}>Всего</td>
                        {extraCols().map((c) => (
                          <td key={c.key} />
                        ))}
                        <td />
                        {(report.totals?.cells || []).map((c) => (
                          <td key={c.iso}>{c.text}</td>
                        ))}
                        <td>{absentText(report.totals?.absentTotal || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>№</th>
                      <th rowSpan={2}>Подразделение</th>
                      <th rowSpan={2}>График работы</th>
                      {report.days.map((d) => (
                        <th key={d.iso} colSpan={3} className={d.sunday ? local.off : undefined}>
                          {d.label}
                        </th>
                      ))}
                      <th colSpan={3}>Итого</th>
                    </tr>
                    <tr>
                      {report.days.map((d) => (
                        <FragmentHead key={`${d.iso}-sub`} sunday={d.sunday} />
                      ))}
                      <FragmentHead sunday={false} />
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className={local.empty} colSpan={6 + report.days.length * 3}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.map((r) => {
                        const t = rowTotals(r);
                        return (
                        <tr key={r.id}>
                          <td>{r.n}</td>
                          <td className={local.name}>{r.division}</td>
                          <td className={local.sched}>{r.schedule}</td>
                          {r.cells.map((c) => (
                            <Fragment key={c.iso}>
                              <td className={report.days.find((d) => d.iso === c.iso)?.sunday ? local.off : undefined}>{cellText(c, 'planned')}</td>
                              <td className={report.days.find((d) => d.iso === c.iso)?.sunday ? local.off : undefined}>{cellText(c, 'worked')}</td>
                              <td className={`${!c.off && (c.diff || 0) < 0 ? local.neg : ''} ${report.days.find((d) => d.iso === c.iso)?.sunday ? local.off : ''}`}>{cellText(c, 'diff')}</td>
                            </Fragment>
                          ))}
                          <td>{cellText(t, 'planned', false)}</td>
                          <td>{cellText(t, 'worked', false)}</td>
                          <td className={t.diff < 0 ? local.neg : undefined}>{cellText(t, 'diff', false)}</td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className={local.settings}>
          {periodTitle ? (
            <>
          <div>
            <h3>Настройки фильтра</h3>
            <label className={local.opt}>
              <input
                type="checkbox"
                checked={settings.useGroups}
                onChange={(e) => setSettings((p) => ({ ...p, useGroups: e.target.checked }))}
              />
              Использовать группы подразделений
            </label>
          </div>
          <div>
            <h3>Настройки отчета</h3>
            <label className={local.opt}>
              <input
                type="checkbox"
                checked={settings.showMinutes}
                onChange={(e) =>
                  setSettings((p) => ({
                    ...p,
                    showMinutes: e.target.checked,
                    showHhMm: e.target.checked ? p.showHhMm : false,
                  }))
                }
              />
              Показать минуты
            </label>
            <label className={`${local.opt}${settings.showMinutes ? '' : ` ${local.dim}`}`}>
              <input
                type="checkbox"
                checked={settings.showHhMm}
                disabled={!settings.showMinutes}
                onChange={(e) => setSettings((p) => ({ ...p, showHhMm: e.target.checked }))}
              />
              Показать (чч:мин)
            </label>
          </div>
            </>
          ) : (
            <>
              <div>
                <label className={local.opt}>
                  <input
                    type="checkbox"
                    checked={calSettings.showGroup}
                    onChange={(e) => setCalSettings((p) => ({ ...p, showGroup: e.target.checked }))}
                  />
                  Группа подразделений
                </label>
                <label className={local.opt}>
                  <input
                    type="checkbox"
                    checked={calSettings.showManager}
                    onChange={(e) =>
                      setCalSettings((p) => ({
                        ...p,
                        showManager: e.target.checked,
                        managerGroupId: e.target.checked ? p.managerGroupId : '',
                      }))
                    }
                  />
                  Руководитель
                </label>
                {calSettings.showManager ? (
                  <div className={local.reveal}>
                    <p className={local.hint}>Показать руководителя из группы подразделений</p>
                    <GroupPick options={groups} value={calSettings.managerGroupId} onChange={(id) => setCalSettings((p) => ({ ...p, managerGroupId: id }))} />
                  </div>
                ) : null}
              </div>
              <div>
                <label className={local.opt}>
                  <input
                    type="checkbox"
                    checked={calSettings.showMinutes}
                    onChange={(e) =>
                      setCalSettings((p) => ({
                        ...p,
                        showMinutes: e.target.checked,
                        showHhMm: e.target.checked ? p.showHhMm : false,
                      }))
                    }
                  />
                  Показать минуты
                </label>
                <label className={`${local.opt}${calSettings.showMinutes ? '' : ` ${local.dim}`}`}>
                  <input
                    type="checkbox"
                    checked={calSettings.showHhMm}
                    disabled={!calSettings.showMinutes}
                    onChange={(e) => setCalSettings((p) => ({ ...p, showHhMm: e.target.checked }))}
                  />
                  Показать (чч:мм)
                </label>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FragmentHead({ sunday }: { sunday: boolean }) {
  const cls = sunday ? local.off : undefined;
  return (
    <>
      <th className={cls}>По плану (часы)</th>
      <th className={cls}>Отработано (часы)</th>
      <th className={cls}>Разница (часы)</th>
    </>
  );
}

function Fragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default function DivisionModePage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}
