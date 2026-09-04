'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from '../absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

export type AccrualTypeRow = {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  purpose?: string | null;
  periodCalc?: string;
  resultMode?: string;
  formula?: string | null;
  taxNdfl?: boolean;
  taxInps?: boolean;
  taxOss?: boolean;
  accountingMode?: string;
};

function AccrualTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<AccrualTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.code, r.name, r.shortName, r.description, String(r.sortOrder ?? '')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AccrualTypeRow[] | { items: AccrualTypeRow[] }>(
        '/api/catalog/accrual-types',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runDelete(row: AccrualTypeRow) {
    if (!(await confirm(`Удалить начисление «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/accrual-types/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `accruals-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Код: r.code,
        'Порядковый номер': r.sortOrder ?? '',
        Название: r.name,
        'Краткое название': r.shortName || '',
        Описание: r.description || '',
        Статус: r.isActive === false ? 'Неактивный' : 'Активный',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="accrual-types" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link
            href="/catalog/accrual-types/new"
            className={styles.createBtn}
            style={{ background: '#0a85e2', textDecoration: 'none' }}
          >
            Создать
          </Link>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => router.push('/settings?tab=org')}
          >
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const params = new URLSearchParams();
                if (searchDraft.trim()) params.set('q', searchDraft.trim());
                const qs = params.toString();
                router.replace(
                  qs ? `/catalog/accrual-types?${qs}` : '/catalog/accrual-types',
                  { scroll: false },
                );
              }
            }}
          />
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Код</th>
              <th>Порядковый номер</th>
              <th>Название</th>
              <th>Краткое название</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = focusId === row.id;
              return (
                <tr
                  key={row.id}
                  className={open ? styles.rowSelected : undefined}
                  onClick={() => setFocusId(open ? null : row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{row.code || ''}</td>
                  <td className={styles.nameCell}>
                    <span className={styles.nameText}>{row.sortOrder ?? ''}</span>
                    {open ? (
                      <div
                        className={`${styles.inlineActions} ${styles.rowActions}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/catalog/accrual-types/${row.id}`}>Просмотреть</Link>
                        <Link href={`/catalog/accrual-types/${row.id}/edit`}>Изменить</Link>
                        <button
                          type="button"
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => void runDelete(row)}
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td>{row.name}</td>
                  <td>{row.shortName || ''}</td>
                  <td>{row.description || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AccrualTypesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <AccrualTypesPageInner />
    </Suspense>
  );
}
