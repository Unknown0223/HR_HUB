'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from './page.module.css';

type TypeRow = {
  id: string;
  code: string;
  name: string;
  accrualName?: string | null;
  isActive: boolean;
};

function IncidentTypesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [rows, setRows] = useState<TypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.accrualName].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TypeRow[]>('/api/catalog/incident-types');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(qs ? `/catalog/incident-types?${qs}` : '/catalog/incident-types', {
      scroll: false,
    });
  }

  async function remove(row: TypeRow) {
    if (!(await confirm('Удалить тип инцидента?'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/incident-types/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `incident-types-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Название: r.name,
        Начисление: r.accrualName || '',
        Статус: r.isActive ? 'Активный' : 'Неактивный',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="incident-types" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/incident-types/new" className={styles.createBtn}>
            Создать
          </Link>
          <Link href="/catalog/incidents" className={styles.toolBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Закрыть
          </Link>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <button type="button" className={styles.toolBtn} onClick={applySearch}>
            Найти
          </button>
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => load()}>
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
              <th className={styles.checkCol} />
              <th>Название</th>
              <th>Начисление</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {filtered.map((row) => {
              const open = selectedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setSelectedId(open ? null : row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{row.accrualName || '—'}</td>
                    <td>
                      <span className={row.isActive ? styles.postedYes : styles.postedNo}>
                        {row.isActive ? 'Активный' : 'Неактивный'}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={4}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/incident-types/${row.id}`}>Изменить</Link>
                          <button type="button" disabled={busy} onClick={() => remove(row)}>
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IncidentTypesPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <IncidentTypesInner />
    </Suspense>
  );
}
