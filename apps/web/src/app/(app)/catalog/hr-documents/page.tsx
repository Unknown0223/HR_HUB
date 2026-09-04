'use client';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch, PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
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

function HrDocumentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
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
  const [cancelTarget, setCancelTarget] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);
  const menuRef = useRef<HTMLDivElement>(null);

  const [exportBusy, setExportBusy] = useState(false);

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка действия');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `hr-documents-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        Дата: fmtDate(r.documentDate),
        Номер: r.number || '',
        Тип: typeLabel(r.type),
        Сотрудник: empFull(r.employee),
        'Таб. №': r.employee.tabNumber,
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
        Статус: r.status,
      })),
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
      <PageSubnav groupKey="hr-documents" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-file-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Все кадровые документы</h1>
          <p className={shared.pageSubtitle}>Приказы, заявления и кадровые документы организации</p>
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
              Создать +
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
        <FormModal
          open
          title={`Создать: ${typeLabel(createType)}`}
          width="lg"
          onClose={() => setPanel('none')}
        >
        <form className={styles.modalForm} onSubmit={onCreate}>
          <div className={styles.formGrid}>
            <label>
              Тип
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
            <label>
              Дата *
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
              <input name="title" defaultValue={typeLabel(createType)} key={createType} />
            </label>
            {(createType === 'hire' || createType === 'transfer') && (
              <>
                {createType === 'transfer' ? (
                  <>
                    <label>
                      Перевод с
                      <input
                        name="transferFrom"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                      />
                    </label>
                    <label>
                      Перевод по
                      <input name="transferTo" type="date" />
                    </label>
                  </>
                ) : null}
                <label>
                  Подразделение
                  <select name="divisionId" defaultValue="">
                    <option value="">—</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Должность
                  <select name="positionId" defaultValue="">
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
              </>
            )}
            {createType === 'dismiss' ? (
              <label>
                Причина увольнения *
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
                <label>
                  Новая фамилия *
                  <input name="newLastName" required />
                </label>
                <label>
                  Новое имя *
                  <input name="newFirstName" required />
                </label>
                <label>
                  Новое отчество
                  <input name="newMiddleName" />
                </label>
              </>
            ) : null}
            {createType === 'wage_change' ? (
              <label>
                Новая сумма *
                <input name="newAmount" type="number" min={0} step="0.01" required />
              </label>
            ) : null}
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
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Дата ↑</th>
              <th>Номер</th>
              <th>Тип документа</th>
              <th>Сотрудники</th>
              <th>Проведен</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
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
                    <td>{typeLabel(row.type)}</td>
                    <td className={styles.empName}>{empFull(row.employee)}</td>
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
                      <td colSpan={6}>
                        <div className={styles.rowActions}>
                          <Link href={docViewHref(row)}>Просмотреть</Link>
                          {row.status === 'draft' ? (
                            <Link href={`${docViewHref(row)}?mode=edit`}>
                              Изменить
                            </Link>
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
                          <Link href={`${docViewHref(row)}?side=history`}>
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

export default function HrDocumentsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <HrDocumentsPageInner />
    </Suspense>
  );
}
