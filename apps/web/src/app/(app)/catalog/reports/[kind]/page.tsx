'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { REPORT_KINDS } from '@/lib/catalog-nav';
import { downloadCsv, extractRows, flattenRow } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import {
  DisciplineReportSheet,
  type DisciplineRow,
} from '@/components/DisciplineReportSheet';
import styles from '../../../../page-shared.module.css';

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

type DisciplinePayload = {
  title?: string;
  generatedAt?: string;
  from?: string;
  to?: string;
  rows?: DisciplineRow[];
};

export default function CatalogReportPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const kind = String(params.kind || '');
  const meta = REPORT_KINDS[kind];
  const isDiscipline = kind === 'discipline';
  const { from, to } = monthBounds();
  const periodMode = searchParams.get('period') === '1';
  const shiftsV2 = searchParams.get('variant') === '2';

  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!meta) {
      setError('Неизвестный отчёт');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs =
        isDiscipline || meta.path.includes('attendance') || meta.path.includes('hourly')
          ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
          : '';
      const result = await apiFetch<unknown>(`${meta.path}${qs}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [meta, isDiscipline, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => extractRows(data), [data]);
  const columns = useMemo(() => {
    if (!rows.length) return [] as string[];
    return Object.keys(flattenRow(rows[0])).slice(0, 14);
  }, [rows]);

  const title =
    kind === 'division-mode' && periodMode
      ? 'Отчет по режиму работы подразделений (период)'
      : kind === 'shifts' && shiftsV2
        ? 'Отчет по сменам (второй вариант)'
        : meta?.title ||
          (data && typeof data === 'object' && 'title' in (data as object)
            ? String((data as { title: string }).title)
            : kind);

  async function exportExcel() {
    setError('');
    try {
      const qs = isDiscipline
        ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : '';
      await downloadXlsxViaApi(
        `/api/catalog/analytics/${kind}/export.xlsx${qs}`,
        `report-${kind}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка экспорта Excel');
    }
  }

  if (isDiscipline) {
    const payload = (data || {}) as DisciplinePayload;
    return (
      <div className={styles.wrap}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? (
          <p className={styles.muted}>Загрузка…</p>
        ) : (
          <DisciplineReportSheet
            title={payload.title || 'Отчет по дисциплине посещений'}
            generatedAt={payload.generatedAt}
            from={payload.from || from}
            to={payload.to || to}
            rows={payload.rows || []}
            onExcel={() => void exportExcel()}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.h1}>{title}</h1>
          <p className={styles.lead}>
            Каталог · отчёт · {kind} · {rows.length} строк
          </p>
        </div>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={!rows.length}
            onClick={() => downloadCsv(`report-${kind}`, rows)}
          >
            CSV
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={loading || !meta}
            onClick={() => void exportExcel()}
          >
            Excel
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <p className={styles.muted}>Загрузка…</p>
      ) : rows.length === 0 ? (
        <div className={styles.panel}>
          <p className={styles.empty}>Нет данных — сначала добавьте записи в каталог</p>
          {data != null && (
            <pre style={{ padding: '1rem', fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        <div className={styles.panel}>
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const flat = flattenRow(row);
                return (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{flat[c] || '—'}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
