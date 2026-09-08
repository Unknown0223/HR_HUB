'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { formatMonthRu } from '@/lib/fine-policies';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
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
const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  posted: 'Проведен',
  cancelled: 'Отменен',
};

const gphServicesListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.gph-services.v1',
  title: 'Услуги ГПХ',
  columns: [
    { key: 'contractNumber', label: 'Номер договора' },
    { key: 'month', label: 'Месяц' },
    { key: 'division', label: 'Подразделение' },
    { key: 'person', label: 'Физическое лицо' },
    { key: 'status', label: 'Состояние' },
  ],
  defaultColumns: ['contractNumber', 'month', 'division', 'person', 'status'],
  defaultSearchKeys: ['contractNumber', 'person', 'division'],
  defaultSort: [{ key: 'month', dir: 'asc' }],
  searchableKeys: ['contractNumber', 'person', 'division', 'status'],
});

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

function cellOf(row: ServiceRow, key: string): string {
  switch (key) {
    case 'contractNumber':
      return row.contract?.number || '';
    case 'month': {
      const monthIso = rowMonthIso(row);
      return monthIso ? formatMonthRu(monthIso) : '';
    }
    case 'division':
      return rowDivision(row) === '—' ? '' : rowDivision(row);
    case 'person': {
      const p = rowPerson(row);
      return p === '—' ? '' : p;
    }
    case 'status': {
      const st = rowStatus(row);
      return STATUS_LABEL[st] || st;
    }
    default:
      return '';
  }
}

function GphServicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(gphServicesListPrefs);
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);

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
    return list;
  }, [
    rows,
    q,
    numberFilter,
    contractIdFromUrl,
    divisionIdFilter,
    statusFilter,
    monthFilter,
  ]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : gphServicesListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked = displayRows.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of displayRows) {
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when API filters change
  }, [contractIdFromUrl, statusFilter]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  function closePanel() {
    setPanel('none');
    setEditId(null);
    if (searchParams.get('create') === '1') {
      patchUrl({ create: null });
    }
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
      closePanel();
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
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulkDelete() {
    const targets = displayRows.filter((r) => checked[r.id]);
    if (!targets.length) return;
    if (!(await confirm(`Удалить выбранные услуги (${targets.length})?`))) return;
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          await apiFetch(`/api/catalog/gph-services/${row.id}`, { method: 'DELETE' });
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `gph-services-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          obj[prefs.labelOf(k)] = cellOf(r, k) || '—';
        }
        return obj;
      }),
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

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="gph-services" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-concierge-bell" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Услуги ГПХ</h1>
          <p className={shared.pageSubtitle}>
            Услуги по договорам гражданско-правового характера
            {contractLabel ? ` · договор ${contractLabel.number}` : ''}
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
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            <i className="fas fa-plus" aria-hidden />
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
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
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
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>

      {error && panel === 'none' ? <p className={styles.error}>{error}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulkDelete()}
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

      <FormModal
        open={panel !== 'none'}
        title={panel === 'edit' ? 'Изменить услугу ГПХ' : 'Создать услугу ГПХ'}
        onClose={closePanel}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="gph-service-form"
              className={modal.btnPrimary}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className={modal.btnGhost} onClick={closePanel}>
              Отмена
            </button>
          </>
        }
      >
        {error ? <p className={modal.error}>{error}</p> : null}
        <form
          key={editId || 'create'}
          id="gph-service-form"
          className={modal.fields}
          onSubmit={onSubmit}
        >
          <label className={modal.field}>
            <span>Договор</span>
            <select name="contractId" defaultValue={editDefaults.contractId || ''}>
              <option value="">— без договора —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}
                  {c.title ? ` — ${c.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Месяц <em className={modal.req}>*</em>
              </span>
              <input
                name="month"
                type="month"
                required
                defaultValue={editDefaults.month || currentMonth()}
              />
            </label>
            <label className={modal.field}>
              <span>Состояние</span>
              <select name="status" defaultValue={editDefaults.status || 'draft'}>
                <option value="draft">Черновик</option>
                <option value="posted">Проведен</option>
                <option value="cancelled">Отменен</option>
              </select>
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Название</span>
              <input
                name="name"
                defaultValue={editDefaults.name || ''}
                placeholder="Услуга по договору ГПХ"
              />
            </label>
            <label className={modal.field}>
              <span>Код</span>
              <input name="code" defaultValue={editDefaults.code || ''} placeholder="Авто" />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Цена</span>
              <input
                name="unitPrice"
                type="number"
                step="any"
                defaultValue={editDefaults.unitPrice || '0'}
              />
            </label>
            <label className={modal.field}>
              <span>Ед.</span>
              <input name="unit" defaultValue={editDefaults.unit || 'шт'} />
            </label>
          </div>
          <label className={modal.field}>
            <span>Активен</span>
            <select name="isActive" defaultValue={editDefaults.isActive || '1'}>
              <option value="1">Да</option>
              <option value="0">Нет</option>
            </select>
          </label>
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
                {visibleCols.map((key) => (
                  <th key={key}>{prefs.labelOf(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && displayRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const st = rowStatus(row);
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
                          aria-label={`Выбрать ${row.contract?.number || row.code}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'contractNumber') {
                          return (
                            <td key={key} className={styles.numberCell}>
                              {row.contract?.number || '—'}
                            </td>
                          );
                        }
                        if (key === 'person') {
                          return (
                            <td key={key} className={styles.empName}>
                              {rowPerson(row)}
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key}>
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
                          );
                        }
                        return <td key={key}>{cellOf(row, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <button type="button" disabled={busy} onClick={() => openEdit(row)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            {row.contractId ? (
                              <Link
                                href={`/catalog/gph-contracts?q=${encodeURIComponent(row.contract?.number || '')}`}
                              >
                                <i className="fas fa-file-signature" aria-hidden />
                                Договор {row.contract?.number || ''}
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void runDelete(row)}
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GphServicesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <GphServicesPageInner />
    </Suspense>
  );
}
