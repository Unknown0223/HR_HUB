'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { fmtDt } from '@/lib/settlements';
import { kindLabel, type PayrollSheet, type SheetAudit } from '@/lib/vedomost';
import form from '../accruals/form.module.css';
import list from '../../catalog/absence-types/page.module.css';
import extra from '../../catalog/settlements/extra.module.css';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function VedomostHistory() {
  const router = useRouter();
  const [rows, setRows] = useState<SheetAudit[]>([]);
  const [docs, setDocs] = useState<PayrollSheet[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [paramsOpen, setParamsOpen] = useState(true);
  const [sheetId, setSheetId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 17 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [dayDiff, setDayDiff] = useState('');

  async function load(filter?: { sheetId?: string; from?: string; to?: string }) {
    setError('');
    try {
      const sp = new URLSearchParams();
      if (filter?.sheetId) sp.set('sheetId', filter.sheetId);
      if (filter?.from) sp.set('from', filter.from);
      if (filter?.to) sp.set('to', filter.to);
      const qs = sp.toString();
      setRows(await apiFetch<SheetAudit[]>(`/api/payroll/sheets/history${qs ? `?${qs}` : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void apiFetch<PayrollSheet[]>('/api/payroll/sheets').then(setDocs).catch(() => setDocs([]));
    void load({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => [r.userName, r.eventType].join(' ').toLowerCase().includes(qq));
  }, [rows, q]);

  return (
    <div className={form.page}>
      <PageSubnav groupKey="vedomost" titleOverride="История изменений" />
      <div className={form.topBar}>
        <h1 className={form.title}>История изменений</h1>
        <div className={form.actions}>
          <button type="button" className={form.btnPost} onClick={() => setParamsOpen(true)}>
            Параметры
          </button>
          <button type="button" className={form.btnClose} onClick={() => router.push('/payroll/vedomost')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}
      <div className={form.card}>
        <div className={form.lineBar}>
          <div />
          <div className={form.lineRight}>
            <input className={form.search} placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th>Дата и время изменения</th>
                <th>Пользователь</th>
                <th>Тип события</th>
                <th>Организация</th>
                <th>Продукт</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={list.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDt(r.occurredAt)}</td>
                  <td>{r.userName}</td>
                  <td>{r.eventType}</td>
                  <td>{r.organization || '—'}</td>
                  <td>{r.product || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {paramsOpen ? (
        <div className={extra.modalBack} onClick={() => setParamsOpen(false)}>
          <div className={extra.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={extra.modalTitle}>Параметры</h2>
            <div className={form.field} style={{ marginBottom: 10 }}>
              <label>
                Документ <span className={form.req}>*</span>
              </label>
              <select value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
                <option value="">Поиск...</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number || kindLabel(d.kind)}
                  </option>
                ))}
              </select>
            </div>
            <div className={form.field} style={{ marginBottom: 10 }}>
              <label>
                Дата начала <span className={form.req}>*</span>
              </label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className={form.field} style={{ marginBottom: 10 }}>
              <label>
                Дата окончания <span className={form.req}>*</span>
              </label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className={form.field} style={{ marginBottom: 10 }}>
              <label>Разница в днях между датой изменения и датой доставки</label>
              <input value={dayDiff} onChange={(e) => setDayDiff(e.target.value)} />
            </div>
            <div className={form.field}>
              <label>Поля</label>
              <div className={extra.fieldsBox} />
            </div>
            <div className={extra.modalActions}>
              <button
                type="button"
                className={form.btnPost}
                onClick={() => {
                  setParamsOpen(false);
                  void load({ sheetId: sheetId || undefined, from, to });
                }}
              >
                Выбрать
              </button>
              <button type="button" className={form.btnClose} onClick={() => { setSheetId(''); setDayDiff(''); }}>
                Сбросить
              </button>
              <button type="button" className={form.btnClose} onClick={() => setParamsOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
