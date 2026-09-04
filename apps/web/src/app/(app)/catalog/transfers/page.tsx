'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpOpt = { id: string; label: string };
type Division = { id: string; name: string };
type Position = { id: string; name: string };

type DocRow = {
  id: string;
  type: string;
  status: string;
  number?: string | null;
  title: string;
  documentDate: string;
  postedAt?: string | null;
  organization?: string | null;
  transferFrom?: string | null;
  transferTo?: string | null;
  positionBefore?: string | null;
  positionAfter?: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber: string;
  };
};

const FILTER_KEYS = ['q', 'status', 'posted', 'from', 'to'] as const;
const PAGE_SIZES = [25, 50, 100] as const;
const COL_COUNT = 10;

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function empFull(e: DocRow['employee']) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function docHref(row: DocRow, mode?: 'edit' | 'history') {
  const base = `/employees/${row.employee.id}/documents/${row.id}`;
  if (mode === 'edit') return `${base}?mode=edit`;
  if (mode === 'history') return `${base}?side=history`;
  return base;
}

function isPosted(row: DocRow) {
  return row.status === 'posted';
}

function TransfersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const status = filters.status;
  const posted = filters.posted;
  const from = filters.from;
  const to = filters.to;

  const [rows, setRows] = useState<DocRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(status || posted || from || to || q),
  );
  const [panel, setPanel] = useState<'none' | 'create'>('none');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [cancelTarget, setCancelTarget] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [exportBusy, setExportBusy] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('type', 'transfer');
    if (q.trim()) p.set('q', q.trim());
    const apiStatus =
      posted === 'yes' || status === 'posted'
        ? 'posted'
        : posted === 'no'
          ? 'unposted'
          : posted === 'both'
            ? ''
            : status;
    if (apiStatus) p.set('status', apiStatus);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('page', String(page));
    p.set('limit', String(pageSize));
    return `?${p.toString()}`;
  }, [q, status, posted, from, to, page, pageSize]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked =
    rows.length > 0 && rows.every((r) => checked[r.id]);
  const somePageChecked =
    rows.some((r) => checked[r.id]) && !allPageChecked;

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<PageResult<DocRow> | DocRow[]>(
        `/api/hr/documents${query}`,
      );
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setRows(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [q, status, posted, from, to, pageSize]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    setChecked({});
  }, [query]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') setPanel('create');
  }, [searchParams]);

  useEffect(() => {
    apiFetch<{
      employees?: EmpOpt[];
      divisions?: { id: string; label: string }[];
      positions?: { id: string; label: string }[];
    }>('/api/catalog/lookups')
      .then((lookups) => {
        setEmployees(lookups.employees || []);
        setDivisions(
          (lookups.divisions || []).map((d) => ({ id: d.id, name: d.label })),
        );
        setPositions(
          (lookups.positions || []).map((p) => ({ id: p.id, name: p.label })),
        );
      })
      .catch(() => undefined);
  }, []);

  function applySearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) p.set('q', searchDraft.trim());
    else p.delete('q');
    router.push(`/catalog/transfers?${p.toString()}`);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      const divisionId = String(fd.get('divisionId') || '');
      const positionId = String(fd.get('positionId') || '');
      const baseSalary = String(fd.get('baseSalary') || '');
      const transferFrom = String(fd.get('transferFrom') || '');
      const transferTo = String(fd.get('transferTo') || '');
      if (divisionId) payload.divisionId = divisionId;
      if (positionId) payload.positionId = positionId;
      if (baseSalary) payload.baseSalary = Number(baseSalary);
      if (transferFrom) payload.transferFrom = transferFrom;
      if (transferTo) payload.transferTo = transferTo;

      const created = await apiFetch<DocRow>('/api/hr/documents', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: fd.get('employeeId'),
          type: 'transfer',
          title: fd.get('title') || 'Кадровый перевод',
          documentDate: fd.get('documentDate') || transferFrom,
          number: fd.get('number') || undefined,
          note: fd.get('note') || undefined,
          payload,
        }),
      });
      form.reset();
      setPanel('none');
      await load();
      if (created?.id && created.employee?.id) {
        router.push(docHref(created, 'edit'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(row: DocRow, action: 'post' | 'unpost' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/hr/documents/${row.id}/${action}`, { method: 'POST' });
      setCancelTarget(null);
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'post' | 'unpost' | 'cancel') {
    if (checkedIds.length === 0) return;
    const targets = rows.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'cancel') {
      if (
        !(await confirm(
          `Отменить выбранные переводы (${targets.length} шт.)?`,
        ))
      ) {
        return;
      }
    } else if (action === 'post') {
      const draft = targets.filter((r) => r.status === 'draft');
      if (draft.length === 0) {
        setError('Нет черновиков среди выбранных');
        return;
      }
    } else if (action === 'unpost') {
      const postedRows = targets.filter((r) => isPosted(r));
      if (postedRows.length === 0) {
        setError('Нет проведённых документов среди выбранных');
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'cancel') {
            if (row.status === 'cancelled') continue;
            await apiFetch(`/api/hr/documents/${row.id}/cancel`, {
              method: 'POST',
            });
          } else if (action === 'post') {
            if (row.status !== 'draft') continue;
            await apiFetch(`/api/hr/documents/${row.id}/post`, {
              method: 'POST',
            });
          } else {
            if (!isPosted(row)) continue;
            await apiFetch(`/api/hr/documents/${row.id}/unpost`, {
              method: 'POST',
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) {
        setError(`Часть операций не выполнена: ${failed}`);
      }
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `transfers-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        Дата: fmtDate(r.documentDate),
        Номер: r.number || '',
        Сотрудник: empFull(r.employee),
        Организация: r.organization || '',
        'Перевод с': fmtDate(r.transferFrom),
        'Перевод по': fmtDate(r.transferTo),
        'Позиция (до)': r.positionBefore || '',
        'Позиция (после)': r.positionAfter || '',
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      const p = new URLSearchParams();
      p.set('type', 'transfer');
      if (q.trim()) p.set('q', q.trim());
      if (status) p.set('status', status);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      await downloadXlsxViaApi(
        `/api/hr/documents/export.xlsx?${p.toString()}`,
        `transfers-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="transfers" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTransfer}`}>
          <i className="fas fa-exchange-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Кадровые переводы</h1>
          <p className={shared.pageSubtitle}>
            Переводы сотрудников между подразделениями и должностями
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
            onClick={() => setPanel('create')}
          >
            <i className="fas fa-plus" aria-hidden />
            Создать перевод
          </button>
          <FilterPanel
            inline
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'dateRange',
                label: 'Дата',
                fromKey: 'from',
                toKey: 'to',
              },
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              {
                type: 'postedChecks',
                key: 'posted',
                label: 'Проведен',
              },
            ]}
          />
        </div>

        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {rows.length} / {total}
          </span>
          <button
            type="button"
            className={
              filtersOpen ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn
            }
            onClick={() => setFiltersOpen((v) => !v)}
            title="Фильтр"
            aria-label="Фильтр"
          >
            <i className="fas fa-filter" aria-hidden />
          </button>
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
            onClick={() => void runBulk('post')}
          >
            <i className="fas fa-check" aria-hidden />
            Провести
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('unpost')}
          >
            <i className="fas fa-undo" aria-hidden />
            Отменить проведение
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('cancel')}
          >
            <i className="fas fa-ban" aria-hidden />
            Отменить
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

      <FormModal
        open={panel === 'create'}
        title="Создать: Кадровый перевод"
        width="lg"
        onClose={() => setPanel('none')}
      >
        <form className={styles.modalForm} onSubmit={onCreate}>
          <div className={styles.formGrid}>
            <label>
              Дата документа *
              <input
                name="documentDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Номер
              <input name="number" placeholder="авто" />
            </label>
            <label>
              Сотрудник *
              <select name="employeeId" required defaultValue="">
                <option value="">— выберите —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Заголовок
              <input name="title" defaultValue="Кадровый перевод" />
            </label>
            <label>
              Перевод с *
              <input
                name="transferFrom"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Перевод по
              <input name="transferTo" type="date" />
            </label>
            <label>
              Подразделение (после) *
              <select name="divisionId" required defaultValue="">
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Должность (после) *
              <select name="positionId" required defaultValue="">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Оклад
              <input name="baseSalary" type="number" min={0} step="0.01" />
            </label>
            <label>
              Примечание
              <input name="note" />
            </label>
          </div>
          <div className={styles.panelActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setPanel('none')}
            >
              Закрыть
            </button>
          </div>
        </form>
      </FormModal>

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageChecked;
                    }}
                    onChange={(e) => toggleAllPage(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Дата</th>
                <th>Номер</th>
                <th>Сотрудник</th>
                <th>Организация</th>
                <th>Перевод с</th>
                <th>Перевод по</th>
                <th>Позиция (до перевода)</th>
                <th>Позиция (после перевода)</th>
                <th>Проведен</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать перевод»
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        open || isChecked ? styles.rowSelected : undefined
                      }
                      onClick={() => setSelectedId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(row.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.number || row.id}`}
                        />
                      </td>
                      <td>{fmtDate(row.documentDate)}</td>
                      <td>{row.number || '—'}</td>
                      <td className={styles.empName}>{empFull(row.employee)}</td>
                      <td>{row.organization || '—'}</td>
                      <td>{fmtDate(row.transferFrom)}</td>
                      <td>{fmtDate(row.transferTo)}</td>
                      <td>{row.positionBefore || '—'}</td>
                      <td>{row.positionAfter || '—'}</td>
                      <td>
                        {row.status === 'posted' ? (
                          <span className={styles.postedYes}>Да</span>
                        ) : (
                          <span className={styles.postedNo}>
                            {row.status === 'cancelled' ? 'Отм.' : 'Нет'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <Link href={docHref(row)}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {row.status === 'draft' ? (
                              <Link href={docHref(row, 'edit')}>
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </Link>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {row.status === 'posted' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'unpost')}
                              >
                                <i className="fas fa-undo" aria-hidden />
                                Отменить проведение
                              </button>
                            ) : null}
                            {row.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => setCancelTarget(row)}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отменить
                              </button>
                            ) : null}
                            <Link href={docHref(row, 'history')}>
                              <i className="fas fa-history" aria-hidden />
                              История изменений
                            </Link>
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
            из <strong>{total}</strong>
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

      {cancelTarget ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal} role="dialog" aria-modal="true">
            <p>
              Отменить документ № {cancelTarget.number || '—'} от{' '}
              {fmtDate(cancelTarget.documentDate)}?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalYes}
                disabled={busy}
                onClick={() => void runAction(cancelTarget, 'cancel')}
              >
                Да
              </button>
              <button
                type="button"
                className={styles.modalNo}
                disabled={busy}
                onClick={() => setCancelTarget(null)}
              >
                Нет
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <TransfersPageInner />
    </Suspense>
  );
}
