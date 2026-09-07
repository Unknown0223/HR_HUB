'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import shared from '../../../../page-shared.module.css';
import arena from '../report-arena.module.css';
import styles from './page.module.css';

type LookupOpt = { id: string; label: string };
type ReportType = 'age' | 'experience' | 'grade' | 'education';
type Band = { min: number | null; max: number | null };
type Tab = 'filter' | 'view';

type GenderRow = {
  label: string;
  male: number;
  female: number;
  other?: number;
  total: number;
};

type GenderPayload = {
  title: string;
  date: string;
  generatedAt?: string;
  reportType: ReportType;
  bucketLabel: string;
  rows: GenderRow[];
  totals: { male: number; female: number; other?: number; total: number };
};

const DEFAULT_AGE: Band[] = [
  { min: null, max: 18 },
  { min: 18, max: 25 },
  { min: 25, max: 35 },
  { min: 35, max: 55 },
  { min: 55, max: null },
];

const DEFAULT_EXP: Band[] = [
  { min: null, max: 1 },
  { min: 1, max: 2 },
  { min: 2, max: 3 },
  { min: 3, max: 5 },
  { min: 5, max: null },
];

const TYPES: { id: ReportType; label: string }[] = [
  { id: 'age', label: 'По возрасту' },
  { id: 'experience', label: 'По опыту' },
  { id: 'grade', label: 'По разряду' },
  { id: 'education', label: 'По виду образования' },
];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRu(iso?: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function fmtGen(iso?: string) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('ru-RU');
}

function bandLabel(b: Band) {
  if (b.min == null && b.max != null) return `до ${b.max} лет`;
  if (b.min != null && b.max == null) return `от ${b.min} лет`;
  if (b.min != null && b.max != null) return `от ${b.min} до ${b.max} лет`;
  return '—';
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(s: string) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvRows(report: GenderPayload): Record<string, unknown>[] {
  return [
    ...report.rows.map((r) => ({
      [report.bucketLabel]: r.label,
      Мужчины: r.male,
      Женщины: r.female,
      Итого: r.total,
    })),
    {
      [report.bucketLabel]: 'Итого',
      Мужчины: report.totals.male,
      Женщины: report.totals.female,
      Итого: report.totals.total,
    },
  ];
}

function xmlText(report: GenderPayload) {
  const rows = csvRows(report)
    .map(
      (r) => `  <row>
    <bucket>${escapeXml(String(r[report.bucketLabel] ?? ''))}</bucket>
    <male>${escapeXml(String(r['Мужчины'] ?? ''))}</male>
    <female>${escapeXml(String(r['Женщины'] ?? ''))}</female>
    <total>${escapeXml(String(r['Итого'] ?? ''))}</total>
  </row>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<genderReport date="${escapeXml(report.date)}" type="${escapeXml(report.reportType)}" title="${escapeXml(report.title)}">
${rows}
</genderReport>
`;
}

function tableInnerHtml(report: GenderPayload) {
  const body = report.rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.label)}</td><td class="num">${fmtNum(r.male)}</td><td class="num">${fmtNum(r.female)}</td><td class="num">${fmtNum(r.total)}</td></tr>`,
    )
    .join('');
  const tot = `<tr class="total"><td>Итого</td><td class="num">${fmtNum(report.totals.male)}</td><td class="num">${fmtNum(report.totals.female)}</td><td class="num">${fmtNum(report.totals.total)}</td></tr>`;
  return `<table>
<thead><tr><th>${escapeHtml(report.bucketLabel)}</th><th>Мужчины</th><th>Женщины</th><th>Итого</th></tr></thead>
<tbody>${body || `<tr><td colspan="4">Нет данных</td></tr>`}${body ? tot : ''}</tbody>
</table>`;
}

function printDocumentHtml(report: GenderPayload) {
  const gen = fmtGen(report.generatedAt);
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  body { margin: 0; font-family: Segoe UI, Arial, sans-serif; color: #181c32; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 10px 16px; border-bottom: 1px solid #e4e6ef; }
  .brand { font-weight: 800; letter-spacing: .04em; color: #009ef7; margin-right: 10px; }
  h1 { margin: 0; font-size: 15px; font-weight: 700; display: inline; }
  .actions { display: flex; gap: 8px; position: relative; }
  .btn { appearance: none; border: 1px solid #e4e6ef; background: #fff; color: #5e6278; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; cursor: pointer; }
  .menu { display: none; position: absolute; right: 0; top: 100%; background: #fff; border: 1px solid #e4e6ef; border-radius: 4px; min-width: 90px; z-index: 2; }
  .menu button { display: block; width: 100%; border: 0; background: #fff; text-align: left; padding: 8px 12px; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
  .date { padding: 10px 16px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #cfd3da; padding: 6px 8px; }
  th { background: #f5f8fa; }
  td.num { text-align: right; }
  tr.total td { background: #eef0f4; font-weight: 600; }
  @media print { .actions { display: none !important; } }
</style></head>
<body>
  <div class="top">
    <div><span class="brand">HR Hub</span><h1>${escapeHtml(report.title)}${gen ? ` (${escapeHtml(gen)})` : ''}</h1></div>
    <div class="actions">
      <button class="btn" id="btnPrint">Печать</button>
      <div>
        <button class="btn" id="btnExcel">Excel</button>
        <div class="menu" id="excelMenu">
          <button type="button" id="btnCsv">CSV</button>
          <button type="button" id="btnXml">XML</button>
        </div>
      </div>
    </div>
  </div>
  <div class="date">Дата: ${escapeHtml(fmtRu(report.date))}</div>
  ${tableInnerHtml(report)}
</body></html>`;
}

export default function GenderReportPage() {
  const [tab, setTab] = useState<Tab>('filter');
  const [date, setDate] = useState(todayIso);
  const [divisionId, setDivisionId] = useState('');
  const [reportType, setReportType] = useState<ReportType>('age');
  const [bands, setBands] = useState<Band[]>(DEFAULT_AGE);
  const [draftMin, setDraftMin] = useState('');
  const [draftMax, setDraftMax] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [educationType, setEducationType] = useState('');
  const [divisions, setDivisions] = useState<LookupOpt[]>([]);
  const [grades, setGrades] = useState<LookupOpt[]>([]);
  const [eduTypes, setEduTypes] = useState<LookupOpt[]>([]);
  const [report, setReport] = useState<GenderPayload | null>(null);
  const [loadedQs, setLoadedQs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [lookups, dicts] = await Promise.all([
          apiFetch<{ divisions?: LookupOpt[]; grades?: LookupOpt[] }>('/api/catalog/lookups'),
          apiFetch<Array<{ code: string; items?: Array<{ id: string; name: string }> }>>(
            '/api/settings/dictionaries?kind=core',
          ),
        ]);
        setDivisions(lookups.divisions || []);
        setGrades(lookups.grades || []);
        const edu = (dicts || []).find((d) => d.code === 'edu');
        setEduTypes((edu?.items || []).map((i) => ({ id: i.name, label: i.name })));
      } catch {
        /* ignore bootstrap */
      }
    })();
  }, []);

  function changeType(next: ReportType) {
    setReportType(next);
    if (next === 'age') setBands(DEFAULT_AGE);
    if (next === 'experience') setBands(DEFAULT_EXP);
    setDraftMin('');
    setDraftMax('');
  }

  function addBand() {
    const min = draftMin.trim() === '' ? null : Number(draftMin);
    const max = draftMax.trim() === '' ? null : Number(draftMax);
    if (min == null && max == null) return;
    if ((min != null && Number.isNaN(min)) || (max != null && Number.isNaN(max))) return;
    setBands((prev) => [...prev, { min, max }]);
    setDraftMin('');
    setDraftMax('');
  }

  const queryQs = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    if (divisionId) p.set('divisionId', divisionId);
    p.set('reportType', reportType);
    if (reportType === 'age' || reportType === 'experience') {
      p.set('ranges', JSON.stringify(bands));
    }
    if (reportType === 'grade' && gradeId) p.set('gradeId', gradeId);
    if (reportType === 'education' && educationType) p.set('educationType', educationType);
    return p.toString();
  }, [date, divisionId, reportType, bands, gradeId, educationType]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<GenderPayload>(
        `/api/catalog/analytics/gender${queryQs ? `?${queryQs}` : ''}`,
      );
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

  async function exportExcel() {
    const data = await ensureReport();
    if (!data) return;
    try {
      await downloadXlsxViaApi(
        `/api/catalog/analytics/gender/export.xlsx${queryQs ? `?${queryQs}` : ''}`,
        'Отчет-по-гендерному-разделению.xlsx',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    }
  }

  function exportCsvFrom(data: GenderPayload) {
    downloadCsv('Отчет-по-гендерному-разделению', csvRows(data));
  }

  function exportXmlFrom(data: GenderPayload) {
    downloadBlob(
      'Отчет-по-гендерному-разделению.xml',
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
        'Отчет-по-гендерному-разделению.html',
        new Blob([printDocumentHtml(data)], { type: 'text/html;charset=utf-8' }),
      );
      return;
    }
    w.document.open();
    w.document.write(printDocumentHtml(data));
    w.document.close();
    w.document.getElementById('btnPrint')?.addEventListener('click', () => w.print());
    const menu = w.document.getElementById('excelMenu');
    w.document.getElementById('btnExcel')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      void exportExcel();
    });
    w.document.getElementById('btnCsv')?.addEventListener('click', () => exportCsvFrom(data));
    w.document.getElementById('btnXml')?.addEventListener('click', () => exportXmlFrom(data));
  }

  const exportDisabled = busy;

  return (
    <div className={arena.page}>
      <div className={arena.toolbar}>
        <div className={arena.tabsTrack}>
          <button
            type="button"
            className={tab === 'filter' ? arena.tabOn : arena.tab}
            onClick={() => setTab('filter')}
          >
            Фильтр
          </button>
          <button
            type="button"
            className={tab === 'view' ? arena.tabOn : arena.tab}
            onClick={() => {
              setTab('view');
              if (!report || loadedQs !== queryQs) void load();
            }}
          >
            Просмотр
          </button>
        </div>
        {tab === 'view' ? (
          <>
            <button
              type="button"
              className={arena.iconBtn}
              disabled={busy}
              aria-label="Обновить"
              onClick={() => void load()}
            >
              <i className="fas fa-sync-alt" aria-hidden />
            </button>
            <div className={arena.exportBtns}>
                                    <button type="button" className={arena.exportBtn} disabled={exportDisabled} onClick={() => void openHtml()}>
                                      HTML
                                    </button>
                                    <button type="button" className={arena.exportBtn} disabled={exportDisabled} onClick={() => void exportExcel()}>
                                      Excel
                                    </button>
                                    <button
                                      type="button"
                                      className={arena.exportBtn}
                                      disabled={exportDisabled}
                                      onClick={() => void ensureReport().then((d) => d && exportCsvFrom(d))}
                                    >
                                      CSV
                                    </button>
                                    <button
                                      type="button"
                                      className={arena.exportBtn}
                                      disabled={exportDisabled}
                                      onClick={() => void ensureReport().then((d) => d && exportXmlFrom(d))}
                                    >
                                      XML
                                    </button>
                                  </div>
          </>
        ) : null}
      </div>

      <div className={shared.pageHeader}>
        <span className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`} aria-hidden>
          <i className="fas fa-venus-mars" />
        </span>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Отчет по гендерному разделению сотрудников</h1>
          <p className={shared.pageSubtitle}>
            Распределение сотрудников по полу в разрезе возраста, опыта, разряда или образования
          </p>
        </div>
      </div>
      {error ? <p className={arena.error}>{error}</p> : null}

      {tab === 'filter' ? (
        <form className={arena.settingsCard} onSubmit={(e) => void generate(e)}>
          <div className={arena.field}>
            <label htmlFor="gender-date">Дата</label>
            <input
              id="gender-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className={arena.field}>
            <label>Подразделение</label>
            <div className={styles.lookup}>
              <SearchLookup
                value={divisionId}
                options={divisions}
                placeholder="Поиск..."
                allowClear
                onChange={setDivisionId}
              />
            </div>
          </div>
          <div className={`${arena.field} ${styles.fieldWide}`}>
            <label>Тип отчета</label>
            <div className={styles.radios}>
              {TYPES.map((t) => (
                <label key={t.id} className={styles.radio}>
                  <input
                    type="radio"
                    name="gender-report-type"
                    checked={reportType === t.id}
                    onChange={() => changeType(t.id)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {reportType === 'age' || reportType === 'experience' ? (
            <div className={`${arena.field} ${styles.fieldWide}`}>
              <label>Диапазоны</label>
              <div className={styles.rangeAdd}>
                <input
                  inputMode="numeric"
                  value={draftMin}
                  placeholder=""
                  onChange={(e) => setDraftMin(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addBand();
                    }
                  }}
                />
                <input
                  inputMode="numeric"
                  value={draftMax}
                  placeholder=""
                  onChange={(e) => setDraftMax(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addBand();
                    }
                  }}
                />
                <button type="button" className={styles.plus} onClick={addBand} aria-label="Добавить">
                  +
                </button>
              </div>
              <div className={styles.rangeList}>
                {bands.map((b, i) => (
                  <div key={`${b.min}-${b.max}-${i}`} className={styles.rangeRow}>
                    <span>{bandLabel(b)}</span>
                    <button
                      type="button"
                      className={styles.trash}
                      aria-label="Удалить"
                      onClick={() => setBands((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <i className="fas fa-trash-alt" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {reportType === 'grade' ? (
            <div className={arena.field}>
              <label>Разряды</label>
              <div className={styles.lookup}>
                <SearchLookup
                  value={gradeId}
                  options={grades}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setGradeId}
                />
              </div>
            </div>
          ) : null}

          {reportType === 'education' ? (
            <div className={arena.field}>
              <label>Виды образования</label>
              <div className={styles.lookup}>
                <SearchLookup
                  value={educationType}
                  options={eduTypes}
                  placeholder="Поиск..."
                  allowClear
                  onChange={setEducationType}
                />
              </div>
            </div>
          ) : null}

          <div className={arena.actions}>
            <button type="submit" className={arena.primary} disabled={busy}>
              {busy ? 'Формирование…' : 'Составить отчет'}
            </button>
            <button type="button" className={arena.exportBtn} disabled={exportDisabled} onClick={() => void openHtml()}>
              HTML
            </button>
            <button type="button" className={arena.exportBtn} disabled={exportDisabled} onClick={() => void exportExcel()}>
              Excel
            </button>
            <button
              type="button"
              className={arena.exportBtn}
              disabled={exportDisabled}
              onClick={() => void ensureReport().then((d) => d && exportCsvFrom(d))}
            >
              CSV
            </button>
            <button
              type="button"
              className={arena.exportBtn}
              disabled={exportDisabled}
              onClick={() => void ensureReport().then((d) => d && exportXmlFrom(d))}
            >
              XML
            </button>
          </div>
        </form>
      ) : (
        <div className={arena.viewCard}>
          {busy && !report ? (
            <p className={arena.muted}>Загрузка…</p>
          ) : !report ? (
            <div className={arena.emptyState}>
              <i className="fas fa-file-alt" aria-hidden />
              <strong>Отчёт ещё не сформирован</strong>
              <span>Откройте вкладку «Фильтр» и нажмите «Составить отчет»</span>
            </div>
          ) : (
            <>
              <div className={arena.viewMeta}>
                <span className={arena.metaPill}>
                  <i className="fas fa-calendar-day" aria-hidden />
                  Дата: {fmtRu(report.date)}
                </span>
                <span className={arena.metaPill}>
                  <i className="fas fa-layer-group" aria-hidden />
                  {TYPES.find((t) => t.id === report.reportType)?.label || report.bucketLabel}
                </span>
                <span className={arena.metaPill}>
                  <i className="fas fa-users" aria-hidden />
                  Строк: {report.rows.length}
                </span>
                {report.generatedAt ? (
                  <span className={arena.metaMuted}>Сформирован: {fmtGen(report.generatedAt)}</span>
                ) : null}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{report.bucketLabel}</th>
                      <th>Мужчины</th>
                      <th>Женщины</th>
                      <th>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Нет данных</td>
                      </tr>
                    ) : (
                      <>
                        {report.rows.map((r) => (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td className={styles.num}>{fmtNum(r.male)}</td>
                            <td className={styles.num}>{fmtNum(r.female)}</td>
                            <td className={styles.num}>{fmtNum(r.total)}</td>
                          </tr>
                        ))}
                        <tr className={styles.totalRow}>
                          <td>Итого</td>
                          <td className={styles.num}>{fmtNum(report.totals.male)}</td>
                          <td className={styles.num}>{fmtNum(report.totals.female)}</td>
                          <td className={styles.num}>{fmtNum(report.totals.total)}</td>
                        </tr>
                      </>
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
