'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
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

function isPosted(row: NameChangeRow) {
  return row.status === 'posted';
}

function NameChangesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
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
  const [exportBusy, setExportBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);

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
    setEditDefaults({
      effectiveAt: new Date().toISOString().slice(0, 10),
    });
    setPanel('create');
  }

  function openEdit(row: NameChangeRow) {
    setEditId(row.id);
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
      setPanel('none');
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    row: NameChangeRow,
    action: 'post' | 'cancel' | 'delete',
  ) {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm(`Удалить документ ${row.documentNumber || row.id}?`))) return;
        await apiFetch(`/api/catalog/name-changes/${row.id}`, {
          method: 'DELETE',
        });
      } else {
        await apiFetch(`/api/catalog/name-changes/${row.id}/${action}`, {
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
      `name-changes-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Дата: fmtDate(r.effectiveAt),
        Номер: r.documentNumber || '',
        Сотрудники: empName(r.employee),
        'Предыдущие имена': prevNames(r),
        Проведен: isPosted(r) ? 'Да' : 'Нет',
      })),
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
      <PageSubnav groupKey="name-changes" />

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
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {panel !== 'none' ? (
        <form className={styles.panel} onSubmit={onSubmit}>
          <h2 className={styles.panelTitle}>
            {panel === 'edit' ? 'Изменить документ' : 'Создать изменение имени'}
          </h2>
          <div className={styles.formGrid}>
            <label>
              Дата *
              <input
                name="effectiveAt"
                type="date"
                required
                defaultValue={editDefaults.effectiveAt || ''}
              />
            </label>
            <label>
              Номер
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
              Новая фамилия *
              <input
                name="newLastName"
                required
                defaultValue={editDefaults.newLastName || ''}
              />
            </label>
            <label>
              Новое имя *
              <input
                name="newFirstName"
                required
                defaultValue={editDefaults.newFirstName || ''}
              />
            </label>
            <label>
              Новое отчество
              <input
                name="newMiddleName"
                defaultValue={editDefaults.newMiddleName || ''}
              />
            </label>
            {panel === 'edit' ? (
              <>
                <label>
                  Пред. фамилия
                  <input
                    name="oldLastName"
                    defaultValue={editDefaults.oldLastName || ''}
                  />
                </label>
                <label>
                  Пред. имя
                  <input
                    name="oldFirstName"
                    defaultValue={editDefaults.oldFirstName || ''}
                  />
                </label>
                <label>
                  Пред. отчество
                  <input
                    name="oldMiddleName"
                    defaultValue={editDefaults.oldMiddleName || ''}
                  />
                </label>
              </>
            ) : null}
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
              <th>Сотрудники</th>
              <th>Предыдущие имена</th>
              <th>Проведен</th>
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
                    <td>{fmtDate(row.effectiveAt)}</td>
                    <td>{row.documentNumber || '—'}</td>
                    <td className={styles.empName}>{empName(row.employee)}</td>
                    <td>{prevNames(row)}</td>
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
                      <td colSpan={6}>
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
                          {row.status === 'draft' || row.status === 'posted' ? (
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
                          <Link href={`/employees/${row.employeeId}`}>
                            Карточка
                          </Link>
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

export default function NameChangesPage() {
  return (
    <Suspense
      fallback={
        <div className={shared.page}>
          <p>Загрузка…</p>
        </div>
      }
    >
      <NameChangesPageInner />
    </Suspense>
  );
}
