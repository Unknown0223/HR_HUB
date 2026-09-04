'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import posS from '../positions/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view' | 'settings';
type Opt = { id: string; label: string };
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type GroupBy = 'none' | 'jobGroup' | 'staffGroup';
type PosType = 'all' | 'occupied' | 'vacant';
type Row = { name: string; values: number[]; other: number; total: number };
type Payload = {
  title: string;
  date: string;
  dateLabel: string;
  generatedAt?: string;
  rowLabel: string;
  columns: string[];
  hasOther: boolean;
  rows: Row[];
};
type Settings = { divisionIds: string[]; groupBy: GroupBy; positionType: PosType };

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
const FILE_BASE = 'Отчет-по-занятости';
const SETTINGS_KEY = 'hr-hub-occupancy-settings';
const DEFAULT_SETTINGS: Settings = { divisionIds: [], groupBy: 'none', positionType: 'all' };
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
const EXTRA_CITIES = [
  'Алмалык',
  'Андижан',
  'Бекабад',
  'Бухара',
  'Гулистан',
  'Денов',
  'Джизак',
  'Зарафшан',
];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
function fmtRu(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
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
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      divisionIds: Array.isArray(p.divisionIds) ? p.divisionIds.map(String) : [],
      groupBy: p.groupBy === 'jobGroup' || p.groupBy === 'staffGroup' ? p.groupBy : 'none',
      positionType: p.positionType === 'occupied' || p.positionType === 'vacant' ? p.positionType : 'all',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={extra.periodWrap} ref={wrapRef}>
      <button type="button" className={s.periodBtn} onClick={() => setOpen((v) => !v)}>
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
                <button type="button" key={`${c.ymd}-${i}`} className={cls} onClick={() => { onChange(c.ymd); setOpen(false); }}>
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

function DivisionTree({
  nodes,
  selected,
  onChange,
}: {
  nodes: TreeNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
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
    const expanded = open.has(node.id) || !!q;
    return (
      <>
        <div className={extra.treeRow} style={{ paddingLeft: depth * 14 }}>
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
          <input type="checkbox" checked={selected.has(node.id)} onChange={() => toggleOne(node.id)} />
          <span>{node.name}</span>
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
    <div>
      <input className={extra.treeSearch} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={`${extra.treeBox} ${s.treeTall}`}>
        {visible.map((n) => (
          <Row key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}

function FilterPick({
  options,
  selected,
  placeholder,
  onChange,
}: {
  options: Opt[];
  selected: string[];
  placeholder?: string;
  onChange: (ids: string[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    return showAll ? list : list.slice(0, 12);
  }, [options, q, showAll]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQ('');
        setShowAll(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  const summary = selected.length ? `Выбрано: ${selected.length}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder={placeholder || 'Поиск...'}
        value={open ? q : summary}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {open ? (
        <div className={s.pickMenu}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button type="button" key={o.id} className={selected.includes(o.id) ? `${s.pickOpt} ${s.pickOptOn}` : s.pickOpt} onClick={() => toggle(o.id)}>
              <input type="checkbox" readOnly checked={selected.includes(o.id)} />
              {o.label}
            </button>
          ))}
          {!showAll && options.length > 12 ? (
            <button type="button" className={s.pickAll} onClick={() => setShowAll(true)}>
              Показать все
            </button>
          ) : null}
        </div>
      ) : null}
      {selected.length && !open ? (
        <div className={s.chips}>
          {selected.slice(0, 4).map((id) => {
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

function rowValues(r: Row, hasOther: boolean) {
  return [r.name, ...r.values.map((v) => (v ? String(v) : '')), ...(hasOther ? [r.other ? String(r.other) : ''] : []), String(r.total)];
}

function csvText(report: Payload) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = [report.rowLabel, ...report.columns];
  const lines = [`${q(report.dateLabel)};${';'.repeat(header.length - 1)}`, header.map(q).join(';'), ...report.rows.map((r) => rowValues(r, report.hasOther).map(q).join(';'))];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  const header = [report.rowLabel, ...report.columns];
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([report.dateLabel, ...Array(header.length - 1).fill('')])}
${row(header)}
${report.rows.map((r) => row(rowValues(r, report.hasOther))).join('\n')}
</t>
`;
}

function printHtml(report: Payload) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const header = [report.rowLabel, ...report.columns];
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'z' : ''}"><td class="name">${escapeHtml(r.name)}</td>${r.values
          .map((v) => `<td>${v || ''}</td>`)
          .join('')}${report.hasOther ? `<td>${r.other || ''}</td>` : ''}<td>${r.total}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#0a85e2;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:11px}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.z td{background:#f9fafb}
.name{text-align:left}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(report.dateLabel)}</div>
<div class="wrap"><table><thead><tr>${header.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${header.length}">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
}

export default function OccupancyReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(isoDay(new Date()));
  const [positionGroupIds, setPositionGroupIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [staffGroups, setStaffGroups] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savedNote, setSavedNote] = useState('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positionGroups, setPositionGroups] = useState<Opt[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [cities, setCities] = useState<Opt[]>(EXTRA_CITIES.map((c) => ({ id: c, label: c })));
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSettings(loadSettings());
    void (async () => {
      try {
        const [lookups, divisions] = await Promise.all([
          apiFetch<{ positions?: Opt[]; positionGroups?: Opt[]; staffGroups?: Opt[] }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
        ]);
        setTree(divisions);
        setPositionGroups(lookups.positionGroups || []);
        setPositions(mergeOpts(lookups.positions || [], EXTRA_POSITIONS));
        setCities(mergeOpts(lookups.staffGroups || [], EXTRA_CITIES.map((c) => ({ id: c, label: c }))));
      } catch {
        /* optional */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('date', date);
    if (positionGroupIds.length) p.set('positionGroupIds', positionGroupIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (staffGroups.length) p.set('staffGroups', staffGroups.join(','));
    if (settings.divisionIds.length) p.set('divisionIds', settings.divisionIds.join(','));
    if (settings.groupBy !== 'none') p.set('groupBy', settings.groupBy);
    if (settings.positionType !== 'all') p.set('positionType', settings.positionType);
    return p.toString();
  }, [date, positionGroupIds, positionIds, staffGroups, settings]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/occupancy?${queryQs}`);
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
  async function exportExcel(data?: Payload | null) {
    const payload = data ?? (await ensureReport());
    if (!payload) return;
    await downloadStyledXlsx({
      filename: `${FILE_BASE}(${fileStamp(payload.generatedAt)}).xlsx`,
      sheetName: 'Отчет по занятости',
      preamble: [payload.dateLabel],
      columns: [payload.rowLabel, ...payload.columns],
      rows: payload.rows.map((r) => rowValues(r, payload.hasOther)),
      colWidths: [28, ...payload.columns.map(() => 14)],
    });
  }
  function exportCsv(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`, new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }));
  }
  function exportXml(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).xml`, new Blob([xmlText(data)], { type: 'application/xml;charset=utf-8' }));
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

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSavedNote('Сохранено');
    setTimeout(() => setSavedNote(''), 2000);
  }
  function resetSettings() {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(SETTINGS_KEY);
    setSavedNote('Сброшено');
    setTimeout(() => setSavedNote(''), 2000);
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
      <h1 className={layout.h1}>Отчет по занятости</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>Фильтр</button>
        <button
          type="button"
          className={tab === 'view' ? layout.tabOn : layout.tab}
          onClick={() => {
            setTab('view');
            if (!report) void generate();
          }}
        >
          Просмотреть
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
      {savedNote ? <p className={s.saved}>{savedNote}</p> : null}

      {tab === 'filter' ? (
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
          <div className={layout.field}>
            <label>Период</label>
            <DatePicker value={date} onChange={setDate} />
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
            <label>Группа позиций</label>
            <FilterPick options={cities} selected={staffGroups} onChange={setStaffGroups} />
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>{busy ? 'Формирование…' : 'Составить отчет'}</button>
            {exportBtns(false)}
          </div>
        </form>
      ) : null}

      {tab === 'settings' ? (
        <div className={`${layout.card} ${s.card}`}>
          <div className={layout.field}>
            <label>Подразделения</label>
            <DivisionTree
              nodes={tree}
              selected={new Set(settings.divisionIds)}
              onChange={(next) => setSettings((p) => ({ ...p, divisionIds: [...next] }))}
            />
          </div>
          <div className={layout.field}>
            <label>Группировать по</label>
            <div className={s.radios}>
              {([
                ['staffGroup', 'Группа позиций'],
                ['jobGroup', 'Группа должностей'],
                ['none', 'Не группировать'],
              ] as const).map(([id, label]) => (
                <label key={id} className={s.radio}>
                  <input type="radio" name="groupBy" checked={settings.groupBy === id} onChange={() => setSettings((p) => ({ ...p, groupBy: id }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className={layout.field}>
            <label>Тип позиции</label>
            <div className={s.radios}>
              {([
                ['all', 'Все позиции'],
                ['occupied', 'Занятые позиции'],
                ['vacant', 'Вакантные позиции'],
              ] as const).map(([id, label]) => (
                <label key={id} className={s.radio}>
                  <input type="radio" name="posType" checked={settings.positionType === id} onChange={() => setSettings((p) => ({ ...p, positionType: id }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'view' ? (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <p className={s.periodLine}>{report.dateLabel}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.rowName}>{report.rowLabel}</th>
                      {report.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td className={s.empty} colSpan={1 + report.columns.length}>Нет данных</td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={r.name} className={i % 2 ? s.zebra : undefined}>
                          <td className={s.rowName}>{r.name}</td>
                          {r.values.map((v, j) => (
                            <td key={j}>{v || ''}</td>
                          ))}
                          {report.hasOther ? <td>{r.other || ''}</td> : null}
                          <td className={s.total}>{r.total}</td>
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
