'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';

type Tab = 'params' | 'view';

type ReportRow = {
  account: string;
  subconto: string;
  openingDebit: number | string;
  openingCredit: number | string;
  turnoverDebit: number | string;
  turnoverCredit: number | string;
  closingDebit: number | string;
  closingCredit: number | string;
  qty?: number | string;
};

type ReportPayload = {
  title: string;
  from: string;
  to: string;
  currency?: string | null;
  rows: ReportRow[];
  showQty?: boolean;
  showAmount?: boolean;
  excludeExtra?: boolean;
};

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

function cell(v: number | string | undefined) {
  if (v == null || v === '') return '—';
  return v;
}

export default function TrialBalanceReportPage() {
  const router = useRouter();
  const bounds = useMemo(() => monthBounds(), []);
  const [tab, setTab] = useState<Tab>('params');

  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [showQty, setShowQty] = useState(false);
  const [showAmount, setShowAmount] = useState(true);
  const [excludeExtra, setExcludeExtra] = useState(false);
  const [currency, setCurrency] = useState('');
  const [subconto, setSubconto] = useState('');

  const [currencies, setCurrencies] = useState<string[]>([]);
  const [report, setReport] = useState<ReportPayload | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const dicts = await apiFetch<
          Array<{
            code: string;
            items?: Array<{ code: string; name: string }>;
          }>
        >('/api/settings/dictionaries?kind=extra');
        const cur = (dicts || []).find((d) => d.code === 'currencies');
        setCurrencies((cur?.items || []).map((i) => i.code));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const queryQs = useCallback(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    if (currency) p.set('currency', currency);
    if (subconto) p.set('subconto', subconto);
    p.set('showQty', showQty ? '1' : '0');
    p.set('showAmount', showAmount ? '1' : '0');
    p.set('excludeExtra', excludeExtra ? '1' : '0');
    return p.toString();
  }, [from, to, currency, subconto, showQty, showAmount, excludeExtra]);

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (!from || !to) {
      setError('Укажите даты периода');
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<ReportPayload>(
        `/api/catalog/analytics/trial-balance?${queryQs()}`,
      );
      setReport(data);
      setTab('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка формирования');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    try {
      await downloadXlsxViaApi(
        `/api/catalog/analytics/trial-balance/export.xlsx?${queryQs()}`,
        'trial-balance.xlsx',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    }
  }

  function exportCsv() {
    if (!report?.rows?.length) return;
    downloadCsv(
      'trial-balance',
      report.rows.map((r) => ({
        Счет: r.account,
        Субконто: r.subconto,
        'Сальдо нач. Дт': r.openingDebit,
        'Сальдо нач. Кт': r.openingCredit,
        'Оборот Дт': r.turnoverDebit,
        'Оборот Кт': r.turnoverCredit,
        'Сальдо кон. Дт': r.closingDebit,
        'Сальдо кон. Кт': r.closingCredit,
        ...(showQty ? { 'Кол-во': r.qty ?? '' } : {}),
      })),
    );
  }

  function exportHtml() {
    if (!report) return;
    const head = [
      'Счет',
      'Субконто',
      'Сальдо нач. Дт',
      'Сальдо нач. Кт',
      'Оборот Дт',
      'Оборот Кт',
      'Сальдо кон. Дт',
      'Сальдо кон. Кт',
      ...(showQty ? ['Кол-во'] : []),
    ];
    const body = report.rows
      .map(
        (r) =>
          `<tr><td>${r.account}</td><td>${r.subconto}</td><td>${cell(r.openingDebit)}</td><td>${cell(r.openingCredit)}</td><td>${cell(r.turnoverDebit)}</td><td>${cell(r.turnoverCredit)}</td><td>${cell(r.closingDebit)}</td><td>${cell(r.closingCredit)}</td>${showQty ? `<td>${cell(r.qty)}</td>` : ''}</tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${report.title}</title>
<style>body{font-family:sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#f3f4f6}</style>
</head><body><h1>${report.title}</h1>
<p>${report.from} — ${report.to}</p>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial-balance.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXml() {
    if (!report) return;
    const rows = report.rows
      .map(
        (r) => `  <row>
    <account>${escapeXml(String(r.account))}</account>
    <subconto>${escapeXml(String(r.subconto))}</subconto>
    <openingDebit>${escapeXml(String(cell(r.openingDebit)))}</openingDebit>
    <openingCredit>${escapeXml(String(cell(r.openingCredit)))}</openingCredit>
    <turnoverDebit>${escapeXml(String(cell(r.turnoverDebit)))}</turnoverDebit>
    <turnoverCredit>${escapeXml(String(cell(r.turnoverCredit)))}</turnoverCredit>
    <closingDebit>${escapeXml(String(cell(r.closingDebit)))}</closingDebit>
    <closingCredit>${escapeXml(String(cell(r.closingCredit)))}</closingCredit>
  </row>`,
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<trialBalance from="${report.from}" to="${report.to}">
${rows}
</trialBalance>
`;
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial-balance.xml';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.page}>
      <PageSubnav
        group={{
          title: 'Оборотно-сальдовая ведомость',
          siblings: [
            {
              label: 'Оборотно-сальдовая ведомость по счету',
              href: '/catalog/reports/account-balance',
            },
          ],
        }}
      />

      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === 'params' ? styles.tabOn : styles.tab}
          onClick={() => setTab('params')}
        >
          Параметры
        </button>
        <button
          type="button"
          className={tab === 'view' ? styles.tabOn : styles.tab}
          onClick={() => setTab('view')}
        >
          Просмотреть
        </button>
        {tab === 'view' ? (
          <>
            <button
              type="button"
              className={styles.refreshBtn}
              title="Обновить"
              disabled={busy}
              onClick={() => void generate()}
            >
              ↻
            </button>
            <div className={styles.exportLinks}>
              <button type="button" onClick={exportHtml}>
                HTML
              </button>
              <button type="button" onClick={() => void exportExcel()}>
                EXCEL
              </button>
              <button type="button" onClick={exportCsv}>
                CSV
              </button>
              <button type="button" onClick={exportXml}>
                XML
              </button>
            </div>
          </>
        ) : null}
        <button
          type="button"
          className={styles.tab}
          onClick={() => router.push('/settings?tab=org')}
        >
          Закрыть
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'params' ? (
        <form className={styles.card} onSubmit={(e) => void generate(e)}>
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label>
                Дата начала <span className={styles.req}>*</span>
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label>
                Дата окончания <span className={styles.req}>*</span>
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.checkCol}>
            <div className={styles.checkRow}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showQty}
                  onChange={(e) => setShowQty(e.target.checked)}
                />
                Кол-во
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showAmount}
                  onChange={(e) => setShowAmount(e.target.checked)}
                />
                Сумма
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={excludeExtra}
                onChange={(e) => setExcludeExtra(e.target.checked)}
              />
              Без учета дополнительных данных
            </label>
          </div>

          <div className={styles.field}>
            <label>Валюта</label>
            <input
              list="osv-tb-cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="Поиск..."
            />
            <datalist id="osv-tb-cur">
              {currencies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className={styles.field}>
            <label>Субконто</label>
            <input
              value={subconto}
              onChange={(e) => setSubconto(e.target.value)}
              placeholder="Поиск..."
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={busy}>
              Сформировать
            </button>
            <div className={styles.exportLinks}>
              <button type="button" onClick={exportHtml}>
                HTML
              </button>
              <button type="button" onClick={() => void exportExcel()}>
                EXCEL
              </button>
              <button type="button" onClick={exportCsv}>
                CSV
              </button>
              <button type="button" onClick={exportXml}>
                XML
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {tab === 'view' ? (
        <div className={styles.viewArea}>
          {!report ? (
            <p className={styles.muted}>
              Сформируйте отчёт на вкладке «Параметры»
            </p>
          ) : (
            <>
              <div className={styles.meta}>
                <strong>{report.title}</strong>
                <span>
                  {report.from} — {report.to}
                  {report.excludeExtra
                    ? ' · без доп. данных'
                    : ''}
                </span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Счет</th>
                      <th>Субконто</th>
                      <th>Сальдо нач. Дт</th>
                      <th>Сальдо нач. Кт</th>
                      <th>Оборот Дт</th>
                      <th>Оборот Кт</th>
                      <th>Сальдо кон. Дт</th>
                      <th>Сальдо кон. Кт</th>
                      {showQty ? <th>Кол-во</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={showQty ? 9 : 8}
                          className={styles.empty}
                        >
                          нет данных
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.account}</td>
                          <td>{r.subconto}</td>
                          <td>{cell(r.openingDebit)}</td>
                          <td>{cell(r.openingCredit)}</td>
                          <td>{cell(r.turnoverDebit)}</td>
                          <td>{cell(r.turnoverCredit)}</td>
                          <td>{cell(r.closingDebit)}</td>
                          <td>{cell(r.closingCredit)}</td>
                          {showQty ? <td>{cell(r.qty)}</td> : null}
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

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
