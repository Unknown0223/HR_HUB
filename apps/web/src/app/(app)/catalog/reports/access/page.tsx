'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx, type XlsxCell } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from '../relatives/page.module.css';
import yesNo from './page.module.css';

type Tab = 'filter' | 'view';
type Opt = {
  id: string;
  label: string;
  tabNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
};
type TreeNode = { id: string; name: string; children?: TreeNode[] };
type Row = {
  employee: string;
  fullAccess: string;
  userAccess: string;
  subordinate: string;
  kpeFull: string;
};
type Payload = { title: string; generatedAt?: string; rows: Row[] };

const FILE_BASE = 'Отчет-по-доступам-сотрудников';
const COLUMNS = [
  'ФИО Сотрудник',
  'Полный доступ',
  'Пользовательский доступ',
  'Подчиненное подразделение',
  'Полный доступ к КПЭ',
];
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
const YES_FILL = 'FFE3F2FD';
const NO_FILL = 'FFFCCDD2';

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
function ynCell(v: string): XlsxCell {
  if (v === 'Да') return { v, s: { fill: YES_FILL, align: 'center' } };
  if (v === 'Нет') return { v, s: { fill: NO_FILL, align: 'center' } };
  return v;
}
function rowValues(r: Row): XlsxCell[] {
  return [r.employee, ynCell(r.fullAccess), r.userAccess, r.subordinate, ynCell(r.kpeFull)];
}
function rowText(r: Row) {
  return [r.employee, r.fullAccess, r.userAccess, r.subordinate, r.kpeFull];
}
function csvText(report: Payload) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return `\uFEFF${[COLUMNS.map(q).join(';'), ...report.rows.map((r) => rowText(r).map(q).join(';'))].join('\n')}`;
}
function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row(COLUMNS)}
${report.rows.map((r) => row(rowText(r))).join('\n')}
</t>
`;
}
function printHtml(report: Payload) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const yn = (v: string) => {
    if (v === 'Да') return `<td style="background:#e3f2fd;color:#1565c0;text-align:center">${v}</td>`;
    if (v === 'Нет') return `<td style="background:#fccdd2;color:#c62828;text-align:center">${v}</td>`;
    return `<td>${escapeHtml(v)}</td>`;
  };
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'z' : ''}"><td class="name">${escapeHtml(r.employee)}</td>${yn(r.fullAccess)}<td>${escapeHtml(r.userAccess)}</td><td>${escapeHtml(r.subordinate)}</td>${yn(r.kpeFull)}</tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.wrap{overflow:auto;padding:16px}
table{border-collapse:collapse;font-size:12px;width:100%}
th,td{border:1px solid #cfd3da;padding:4px 8px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.z td{background:#f9fafb}
.name{text-align:left}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="wrap"><table><thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="5">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
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
    const expanded = open.has(node.id) || !!q;
    return (
      <>
        <div className={`${extra.treeRow} ${selected.has(node.id) ? yesNo.treeOn : ''}`} style={{ paddingLeft: depth * 14 }}>
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
          <input
            type="checkbox"
            className={yesNo.box}
            checked={selected.has(node.id)}
            onChange={() => toggleOne(node.id)}
          />
          <button type="button" className={selected.has(node.id) ? `${yesNo.treeName} ${yesNo.treeNameOn}` : yesNo.treeName} onClick={() => toggleOne(node.id)}>
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
  const summary = selected.size ? `Выбрано: ${selected.size}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder="Поиск..."
        value={menuOpen ? q : summary}
        onFocus={() => setMenuOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setMenuOpen(true);
        }}
      />
      {menuOpen ? (
        <div className={`${s.pickMenu} ${yesNo.treeMenu}`}>
          <input className={s.pickSearch} placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className={yesNo.treeInner}>
            {visible.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
            {visible.map((n) => (
              <Row key={n.id} node={n} depth={0} />
            ))}
          </div>
        </div>
      ) : null}
      {!menuOpen && selected.size ? (
        <div className={s.chips}>
          <span className={yesNo.chipCount}>Выбрано: {selected.size}</span>
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
  const summary = selected.length ? `Выбрано: ${selected.length}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder="Поиск..."
        value={open ? q : summary}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className={`${s.pickMenu} ${yesNo.listMenu}`}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button type="button" key={o.id} className={on ? `${yesNo.listRow} ${yesNo.listOn}` : yesNo.listRow} onClick={() => toggle(o.id)}>
                <input type="checkbox" className={yesNo.box} readOnly checked={on} tabIndex={-1} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!open && selected.length ? (
        <div className={s.chips}>
          {selected.slice(0, 6).map((id) => {
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
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
    setShowAll(false);
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? options.filter((o) => `${o.tabNumber || ''} ${empName(o)}`.toLowerCase().includes(needle))
      : options;
    return showAll ? list : list.slice(0, 12);
  }, [options, q, showAll]);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  const summary = selected.length ? `Выбрано: ${selected.length}` : '';
  return (
    <div className={s.pickWrap} ref={wrapRef}>
      <input
        className={s.pickInput}
        placeholder="Поиск..."
        value={open ? q : summary}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className={`${s.pickMenu} ${s.pickMenuWide} ${yesNo.empMenu}`}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className={yesNo.empTable}>
            <div className={yesNo.empHead}>
              <span />
              <span>Табельный номер</span>
              <span>ФИО</span>
            </div>
            {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
            {filtered.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button type="button" key={o.id} className={on ? `${yesNo.empRow} ${yesNo.empOn}` : yesNo.empRow} onClick={() => toggle(o.id)}>
                  <input type="checkbox" className={yesNo.box} readOnly checked={on} tabIndex={-1} />
                  <span className={yesNo.empTab}>{o.tabNumber || '—'}</span>
                  <span className={yesNo.empName}>{empName(o)}</span>
                </button>
              );
            })}
          </div>
          {!showAll && options.length > 12 ? (
            <button type="button" className={s.pickAll} onClick={() => setShowAll(true)}>
              Показать все
            </button>
          ) : null}
        </div>
      ) : null}
      {!open && selected.length ? (
        <div className={s.chips}>
          {selected.slice(0, 4).map((id) => {
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

function ynClass(v: string) {
  if (v === 'Да') return yesNo.yes;
  if (v === 'Нет') return yesNo.no;
  return undefined;
}

export default function AccessReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [withoutAccess, setWithoutAccess] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const divisions = await apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]);
      setTree(divisions);
      const lookups = await apiFetch<{ employees?: Opt[]; positions?: Opt[] }>('/api/catalog/lookups').catch(
        () => ({ employees: [] as Opt[], positions: [] as Opt[] }),
      );
      let emps = lookups.employees || [];
      let poss = lookups.positions || [];
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
      setPositions(
        mergeOpts(
          poss.map((p) => ({ id: p.id, label: (p.label || (p as { name?: string }).name || p.id).toUpperCase() })),
          EXTRA_POSITIONS,
        ),
      );
      setEmployees(
        emps
          .map((e) => ({
            ...e,
            tabNumber: e.tabNumber || '',
            label: empName(e),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      );
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (withoutAccess) p.set('withoutAccess', '1');
    return p.toString();
  }, [divisionIds, positionIds, employeeIds, withoutAccess]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/access${queryQs ? `?${queryQs}` : ''}`);
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
      sheetName: 'Доступы',
      columns: COLUMNS,
      rows: payload.rows.map(rowValues),
      colWidths: [36, 16, 22, 28, 20],
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
      <h1 className={layout.h1}>Отчет по доступам сотрудников</h1>
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
          Просмотр
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
        <form className={`${layout.card} ${s.card}`} onSubmit={(e) => void generate(e)}>
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
          <label className={s.check}>
            <input type="checkbox" checked={withoutAccess} onChange={(e) => setWithoutAccess(e.target.checked)} />
            Показать сотрудников, у которых нет доступа к подразделениям
          </label>
          <div className={layout.actions}>
            <button type="submit" className={layout.primary} disabled={busy}>{busy ? 'Формирование…' : 'Генерировать'}</button>
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
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 ? (
                    <tr>
                      <td className={s.empty} colSpan={5}>Нет данных</td>
                    </tr>
                  ) : (
                    report.rows.map((r, i) => (
                      <tr key={`${i}-${r.employee}-${r.subordinate}`} className={i % 2 ? s.zebra : undefined}>
                        <td className={s.rowName}>{r.employee}</td>
                        <td className={ynClass(r.fullAccess)}>{r.fullAccess}</td>
                        <td>{r.userAccess}</td>
                        <td>{r.subordinate}</td>
                        <td className={ynClass(r.kpeFull)}>{r.kpeFull}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
