'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { ListBulkBar, togglePage, toggleSelect } from '@/components/ListBulkBar';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { formatMonthRu } from '@/lib/fine-policies';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type PersonRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type DivisionRef = { id: string; name: string; code?: string };

type ContractRef = {
  id: string;
  number: string;
  title?: string;
  startDate?: string;
  status?: string;
  division?: DivisionRef | null;
  person?: PersonRef | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber?: string;
    person?: PersonRef | null;
    division?: DivisionRef | null;
  } | null;
};

type ServiceRow = {
  id: string;
  code: string;
  name: string;
  unitPrice?: string | number | null;
  unit?: string | null;
  month?: string | null;
  status?: string | null;
  isActive: boolean;
  contractId?: string | null;
  contract?: ContractRef | null;
};

type DivisionOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'number', 'contractId', 'divisionId', 'status', 'month'] as const;
const PAGE_SIZE = 50;
const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  posted: 'Проведен',
  cancelled: 'Отменен',
};

function personName(p?: PersonRef | null) {
  if (!p) return '';
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ').toUpperCase();
}

function empName(e?: ContractRef['employee']) {
  if (!e) return '';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function rowPerson(row: ServiceRow) {
  const c = row.contract;
  return (
    personName(c?.person) ||
    personName(c?.employee?.person) ||
    empName(c?.employee) ||
    '—'
  );
}

function rowDivision(row: ServiceRow) {
  return row.contract?.division?.name || row.contract?.employee?.division?.name || '—';
}

function rowMonthIso(row: ServiceRow) {
  const raw = row.month || row.contract?.startDate || '';
  return raw ? String(raw).slice(0, 10) : '';
}

function rowStatus(row: ServiceRow) {
  return row.status || row.contract?.status || 'draft';
}

function monthValue(iso?: string | null) {
  if (!iso) return '';
  const s = String(iso);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return s.slice(0, 7);
}

function toMonthDate(raw: string) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return v.slice(0, 10);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function GphServicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const numberFilter = filters.number;
  const contractIdFromUrl =
    filters.contractId || searchParams.get('contractId') || '';
  const divisionIdFilter = filters.divisionId;
  const statusFilter = filters.status;
  const monthFilter = filters.month;

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || numberFilter || contractIdFromUrl || divisionIdFilter || statusFilter || monthFilter),
  );
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [contracts, setContracts] = useState<ContractRef[]>([]);
  const [divisions, setDivisions] = useState<DivisionOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          r.code,
          r.name,
          r.contract?.number,
          rowPerson(r),
          rowDivision(r),
          STATUS_LABEL[rowStatus(r)] || rowStatus(r),
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
        String(r.contract?.number || '')
          .toLowerCase()
          .includes(nq),
      );
    }
    if (contractIdFromUrl) {
      list = list.filter((r) => r.contractId === contractIdFromUrl);
    }
    if (divisionIdFilter) {
      list = list.filter(
        (r) =>
          r.contract?.division?.id === divisionIdFilter ||
          r.contract?.employee?.division?.id === divisionIdFilter,
      );
    }
    if (statusFilter) {
      list = list.filter((r) => rowStatus(r) === statusFilter);
    }
    if (monthFilter) {
      const ym = monthValue(monthFilter);
      list = list.filter((r) => monthValue(rowMonthIso(r)) === ym);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const am = rowMonthIso(a) || '9999-12-31';
      const bm = rowMonthIso(b) || '9999-12-31';
      if (am !== bm) return am < bm ? -dir : dir;
      return String(a.contract?.number || '').localeCompare(String(b.contract?.number || ''), 'ru');
    });
  }, [
    rows,
    q,
    numberFilter,
    contractIdFromUrl,
    divisionIdFilter,
    statusFilter,
    monthFilter,
    sortDir,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, numberFilter, contractIdFromUrl, divisionIdFilter, statusFilter, monthFilter, sortDir]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (contractIdFromUrl) params.set('contractId', contractIdFromUrl);
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const data = await apiFetch<ServiceRow[]>(
        `/api/catalog/gph-services${qs ? `?${qs}` : ''}`,
      );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when API filters change
  }, [contractIdFromUrl, statusFilter]);

  useEffect(() => {
    apiFetch<ContractRef[]>('/api/catalog/gph-contracts')
      .then((d) => setContracts(Array.isArray(d) ? d : []))
      .catch(() => setContracts([]));
    apiFetch<Array<{ id: string; name: string; code?: string }>>('/api/organization/divisions')
      .then((d) =>
        setDivisions(
          (Array.isArray(d) ? d : []).map((x) => ({
            id: x.id,
            label: x.code ? `${x.code} — ${x.name}` : x.name,
          })),
        ),
      )
      .catch(() => setDivisions([]));
  }, []);

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `/catalog/gph-services?${qs}` : '/catalog/gph-services', {
      scroll: false,
    });
  }

  function applySearch() {
    patchUrl({ q: searchDraft.trim() || null });
  }

  function openCreate() {
    const c = contracts.find((x) => x.id === contractIdFromUrl);
    setEditId(null);
    setEditDefaults({
      contractId: contractIdFromUrl || '',
      month: monthValue(c?.startDate) || currentMonth(),
      unit: 'шт',
      unitPrice: '0',
      status: 'draft',
      isActive: '1',
      name: '',
      code: '',
    });
    setPanel('create');
  }

  function openEdit(row: ServiceRow) {
    setEditId(row.id);
    setEditDefaults({
      code: row.code,
      name: row.name,
      contractId: row.contractId || '',
      month: monthValue(rowMonthIso(row)) || currentMonth(),
      unitPrice: String(row.unitPrice ?? '0'),
      unit: row.unit || 'шт',
      status: rowStatus(row),
      isActive: row.isActive ? '1' : '0',
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
        code: String(fd.get('code') || '').trim() || undefined,
        name: String(fd.get('name') || '').trim() || undefined,
        contractId: fd.get('contractId') || null,
        month: toMonthDate(String(fd.get('month') || '')),
        status: fd.get('status') || 'draft',
        unitPrice: fd.get('unitPrice') ? Number(fd.get('unitPrice')) : 0,
        unit: fd.get('unit') || 'шт',
        isActive: String(fd.get('isActive')) !== '0',
      };
      if (editId) {
        await apiFetch(`/api/catalog/gph-services/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/gph-services', {
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

  async function runDelete(row: ServiceRow) {
    if (!(await confirm(`Удалить услугу ${row.contract?.number || row.code}?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/catalog/gph-services/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!(await confirm(`Удалить выбранные услуги (${ids.length})?`))) return;
    setBusy(true);
    setError('');
    try {
      for (const id of ids) {
        await apiFetch(`/api/catalog/gph-services/${id}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `gph-services-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        'Номер договора': r.contract?.number || '',
        Месяц: rowMonthIso(r) ? formatMonthRu(rowMonthIso(r)) : '',
        Подразделение: rowDivision(r),
        'Физическое лицо': rowPerson(r),
        Состояние: STATUS_LABEL[rowStatus(r)] || rowStatus(r),
        Наименование: r.name,
        Код: r.code,
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (contractIdFromUrl) params.set('contractId', contractIdFromUrl);
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      await downloadXlsxViaApi(
        `/api/catalog/gph-services/export.xlsx${qs ? `?${qs}` : ''}`,
        `gph-services-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  const contractLabel = contracts.find((c) => c.id === contractIdFromUrl);
  const allOnPageSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="gph-services" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-briefcase" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Услуги по договорам ГПХ</h1>
          <p className={shared.pageSubtitle}>
            Услуги и акты по гражданско-правовым договорам
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              {
                type: 'text',
                key: 'number',
                label: 'Номер договора',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'contractId',
                label: 'Договор',
                options: contracts.map((c) => ({
                  value: c.id,
                  label: c.number + (c.title ? ` — ${c.title}` : ''),
                })),
              },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
              },
              {
                type: 'status',
                key: 'status',
                label: 'Состояние',
                options: [
                  { value: 'draft', label: 'Черновик' },
                  { value: 'posted', label: 'Проведен' },
                  { value: 'cancelled', label: 'Отменен' },
                ],
              },
            ]}
          />
          <ListBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            actions={[
              {
                key: 'delete',
                label: 'Удалить',
                count: selected.size,
                variant: 'danger',
                onClick: () => void bulkDelete(),
              },
            ]}
          />
          {contractLabel ? (
            <span className={styles.pagerMeta}>Договор: {contractLabel.number}</span>
          ) : null}
        </div>

        <div className={styles.rightTools}>
          <label className={styles.monthFilter}>
            месяц
            <input
              type="month"
              value={monthValue(monthFilter)}
              onChange={(e) =>
                patchUrl({ month: e.target.value ? `${e.target.value}-01` : null })
              }
            />
          </label>
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
          <span className={styles.pagerMeta}>
            {paged.length}/{filtered.length}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className={styles.pagerMeta}>{Math.min(page, pageCount)}</span>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => load()} aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel !== 'none' ? (
        <FormModal
          open
          title={panel === 'edit' ? 'Изменить услугу' : 'Создать услугу'}
          width="lg"
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
              Договор
              <select
                name="contractId"
                defaultValue={editDefaults.contractId || ''}
              >
                <option value="">— без договора —</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number}
                    {c.title ? ` — ${c.title}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Месяц *
              <input
                name="month"
                type="month"
                required
                defaultValue={editDefaults.month || currentMonth()}
              />
            </label>
            <label>
              Состояние
              <select name="status" defaultValue={editDefaults.status || 'draft'}>
                <option value="draft">Черновик</option>
                <option value="posted">Проведен</option>
                <option value="cancelled">Отменен</option>
              </select>
            </label>
            <label>
              Название
              <input name="name" defaultValue={editDefaults.name || ''} placeholder="Услуга по договору ГПХ" />
            </label>
            <label>
              Код
              <input name="code" defaultValue={editDefaults.code || ''} placeholder="Авто" />
            </label>
            <label>
              Цена
              <input
                name="unitPrice"
                type="number"
                step="any"
                defaultValue={editDefaults.unitPrice || '0'}
              />
            </label>
            <label>
              Ед.
              <input name="unit" defaultValue={editDefaults.unit || 'шт'} />
            </label>
            <label>
              Активен
              <select name="isActive" defaultValue={editDefaults.isActive || '1'}>
                <option value="1">Да</option>
                <option value="0">Нет</option>
              </select>
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
              <th className={styles.checkCol}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) => setSelected(togglePage(selected, paged.map((r) => r.id), e.target.checked))}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Номер договора</th>
              <th>
                <button
                  type="button"
                  className={styles.sortBtn}
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                >
                  Месяц
                  <span className={styles.sortMark}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                </button>
              </th>
              <th>Подразделение</th>
              <th>Физическое лицо</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : null}
            {paged.map((row) => {
              const open = selectedId === row.id;
              const st = rowStatus(row);
              const monthIso = rowMonthIso(row);
              return (
                <Fragment key={row.id}>
                  <tr
                    className={open || selected.has(row.id) ? styles.rowSelected : undefined}
                    onClick={() => setSelectedId(open ? null : row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={(e) => setSelected(toggleSelect(selected, row.id, e.target.checked))}
                      />
                    </td>
                    <td className={styles.empName}>{row.contract?.number || '—'}</td>
                    <td>{monthIso ? formatMonthRu(monthIso) : '—'}</td>
                    <td>{rowDivision(row)}</td>
                    <td>{rowPerson(row)}</td>
                    <td>
                      <span
                        className={
                          st === 'posted'
                            ? styles.statusPosted
                            : st === 'cancelled'
                              ? styles.statusCancelled
                              : styles.statusDraft
                        }
                      >
                        {STATUS_LABEL[st] || st}
                      </span>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={6}>
                        <div className={styles.rowActions}>
                          <button type="button" disabled={busy} onClick={() => openEdit(row)}>
                            Изменить
                          </button>
                          {row.contractId ? (
                            <Link
                              href={`/catalog/gph-contracts?q=${encodeURIComponent(row.contract?.number || '')}`}
                            >
                              Договор {row.contract?.number || ''}
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() => runDelete(row)}
                          >
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

export default function GphServicesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <GphServicesPageInner />
    </Suspense>
  );
}
