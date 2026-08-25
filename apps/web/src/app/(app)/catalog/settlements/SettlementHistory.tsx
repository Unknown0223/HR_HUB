'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { fmtDt, type SettlementAudit, type SettlementDoc } from '@/lib/settlements';
import form from '../../payroll/accruals/form.module.css';
import list from '../absence-types/page.module.css';
import extra from './extra.module.css';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function SettlementHistory() {
  const router = useRouter();
  const [rows, setRows] = useState<SettlementAudit[]>([]);
  const [docs, setDocs] = useState<SettlementDoc[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [paramsOpen, setParamsOpen] = useState(true);
  const [settlementId, setSettlementId] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 17 * 86400000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [dayDiff, setDayDiff] = useState('');

  async function load(filter?: { settlementId?: string; from?: string; to?: string; q?: string }) {
    setError('');
    try {
      const sp = new URLSearchParams();
      if (filter?.settlementId) sp.set('settlementId', filter.settlementId);
      if (filter?.from) sp.set('from', filter.from);
      if (filter?.to) sp.set('to', filter.to);
      if (filter?.q) sp.set('q', filter.q);
      const qs = sp.toString();
      setRows(await apiFetch<SettlementAudit[]>(`/api/payroll/settlements/history${qs ? `?${qs}` : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void apiFetch<SettlementDoc[]>('/api/payroll/settlements').then(setDocs).catch(() => setDocs([]));
    void load({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) =>
      [r.userName, r.eventType, r.organization, r.product].join(' ').toLowerCase().includes(qq),
    );
  }, [rows, q]);

  return (
    <div className={form.page}>
      <PageSubnav groupKey="settlements" titleOverride="История изменений" />
      <div className={form.topBar}>
        <h1 className={form.title}>История изменений</h1>
        <div className={form.actions}>
          <button type="button" className={form.btnPost} onClick={() => setParamsOpen(true)}>
            Параметры
          </button>
          <button type="button" className={form.btnClose} onClick={() => router.push('/catalog/settlements')}>
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
              <select value={settlementId} onChange={(e) => setSettlementId(e.target.value)}>
                <option value="">Поиск...</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.number || d.title || d.id}
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
                  if (!from || !to) return;
                  setParamsOpen(false);
                  void load({ settlementId: settlementId || undefined, from, to });
                }}
              >
                Выбрать
              </button>
              <button
                type="button"
                className={form.btnClose}
                onClick={() => {
                  setSettlementId('');
                  setDayDiff('');
                }}
              >
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
