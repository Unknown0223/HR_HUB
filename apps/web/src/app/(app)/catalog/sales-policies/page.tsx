'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import type { SalesRateRow } from '@/lib/sales-accruals';
import form from '../../payroll/accruals/form.module.css';
import list from '../absence-types/page.module.css';

export function SalesRatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SalesRateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await apiFetch<SalesRateRow[]>('/api/payroll/sales-accruals/rates'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function patch(i: number, field: 'personalPercent' | 'divisionPercent', value: string) {
    const n = Number(value);
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: Number.isFinite(n) ? n : 0 } : r)),
    );
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const next = await apiFetch<SalesRateRow[]>('/api/payroll/sales-accruals/rates', {
        method: 'PATCH',
        body: JSON.stringify({
          rows: rows.map((r) => ({
            positionId: r.positionId,
            personalPercent: Number(r.personalPercent) || 0,
            divisionPercent: Number(r.divisionPercent) || 0,
          })),
        }),
      });
      setRows(next);
      router.push('/catalog/sales-accruals');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={form.page}>
      <PageSubnav groupKey="sales-policies" />
      <div className={form.topBar}>
        <h1 className={form.title}>Настройка процентов продаж</h1>
        <div className={form.actions}>
          <button type="button" className={form.btnSave} disabled={saving} onClick={() => void save()}>
            Сохранить
          </button>
          <button type="button" className={form.btnClose} onClick={() => router.push('/catalog/sales-accruals')}>
            Закрыть
          </button>
        </div>
      </div>
      {error ? <p className={form.error}>{error}</p> : null}
      {loading ? <p>Загрузка…</p> : null}
      <div className={form.card} style={{ maxWidth: 720 }}>
        <div className={form.tableWrap}>
          <table className={form.table}>
            <thead>
              <tr>
                <th style={{ width: 48 }}>№</th>
                <th>Должность</th>
                <th>Личные продажи</th>
                <th>Продажи подразделения</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className={form.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {rows.map((r, i) => (
                <tr key={r.positionId}>
                  <td>{r.sortOrder}</td>
                  <td>{r.positionName}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        step="any"
                        value={r.personalPercent || ''}
                        onChange={(e) => patch(i, 'personalPercent', e.target.value)}
                      />
                      <span className={list.pagerMeta}>%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        step="any"
                        value={r.divisionPercent || ''}
                        onChange={(e) => patch(i, 'divisionPercent', e.target.value)}
                      />
                      <span className={list.pagerMeta}>%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SalesPoliciesRoute() {
  return <SalesRatesPage />;
}
