'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { confirm } from '@/lib/dialogs';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';

type Tab = 'params' | 'view' | 'settings';

type CoaItem = { code: string; name: string };

type ReportRow = {
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
  account: string;
  currency?: string | null;
  rows: ReportRow[];
  totals?: Record<string, number | string>;
  showQty?: boolean;
  showAmount?: boolean;
};

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

function cell(v: number | string | undefined, empty: string) {
  if (v == null || v === '') return empty || '—';
  return v;
}

export default function AccountBalanceReportPage() {
  const bounds = useMemo(() => monthBounds(), []);
  const [tab, setTab] = useState<Tab>('params');

  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [showQty, setShowQty] = useState(false);
  const [showAmount, setShowAmount] = useState(true);
  const [account, setAccount] = useState('');
  const [currency, setCurrency] = useState('');
  const [subconto, setSubconto] = useState('');

  const [coa, setCoa] = useState<CoaItem[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [defaultCellValue, setDefaultCellValue] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [dicts, settings] = await Promise.all([
          apiFetch<
            Array<{
              code: string;
              items?: Array<{ code: string; name: string }>;
            }>
          >('/api/settings/dictionaries?kind=extra'),
          apiFetch<{
            accountBalanceReport?: { defaultCellValue?: string };
          }>('/api/settings/account-balance-report'),
        ]);
        const coaDict = (dicts || []).find((d) => d.code === 'coa');
        setCoa(
          (coaDict?.items || []).map((i) => ({ code: i.code, name: i.name })),
        );
        const cur = (dicts || []).find((d) => d.code === 'currencies');
        setCurrencies((cur?.items || []).map((i) => i.code));
        setDefaultCellValue(
          settings.accountBalanceReport?.defaultCellValue || '',
        );
      } catch {
        /* ignore bootstrap errors */
      }
    })();
  }, []);

  const queryQs = useCallback(() => {
    const p = new URLSearchParams();
    p.set('from', from);
    p.set('to', to);
    p.set('account', account);
    if (currency) p.set('currency', currency);
    if (subconto) p.set('subconto', subconto);
    p.set('showQty', showQty ? '1' : '0');
    p.set('showAmount', showAmount ? '1' : '0');
    return p.toString();
  }, [from, to, account, currency, subconto, showQty, showAmount]);

  async function generate(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setOk('');
    if (!from || !to) {
      setError('Укажите даты периода');
      return;
    }
    if (!account.trim()) {
      setError('Укажите счет');
      setTab('params');
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<ReportPayload>(
        `/api/catalog/analytics/account-balance?${queryQs()}`,
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

  async function saveSettings() {
    setBusy(true);
    setError('');
    setOk('');
    try {
      await apiFetch('/api/settings/account-balance-report', {
        method: 'PATCH',
        body: JSON.stringify({
          accountBalanceReport: { defaultCellValue },
        }),
      });
      setOk('Настройки сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function resetSettings() {
    const yes = await confirm({
      title: 'Сброс настроек',
      message: 'Сбросить настройки отчёта?',
      confirmText: 'Да',
      cancelText: 'Нет',
      variant: 'primary',
    });
    if (!yes) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      setDefaultCellValue('');
      await apiFetch('/api/settings/account-balance-report', {
        method: 'PATCH',
        body: JSON.stringify({
          accountBalanceReport: { defaultCellValue: '' },
        }),
      });
      setOk('Настройки сброшены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сброса');
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    if (!account.trim()) {
      setError('Сначала укажите счет и сформируйте отчёт');
      return;
    }
    try {
      await downloadXlsxViaApi(
        `/api/catalog/analytics/account-balance/export.xlsx?${queryQs()}`,
        'account-balance.xlsx',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    }
  }

  function exportCsv() {
    if (!report?.rows?.length) return;
    downloadCsv(
      'account-balance',
      report.rows.map((r) => ({
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
    const empty = defaultCellValue;
    const head = [
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
          `<tr><td>${r.subconto}</td><td>${cell(r.openingDebit, empty)}</td><td>${cell(r.openingCredit, empty)}</td><td>${cell(r.turnoverDebit, empty)}</td><td>${cell(r.turnoverCredit, empty)}</td><td>${cell(r.closingDebit, empty)}</td><td>${cell(r.closingCredit, empty)}</td>${showQty ? `<td>${cell(r.qty, empty)}</td>` : ''}</tr>`,
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${report.title}</title>
<style>body{font-family:sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#f3f4f6}</style>
</head><body><h1>${report.title}</h1>
<p>Счет: ${report.account} · ${report.from} — ${report.to}</p>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'account-balance.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXml() {
    if (!report) return;
    const empty = defaultCellValue;
    const rows = report.rows
      .map(
        (r) => `  <row>
    <subconto>${escapeXml(String(r.subconto))}</subconto>
    <openingDebit>${escapeXml(String(cell(r.openingDebit, empty)))}</openingDebit>
    <openingCredit>${escapeXml(String(cell(r.openingCredit, empty)))}</openingCredit>
    <turnoverDebit>${escapeXml(String(cell(r.turnoverDebit, empty)))}</turnoverDebit>
    <turnoverCredit>${escapeXml(String(cell(r.turnoverCredit, empty)))}</turnoverCredit>
    <closingDebit>${escapeXml(String(cell(r.closingDebit, empty)))}</closingDebit>
    <closingCredit>${escapeXml(String(cell(r.closingCredit, empty)))}</closingCredit>
  </row>`,
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<accountBalance account="${escapeXml(report.account)}" from="${report.from}" to="${report.to}">
${rows}
</accountBalance>
`;
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'account-balance.xml';
    a.click();
    URL.revokeObjectURL(url);
  }

  const empty = defaultCellValue;

  return (
    <div className={styles.page}>
      <PageSubnav
        group={{
          title: 'Оборотно-сальдовая ведомость по счету',
          siblings: [
            {
              label: 'Оборотно-сальдовая ведомость',
              href: '/catalog/reports/trial-balance',
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
        <button
          type="button"
          className={tab === 'settings' ? styles.tabOn : styles.tab}
          onClick={() => setTab('settings')}
        >
          Настройки
        </button>
        {tab === 'settings' ? (
          <>
            <button
              type="button"
              className={styles.btnBlue}
              disabled={busy}
              onClick={() => void saveSettings()}
            >
              Сохранить настройки
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={busy}
              onClick={() => void resetSettings()}
            >
              Сброс настроек
            </button>
          </>
        ) : null}
        {tab === 'view' ? (
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
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      {tab === 'params' ? (
        <form className={styles.card} onSubmit={(e) => void generate(e)}>
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label>
                Дата начала периода <span className={styles.req}>*</span>
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
                Дата окончания периода <span className={styles.req}>*</span>
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>

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

          <div className={styles.field}>
            <label>
              Счет <span className={styles.req}>*</span>
            </label>
            <input
              list="osv-coa"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Поиск..."
              required
            />
            <datalist id="osv-coa">
              {coa.map((c) => (
                <option key={c.code} value={`${c.code}. ${c.name}`} />
              ))}
            </datalist>
          </div>

          <div className={styles.field}>
            <label>Валюта</label>
            <input
              list="osv-cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="Поиск..."
            />
            <datalist id="osv-cur">
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
                  Счет: {report.account} · {report.from} — {report.to}
                </span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
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
                          colSpan={showQty ? 8 : 7}
                          className={styles.empty}
                        >
                          нет данных
                        </td>
                      </tr>
                    ) : (
                      report.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.subconto}</td>
                          <td>{cell(r.openingDebit, empty)}</td>
                          <td>{cell(r.openingCredit, empty)}</td>
                          <td>{cell(r.turnoverDebit, empty)}</td>
                          <td>{cell(r.turnoverCredit, empty)}</td>
                          <td>{cell(r.closingDebit, empty)}</td>
                          <td>{cell(r.closingCredit, empty)}</td>
                          {showQty ? <td>{cell(r.qty, empty)}</td> : null}
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
        <div className={styles.card}>
          <div className={styles.field}>
            <label>
              Значение по умолчанию (при отсутствии данных в ячейке, она будет
              заполняться данным значением)
            </label>
            <input
              value={defaultCellValue}
              onChange={(e) => setDefaultCellValue(e.target.value)}
            />
          </div>
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
