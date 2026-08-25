'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type KeyFilter = 'all' | 'key' | 'not-key';
type BasisFilter = 'all' | 'positive' | 'negative';
type ReasonRow = {
  reasonId: string | null;
  reason: string;
  group: string;
  count: number;
  pct: number;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  generatedAt?: string;
  total: number;
  rows: ReasonRow[];
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
const FILE_BASE = 'Отчет-по-причинам-увольнения';
const XML_WIDTH = 11;

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function yearStart(d = new Date()) {
  return isoDay(new Date(d.getFullYear(), 0, 1));
}

function fmtLongRange(from: string, to: string) {
  const one = (d: Date) => `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${one(parseIso(from))} - ${one(parseIso(to))}`;
}

function fmtRu(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function fmtPeriodLine(from: string, to: string) {
  return `Период: ${fmtRu(from)} - ${fmtRu(to)}`;
}

function fmtGen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

function fmtPctUi(n: number) {
  const t = (Math.round(n * 10) / 10).toFixed(1);
  return `${t.endsWith('.0') ? t.slice(0, -2) : t}%`;
}

function fmtPctXml(n: number) {
  const t = (Math.round(n * 10) / 10).toFixed(1);
  if (t.endsWith('.0')) return t.slice(0, -2);
  if (t.startsWith('0')) return t.slice(1);
  return t;
}

function escapeHtml(v: string) {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const today = isoDay(new Date());
  const now = new Date();
  const last12 = isoDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const y0 = yearStart(now);
  const prev0 = isoDay(new Date(now.getFullYear() - 1, 0, 1));
  const prev1 = isoDay(new Date(now.getFullYear() - 1, 11, 31));
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(last12, today)}>
              Последние 12 месяцев
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(y0, today)}>
              Текущий год
            </button>
            <button type="button" className={extra.preset} onClick={() => applyPreset(prev0, prev1)}>
              Прошлый год
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
              <button type="button" className={extra.cancel} onClick={() => setOpen(false)}>
                Отменить
              </button>
              <button
                type="button"
                className={extra.apply}
                onClick={() => {
                  onChange(draftFrom, draftTo);
                  setOpen(false);
                }}
              >
                Применить
              </button>
            </div>
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
        if (!qq || n.name.toLowerCase().includes(qq) || kids.length) {
          return { ...n, children: kids };
        }
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

  function selectVisible() {
    const next = new Set(selected);
    for (const n of visible) for (const id of collectIds(n)) next.add(id);
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
            <button type="button" className={s.selectAll} onClick={() => selectBranch(node)}>
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
      <div className={s.treeHead}>
        <button type="button" className={s.selectAll} onClick={selectVisible}>
          выбрать все
        </button>
      </div>
      <input
        className={extra.treeSearch}
        placeholder="Поиск..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={extra.treeBox}>
        {visible.map((n) => (
          <Row key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}

function csvText(report: Payload) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blank = ';'.repeat(XML_WIDTH - 1);
  const lines = [
    blank,
    `${q(fmtPeriodLine(report.from, report.to))}${';'.repeat(XML_WIDTH - 1)}`,
    blank,
    `${q('Причина увольнения')};${q('Группа причин увольнения')};${q('Кол-во')};${q('%')}${';'.repeat(XML_WIDTH - 4)}`,
    ...report.rows.map(
      (r) =>
        `${q(r.reason)};${q(r.group)};${q(r.count)};${q(fmtPctXml(r.pct))}${';'.repeat(XML_WIDTH - 4)}`,
    ),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string, number = false) =>
    number ? `<c type="number">${v}</c>` : `<c>${escapeHtml(v)}</c>`;
  const empty = '<c></c>'.repeat(XML_WIDTH);
  const pad = (n = XML_WIDTH - 4) => '<c></c>'.repeat(n);
  const body = report.rows
    .map(
      (r) =>
        `<r>${cell(r.reason)}${cell(r.group)}${cell(String(r.count))}${cell(fmtPctXml(r.pct), true)}${pad()}</r>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
<r>${empty}</r>
<r>${cell(fmtPeriodLine(report.from, report.to))}${pad(XML_WIDTH - 1)}</r>
<r>${empty}</r>
<r>${cell('Причина увольнения')}${cell('Группа причин увольнения')}${cell('Кол-во')}${cell('%')}${pad()}</r>
${body}
</t>
`;
}

function tableInner(report: Payload) {
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'zebra' : ''}"><td class="reason"><a>${escapeHtml(r.reason)}</a></td><td>${escapeHtml(r.group)}</td><td class="num">${r.count}</td><td class="num">${fmtPctUi(r.pct)}</td></tr>`,
    )
    .join('');
  return `<table>
<thead><tr><th>Причина увольнения</th><th>Группа причин увольнения</th><th>Кол-во</th><th>%</th></tr></thead>
<tbody>${body || `<tr><td colspan="4">Нет данных</td></tr>`}</tbody>
</table>`;
}

function printHtml(report: Payload) {
  const gen = fmtGen(report.generatedAt);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{font-weight:800;color:#009ef7;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{padding:0 16px 16px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #cfd3da;padding:5px 8px}
th{background:#f5f8fa}
.zebra td{background:#f9fafb}
.reason a{color:#3699ff;text-decoration:none}
.num{text-align:right}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${escapeHtml(fmtPeriodLine(report.from, report.to))}</div>
<div class="wrap">${tableInner(report)}</div>
</body></html>`;
}

export default function DismissalsByReasonPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keyEmployee, setKeyEmployee] = useState<KeyFilter>('all');
  const [basisType, setBasisType] = useState<BasisFilter>('all');
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<TreeNode[]>('/api/organization/divisions/tree');
        setTree(Array.isArray(data) ? data : []);
      } catch {
        try {
          const lookups = await apiFetch<{ divisions?: { id: string; label: string }[] }>('/api/catalog/lookups');
          setTree((lookups.divisions || []).map((d) => ({ id: d.id, name: d.label, children: [] })));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (selected.size) p.set('divisionIds', [...selected].join(','));
    if (keyEmployee !== 'all') p.set('keyEmployee', keyEmployee);
    if (basisType !== 'all') p.set('basisType', basisType);
    return p.toString();
  }, [from, to, selected, keyEmployee, basisType]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/dismissals-by-reason?${queryQs}`);
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
      sheetName: payload.title,
      title: payload.title,
      subtitle: fmtPeriodLine(payload.from, payload.to),
      columns: ['Причина увольнения', 'Группа причин увольнения', 'Кол-во', '%'],
      rows: payload.rows.map((r) => [r.reason, r.group, r.count, r.pct]),
      colWidths: [48, 28, 12, 10],
    });
  }

  function exportCsv(data: Payload) {
    downloadBlob(
      `${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`,
      new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }),
    );
  }

  function exportXml(data: Payload) {
    downloadBlob(
      `${FILE_BASE}(${fileStamp(data.generatedAt)}).xml`,
      new Blob([xmlText(data)], { type: 'application/xml;charset=utf-8' }),
    );
  }

  async function openHtml() {
    const w = window.open('', '_blank');
    const data = await ensureReport();
    if (!data) {
      w?.close();
      return;
    }
    if (!w) {
      downloadBlob(
        `${FILE_BASE}(${fileStamp(data.generatedAt)}).html`,
        new Blob([printHtml(data)], { type: 'text/html;charset=utf-8' }),
      );
      return;
    }
    w.document.open();
    w.document.write(printHtml(data));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    w.document.getElementById('btnExcel')?.addEventListener('click', () => void exportExcel(data));
  }

  const exportBtns = (ghost = false) => (
    <div className={ghost ? undefined : extra.exportLinks} style={ghost ? { display: 'flex', gap: 8 } : undefined}>
      <button type="button" className={ghost ? extra.exportGhost : undefined} disabled={busy} onClick={() => void openHtml()}>
        HTML
      </button>
      <button type="button" className={ghost ? extra.exportGhost : undefined} disabled={busy} onClick={() => void exportExcel()}>
        Excel
      </button>
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportCsv(d))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? extra.exportGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportXml(d))}
      >
        XML
      </button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет по причинам увольнения</h1>
      <div className={layout.toolbar}>
        <button type="button" className={tab === 'filter' ? layout.tabOn : layout.tab} onClick={() => setTab('filter')}>
          Фильтр
        </button>
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
        <form className={layout.card} onSubmit={(e) => void generate(e)}>
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
            <label>Подразделения</label>
            <DivisionTree nodes={tree} selected={selected} onChange={setSelected} />
          </div>
          <div className={layout.field}>
            <label>Ценность</label>
            <div className={s.radios}>
              <label className={s.radio}>
                <input type="radio" name="key" checked={keyEmployee === 'all'} onChange={() => setKeyEmployee('all')} />
                Все
              </label>
              <label className={s.radio}>
                <input type="radio" name="key" checked={keyEmployee === 'key'} onChange={() => setKeyEmployee('key')} />
                Ключевой сотрудник
              </label>
              <label className={s.radio}>
                <input
                  type="radio"
                  name="key"
                  checked={keyEmployee === 'not-key'}
                  onChange={() => setKeyEmployee('not-key')}
                />
                Не ключевой сотрудник
              </label>
            </div>
          </div>
          <div className={layout.field}>
            <label>Тип основания</label>
            <div className={s.radios}>
              <label className={s.radio}>
                <input type="radio" name="basis" checked={basisType === 'all'} onChange={() => setBasisType('all')} />
                Все
              </label>
              <label className={s.radio}>
                <input
                  type="radio"
                  name="basis"
                  checked={basisType === 'positive'}
                  onChange={() => setBasisType('positive')}
                />
                Положительное
              </label>
              <label className={s.radio}>
                <input
                  type="radio"
                  name="basis"
                  checked={basisType === 'negative'}
                  onChange={() => setBasisType('negative')}
                />
                Отрицательное
              </label>
            </div>
          </div>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            {exportBtns(false)}
          </div>
        </form>
      ) : (
        <div className={layout.viewArea}>
          {busy && !report ? (
            <p className={layout.muted}>Загрузка…</p>
          ) : !report ? (
            <p className={layout.muted}>Сначала составьте отчёт на вкладке «Фильтр»</p>
          ) : (
            <>
              <p className={extra.periodLine}>{fmtPeriodLine(report.from, report.to)}</p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Причина увольнения</th>
                      <th>Группа причин увольнения</th>
                      <th>Кол-во</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length ? (
                      report.rows.map((r, i) => (
                        <tr key={r.reasonId || r.reason} className={i % 2 ? s.zebra : undefined}>
                          <td className={s.reason}>
                            <span className={s.link}>{r.reason}</span>
                          </td>
                          <td>{r.group}</td>
                          <td className={s.num}>{r.count}</td>
                          <td className={s.num}>{fmtPctUi(r.pct)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className={layout.muted} colSpan={4}>
                          Нет данных
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
