'use client';

import { confirm } from '@/lib/dialogs';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import shared from '../../../page-shared.module.css';

export type AccrualTypeRow = {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  purpose?: string | null;
  periodCalc?: string;
  resultMode?: string;
  formula?: string | null;
  taxNdfl?: boolean;
  taxInps?: boolean;
  taxOss?: boolean;
  accountingMode?: string;
};

const PURPOSES = [
  'Оклад',
  'Отпуск',
  'Больничный',
  'Командировка',
  'Премия',
  'Доплата',
  'Сверхурочные',
  'Ночные',
];

const accrualTypeListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.accrual-types.v1',
  title: 'Начисления',
  columns: [
    { key: 'code', label: 'Код' },
    { key: 'sortOrder', label: 'Порядковый номер' },
    { key: 'name', label: 'Название' },
    { key: 'shortName', label: 'Краткое название' },
    { key: 'description', label: 'Описание' },
  ],
  defaultColumns: ['code', 'sortOrder', 'name', 'shortName', 'description'],
  defaultSearchKeys: ['code', 'name', 'shortName'],
  defaultSort: [{ key: 'sortOrder', dir: 'asc' }],
});

function accrualTypeCell(row: AccrualTypeRow, key: string): string {
  switch (key) {
    case 'code':
      return row.code || '';
    case 'sortOrder':
      return row.sortOrder != null ? String(row.sortOrder) : '';
    case 'name':
      return row.name || '';
    case 'shortName':
      return row.shortName || '';
    case 'description':
      return row.description || '';
    default:
      return '';
  }
}

function AccrualTypesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useTablePrefs(accrualTypeListPrefs);
  const q = searchParams?.get('q') || '';

  const [rows, setRows] = useState<AccrualTypeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);

  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [shortName, setShortName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : accrualTypeListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const blob = [r.code, r.name, r.shortName, r.description, String(r.sortOrder ?? '')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, accrualTypeCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const allChecked =
    displayRows.length > 0 && displayRows.every((r) => selected.has(r.id));
  const someChecked = displayRows.some((r) => selected.has(r.id)) && !allChecked;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AccrualTypeRow[] | { items: AccrualTypeRow[] }>(
        '/api/catalog/accrual-types',
      );
      setRows(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on ?create=1 only
  }, [searchParams]);

  function clearCreateParam() {
    if (searchParams.get('create') !== '1') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create');
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/accrual-types?${qs}` : '/catalog/accrual-types',
      { scroll: false },
    );
  }

  function openCreate() {
    setEditId(null);
    setName('');
    setCode('');
    setShortName('');
    setSortOrder(
      String((rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1),
    );
    setPurpose('');
    setDescription('');
    setActive(true);
    setMode('create');
    setError('');
  }

  function openEdit(row: AccrualTypeRow) {
    setEditId(row.id);
    setName(row.name || '');
    setCode(row.code || '');
    setShortName(row.shortName || '');
    setSortOrder(String(row.sortOrder ?? 0));
    setPurpose(row.purpose || '');
    setDescription(row.description || '');
    setActive(row.isActive !== false);
    setMode('edit');
    setError('');
  }

  function closeModal() {
    setMode('none');
    setEditId(null);
    setError('');
    clearCreateParam();
  }

  async function save() {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError('');
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    const body = {
      name: name.trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive: active,
      purpose: purpose.trim() || null,
      periodCalc: existing?.periodCalc || 'period',
      resultMode: existing?.resultMode || 'formula',
      formula: existing?.formula ?? null,
      taxNdfl: existing?.taxNdfl !== false,
      taxInps: Boolean(existing?.taxInps),
      taxOss: Boolean(existing?.taxOss),
      accountingMode: existing?.accountingMode || 'employee',
      shortName: shortName.trim() || null,
      code: code.trim(),
      description: description.trim() || null,
    };
    try {
      if (editId) {
        await apiFetch(`/api/catalog/accrual-types/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/catalog/accrual-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runDelete(row: AccrualTypeRow) {
    if (!(await confirm(`Удалить начисление «${row.name}»?`))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/catalog/accrual-types/${row.id}`, { method: 'DELETE' });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      if (focusId === row.id) setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(displayRows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные начисления (${selected.size})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const id of selected) {
        try {
          await apiFetch(`/api/catalog/accrual-types/${id}`, { method: 'DELETE' });
        } catch {
          failed += 1;
        }
      }
      setSelected(new Set());
      setFocusId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    const qs = params.toString();
    router.replace(
      qs ? `/catalog/accrual-types?${qs}` : '/catalog/accrual-types',
      { scroll: false },
    );
  }

  function exportCsv() {
    downloadCsv(
      `accruals-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) obj[prefs.labelOf(k)] = accrualTypeCell(r, k);
        return obj;
      }),
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav groupKey="accrual-types" />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeWage}`}>
          <i className="fas fa-coins" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Начисления</h1>
          <p className={shared.pageSubtitle}>
            Виды начислений заработной платы
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
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => router.push('/settings?tab=org')}
          >
            <i className="fas fa-times" aria-hidden />
            Закрыть
          </button>
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {filtered.length} / {rows.length}
          </span>
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

      {error && mode === 'none' ? <p className={styles.error}>{error}</p> : null}

      {selected.size > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{selected.size}</strong>
          </span>
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() => void deleteSelected()}
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkGhost}
            disabled={busy}
            onClick={() => setSelected(new Set())}
          >
            Снять выделение
          </button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
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
                    нет данных
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = focusId === row.id;
                const isChecked = selected.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setFocusId(open ? null : row.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(row.id, !isChecked)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${row.name}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'name') {
                          return (
                            <td key={key} className={styles.nameCell}>
                              {row.name}
                            </td>
                          );
                        }
                        return <td key={key}>{accrualTypeCell(row, key)}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/accrual-types/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            <button type="button" onClick={() => openEdit(row)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <Link href={`/catalog/accrual-types/${row.id}/edit`}>
                              <i className="fas fa-sliders-h" aria-hidden />
                              Полная форма
                            </Link>
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
            Показано <strong>{displayRows.length}</strong> из{' '}
            <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <FormModal
        open={mode !== 'none'}
        title={
          mode === 'edit' ? 'Начисление (изменение)' : 'Начисление (создание)'
        }
        width="md"
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '…' : 'Сохранить'}
            </button>
            {editId ? (
              <Link
                href={`/catalog/accrual-types/${editId}/edit`}
                className={modal.btnGhost}
                onClick={closeModal}
              >
                Полная форма
              </Link>
            ) : null}
            <button type="button" className={modal.btnGhost} onClick={closeModal}>
              Закрыть
            </button>
          </>
        }
      >
        {error && mode !== 'none' ? <p className={modal.error}>{error}</p> : null}
        <div className={modal.field}>
          <label>
            Название <span className={modal.req}>*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className={modal.field}>
          <label>Код</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className={modal.field}>
          <label>Краткое название</label>
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
          />
        </div>
        <div className={modal.field}>
          <label>Порядковый номер</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className={modal.field}>
          <label>Назначение начисления</label>
          <input
            list="accrual-purposes-modal"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Поиск..."
          />
          <datalist id="accrual-purposes-modal">
            {PURPOSES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className={modal.field}>
          <label>Описание</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={modal.field}>
          <span>Статус</span>
          <label className={formStyles.toggleRow}>
            <button
              type="button"
              className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
              onClick={() => setActive((v) => !v)}
              aria-pressed={active}
            />
            <span>{active ? 'Активный' : 'Неактивный'}</span>
          </label>
        </div>
      </FormModal>
    </div>
  );
}

export default function AccrualTypesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <AccrualTypesPageInner />
    </Suspense>
  );
}
