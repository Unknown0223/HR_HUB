'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadStyledXlsx } from '@/lib/xlsx-download';
import layout from '../staffing/page.module.css';
import extra from '../movement-divisions/page.module.css';
import s from './page.module.css';

type Tab = 'filter' | 'view';
type Opt = { id: string; label: string };
type Row = {
  n: number;
  introducedAt: string;
  fullName: string;
  category: string;
  education: string;
  employmentSource: string;
  birthDate: string;
  gender: string;
  languages: string;
  position: string;
  phone: string;
};
type Payload = {
  title: string;
  from: string;
  to: string;
  generatedAt?: string;
  rows: Row[];
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
const FILE_BASE = 'Отчет-по-кандидатам';
const COLUMNS = [
  '#',
  'Дата введения',
  'Ф.И.О.',
  'Категория',
  'Образование',
  'Источник занятости',
  'Дата рождения',
  'Пол',
  'Знание языков',
  'Должности',
  'Номер телефона',
];
const PERSON_TYPES: Opt[] = [
  { id: 'A', label: 'A' },
  { id: 'B', label: 'B' },
  { id: 'C', label: 'C' },
];
const EXTRA_POSITIONS: Opt[] = [
  { id: 'TP', label: 'TP' },
  { id: 'MERCHANDISER', label: 'MERCHANDISER' },
  { id: 'SVR', label: 'SVR' },
];

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

function lastWeekRange() {
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7;
  const thisMonday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const prevMonday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  const prevSunday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1);
  return { from: isoDay(prevMonday), to: isoDay(prevSunday) };
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
  const yest = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const last7 = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const last30 = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const month0 = monthStart(now);
  const prevMonth0 = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonth1 = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const week = lastWeekRange();
  const left = view;
  const right = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  function cal(month: Date) {
    return (
      <div className={extra.cal}>
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
      <button type="button" className={s.periodBtn} onClick={() => setOpen((v) => !v)}>
        <i className="fa fa-calendar" aria-hidden />
        <span>{fmtLongRange(from, to)}</span>
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
            <button type="button" className={extra.preset} onClick={() => applyPreset(week.from, week.to)}>
              Прошлая неделя
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
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
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
          <input
            className={s.pickSearch}
            placeholder="Поиск..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {filtered.length === 0 ? <div className={s.pickEmpty}>Нет данных</div> : null}
          {filtered.map((o) => (
            <button
              type="button"
              key={o.id}
              className={selected.includes(o.id) ? `${s.pickOpt} ${s.pickOptOn}` : s.pickOpt}
              onClick={() => toggle(o.id)}
            >
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

function rowValues(r: Row) {
  return [
    String(r.n),
    fmtRu(r.introducedAt),
    r.fullName,
    r.category,
    r.education,
    r.employmentSource,
    fmtRu(r.birthDate),
    r.gender,
    r.languages,
    r.position,
    r.phone,
  ];
}

function csvText(report: Payload) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    `${q(`Период с ${fmtRu(report.from)} по ${fmtRu(report.to)}`)};${';'.repeat(10)}`,
    COLUMNS.map(q).join(';'),
    ...report.rows.map((r) => rowValues(r).map(q).join(';')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

function xmlText(report: Payload) {
  const cell = (v: string) => `<c>${escapeHtml(v)}</c>`;
  const row = (vals: string[]) => `<r>${vals.map(cell).join('')}</r>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<t>
${row([`Период с ${fmtRu(report.from)} по ${fmtRu(report.to)}`, ...Array(10).fill('')])}
${row(COLUMNS)}
${report.rows.map((r) => row(rowValues(r))).join('\n')}
</t>
`;
}

function printHtml(report: Payload) {
  const gen = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString('ru-RU')
    : '';
  const body = report.rows
    .map(
      (r) =>
        `<tr>${rowValues(r)
          .map((v, i) => `<td class="${i === 2 ? 'name' : ''}">${escapeHtml(v)}</td>`)
          .join('')}</tr>`,
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
table{border-collapse:collapse;font-size:12px}
th,td{border:1px solid #cfd3da;padding:3px 6px;white-space:nowrap}
th{background:#f5f8fa}
.name{text-align:left}
@media print{.btn{display:none}}
</style></head>
<body>
<div class="top"><div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
<div><button class="btn" id="btnPrint">Печать</button> <button class="btn" id="btnExcel">Excel</button></div></div>
<div class="meta">Период с ${escapeHtml(fmtRu(report.from))} по ${escapeHtml(fmtRu(report.to))}</div>
<div class="wrap"><table><thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="11">Нет данных</td></tr>`}</tbody></table></div>
</body></html>`;
}

export default function CandidatesReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDay(new Date()));
  const [positionIds, setPositionIds] = useState<string[]>([]);
  const [personType, setPersonType] = useState('');
  const [employmentSource, setEmploymentSource] = useState('');
  const [gender, setGender] = useState('all');
  const [positions, setPositions] = useState<Opt[]>([]);
  const [sources, setSources] = useState<Opt[]>([]);
  const [report, setReport] = useState<Payload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<{
          positions?: Opt[];
          employmentSources?: Opt[];
        }>('/api/catalog/lookups');
        const catalog = data.positions || [];
        const merged = [...EXTRA_POSITIONS];
        for (const p of catalog) {
          if (!merged.some((x) => x.id === p.id || x.label === p.label)) merged.push(p);
        }
        setPositions(merged);
        setSources(data.employmentSources || []);
      } catch {
        setPositions(EXTRA_POSITIONS);
      }
    })();
  }, []);

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (positionIds.length) p.set('positionIds', positionIds.join(','));
    if (personType) p.set('personType', personType);
    if (employmentSource) {
      const label = sources.find((x) => x.id === employmentSource)?.label || employmentSource;
      p.set('employmentSource', label);
    }
    if (gender && gender !== 'all') p.set('gender', gender);
    return p.toString();
  }, [from, to, positionIds, personType, employmentSource, gender, sources]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<Payload>(`/api/catalog/analytics/candidates?${queryQs}`);
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
      sheetName: 'Кандидат',
      preamble: [`Период с ${fmtRu(payload.from)} по ${fmtRu(payload.to)}`],
      columns: COLUMNS,
      rows: payload.rows.map(rowValues),
      colWidths: [6, 14, 42, 14, 16, 20, 14, 12, 16, 16, 18],
    });
  }

  function exportCsv(data: Payload) {
    downloadBlob(`${FILE_BASE}(${fileStamp(data.generatedAt)}).csv`, new Blob([csvText(data)], { type: 'text/csv;charset=utf-8' }));
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
        onClick={() => void ensureReport().then((d) => d && exportCsv(d))}
      >
        CSV
      </button>
      <button
        type="button"
        className={ghost ? layout.exportBtnGhost : undefined}
        disabled={busy}
        onClick={() => void ensureReport().then((d) => d && exportXml(d))}
      >
        XML
      </button>
    </div>
  );

  return (
    <div className={layout.page}>
      <h1 className={layout.h1}>Отчет по кандидатам</h1>
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
            <label>Дата создания</label>
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
            <label>Должности</label>
            <FilterPick options={positions} selected={positionIds} onChange={setPositionIds} />
          </div>
          <div className={layout.field}>
            <label>Тип физического лица</label>
            <SearchLookup
              value={personType}
              options={PERSON_TYPES}
              placeholder="Поиск..."
              onChange={setPersonType}
              allowClear
            />
          </div>
          <div className={layout.field}>
            <label>Источник занятости</label>
            <SearchLookup
              value={employmentSource}
              options={sources}
              placeholder="Поиск..."
              onChange={setEmploymentSource}
              allowClear
            />
          </div>
          <div className={layout.field}>
            <label>Пол</label>
            <div className={s.radios}>
              {(
                [
                  ['all', 'Все'],
                  ['male', 'Мужской'],
                  ['female', 'Женский'],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className={s.radio}>
                  <input type="radio" name="gender" checked={gender === id} onChange={() => setGender(id)} />
                  {label}
                </label>
              ))}
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
              <p className={s.periodLine}>
                Период с {fmtRu(report.from)} по {fmtRu(report.to)}
              </p>
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
                        <td className={s.empty} colSpan={COLUMNS.length}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={`${r.n}-${r.position}-${i}`}>
                          <td className={s.num}>{r.n}</td>
                          <td>{fmtRu(r.introducedAt)}</td>
                          <td className={s.name}>{r.fullName}</td>
                          <td>{r.category}</td>
                          <td>{r.education}</td>
                          <td>{r.employmentSource}</td>
                          <td>{fmtRu(r.birthDate)}</td>
                          <td>{r.gender}</td>
                          <td>{r.languages}</td>
                          <td>{r.position}</td>
                          <td>{r.phone}</td>
                        </tr>
                      ))
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
