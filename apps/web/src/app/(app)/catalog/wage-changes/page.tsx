'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
};

type WageChangeRow = {
  id: string;
  employeeId: string;
  status: string;
  oldAmount?: number | string | null;
  newAmount: number | string;
  effectiveAt: string;
  reason?: string | null;
  documentNumber?: string | null;
  postedAt?: string | null;
  createdAt?: string;
  employee?: EmpRef | null;
};

type EmpOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to', 'employeeId'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtMoney(v?: number | string | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function isPosted(row: WageChangeRow) {
  return row.status === 'posted';
}

function accrualsLabel(amount?: number | string | null) {
  if (amount == null || amount === '') return '—';
  return `Оклад: ${fmtMoney(amount)}`;
}

function WageChangesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const postedFilter = filters.posted;
  const employeeIdFilter = filters.employeeId;

  const [rows, setRows] = useState<WageChangeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || from || to || numberFilter || postedFilter || employeeIdFilter),
  );
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.documentNumber,
          empName(r.employee),
          r.reason,
          r.oldAmount,
          r.newAmount,
          r.employee?.tabNumber,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (numberFilter.trim()) {
      const nq = numberFilter.trim().toLowerCase();
      list = list.filter((r) =>
        String(r.documentNumber || '')
          .toLowerCase()
          .includes(nq),
      );
    }
    if (employeeIdFilter) {
      list = list.filter((r) => r.employeeId === employeeIdFilter);
    }
    if (postedFilter === 'yes') list = list.filter((r) => isPosted(r));
    else if (postedFilter === 'no') list = list.filter((r) => !isPosted(r));
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(r.effectiveAt).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(r.effectiveAt).getTime() <= t);
    }
    return list;
  }, [rows, q, numberFilter, employeeIdFilter, postedFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<WageChangeRow[]>('/api/catalog/wage-changes');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, numberFilter, employeeIdFilter, postedFilter, from, to, pageSize]);

  useEffect(() => {
    apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups')
      .then((d) => setEmployees(d.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/wage-changes?${qs}` : '/catalog/wage-changes', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setEditDefaults({
      effectiveAt: new Date().toISOString().slice(0, 10),
    });
    setPanel('create');
  }

  function openEdit(row: WageChangeRow) {
    setEditId(row.id);
    setEditDefaults({
      employeeId: row.employeeId,
      newAmount: String(row.newAmount ?? ''),
      effectiveAt: String(row.effectiveAt).slice(0, 10),
      reason: row.reason || '',
      documentNumber: row.documentNumber || '',
    });
    setPanel('edit');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        employeeId: fd.get('employeeId'),
        newAmount: Number(fd.get('newAmount')),
        effectiveAt: fd.get('effectiveAt'),
        reason: fd.get('reason') || undefined,
        documentNumber: fd.get('documentNumber') || undefined,
      };
      if (editId) {
        await apiFetch(`/api/catalog/wage-changes/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/wage-changes', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      form.reset();
      setPanel('none');
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(row: WageChangeRow, action: 'post' | 'cancel' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm(`Удалить документ ${row.documentNumber || row.id}?`))) return;
        await apiFetch(`/api/catalog/wage-changes/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/catalog/wage-changes/${row.id}/${action}`, {
          method: 'POST',
        });
      }
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
      `wage-changes-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        'Дата документа': fmtDate(r.createdAt || r.effectiveAt),
        'Номер документа': r.documentNumber || '',
        Сотрудник: empName(r.employee),
        Дата: fmtDate(r.effectiveAt),
        'Начисления (до изменения)': accrualsLabel(r.oldAmount),
        Начисления: accrualsLabel(r.newAmount),
        Проведен: isPosted(r) ? 'Да' : 'Нет',
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/catalog/wage-changes/export.xlsx',
        `wage-changes-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="wage-changes" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-ruble-sign" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Все изменения в оплате труда</h1>
          <p className={shared.pageSubtitle}>История изменений тарифов и окладов сотрудников</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
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
              {
                type: 'text',
                key: 'number',
                label: 'Номер',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Сотрудник',
                options: employees.map((e) => ({ value: e.id, label: e.label })),
              },
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
            {pageSize} / {filtered.length}
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

      {panel !== 'none' ? (
        <FormModal
          open
          title={
            panel === 'edit'
              ? 'Изменить оплату труда'
              : 'Создать изменение оплаты труда'
          }
          width="md"
          onClose={() => {
            setPanel('none');
            setEditId(null);
          }}
        >
        <form
          key={`${panel}-${editId || 'new'}`}
          className={styles.modalForm}
          onSubmit={onSubmit}
        >
          <div className={styles.formGrid}>
            <label>
              Дата документа *
              <input
                name="effectiveAt"
                type="date"
                required
                defaultValue={editDefaults.effectiveAt || ''}
              />
            </label>
            <label>
              Номер документа
              <input
                name="documentNumber"
                placeholder="авто"
                defaultValue={editDefaults.documentNumber || ''}
              />
            </label>
            <label>
              Сотрудник *
              <select
                name="employeeId"
                required
                defaultValue={editDefaults.employeeId || ''}
              >
                <option value="">— выберите —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Новая сумма *
              <input
                name="newAmount"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={editDefaults.newAmount || ''}
              />
            </label>
            <label>
              Причина
              <input name="reason" defaultValue={editDefaults.reason || ''} />
            </label>
          </div>
          <div className={styles.panelActions}>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                setPanel('none');
                setEditId(null);
              }}
            >
              Закрыть
            </button>
          </div>
        </form>
        </FormModal>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Дата документа</th>
              <th>Номер документа</th>
              <th>Сотрудник</th>
              <th>Дата</th>
              <th>Начисления (до изменения)</th>
              <th>Начисления</th>
              <th>Проведен</th>
            </tr>
          </thead>
          <tbody>
            {loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {pageRows.map((row) => {
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
                    <td>{fmtDate(row.createdAt || row.effectiveAt)}</td>
                    <td>{row.documentNumber || '—'}</td>
                    <td className={styles.empName}>{empName(row.employee)}</td>
                    <td>{fmtDate(row.effectiveAt)}</td>
                    <td>{accrualsLabel(row.oldAmount)}</td>
                    <td>{accrualsLabel(row.newAmount)}</td>
                    <td>
                      {isPosted(row) ? (
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
                      <td colSpan={8}>
                        <div className={`${styles.actionsSlide} ${styles.rowActions}`}>
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'post')}
                            >
                              Провести
                            </button>
                          ) : null}
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'cancel')}
                            >
                              Отменить
                            </button>
                          ) : null}
                          {row.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openEdit(row)}
                            >
                              Изменить
                            </button>
                          ) : null}
                          <Link href={`/employees/${row.employeeId}`}>Карточка</Link>
                          {row.status !== 'posted' ? (
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => runAction(row, 'delete')}
                            >
                              Удалить
                            </button>
                          ) : null}
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

export default function WageChangesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <WageChangesPageInner />
    </Suspense>
  );
}
