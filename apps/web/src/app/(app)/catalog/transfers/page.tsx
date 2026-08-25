'use client';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from '../hr-documents/page.module.css';
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
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

  const colCount = 10;

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="transfers" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setPanel('create')}
          >
            Создать +
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
            {pageSize} / {total}
          </span>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>
            {page}/{totalPages}
          </span>
          <button
            type="button"
            className={styles.pagerBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <select
            aria-label="Размер страницы"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className={styles.search}
            style={{ minWidth: 72, width: 72 }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel === 'create' ? (
        <form className={styles.panel} onSubmit={onCreate}>
          <h2 className={styles.panelTitle}>Создать: Кадровый перевод</h2>
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
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Дата ↑</th>
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
                <td colSpan={colCount} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className={styles.empty}>
                  Нет данных — нажмите «Создать»
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
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
                      <td colSpan={colCount}>
                        <div className={styles.rowActions}>
                          <Link href={docHref(row)}>Просмотреть</Link>
                          {row.status === 'draft' ? (
                            <Link href={docHref(row, 'edit')}>Изменить</Link>
                          ) : null}
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'post')}
                            >
                              Провести
                            </button>
                          ) : null}
                          {row.status === 'posted' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'unpost')}
                            >
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
                              Отменить
                            </button>
                          ) : null}
                          <Link href={docHref(row, 'history')}>
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
                onClick={() => runAction(cancelTarget, 'cancel')}
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
