'use client';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { apiFetch, PageResult } from '@/lib/api';
import type { ColumnDef } from '@/lib/catalog-columns';
import { downloadCsv } from '@/lib/csv';
import { confirm } from '@/lib/dialogs';
import { downloadXlsxViaApi } from '@/lib/excel';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type EmpOpt = {
  id: string;
  label: string;
  firstName?: string;
  lastName?: string;
  tabNumber?: string;
};

type DocRow = {
  id: string;
  type: string;
  status: string;
  number?: string | null;
  title: string;
  documentDate: string;
  postedAt?: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber: string;
  };
};

type Division = { id: string; name: string };
type Position = { id: string; name: string };

const FILTER_KEYS = ['q', 'type', 'status', 'posted', 'from', 'to'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

const HR_DOC_COLUMNS: ColumnDef[] = [
  { key: 'documentDate', label: 'Дата' },
  { key: 'number', label: 'Номер' },
  { key: 'type', label: 'Тип документа' },
  { key: 'employee', label: 'Сотрудники' },
  { key: 'posted', label: 'Проведен' },
];

const hrDocPrefsCfg = prefsConfigFromColumns({
  storageKey: 'hrhub.table.hr-documents.v1',
  title: 'Кадровые документы',
  columns: HR_DOC_COLUMNS,
  defaultColumns: HR_DOC_COLUMNS.map((c) => c.key),
  defaultSearchKeys: ['number', 'type', 'employee'],
  defaultSort: [{ key: 'documentDate', dir: 'desc' }],
});

const DOC_TYPES = [
  { value: 'hire', label: 'Прием на работу' },
  { value: 'dismiss', label: 'Увольнение' },
  { value: 'transfer', label: 'Кадровый перевод' },
  { value: 'name_change', label: 'Изменение имени' },
  { value: 'wage_change', label: 'Изменение оплаты труда' },
  { value: 'other', label: 'Прочее' },
] as const;

function typeLabel(t: string) {
  return DOC_TYPES.find((x) => x.value === t)?.label || t;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function empFull(e: DocRow['employee']) {
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function docViewHref(row: DocRow) {
  return `/employees/${row.employee.id}/documents/${row.type === 'hire' ? 'hire' : row.id}`;
}

function cellOf(row: DocRow, key: string): string {
  switch (key) {
    case 'documentDate':
      return fmtDate(row.documentDate);
    case 'number':
      return row.number || '';
    case 'type':
      return typeLabel(row.type);
    case 'employee':
      return empFull(row.employee);
    case 'posted':
      if (row.status === 'posted') return 'Да';
      if (row.status === 'cancelled') return 'Отм.';
      return 'Нет';
    default:
      return '';
  }
}

function HrDocumentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(hrDocPrefsCfg);
  const q = filters.q;
  const type = filters.type || searchParams.get('type') || '';
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
    Boolean(type || status || posted || from || to || q),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'create'>('none');
  const [createType, setCreateType] = useState<string>('hire');
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [dismissalReasons, setDismissalReasons] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [cancelTarget, setCancelTarget] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const menuRef = useRef<HTMLDivElement>(null);

  const [exportBusy, setExportBusy] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : hrDocPrefsCfg.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (type) p.set('type', type);
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
  }, [q, type, status, posted, from, to, page, pageSize]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(rows, cellOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, prefs.state.sort],
  );

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked =
    displayRows.some((r) => checked[r.id]) && !allPageChecked;

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

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
  }, [q, type, status, from, to, pageSize]);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    setChecked({});
  }, [query]);

  useEffect(() => {
    if (searchParams.get('type') === 'transfer') {
      const p = new URLSearchParams(searchParams.toString());
      p.delete('type');
      const qs = p.toString();
      router.replace(`/catalog/transfers${qs ? `?${qs}` : ''}`);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setCreateType(searchParams.get('type') || 'hire');
      setPanel('create');
    }
  }, [searchParams]);

  useEffect(() => {
    apiFetch<{
      employees?: EmpOpt[];
      divisions?: { id: string; label: string }[];
      positions?: { id: string; label: string }[];
      dismissalReasons?: { id: string; label: string }[];
    }>('/api/catalog/lookups')
      .then((lookups) => {
        setEmployees(lookups.employees || []);
        setDivisions(
          (lookups.divisions || []).map((d) => ({ id: d.id, name: d.label })),
        );
        setPositions(
          (lookups.positions || []).map((p) => ({ id: p.id, name: p.label })),
        );
        setDismissalReasons(
          (lookups.dismissalReasons || []).map((r) => ({
            id: r.id,
            name: r.label,
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function applySearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) p.set('q', searchDraft.trim());
    else p.delete('q');
    router.push(`/catalog/hr-documents?${p.toString()}`);
  }

  function openCreate(docType: string) {
    setCreateType(docType);
    setPanel('create');
    setMenuOpen(false);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setSaving(true);
    setError('');
    try {
      const docType = String(fd.get('type') || createType);
      const payload: Record<string, unknown> = {};
      const divisionId = String(fd.get('divisionId') || '');
      const positionId = String(fd.get('positionId') || '');
      const baseSalary = String(fd.get('baseSalary') || '');
      const dismissalReasonId = String(fd.get('dismissalReasonId') || '');
      const newLastName = String(fd.get('newLastName') || '').trim();
      const newFirstName = String(fd.get('newFirstName') || '').trim();
      const newMiddleName = String(fd.get('newMiddleName') || '').trim();
      const newAmount = String(fd.get('newAmount') || '');
      const transferFrom = String(fd.get('transferFrom') || '');
      const transferTo = String(fd.get('transferTo') || '');

      if (divisionId) payload.divisionId = divisionId;
      if (positionId) payload.positionId = positionId;
      if (baseSalary) payload.baseSalary = Number(baseSalary);
      if (dismissalReasonId) payload.dismissalReasonId = dismissalReasonId;
      if (newLastName) payload.newLastName = newLastName;
      if (newFirstName) payload.newFirstName = newFirstName;
      if (newMiddleName) payload.newMiddleName = newMiddleName;
      if (newAmount) payload.newAmount = Number(newAmount);
      if (transferFrom) payload.transferFrom = transferFrom;
      if (transferTo) payload.transferTo = transferTo;

      if (docType === 'dismiss' && !dismissalReasonId) {
        throw new Error('Укажите причину увольнения');
      }
      if (docType === 'name_change' && (!newLastName || !newFirstName)) {
        throw new Error('Укажите новую фамилию и имя');
      }
      if (docType === 'wage_change' && !newAmount) {
        throw new Error('Укажите новую сумму');
      }
      if (docType === 'transfer' && !divisionId && !positionId) {
        throw new Error('Укажите подразделение и/или должность');
      }

      const created = await apiFetch<DocRow>('/api/hr/documents', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: fd.get('employeeId'),
          type: docType,
          title: fd.get('title') || typeLabel(docType),
          documentDate: fd.get('documentDate'),
          number: fd.get('number') || undefined,
          note: fd.get('note') || undefined,
          payload: Object.keys(payload).length ? payload : undefined,
        }),
      });
      form.reset();
      setPanel('none');
      await load();
      if (created?.id && created.employee?.id) {
        router.push(
          `/employees/${created.employee.id}/documents/${
            created.type === 'hire' ? 'hire' : created.id
          }?mode=edit`,
        );
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
        !(await confirm(`Отменить выбранные документы (${targets.length} шт.)?`))
      ) {
        return;
      }
    } else if (action === 'post') {
      if (targets.every((r) => r.status !== 'draft')) {
        setError('Нет черновиков среди выбранных');
        return;
      }
    } else if (action === 'unpost') {
      if (targets.every((r) => r.status !== 'posted')) {
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
            if (row.status !== 'posted') continue;
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
      `hr-documents-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
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
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (type) p.set('type', type);
      if (status) p.set('status', status);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const qs = p.toString();
      await downloadXlsxViaApi(
        `/api/hr/documents/export.xlsx${qs ? `?${qs}` : ''}`,
        `hr-documents-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
      <PageSubnav groupKey="hr-documents" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-file-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Все кадровые документы</h1>
          <p className={shared.pageSubtitle}>Приказы, заявления и кадровые документы организации</p>
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
          <div className={styles.createWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать
            </button>
            {menuOpen ? (
              <div className={styles.createMenu}>
                {DOC_TYPES.map((t) => (
                  <button key={t.value} type="button" onClick={() => openCreate(t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
                type: 'select',
                key: 'type',
                label: 'Тип документа',
                options: DOC_TYPES.map((t) => ({ value: t.value, label: t.label })),
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
        title={`Создать: ${typeLabel(createType)}`}
        onClose={() => setPanel('none')}
        width="lg"
        footer={
          <>
            <button
              type="submit"
              form="hr-doc-create-form"
              className={modal.btnPrimary}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setPanel('none')}
            >
              Отмена
            </button>
          </>
        }
      >
        {error && panel === 'create' ? (
          <p className={modal.error}>{error}</p>
        ) : null}
        <form id="hr-doc-create-form" className={modal.fields} onSubmit={onCreate}>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Тип</span>
              <select
                name="type"
                value={createType}
                required
                onChange={(e) => setCreateType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={modal.field}>
              <span>
                Дата <em className={modal.req}>*</em>
              </span>
              <input
                name="documentDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Номер</span>
              <input name="number" placeholder="авто" />
            </label>
            <label className={modal.field}>
              <span>
                Сотрудник <em className={modal.req}>*</em>
              </span>
              <select name="employeeId" required defaultValue="">
                <option value="">— выберите —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={modal.field}>
            <span>Заголовок</span>
            <input name="title" defaultValue={typeLabel(createType)} key={createType} />
          </label>
          {createType === 'transfer' ? (
            <div className={modal.row2}>
              <label className={modal.field}>
                <span>Перевод с</span>
                <input
                  name="transferFrom"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label className={modal.field}>
                <span>Перевод по</span>
                <input name="transferTo" type="date" />
              </label>
            </div>
          ) : null}
          {createType === 'hire' || createType === 'transfer' ? (
            <>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>Подразделение</span>
                  <select name="divisionId" defaultValue="">
                    <option value="">—</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={modal.field}>
                  <span>Должность</span>
                  <select name="positionId" defaultValue="">
                    <option value="">—</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={modal.field}>
                <span>Оклад</span>
                <input name="baseSalary" type="number" min={0} step="0.01" />
              </label>
            </>
          ) : null}
          {createType === 'dismiss' ? (
            <label className={modal.field}>
              <span>
                Причина увольнения <em className={modal.req}>*</em>
              </span>
              <select name="dismissalReasonId" required defaultValue="">
                <option value="">— выберите —</option>
                {dismissalReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {createType === 'name_change' ? (
            <>
              <div className={modal.row2}>
                <label className={modal.field}>
                  <span>
                    Новая фамилия <em className={modal.req}>*</em>
                  </span>
                  <input name="newLastName" required />
                </label>
                <label className={modal.field}>
                  <span>
                    Новое имя <em className={modal.req}>*</em>
                  </span>
                  <input name="newFirstName" required />
                </label>
              </div>
              <label className={modal.field}>
                <span>Новое отчество</span>
                <input name="newMiddleName" />
              </label>
            </>
          ) : null}
          {createType === 'wage_change' ? (
            <label className={modal.field}>
              <span>
                Новая сумма <em className={modal.req}>*</em>
              </span>
              <input name="newAmount" type="number" min={0} step="0.01" required />
            </label>
          ) : null}
          <label className={modal.field}>
            <span>Примечание</span>
            <input name="note" />
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
                          aria-label={`Выбрать ${row.number || row.id}`}
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
                        if (key === 'posted') {
                          return (
                            <td key={key}>
                              {row.status === 'posted' ? (
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
                            <Link href={docViewHref(row)}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            {row.status === 'draft' ? (
                              <Link href={`${docViewHref(row)}?mode=edit`}>
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
                            <Link href={`${docViewHref(row)}?side=history`}>
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

export default function HrDocumentsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <HrDocumentsPageInner />
    </Suspense>
  );
}
