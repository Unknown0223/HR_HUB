'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { FormEvent, Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import { PageSubnav } from '@/components/PageSubnav';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsxViaApi } from '@/lib/excel';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type PersonRef = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

type DivisionRef = { id: string; name: string; code?: string };

type GphRow = {
  id: string;
  number: string;
  title: string;
  startDate: string;
  endDate?: string | null;
  amount?: string | number | null;
  allowAddService?: boolean;
  status: string;
  isActive: boolean;
  note?: string | null;
  postedAt?: string | null;
  employeeId: string;
  divisionId?: string | null;
  personId?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    tabNumber: string;
    person?: PersonRef | null;
    division?: DivisionRef | null;
  } | null;
  division?: DivisionRef | null;
  person?: PersonRef | null;
  services?: { id: string; code: string; name: string }[];
};

type EmpOpt = { id: string; label: string };
type PersonOpt = { id: string; label: string };
type DivisionOpt = { id: string; label: string };

const FILTER_KEYS = ['q', 'number', 'status', 'posted', 'from', 'to', 'employeeId', 'divisionId'] as const;
const COL_COUNT = 9;

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
}

function fmtAmount(value?: string | number | null) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function personName(p?: PersonRef | null) {
  if (!p) return '';
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ').toUpperCase();
}

function empName(e?: GphRow['employee']) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ').toUpperCase();
}

function rowPerson(row: GphRow) {
  return (
    personName(row.person) ||
    personName(row.employee?.person) ||
    empName(row.employee)
  );
}

function rowDivision(row: GphRow) {
  return row.division?.name || row.employee?.division?.name || '—';
}

function GphContractsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const status = filters.status;
  const from = filters.from;
  const to = filters.to;
  const numberFilter = filters.number;
  const postedFilter = filters.posted;
  const employeeIdFilter = filters.employeeId;
  const divisionIdFilter = filters.divisionId;

  const [rows, setRows] = useState<GphRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(status || from || to || q || numberFilter || postedFilter || employeeIdFilter || divisionIdFilter),
  );
  const [panel, setPanel] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [editDefaults, setEditDefaults] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [persons, setPersons] = useState<PersonOpt[]>([]);
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
          r.number,
          r.title,
          rowPerson(r),
          rowDivision(r),
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
      list = list.filter((r) => String(r.number || '').toLowerCase().includes(nq));
    }
    if (employeeIdFilter) {
      list = list.filter((r) => r.employeeId === employeeIdFilter);
    }
    if (divisionIdFilter) {
      list = list.filter(
        (r) =>
          r.divisionId === divisionIdFilter ||
          r.division?.id === divisionIdFilter ||
          r.employee?.division?.id === divisionIdFilter,
      );
    }
    const effectivePosted =
      postedFilter ||
      (status === 'posted' ? 'yes' : status ? '' : '');
    if (effectivePosted === 'yes' || status === 'posted') {
      list = list.filter((r) => r.status === 'posted');
    } else if (effectivePosted === 'no') {
      list = list.filter((r) => r.status !== 'posted');
    } else if (status && status !== 'posted') {
      list = list.filter((r) => r.status === status);
    }
    if (from) {
      const f = new Date(from).getTime();
      list = list.filter((r) => new Date(r.startDate).getTime() >= f);
    }
    if (to) {
      const t = new Date(to).getTime();
      list = list.filter((r) => new Date(r.startDate).getTime() <= t);
    }
    return list;
  }, [
    rows,
    q,
    numberFilter,
    employeeIdFilter,
    divisionIdFilter,
    status,
    postedFilter,
    from,
    to,
  ]);

  const checkedRows = useMemo(
    () => filtered.filter((r) => checked[r.id]),
    [filtered, checked],
  );

  const allPageChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const somePageChecked = filtered.some((r) => checked[r.id]) && !allPageChecked;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
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
      const data = await apiFetch<GphRow[]>('/api/catalog/gph-contracts');
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
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    setChecked({});
  }, [q, numberFilter, employeeIdFilter, divisionIdFilter, status, postedFilter, from, to]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') setPanel('create');
  }, [searchParams]);

  useEffect(() => {
    apiFetch<{
      employees?: EmpOpt[];
      persons?: PersonOpt[];
      divisions?: DivisionOpt[];
    }>('/api/catalog/lookups')
      .then((l) => {
        setEmployees(l.employees || []);
        setPersons(l.persons || []);
        setDivisions(l.divisions || []);
      })
      .catch(() => undefined);
  }, []);

  function applySearch() {
    const p = new URLSearchParams(searchParams.toString());
    if (searchDraft.trim()) p.set('q', searchDraft.trim());
    else p.delete('q');
    router.push(`/catalog/gph-contracts?${p.toString()}`);
  }

  function openCreate() {
    setEditId(null);
    setEditDefaults({
      startDate: new Date().toISOString().slice(0, 10),
      allowAddService: 'true',
    });
    setPanel('create');
  }

  function openEdit(row: GphRow) {
    setEditId(row.id);
    setEditDefaults({
      employeeId: row.employeeId || '',
      divisionId: row.divisionId || row.employee?.division?.id || '',
      personId: row.personId || row.employee?.person?.id || '',
      number: row.number || '',
      title: row.title || '',
      startDate: row.startDate ? String(row.startDate).slice(0, 10) : '',
      endDate: row.endDate ? String(row.endDate).slice(0, 10) : '',
      amount: row.amount != null ? String(row.amount) : '',
      allowAddService: row.allowAddService === false ? 'false' : 'true',
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
        divisionId: fd.get('divisionId') || undefined,
        personId: fd.get('personId') || undefined,
        number: fd.get('number'),
        title: fd.get('title'),
        startDate: fd.get('startDate'),
        endDate: fd.get('endDate') || undefined,
        amount: fd.get('amount') ? Number(fd.get('amount')) : undefined,
        allowAddService: String(fd.get('allowAddService')) !== 'false',
        note: fd.get('note') || undefined,
      };
      if (editId) {
        await apiFetch(`/api/catalog/gph-contracts/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/gph-contracts', {
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

  async function runAction(
    row: GphRow,
    action: 'post' | 'unpost' | 'close' | 'activate' | 'delete',
  ) {
    setBusy(true);
    setError('');
    try {
      if (action === 'delete') {
        if (!(await confirm(`Удалить договор ${row.number}?`))) return;
        await apiFetch(`/api/catalog/gph-contracts/${row.id}`, {
          method: 'DELETE',
        });
      } else {
        await apiFetch(`/api/catalog/gph-contracts/${row.id}/${action}`, {
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

  async function runBulk(action: 'post' | 'unpost' | 'activate' | 'delete') {
    const targets = checkedRows;
    if (targets.length === 0) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить выбранные договоры (${targets.length} шт.)?`))) {
        return;
      }
    } else if (action === 'post') {
      if (targets.every((r) => r.status !== 'draft')) {
        setError('Нет черновиков среди выбранных');
        return;
      }
    } else if (action === 'unpost') {
      if (targets.every((r) => r.status !== 'posted')) {
        setError('Нет проведённых договоров среди выбранных');
        return;
      }
    } else if (action === 'activate') {
      if (targets.every((r) => r.isActive)) {
        setError('Все выбранные договоры уже активны');
        return;
      }
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          if (action === 'delete') {
            await apiFetch(`/api/catalog/gph-contracts/${row.id}`, {
              method: 'DELETE',
            });
          } else if (action === 'post') {
            if (row.status !== 'draft') continue;
            await apiFetch(`/api/catalog/gph-contracts/${row.id}/post`, {
              method: 'POST',
            });
          } else if (action === 'unpost') {
            if (row.status !== 'posted') continue;
            await apiFetch(`/api/catalog/gph-contracts/${row.id}/unpost`, {
              method: 'POST',
            });
          } else {
            if (row.isActive) continue;
            await apiFetch(`/api/catalog/gph-contracts/${row.id}/activate`, {
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
      `gph-contracts-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        'Номер договора': r.number,
        'Дата начала': fmtDate(r.startDate),
        Подразделение: rowDivision(r),
        'Физическое лицо': rowPerson(r),
        'Доступ на добавление услуги':
          r.allowAddService === false ? 'Нет' : 'Да',
        Проведен: r.status === 'posted' ? 'Да' : 'Нет',
        Наименование: r.title,
        Сумма: r.amount ?? '',
        Активен: r.isActive ? 'Да' : 'Нет',
      })),
    );
  }

  async function exportExcel() {
    setExportBusy(true);
    setError('');
    try {
      await downloadXlsxViaApi(
        '/api/catalog/gph-contracts/export.xlsx',
        `gph-contracts-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка Excel');
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="gph-contracts" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-file-signature" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Договоры ГПХ</h1>
          <p className={shared.pageSubtitle}>
            Договоры гражданско-правового характера и доступ к услугам
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
                label: 'Номер договора',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Сотрудники',
                options: employees.map((e) => ({ value: e.id, label: e.label })),
              },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.label })),
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
        </div>
      </div>

      {error && panel === 'none' ? <p className={styles.error}>{error}</p> : null}

      {checkedRows.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedRows.length}</strong>
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
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('activate')}
          >
            <i className="fas fa-play" aria-hidden />
            Активировать
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
        title={panel === 'edit' ? 'Изменить договор ГПХ' : 'Создать договор ГПХ'}
        onClose={closePanel}
        width="xl"
        footer={
          <>
            <button
              type="submit"
              form="gph-contract-form"
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
          id="gph-contract-form"
          className={modal.fields}
          onSubmit={onSubmit}
        >
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>
                Номер договора <em className={modal.req}>*</em>
              </span>
              <input name="number" required autoFocus defaultValue={editDefaults.number || ''} />
            </label>
            <label className={modal.field}>
              <span>
                Дата начала <em className={modal.req}>*</em>
              </span>
              <input
                name="startDate"
                type="date"
                required
                defaultValue={editDefaults.startDate || ''}
              />
            </label>
          </div>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Дата окончания</span>
              <input name="endDate" type="date" defaultValue={editDefaults.endDate || ''} />
            </label>
            <label className={modal.field}>
              <span>Сумма</span>
              <input
                name="amount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={editDefaults.amount || ''}
              />
            </label>
          </div>
          <label className={modal.field}>
            <span>
              Сотрудник (ГПХ) <em className={modal.req}>*</em>
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
              <span>Физическое лицо</span>
              <select name="personId" defaultValue={editDefaults.personId || ''}>
                <option value="">— из сотрудника —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={modal.field}>
              <span>Подразделение</span>
              <select name="divisionId" defaultValue={editDefaults.divisionId || ''}>
                <option value="">— из сотрудника —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={modal.field}>
            <span>
              Наименование <em className={modal.req}>*</em>
            </span>
            <input name="title" required defaultValue={editDefaults.title || ''} />
          </label>
          <div className={modal.row2}>
            <label className={modal.field}>
              <span>Доступ на добавление услуги</span>
              <select
                name="allowAddService"
                defaultValue={editDefaults.allowAddService || 'true'}
              >
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
            </label>
            <label className={modal.field}>
              <span>Примечание</span>
              <input name="note" defaultValue={editDefaults.note || ''} />
            </label>
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
                <th>Номер договора</th>
                <th>Дата начала ↑</th>
                <th>Наименование</th>
                <th>Подразделение</th>
                <th>Физическое лицо</th>
                <th className={styles.numCol}>Сумма</th>
                <th>Доступ на добавление услуги</th>
                <th>Проведен</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => {
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
                      <td className={styles.numberCell}>{row.number}</td>
                      <td>{fmtDate(row.startDate)}</td>
                      <td>{row.title || '—'}</td>
                      <td>{rowDivision(row)}</td>
                      <td className={styles.empName}>{rowPerson(row)}</td>
                      <td className={styles.numCol}>{fmtAmount(row.amount)}</td>
                      <td>
                        {row.allowAddService === false ? (
                          <span className={styles.postedNo}>Нет</span>
                        ) : (
                          <span className={styles.postedYes}>Да</span>
                        )}
                      </td>
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
                            {row.isActive ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'close')}
                              >
                                <i className="fas fa-lock" aria-hidden />
                                Закрыть
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(row, 'activate')}
                              >
                                <i className="fas fa-play" aria-hidden />
                                Активировать
                              </button>
                            )}
                            {row.status === 'draft' || !row.isActive ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openEdit(row)}
                              >
                                <i className="fas fa-pen" aria-hidden />
                                Изменить
                              </button>
                            ) : null}
                            {row.allowAddService !== false ? (
                              <Link href={`/catalog/gph-services?contractId=${row.id}`}>
                                <i className="fas fa-concierge-bell" aria-hidden />
                                Услуги
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void runAction(row, 'delete')}
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

export default function GphContractsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <GphContractsPageInner />
    </Suspense>
  );
}
