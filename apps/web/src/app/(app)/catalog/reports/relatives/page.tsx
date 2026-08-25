'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import treeS from '../dismissals-by-reason/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type GenderFilter = 'all' | 'male' | 'female';
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
  n: number;
  employee: string;
  relativesCount: number | '';
  relation: string;
  relativeName: string;
  gender: string;
  age: number | null;
  birthDate: string;
  workplace: string;
  dependent: string;
};
type Payload = {
  title: string;
  date: string;
  dateLabel: string;
  gender?: string;
  generatedAt?: string;
  totalRelatives: number;
  rows: Row[];
};

const FILE_BASE = 'Сотрудники-и-их-родственники';
const COLUMNS = [
  '#',
  'Имя',
  'Количество родственников',
  'Название степени родства',
  'Имя родственника',
  'Пол',
  'Возраст',
  'Дата рождения',
  'Рабочее место',
  'Зависимость',
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
function rowValues(r: Row) {
  return [
    String(r.n),
    r.employee,
    r.relativesCount === '' ? '' : String(r.relativesCount),
    r.relation,
    r.relativeName,
    r.gender,
    r.age == null ? '' : String(r.age),
    r.birthDate,
    r.workplace,
    r.dependent,
  ];
}
function metaLines(report: Payload) {
  const lines = [`Дата: ${report.dateLabel}`];
  if (report.gender) lines.push(`Пол: ${report.gender}`);
  return lines;
}
function csvText(report: Payload) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const total = ['', 'Итого', String(report.totalRelatives), '', '', '', '', '', '', ''];
  return `\uFEFF${[
    ...metaLines(report).map(q),
    COLUMNS.map(q).join(';'),
    ...report.rows.map((r) => rowValues(r).map(q).join(';')),
    total.map(q).join(';'),
  ].join('\n')}`;
}
function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${metaLines(report).map((l) => row([l])).join('\n')}
${row(COLUMNS)}
${report.rows.map((r) => row(rowValues(r))).join('\n')}
${row(['', 'Итого', String(report.totalRelatives)])}
</t>
`;
}
function printHtml(report: Payload) {
  const gen = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '';
  const body = report.rows
    .map(
      (r, i) =>
        `<tr class="${i % 2 ? 'z' : ''}"><td>${r.n}</td><td class="name">${escapeHtml(r.employee)}</td><td>${r.relativesCount === '' ? '' : r.relativesCount}</td><td>${escapeHtml(r.relation)}</td><td class="name">${escapeHtml(r.relativeName)}</td><td>${escapeHtml(r.gender)}</td><td>${r.age ?? ''}</td><td>${escapeHtml(r.birthDate)}</td><td>${escapeHtml(r.workplace)}</td><td>${escapeHtml(r.dependent)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#181c32}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e4e6ef}
.brand{color:#3699ff;font-weight:700;margin-right:10px}
h1{margin:0;font-size:15px;display:inline}
.btn{border:1px solid #e4e6ef;background:#fff;color:#5e6278;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;text-transform:uppercase;cursor:pointer}
.meta{padding:10px 16px;font-size:13px}
.wrap{overflow:auto;padding:0 16px 16px}
table{border-collapse:collapse;font-size:12px;width:100%}
th,td{border:1px solid #cfd3da;padding:4px 8px;white-space:nowrap;text-align:center}
th{background:#eef0f4}
.z td{background:#f9fafb}
.name{text-align:left}
.tot td{font-weight:700;background:#f5f8fa}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">${metaLines(report).map(escapeHtml).join(' &nbsp; ')}</div>
<div class="wrap"><table><thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${body}<tr class="tot"><td></td><td class="name">Итого</td><td>${report.totalRelatives}</td><td colspan="7"></td></tr></tbody></table></div>
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
      <input className={extra.treeSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={`${extra.treeBox} ${s.treeTall}`}>
        {visible.map((n) => (
          <Row key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
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
  const wrapRef = useOutsideClose(open, () => {
    setOpen(false);
    setQ('');
    setShowAll(false);
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
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
        <div className={`${s.pickMenu} ${s.pickMenuWide}`}>
          <input className={s.pickSearch} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className={s.empHead}>
            <span />
            <span>Табельный номер</span>
            <span>Сотрудник</span>
          </div>
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button
              type="button"
              key={o.id}
              className={selected.includes(o.id) ? `${s.empRow} ${s.empOn}` : s.empRow}
              onClick={() => toggle(o.id)}
            >
              <input type="checkbox" readOnly checked={selected.includes(o.id)} />
              <span>{o.tabNumber || ''}</span>
              <span>{empName(o)}</span>
            </button>
          ))}
          {!showAll && options.length > 12 ? (
            <button type="button" className={s.pickAll} onClick={() => setShowAll(true)}>
              Показать все
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function RelativesReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [relationIds, setRelationIds] = useState<string[]>([]);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [ageFrom, setAgeFrom] = useState('');
  const [ageTo, setAgeTo] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [positions, setPositions] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [relations, setRelations] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, divisions, dicts] = await Promise.all([
          apiFetch<{ employees?: Opt[]; positions?: Opt[] }>('/api/catalog/lookups'),
          apiFetch<TreeNode[]>('/api/organization/divisions/tree').catch(() => [] as TreeNode[]),
          apiFetch<Array<{ code: string; items?: Array<{ id: string; name: string; code?: string }> }>>(
            '/api/settings/dictionaries?kind=core',
          ).catch(() => []),
        ]);
        setTree(divisions);
        setPositions(mergeOpts(lookups.positions || [], EXTRA_POSITIONS));
        setEmployees(
          (lookups.employees || [])
            .map((e) => ({ ...e, label: empName(e) }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
        );
        const kin = (dicts || []).find((d) => d.code === 'kinship');
        setRelations(
          (kin?.items || []).map((i) => ({ id: i.code || i.id, label: i.name })),
        );
      } catch {
        /* optional */
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (divisionIds.length) p.set('divisionIds', divisionIds.join(','));
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (employeeIds.length) p.set('employeeIds', employeeIds.join(','));
    if (relationIds.length) p.set('relations', relationIds.join(','));
    if (gender !== 'all') p.set('gender', gender);
    if (ageFrom.trim()) p.set('ageFrom', ageFrom.trim());
    if (ageTo.trim()) p.set('ageTo', ageTo.trim());
    if (showHidden) p.set('showHidden', '1');
    return p.toString();
  }, [divisionIds, positionIds, employeeIds, relationIds, gender, ageFrom, ageTo, showHidden]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/relatives${queryQs ? `?${queryQs}` : ''}`);
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
      sheetName: 'Сотрудники',
      preamble: metaLines(payload),
      columns: COLUMNS,
      rows: [
        ...payload.rows.map(rowValues),
        ['', 'Итого', payload.totalRelatives, '', '', '', '', '', '', ''],
      ],
      colWidths: [6, 32, 22, 24, 28, 12, 10, 14, 20, 14],
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
      <h1 className={layout.h1}>Сотрудники и их родственники</h1>
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
            <label>Подразделения</label>
            <DivisionTree nodes={tree} selected={new Set(divisionIds)} onChange={(next) => setDivisionIds([...next])} />
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
            <label>Степени родства</label>
            <FilterPick options={relations} selected={relationIds} onChange={setRelationIds} />
          </div>
          <div className={layout.field}>
            <label>Пол</label>
            <div className={s.radios}>
              <label className={s.radio}>
                <input type="radio" name="gender" checked={gender === 'male'} onChange={() => setGender('male')} />
                Мужской
              </label>
              <label className={s.radio}>
                <input type="radio" name="gender" checked={gender === 'female'} onChange={() => setGender('female')} />
                Женский
              </label>
              <label className={s.radio}>
                <input type="radio" name="gender" checked={gender === 'all'} onChange={() => setGender('all')} />
                Все
              </label>
            </div>
          </div>
          <div className={s.yearRow}>
            <div className={layout.field}>
              <label>Минимальный возраст</label>
              <input className={s.numInput} inputMode="numeric" value={ageFrom} onChange={(e) => setAgeFrom(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
            <div className={layout.field}>
              <label>Максимальный возраст</label>
              <input className={s.numInput} inputMode="numeric" value={ageTo} onChange={(e) => setAgeTo(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Показать скрытые
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
            <>
              <p className={s.periodLine}>{metaLines(report).join('   ')}</p>
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
                    {report.rows.map((r, i) => (
                      <tr key={`${r.n}-${r.relativeName}`} className={i % 2 ? s.zebra : undefined}>
                        <td>{r.n}</td>
                        <td className={s.rowName}>{r.employee}</td>
                        <td>{r.relativesCount}</td>
                        <td>{r.relation}</td>
                        <td className={s.rowName}>{r.relativeName}</td>
                        <td>{r.gender}</td>
                        <td>{r.age ?? ''}</td>
                        <td>{r.birthDate}</td>
                        <td>{r.workplace}</td>
                        <td>{r.dependent}</td>
                      </tr>
                    ))}
                    <tr className={s.total}>
                      <td />
                      <td className={s.rowName}>Итого</td>
                      <td>{report.totalRelatives}</td>
                      <td colSpan={7} />
                    </tr>
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
