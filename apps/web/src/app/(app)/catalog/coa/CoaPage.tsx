'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
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
import {
  ACCOUNT_KINDS,
  PAYMENT_KINDS,
  accountKindLabel,
  asCoaMeta,
  currencyKindLabel,
  debitCreditFromKind,
  inferAccountKind,
  inferPaymentKind,
  isMainAccount,
  parentCaption,
  yesNo,
  type CoaMeta,
} from '@/lib/coa';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import {
  CoaForm,
  draftFromMeta,
  emptyDraft,
  type CoaDraft,
} from './CoaForm';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import extra from './page.module.css';
import shared from '../../../page-shared.module.css';

type Dict = {
  id: string;
  code: string;
  name: string;
  items?: DictItem[];
};

type DictItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: CoaMeta | null;
};

const DICT_CODE = 'coa';
const PAGE_SIZE = 50;
const FILTER_KEYS = [
  'q',
  'code',
  'name',
  'accountKind',
  'paymentKind',
  'isActive',
  'quantitative',
] as const;

const coaListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.coa.v1',
  title: 'План счетов',
  columns: [
    { key: 'code', label: 'Код' },
    { key: 'name', label: 'Название' },
    { key: 'parent', label: 'Подчинен счету' },
    { key: 'accountKind', label: 'Вид счета' },
    { key: 'quantitative', label: 'Количественный' },
    { key: 'paymentKind', label: 'Вид валюты' },
    { key: 'isActive', label: 'Статус' },
  ],
  defaultColumns: [
    'code',
    'name',
    'parent',
    'accountKind',
    'quantitative',
    'paymentKind',
    'isActive',
  ],
  defaultSearchKeys: ['code', 'name'],
  defaultSort: [{ key: 'code', dir: 'asc' }],
});

function coaCell(row: DictItem, key: string): string {
  const meta = asCoaMeta(row.meta);
  switch (key) {
    case 'code':
      return row.code || '';
    case 'name':
      return row.name || '';
    case 'parent':
      return parentCaption(meta.parentCode, meta.parentName);
    case 'accountKind':
      return accountKindLabel(inferAccountKind(meta));
    case 'quantitative':
      return yesNo(meta.quantitative);
    case 'paymentKind':
      return currencyKindLabel(inferPaymentKind(meta));
    case 'isActive':
      return row.isActive === false ? 'Неактивный' : 'Активный';
    default:
      return '';
  }
}

function CoaPageInner({ mainOnly }: { mainOnly?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(coaListPrefs);
  const q = filters.q;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [settingsValues, setSettingsValues] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [statusOpen, setStatusOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.code ||
        filters.name ||
        filters.accountKind ||
        filters.paymentKind ||
        filters.isActive ||
        filters.quantitative,
    ),
  );

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CoaDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : coaListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const basePath = mainOnly ? '/catalog/coa-main' : '/catalog/coa';

  const allForParent = useMemo(
    () =>
      rows.map((r) => ({
        id: r.code,
        label: `${r.code}. ${r.name}`,
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const meta = asCoaMeta(r.meta);
      if (mainOnly && !isMainAccount(r.code, meta)) return false;
      const codeF = (filters.code || '').trim().toLowerCase();
      const nameF = (filters.name || '').trim().toLowerCase();
      if (codeF && !r.code.toLowerCase().includes(codeF)) return false;
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      const kind = inferAccountKind(meta);
      const pay = inferPaymentKind(meta);
      if (filters.accountKind && kind !== filters.accountKind) return false;
      if (filters.paymentKind && pay !== filters.paymentKind) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (filters.quantitative === '1' && !meta.quantitative) return false;
      if (filters.quantitative === '0' && meta.quantitative) return false;
      if (!qq) return true;
      const blob = [
        r.code,
        r.name,
        parentCaption(meta.parentCode, meta.parentName),
        accountKindLabel(kind),
        currencyKindLabel(pay),
        r.isActive === false ? 'неактивный' : 'активный',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, mainOnly, filters]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, coaCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, prefs.state.sort],
  );

  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return displayRows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [displayRows, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, settings] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra'),
        apiFetch<{ accountSettings?: Record<string, string> }>(
          '/api/settings/account-settings',
        ).catch(() => ({ accountSettings: {} })),
      ]);
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «План счетов» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      const items = [...(dict.items || [])].sort(
        (a, b) => a.code.localeCompare(b.code, 'ru') || a.name.localeCompare(b.name, 'ru'),
      );
      setRows(items);
      setSettingsValues(Object.values(settings.accountSettings || {}));
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
    setPage(1);
  }, [q, mainOnly, filters]);

  function accountByCode(code?: string) {
    if (!code) return undefined;
    return rows.find((r) => r.code === code);
  }

  function isUsed(row: DictItem) {
    const asParent = rows.some(
      (r) => r.id !== row.id && asCoaMeta(r.meta).parentCode === row.code,
    );
    const inSettings = settingsValues.some(
      (v) => v === row.code || v.startsWith(`${row.code}.`) || v.includes(`${row.code}.`),
    );
    return asParent || inSettings;
  }

  function openCreate() {
    setEditId(null);
    const d = emptyDraft();
    if (rows.some((r) => r.code === '0000')) d.parentCode = '0000';
    setDraft(d);
    setMode('create');
    setError('');
  }

  function openEdit(row: DictItem) {
    const meta = asCoaMeta(row.meta);
    setEditId(row.id);
    setDraft(
      draftFromMeta(
        row.code,
        row.name,
        row.isActive !== false,
        meta,
        inferAccountKind(meta),
        inferPaymentKind(meta),
      ),
    );
    setMode('edit');
    setError('');
  }

  async function save() {
    if (!dictId) return;
    if (!draft.code.trim()) {
      setError('Укажите код');
      return;
    }
    if (!draft.name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!draft.parentCode) {
      setError('Укажите подчиненный счет');
      return;
    }
    if (!draft.accountKind) {
      setError('Укажите вид счета');
      return;
    }
    const parent = accountByCode(draft.parentCode);
    const dc = debitCreditFromKind(draft.accountKind);
    setSaving(true);
    setError('');
    try {
      const existing = editId ? rows.find((r) => r.id === editId) : null;
      if (
        !existing &&
        rows.some((r) => r.code.toLowerCase() === draft.code.trim().toLowerCase())
      ) {
        setError('Счет с таким кодом уже существует');
        setSaving(false);
        return;
      }
      const body = {
        code: draft.code.trim(),
        name: draft.name.trim(),
        isActive: draft.active,
        meta: {
          parentCode: draft.parentCode,
          parentName: parent?.name || draft.parentCode,
          accountKind: draft.accountKind,
          paymentKind: draft.paymentKind,
          quantitative: draft.quantitative,
          balance: draft.balance,
          checkExceed: draft.checkExceed,
          isMain: isMainAccount(draft.code.trim(), {
            parentCode: draft.parentCode,
            isMain: mainOnly || draft.parentCode === draft.code.trim(),
          }),
          subcontos: draft.subcontos.filter((s) => s.name || s.type),
          ...dc,
          currency: draft.paymentKind === 'base' ? 'UZS' : '',
        },
      };
      if (editId) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(ids: string[], active: boolean) {
    if (!dictId || !ids.length) return;
    setBusy(true);
    setStatusOpen(false);
    try {
      for (const id of ids) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: active }),
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения статуса');
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[], unusedOnly: boolean) {
    if (!dictId || !ids.length) return;
    const targets = unusedOnly
      ? ids.filter((id) => {
          const row = rows.find((r) => r.id === id);
          return row && !isUsed(row);
        })
      : ids;
    if (!targets.length) {
      setError(
        unusedOnly
          ? 'Выбранные счета используются и не могут быть удалены'
          : 'Нечего удалять',
      );
      return;
    }
    if (
      !(await confirm({
        title: unusedOnly ? 'Удаление неиспользуемых данных' : 'Удаление',
        message: unusedOnly
          ? `Удалить неиспользуемые счета (${targets.length})?`
          : `Удалить выбранные счета (${targets.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of targets) {
        await apiFetch(
          `/api/settings/dictionaries/${dictId}/items/${id}/delete`,
          { method: 'POST' },
        );
      }
      setSelected(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `coa-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, string> = {};
        for (const k of visibleCols) {
          if (k === 'parent') {
            const meta = asCoaMeta(r.meta);
            const parent = accountByCode(meta.parentCode);
            obj[prefs.labelOf(k)] = parentCaption(
              meta.parentCode,
              meta.parentName || parent?.name,
            );
          } else {
            obj[prefs.labelOf(k)] = coaCell(r, k);
          }
        }
        return obj;
      }),
    );
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  const parentOptions =
    mode === 'edit' && draft.code
      ? [
          { id: draft.code, label: `${draft.code}. ${draft.name || draft.code}` },
          ...allForParent.filter((o) => o.id !== draft.code),
        ]
      : allForParent;

  function renderRow(row: DictItem) {
    const open = focusId === row.id;
    const meta = asCoaMeta(row.meta);
    const kind = inferAccountKind(meta);
    const pay = inferPaymentKind(meta);
    const parent = accountByCode(meta.parentCode);
    return (
      <tr
        key={row.id}
        className={open ? styles.rowSelected : undefined}
        onClick={() => setFocusId(open ? null : row.id)}
        style={{ cursor: 'pointer' }}
      >
        <td onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={(e) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
            aria-label={`Выбрать ${row.code}`}
          />
        </td>
        {visibleCols.map((key) => {
          if (key === 'code') {
            return <td key={key}>{row.code}</td>;
          }
          if (key === 'name') {
            return (
              <td key={key} className={styles.nameCell}>
                <span className={styles.nameText}>{row.name}</span>
                {open ? (
                  <div
                    className={styles.rowActions}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button type="button" onClick={() => openEdit(row)}>
                      Изменить
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void setActive([row.id], row.isActive === false)
                      }
                    >
                      {row.isActive === false ? 'Активный' : 'Неактивный'}
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      disabled={busy}
                      onClick={() => void deleteIds([row.id], false)}
                    >
                      Удалить
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteIds([row.id], true)}
                    >
                      Удалить неиспользуемые данные
                    </button>
                  </div>
                ) : null}
              </td>
            );
          }
          if (key === 'parent') {
            return (
              <td key={key}>
                {parentCaption(
                  meta.parentCode,
                  meta.parentName || parent?.name,
                )}
              </td>
            );
          }
          if (key === 'accountKind') {
            return <td key={key}>{accountKindLabel(kind)}</td>;
          }
          if (key === 'quantitative') {
            return <td key={key}>{yesNo(meta.quantitative)}</td>;
          }
          if (key === 'paymentKind') {
            return <td key={key}>{currencyKindLabel(pay)}</td>;
          }
          if (key === 'isActive') {
            return (
              <td key={key}>
                <span
                  className={
                    row.isActive === false ? extra.badgeOff : extra.badge
                  }
                >
                  {row.isActive === false ? 'Неактивный' : 'Активный'}
                </span>
              </td>
            );
          }
          return <td key={key}>{coaCell(row, key) || '—'}</td>;
        })}
      </tr>
    );
  }

  return (
    <div className={styles.wrap}>
      <TablePrefsModals prefs={prefs} />
      <PageSubnav
        group={{
          title: mainOnly ? 'План главных счетов' : 'План счетов',
          siblings: [
            { label: 'План счетов', href: '/catalog/coa' },
            { label: 'План главных счетов', href: '/catalog/coa-main' },
            { label: 'Настройки счетов', href: '/settings/account-settings' },
          ],
        }}
      />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeDoc}`}>
          <i className="fas fa-sitemap" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>
            {mainOnly ? 'План главных счетов' : 'План счетов'}
          </h1>
          <p className={shared.pageSubtitle}>
            {mainOnly
              ? 'Справочник главных счетов бухгалтерского учёта'
              : 'Справочник счетов бухгалтерского учёта и субсчетов'}
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
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'name',
                label: 'Название',
                placeholder: 'Поиск...',
              },
              {
                type: 'select',
                key: 'accountKind',
                label: 'Вид счета',
                options: ACCOUNT_KINDS.map((k) => ({
                  value: k.id,
                  label: k.label,
                })),
              },
              {
                type: 'select',
                key: 'paymentKind',
                label: 'Вид валюты',
                options: PAYMENT_KINDS.map((k) => ({
                  value: k.id,
                  label: k.label,
                })),
              },
              {
                type: 'select',
                key: 'quantitative',
                label: 'Количественный',
                options: [
                  { value: '1', label: 'Да' },
                  { value: '0', label: 'Нет' },
                ],
              },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          {selected.size > 0 ? (
            <>
              <div className={extra.statusWrap}>
                <button
                  type="button"
                  className={extra.btnStatus}
                  disabled={busy}
                  onClick={() => setStatusOpen((v) => !v)}
                >
                  Изменить статус
                </button>
                {statusOpen ? (
                  <div className={extra.statusMenu}>
                    <button
                      type="button"
                      onClick={() =>
                        void setActive(Array.from(selected), false)
                      }
                    >
                      Неактивный {selected.size}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setActive(Array.from(selected), true)
                      }
                    >
                      Активный {selected.size}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={local.btnDanger}
                disabled={busy}
                onClick={() => void deleteIds(Array.from(selected), false)}
              >
                Удалить {selected.size}
              </button>
            </>
          ) : null}
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
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Предыдущая страница"
          >
            <i className="fas fa-chevron-left" aria-hidden />
          </button>
          <span className={styles.pagerMeta}>
            {Math.min(page, pageCount)} / {pageCount}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            <i className="fas fa-chevron-right" aria-hidden />
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

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    displayRows.length > 0 &&
                    displayRows.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(displayRows.map((r) => r.id)));
                  }}
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
                  Нет данных
                </td>
              </tr>
            ) : null}
            {paged.map(renderRow)}
          </tbody>
        </table>
      </div>

      <FormModal
        open={mode === 'create' || mode === 'edit'}
        title={
          mode === 'edit'
            ? 'План счетов (изменение)'
            : 'План счетов (создание)'
        }
        width="lg"
        onClose={() => {
          setMode('list');
          setError('');
        }}
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
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => {
                setMode('list');
                setError('');
              }}
            >
              Закрыть
            </button>
          </>
        }
      >
        <CoaForm
          draft={draft}
          setDraft={setDraft}
          parentOptions={parentOptions}
          error={error}
        />
      </FormModal>
    </div>
  );
}

export function CoaPage({ mainOnly }: { mainOnly?: boolean }) {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <CoaPageInner mainOnly={mainOnly} />
    </Suspense>
  );
}

