'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { ClearanceTemplateFormModal } from './ClearanceTemplateFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

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

const PAGE_SIZES = [25, 50, 100] as const;
const COL_COUNT = 8;

function yesNo(v: boolean) {
  return v ? 'Да' : 'Нет';
}

function ClearanceTemplatesInner() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const filtered = useMemo(() => {
    const qq = search.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.name, r.code, r.division?.name, r.position?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, search]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const someChecked = filtered.some((r) => checked[r.id]) && !allChecked;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );
  const rangeFrom = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, filtered.length);

  const checkedIds = useMemo(() => Object.keys(checked).filter((id) => checked[id]), [checked]);
  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => checked[r.id]);
  const somePageChecked = pageRows.some((r) => checked[r.id]) && !allPageChecked;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<TemplateRow[] | { items?: TemplateRow[] }>(
        '/api/catalog/clearance-templates',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchDraft(q);
    setPage(1);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setEditId(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  function buildUrl(next: URLSearchParams) {
    const qs = next.toString();
    return qs ? `/catalog/clearance-templates?${qs}` : '/catalog/clearance-templates';
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    params.delete('create');
    router.replace(buildUrl(params), { scroll: false });
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (searchParams.get('create') === '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      router.replace(buildUrl(params), { scroll: false });
    }
  }

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of pageRows) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  function dropChecked(ids: string[]) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }

  async function remove(row: TemplateRow) {
    if (!(await confirm('Удалить шаблон?'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/clearance-templates/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      dropChecked([row.id]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function bulkRemove() {
    if (checkedIds.length === 0) return;
    if (!(await confirm(`Удалить выбранные шаблоны (${checkedIds.length} шт.)?`))) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const id of checkedIds) {
        try {
          await apiFetch(`/api/catalog/clearance-templates/${id}`, { method: 'DELETE' });
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть шаблонов не удалена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  async function bulkSetActive(isActive: boolean) {
    if (checkedIds.length === 0) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const id of checkedIds) {
        try {
          await apiFetch(`/api/catalog/clearance-templates/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
          });
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть шаблонов не обновлена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `clearance-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Шаблон: r.name || '',
        Код: r.code || '',
        Подразделения: r.division?.name || '',
        Должность: r.position?.name || '',
        'Подпись руководителя': yesNo(r.requireManagerSign),
        'Подпись вышестоящего руководителя': yesNo(r.requireHigherManagerSign),
        Сотрудники: String(r.employees?.length ?? 0),
        Активен: yesNo(r.isActive),
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
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

  const modalTitle =
    modal?.mode === 'edit'
      ? 'Шаблон обходного листа (изменение)'
      : 'Шаблон обходного листа (создание)';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="clearance-templates" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeClearance}`}>
          <i className="fas fa-clipboard-list" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Шаблоны обходных листов</h1>
          <p className={shared.pageSubtitle}>
            Правила подписания и состав участников обходного листа
          </p>
        </div>
        <div className={shared.pageHeaderActions}>
          <div className={styles.searchWrap}>
            <i className={`fas fa-search ${styles.searchIcon}`} aria-hidden />
            <input
              className={styles.search}
              placeholder="Поиск…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applySearch();
              }}
              aria-label="Поиск"
            />
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => {
              setEditId(null);
              setModalOpen(true);
            }}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать
          </button>
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={exportCsv}
            title="CSV"
            aria-label="Экспорт CSV"
          >
            <i className="fas fa-file-csv" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={exportBusy}
            onClick={() => void exportExcel()}
            title="Excel"
            aria-label="Экспорт Excel"
          >
            <i className="fas fa-file-excel" aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void load()}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkSetActive(true)}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void bulkSetActive(false)}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void bulkRemove()}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setChecked({})}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    disabled={pageRows.length === 0}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageChecked;
                    }}
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Шаблон</th>
                <th>Подразделения</th>
                <th>Должность</th>
                <th>Подпись руководителя</th>
                <th>Подпись вышестоящего руководителя</th>
                <th>Сотрудники</th>
                <th>Активен</th>
              </tr>
            </thead>
            <tbody>
              {loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {pageRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.name || row.code}`}
                        />
                      </td>
                      <td>
                        <div className={styles.nameCell}>
                          <span className={styles.nameIcon} aria-hidden>
                            <i className="fas fa-clipboard-check" />
                          </span>
                          <div className={styles.nameText}>
                            <div className={styles.name}>{row.name || '—'}</div>
                            <div className={styles.meta}>{row.code}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.division?.name || '—'}</td>
                      <td>{row.position?.name || '—'}</td>
                      <td>
                        <span
                          className={
                            row.requireManagerSign ? styles.signYes : styles.signNo
                          }
                        >
                          {yesNo(row.requireManagerSign)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.requireHigherManagerSign ? styles.signYes : styles.signNo
                          }
                        >
                          {yesNo(row.requireHigherManagerSign)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.countPill}>{row.employees?.length ?? 0}</span>
                      </td>
                      <td>
                        <span className={row.isActive ? styles.badgeOk : styles.badgeOff}>
                          {yesNo(row.isActive)}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditId(row.id);
                                setModalOpen(true);
                              }}
                            >
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <Link
                              href={`/catalog/clearance-templates/${row.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <i className="fas fa-external-link-alt" aria-hidden />
                              Открыть форму
                            </Link>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void remove(row);
                              }}
                            >
                              <i className="fas fa-trash" aria-hidden />
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
        <div className={styles.footer}>
          <p>
            Показано{' '}
            <strong>
              {rangeFrom}–{rangeTo}
            </strong>{' '}
            из <strong>{filtered.length}</strong>
          </p>
          <div className={styles.footerPager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Предыдущая страница"
            >
              ‹
            </button>
            <span className={styles.countBadge}>
              {page}/{totalPages}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Следующая страница"
            >
              ›
            </button>
            <select
              aria-label="Размер страницы"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className={styles.pageSize}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ClearanceTemplateFormModal
        open={modalOpen}
        editId={editId}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          void load();
        }}
      />
    </div>
  );
}

export default function ClearanceTemplatesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <ClearanceTemplatesInner />
    </Suspense>
  );
}
