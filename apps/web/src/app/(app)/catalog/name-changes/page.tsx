'use client';

import { confirm } from '@/lib/dialogs';
import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import type { ColumnDef } from '@/lib/catalog-columns';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import modal from '@/components/form-modal.module.css';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber: string;
};

type NameChangeRow = {
  id: string;
  employeeId: string;
  status: string;
  oldLastName: string;
  oldFirstName: string;
  oldMiddleName?: string | null;
  newLastName: string;
  newFirstName: string;
  newMiddleName?: string | null;
  effectiveAt: string;
  documentNumber?: string | null;
  note?: string | null;
  postedAt?: string | null;
  employee?: EmpRef | null;
};

type EmpOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'number', 'posted', 'from', 'to', 'employeeId', 'oldName'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

const NAME_CHANGE_COLUMNS: ColumnDef[] = [
  { key: 'effectiveAt', label: 'Дата' },
  { key: 'number', label: 'Номер' },
  { key: 'employee', label: 'Сотрудники' },
  { key: 'prevNames', label: 'Предыдущие имена' },
  { key: 'nextNames', label: 'Новые имена' },
  { key: 'posted', label: 'Проведен' },
];

const nameChangePrefsCfg = prefsConfigFromColumns({
  storageKey: 'hrhub.table.name-changes.v1',
  title: 'Изменение имени',
  columns: NAME_CHANGE_COLUMNS,
  defaultColumns: NAME_CHANGE_COLUMNS.map((c) => c.key),
  defaultSearchKeys: ['number', 'employee', 'prevNames', 'nextNames'],
  defaultSort: [{ key: 'effectiveAt', dir: 'desc' }],
});

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fullName(parts: {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}) {
  return [parts.lastName, parts.firstName, parts.middleName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function empName(e?: EmpRef | null) {
  if (!e) return '—';
  return fullName(e);
}

function prevNames(row: NameChangeRow) {
  return fullName({
    lastName: row.oldLastName,
    firstName: row.oldFirstName,
    middleName: row.oldMiddleName,
  });
}

function nextNames(row: NameChangeRow) {
  return fullName({
    lastName: row.newLastName,
    firstName: row.newFirstName,
    middleName: row.newMiddleName,
  });
}

function isPosted(row: NameChangeRow) {
  return row.status === 'posted';
}

function canPost(row: NameChangeRow) {
  return row.status === 'draft';
}

function canCancel(row: NameChangeRow) {
  return row.status === 'draft' || row.status === 'posted';
}

function canDelete(row: NameChangeRow) {
  return row.status !== 'posted';
}

function cellOf(row: NameChangeRow, key: string): string {
  switch (key) {
    case 'effectiveAt':
      return fmtDate(row.effectiveAt);
    case 'number':
      return row.documentNumber || '';
    case 'employee':
      return empName(row.employee);
    case 'prevNames':
      return prevNames(row);
    case 'nextNames':
      return nextNames(row);
    case 'posted':
      if (isPosted(row)) return 'Да';
      if (row.status === 'cancelled') return 'Отм.';
      return 'Нет';
    default:
      return '';
  }
}

function NameChangesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(nameChangePrefsCfg);
  const q = filters.q;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const postedFilter = filters.posted;
  const employeeIdFilter = filters.employeeId;
  const oldNameFilter = filters.oldName;

  const [rows, setRows] = useState<NameChangeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || from || to || numberFilter || postedFilter || employeeIdFilter || oldNameFilter),
  );
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
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
          prevNames(r),
          r.newLastName,
          r.newFirstName,
          r.employee?.tabNumber,
          r.note,
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
    if (oldNameFilter.trim()) {
      const oq = oldNameFilter.trim().toLowerCase();
      list = list.filter((r) => prevNames(r).toLowerCase().includes(oq));
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
  }, [
    rows,
    q,
    numberFilter,
    employeeIdFilter,
    oldNameFilter,
    postedFilter,
    from,
    to,
  ]);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : nameChangePrefsCfg.defaultColumns;

  const sorted = useMemo(
    () => prefs.applySortToRows(filtered, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );
  const colCount = 1 + visibleCols.length;
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const checkedRows = useMemo(
    () => sorted.filter((r) => checked[r.id]),
    [sorted, checked],
  );

  const allPageChecked = pageRows.length > 0 && pageRows.every((r) => checked[r.id]);
  const somePageChecked = pageRows.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<NameChangeRow[]>('/api/catalog/name-changes');
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
    apiFetch<{ employees?: EmpOpt[] }>('/api/catalog/lookups')
      .then((d) => setEmployees(d.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [q, numberFilter, employeeIdFilter, oldNameFilter, postedFilter, from, to, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/name-changes?${qs}` : '/catalog/name-changes', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setError('');
    setEditDefaults({
      effectiveAt: new Date().toISOString().slice(0, 10),
    });
    setPanel('create');
  }

  function openEdit(row: NameChangeRow) {
    setEditId(row.id);
    setError('');
    setEditDefaults({
      employeeId: row.employeeId,
      oldLastName: row.oldLastName,
      oldFirstName: row.oldFirstName,
      oldMiddleName: row.oldMiddleName || '',
      newLastName: row.newLastName,
      newFirstName: row.newFirstName,
      newMiddleName: row.newMiddleName || '',
      effectiveAt: String(row.effectiveAt).slice(0, 10),
      documentNumber: row.documentNumber || '',
      note: row.note || '',
    });
    setPanel('edit');
  }

  function closePanel() {
    setPanel('none');
    setEditId(null);
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
        newLastName: fd.get('newLastName'),
        newFirstName: fd.get('newFirstName'),
        newMiddleName: fd.get('newMiddleName') || undefined,
        effectiveAt: fd.get('effectiveAt'),
        documentNumber: fd.get('documentNumber') || undefined,
        note: fd.get('note') || undefined,
      };
      const oldL = String(fd.get('oldLastName') || '').trim();
      const oldF = String(fd.get('oldFirstName') || '').trim();
      if (oldL) body.oldLastName = oldL;
      if (oldF) body.oldFirstName = oldF;
      const oldM = String(fd.get('oldMiddleName') || '').trim();
      if (oldM) body.oldMiddleName = oldM;

      if (editId) {
        await apiFetch(`/api/catalog/name-changes/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/name-changes', {
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

  async function runAction(row: NameChangeRow, action: 'post' | 'cancel' | 'delete') {
    if (action === 'delete') {
      if (!(await confirm(`Удалить документ ${row.documentNumber || row.id}?`))) return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        await apiFetch(`/api/catalog/name-changes/${row.id}`, {
          method: 'DELETE',
        });
      } else {
        await apiFetch(`/api/catalog/name-changes/${row.id}/${action}`, {
          method: 'POST',
        });
      }
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

  async function runBulk(action: 'post' | 'cancel' | 'delete') {
    const targets = checkedRows.filter((r) =>
      action === 'post' ? canPost(r) : action === 'cancel' ? canCancel(r) : canDelete(r),
    );
    if (targets.length === 0) {
      setError(
        action === 'post'
          ? 'Нет черновиков среди выбранных'
          : action === 'cancel'
            ? 'Нет документов для отмены среди выбранных'
            : 'Нет документов для удаления среди выбранных',
      );
      return;
    }

    const question =
      action === 'post'
        ? `Провести выбранные документы (${targets.length} шт.)?`
        : action === 'cancel'
          ? `Отменить выбранные документы (${targets.length} шт.)?`
          : `Удалить выбранные документы (${targets.length} шт.)?`;
    if (!(await confirm(question))) return;

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/name-changes/${row.id}`, {
              method: 'DELETE',
            });
          } else {
            await apiFetch(`/api/catalog/name-changes/${row.id}/${action}`, {
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
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `name-changes-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = cellOf(r, k);
        return obj;
      }),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/catalog/name-changes/export.xlsx',
        `name-changes-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="name-changes" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeHr}`}>
          <i className="fas fa-signature" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Реестр изменения имени</h1>
          <p className={shared.pageSubtitle}>
            Документы смены ФИО сотрудников и их проведение
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
                label: 'Сотрудники',
                options: employees.map((e) => ({ value: e.id, label: e.label })),
              },
              {
                type: 'text',
                key: 'oldName',
                label: 'Предыдущие имена',
                placeholder: 'Поиск...',
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
          <span className={styles.countBadge}>
            {pageRows.length} / {rows.length}
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
            onClick={() => void runBulk('cancel')}
          >
            <i className="fas fa-ban" aria-hidden />
            Отменить
          </button>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void runBulk('delete')}
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
        title={panel === 'edit' ? 'Изменить документ' : 'Создать изменение имени'}
        onClose={closePanel}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="name-change-form"
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
          id="name-change-form"
          key={editId ?? 'create'}
          className={modal.fields}
          onSubmit={onSubmit}
        >
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Дата <em className={modal.req}>*</em>
              </span>
              <input
                name="effectiveAt"
                type="date"
                required
                defaultValue={editDefaults.effectiveAt || ''}
              />
            </label>
            <label className={modal.field}>
              <span>Номер</span>
              <input
                name="documentNumber"
                placeholder="авто"
                defaultValue={editDefaults.documentNumber || ''}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>
              Сотрудник <em className={modal.req}>*</em>
            </span>
            <select name="employeeId" required defaultValue={editDefaults.employeeId || ''}>
              <option value="">— выберите —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Новая фамилия <em className={modal.req}>*</em>
              </span>
              <input
                name="newLastName"
                required
                defaultValue={editDefaults.newLastName || ''}
              />
            </label>
            <label className={modal.field}>
              <span>
                Новое имя <em className={modal.req}>*</em>
              </span>
              <input
                name="newFirstName"
                required
                defaultValue={editDefaults.newFirstName || ''}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>Новое отчество</span>
            <input name="newMiddleName" defaultValue={editDefaults.newMiddleName || ''} />
          </label>
          {panel === 'edit' ? (
            <>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>Пред. фамилия</span>
                  <input
                    name="oldLastName"
                    defaultValue={editDefaults.oldLastName || ''}
                  />
                </label>
                <label className={modal.field}>
                  <span>Пред. имя</span>
                  <input
                    name="oldFirstName"
                    defaultValue={editDefaults.oldFirstName || ''}
                  />
                </label>
              </div>
              <label className={modal.field}>
                <span>Пред. отчество</span>
                <input
                  name="oldMiddleName"
                  defaultValue={editDefaults.oldMiddleName || ''}
                />
              </label>
            </>
          ) : null}
          <label className={modal.field}>
            <span>Примечание</span>
            <input name="note" defaultValue={editDefaults.note || ''} />
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
              {loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
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
                          aria-label={`Выбрать ${row.documentNumber || row.id}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'employee') {
                          return (
                            <td key={key} className={styles.empName}>
                              {cellOf(row, key) || '—'}
                            </td>
                          );
                        }
                        if (key === 'nextNames') {
                          return (
                            <td key={key} className={styles.newName}>
                              {cellOf(row, key) || '—'}
                            </td>
                          );
                        }
                        if (key === 'posted') {
                          return (
                            <td key={key}>
                              {isPosted(row) ? (
                                <span className={styles.postedYes}>Да</span>
                              ) : (
                                <span className={styles.postedNo}>
                                  {row.status === 'cancelled' ? 'Отм.' : 'Нет'}
                                </span>
                              )}
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
                            {canPost(row) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'post')}
                              >
                                <i className="fas fa-check" aria-hidden />
                                Провести
                              </button>
                            ) : null}
                            {canCancel(row) ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'cancel')}
                              >
                                <i className="fas fa-ban" aria-hidden />
                                Отменить
                              </button>
                            ) : null}
                            {row.status === 'draft' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openEdit(row)}
                              >
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                            ) : null}
                            <Link href={`/employees/${row.employeeId}`}>
                              <i className="fas fa-id-card" aria-hidden />
                              Карточка
                            </Link>
                            {canDelete(row) ? (
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => void runAction(row, 'delete')}
                              >
                                <i className="fas fa-trash" aria-hidden />
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
    </div>
  );
}

export default function NameChangesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <NameChangesPageInner />
    </Suspense>
  );
}
