'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type AbsenceMeta = {
  number?: string;
  documentType?: string;
  documentDate?: string;
  requestDate?: string;
  [key: string]: unknown;
};

type AbsenceRow = {
  id: string;
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  status: string;
  note?: string | null;
  meta?: AbsenceMeta | null;
  createdAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber: string;
  } | null;
  absenceType?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

type EmpOpt = { id: string; label: string; tabNumber?: string };
type TypeOpt = { id: string; code: string; name: string };

const FILTER_KEYS = [
  'q',
  'number',
  'posted',
  'from',
  'to',
  'employeeId',
  'documentType',
] as const;

const DOC_TYPE_PRESETS = [
  { label: 'Больничный лист', documentType: 'Больничный лист', typeCode: 'SICK', batch: false },
  {
    label: 'Больничный лист списком',
    documentType: 'Больничный лист',
    typeCode: 'SICK',
    batch: true,
  },
  { label: 'Отпуск', documentType: 'Отпуск', typeCode: 'VAC', batch: false },
  { label: 'Отпуск списком', documentType: 'Отпуск', typeCode: 'VAC', batch: true },
] as const;

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function metaOf(row: AbsenceRow): AbsenceMeta {
  const m = row.meta;
  if (m && typeof m === 'object' && !Array.isArray(m)) return m;
  return {};
}

function rowNumber(row: AbsenceRow) {
  return String(metaOf(row).number || '—');
}

function rowDocType(row: AbsenceRow) {
  return String(metaOf(row).documentType || row.absenceType?.name || '—');
}

function rowDocDate(row: AbsenceRow) {
  const m = metaOf(row);
  return m.documentDate || m.requestDate || row.createdAt;
}

function empFull(e?: AbsenceRow['employee']) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function isPosted(row: AbsenceRow) {
  return row.status === 'approved';
}

function AbsencesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const postedFilter = filters.posted;
  const employeeIdFilter = filters.employeeId;
  const documentTypeFilter = filters.documentType;

  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      from ||
        to ||
        q ||
        numberFilter ||
        postedFilter ||
        employeeIdFilter ||
        documentTypeFilter,
    ),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [batchMode, setBatchMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<TypeOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(q);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const blob = [
          rowNumber(r),
          rowDocType(r),
          empFull(r.employee),
          r.employee?.tabNumber,
          r.note,
          r.absenceType?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(qq);
      });
    }
    if (numberFilter.trim()) {
      const nq = numberFilter.trim().toLowerCase();
      list = list.filter((r) => rowNumber(r).toLowerCase().includes(nq));
    }
    if (employeeIdFilter) {
      list = list.filter((r) => r.employeeId === employeeIdFilter);
    }
    if (documentTypeFilter.trim()) {
      const dq = documentTypeFilter.trim().toLowerCase();
      list = list.filter((r) => rowDocType(r).toLowerCase().includes(dq));
    }
    if (postedFilter === 'yes') {
      list = list.filter((r) => isPosted(r));
    } else if (postedFilter === 'no') {
      list = list.filter((r) => !isPosted(r));
    }
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(rowDocDate(r)).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(rowDocDate(r)).getTime() <= t);
    }
    return list;
  }, [
    rows,
    q,
    numberFilter,
    employeeIdFilter,
    documentTypeFilter,
    postedFilter,
    from,
    to,
  ]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AbsenceRow[]>('/api/hr/absences');
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
    apiFetch<TypeOpt[]>('/api/hr/absence-types')
      .then((d) => setAbsenceTypes(Array.isArray(d) ? d : []))
      .catch(() => setAbsenceTypes([]));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/absences?${qs}` : '/catalog/absences', {
      scroll: false,
    });
  }

  function openCreate(preset?: (typeof DOC_TYPE_PRESETS)[number]) {
    setEditId(null);
    const type =
      absenceTypes.find((t) => t.code === preset?.typeCode) || absenceTypes[0];
    setBatchMode(Boolean(preset?.batch));
    setEditDefaults({
      documentDate: new Date().toISOString().slice(0, 10),
      documentType: preset?.documentType || 'Отпуск',
      absenceTypeId: type?.id || '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    });
    setPanel('create');
    setMenuOpen(false);
  }

  function openEdit(row: AbsenceRow) {
    const m = metaOf(row);
    setEditId(row.id);
    setBatchMode(false);
    setEditDefaults({
      employeeId: row.employeeId,
      absenceTypeId: row.absenceTypeId,
      startDate: String(row.startDate).slice(0, 10),
      endDate: String(row.endDate).slice(0, 10),
      number: String(m.number || ''),
      documentType: rowDocType(row),
      documentDate: String(rowDocDate(row)).slice(0, 10),
      note: row.note || '',
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
      const shared = {
        absenceTypeId: fd.get('absenceTypeId'),
        startDate: fd.get('startDate'),
        endDate: fd.get('endDate'),
        number: fd.get('number') || undefined,
        documentType: fd.get('documentType') || undefined,
        documentDate: fd.get('documentDate') || undefined,
        note: fd.get('note') || undefined,
        status: 'draft',
      };

      if (editId) {
        await apiFetch(`/api/hr/absences/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...shared,
            employeeId: fd.get('employeeId'),
          }),
        });
      } else if (batchMode) {
        const ids = fd.getAll('employeeIds').map(String).filter(Boolean);
        if (ids.length === 0) throw new Error('Выберите хотя бы одного сотрудника');
        for (const employeeId of ids) {
          await apiFetch('/api/hr/absences', {
            method: 'POST',
            body: JSON.stringify({ ...shared, employeeId }),
          });
        }
      } else {
        await apiFetch('/api/hr/absences', {
          method: 'POST',
          body: JSON.stringify({
            ...shared,
            employeeId: fd.get('employeeId'),
          }),
        });
      }
      form.reset();
      setPanel('none');
      setEditId(null);
      setBatchMode(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(row: AbsenceRow, action: 'post' | 'unpost' | 'delete') {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm(`Удалить отсутствие ${rowNumber(row)}?`))) return;
        await apiFetch(`/api/hr/absences/${row.id}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/hr/absences/${row.id}/${action}`, {
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
      `absences-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Дата: fmtDate(rowDocDate(r)),
        Номер: rowNumber(r),
        'Тип документа': rowDocType(r),
        'Табельный номер': r.employee?.tabNumber || '',
        Сотрудник: empFull(r.employee),
        'Дата начала': fmtDate(r.startDate),
        'Дата окончания': fmtDate(r.endDate),
        Проведен: isPosted(r) ? 'Да' : 'Нет',
      })),
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="absences" />

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <div className={styles.createWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setMenuOpen((v) => !v)}
            >
              Создать ▾
            </button>
            {menuOpen ? (
              <div className={styles.createMenu}>
                {DOC_TYPE_PRESETS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => openCreate(item)}
                  >
                    {item.label}
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
                key: 'documentType',
                label: 'Тип документа',
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
          <button type="button" className={styles.toolBtn} onClick={() => load()}>
            Обновить
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel !== 'none' ? (
        <form className={styles.panel} onSubmit={onSubmit}>
          <h2 className={styles.panelTitle}>
            {panel === 'edit'
              ? 'Изменить отсутствие'
              : batchMode
                ? 'Создать отсутствие списком'
                : 'Создать отсутствие'}
          </h2>
          <div className={styles.formGrid}>
            <label>
              Дата *
              <input
                name="documentDate"
                type="date"
                required
                defaultValue={editDefaults.documentDate || ''}
              />
            </label>
            <label>
              Номер
              <input
                name="number"
                placeholder="авто"
                defaultValue={editDefaults.number || ''}
              />
            </label>
            <label>
              Тип документа *
              <input
                name="documentType"
                required
                defaultValue={editDefaults.documentType || ''}
                list="absence-doc-types"
              />
              <datalist id="absence-doc-types">
                {DOC_TYPE_PRESETS.map((t) => (
                  <option key={t.label} value={t.documentType} />
                ))}
              </datalist>
            </label>
            <label>
              Вид отсутствия *
              <select
                name="absenceTypeId"
                required
                defaultValue={editDefaults.absenceTypeId || ''}
              >
                <option value="">— выберите —</option>
                {absenceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {batchMode && panel === 'create' ? (
              <label style={{ gridColumn: '1 / -1' }}>
                Сотрудники *
                <select
                  name="employeeIds"
                  multiple
                  required
                  size={Math.min(8, Math.max(4, employees.length))}
                  style={{ minHeight: 120 }}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
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
            )}
            <label>
              Дата начала *
              <input
                name="startDate"
                type="date"
                required
                defaultValue={editDefaults.startDate || ''}
              />
            </label>
            <label>
              Дата окончания *
              <input
                name="endDate"
                type="date"
                required
                defaultValue={editDefaults.endDate || ''}
              />
            </label>
            <label>
              Примечание
              <input name="note" defaultValue={editDefaults.note || ''} />
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
                setBatchMode(false);
              }}
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
              <th>Тип документа</th>
              <th>Табельный номер</th>
              <th>Сотрудник</th>
              <th>Дата начала</th>
              <th>Дата окончания</th>
              <th>Проведен</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
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
                    <td>{fmtDate(rowDocDate(row))}</td>
                    <td>{rowNumber(row)}</td>
                    <td>{rowDocType(row)}</td>
                    <td>{row.employee?.tabNumber || '—'}</td>
                    <td className={styles.empName}>{empFull(row.employee)}</td>
                    <td>{fmtDate(row.startDate)}</td>
                    <td>{fmtDate(row.endDate)}</td>
                    <td>
                      {isPosted(row) ? (
                        <span className={styles.postedYes}>Да</span>
                      ) : (
                        <span className={styles.postedNo}>Нет</span>
                      )}
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.actionsRow}>
                      <td colSpan={9}>
                        <div className={styles.rowActions}>
                          {!isPosted(row) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'post')}
                            >
                              Провести
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(row, 'unpost')}
                            >
                              Отменить проведение
                            </button>
                          )}
                          {!isPosted(row) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openEdit(row)}
                            >
                              Изменить
                            </button>
                          ) : null}
                          <Link href={`/employees/${row.employeeId}?tab=absences`}>
                            Карточка
                          </Link>
                          {!isPosted(row) || row.status === 'cancelled' ? (
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

export default function AbsencesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <AbsencesPageInner />
    </Suspense>
  );
}
