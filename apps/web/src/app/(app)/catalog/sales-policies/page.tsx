'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import type { SalesRateRow } from '@/lib/sales-accruals';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

function SalesRatesPage() {
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

  function patch(positionId: string, field: 'personalPercent' | 'divisionPercent', value: string) {
    const n = Number(value);
    setRows((prev) =>
      prev.map((r) =>
        r.positionId === positionId
          ? { ...r, [field]: Number.isFinite(n) ? n : 0 }
          : r,
      ),
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

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rows],
  );

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="sales-policies" />

      <div className={styles.shell}>
        <header className={shared.pageHeader}>
          <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`} aria-hidden>
            <i className="fas fa-percent" />
          </div>
          <div className={shared.pageHeaderText}>
            <h1 className={shared.pageTitle}>Настройка процентов продаж</h1>
            <p className={shared.pageSubtitle}>
              Проценты личных и подразделенийских продаж по должностям
            </p>
          </div>
          <div className={shared.pageHeaderActions}>
            <button
              type="button"
              className={styles.btnSave}
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.btnClose}
              onClick={() => router.push('/catalog/sales-accruals')}
            >
              Закрыть
            </button>
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.legend}>
            <span>
              <i className="fas fa-user" aria-hidden /> Личные продажи
            </span>
            <span>
              <i className="fas fa-sitemap" aria-hidden /> Продажи подразделения
            </span>
          </div>

          {loading ? (
            <p className={styles.hint}>Загрузка…</p>
          ) : sorted.length === 0 ? (
            <p className={styles.hint}>Нет данных</p>
          ) : (
            <div className={styles.grid}>
              {sorted.map((r) => (
                <article key={r.positionId} className={styles.row}>
                  <div className={styles.rowHead}>
                    <span className={styles.num}>{r.sortOrder}</span>
                    <h2 className={styles.posName}>{r.positionName}</h2>
                  </div>
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      <span>Личные</span>
                      <div className={styles.inputWrap}>
                        <input
                          type="number"
                          step="any"
                          value={r.personalPercent || ''}
                          onChange={(e) =>
                            patch(r.positionId, 'personalPercent', e.target.value)
                          }
                        />
                        <span className={styles.suffix}>%</span>
                      </div>
                    </label>
                    <label className={styles.field}>
                      <span>Подразделение</span>
                      <div className={styles.inputWrap}>
                        <input
                          type="number"
                          step="any"
                          value={r.divisionPercent || ''}
                          onChange={(e) =>
                            patch(r.positionId, 'divisionPercent', e.target.value)
                          }
                        />
                        <span className={styles.suffix}>%</span>
                      </div>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SalesPoliciesRoute() {
  return <SalesRatesPage />;
}
