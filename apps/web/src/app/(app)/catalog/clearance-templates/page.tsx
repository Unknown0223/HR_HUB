'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';

type TemplateRow = {
  id: string;
  code: string;
  name: string;
  divisionId?: string | null;
  positionId?: string | null;
  requireManagerSign: boolean;
  requireHigherManagerSign: boolean;
  isActive: boolean;
  division?: { id: string; name: string; code: string } | null;
  position?: { id: string; name: string; code: string } | null;
  employees?: { id: string; employeeId: string }[];
};

function yesNo(v: boolean) {
  return v ? 'Да' : 'Нет';
}

function ClearanceTemplatesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.division?.name, r.position?.name]
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
      const data = await apiFetch<TemplateRow[]>('/api/catalog/clearance-templates');
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
    router.replace(qs ? `/catalog/clearance-templates?${qs}` : '/catalog/clearance-templates', {
      scroll: false,
    });
  }

  async function remove(row: TemplateRow) {
    if (!(await confirm('Удалить шаблон?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/clearance-templates/${row.id}`, { method: 'DELETE' });
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
      `clearance-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Подразделения: r.division?.name || '',
        Должность: r.position?.name || '',
        'Подпись руководителя': yesNo(r.requireManagerSign),
        'Подпись вышестоящего руководителя': yesNo(r.requireHigherManagerSign),
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    try {
      await downloadXlsxViaApi(
        '/api/catalog/clearance-templates/export.xlsx',
        `clearance-templates-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="clearance-templates" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <Link href="/catalog/clearance-templates/new" className={styles.createBtn}>
            Создать
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
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
          >
            {exportBusy ? 'Excel…' : 'Excel'}
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
              <th>Подразделения</th>
              <th>Должность</th>
              <th>Подпись руководителя</th>
              <th>Подпись вышестоящего руководителя</th>
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
                    <td>{row.division?.name || '—'}</td>
                    <td>{row.position?.name || '—'}</td>
                    <td>{yesNo(row.requireManagerSign)}</td>
                    <td>{yesNo(row.requireHigherManagerSign)}</td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={5}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/clearance-templates/${row.id}`}>Изменить</Link>
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

export default function ClearanceTemplatesPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <ClearanceTemplatesInner />
    </Suspense>
  );
}
