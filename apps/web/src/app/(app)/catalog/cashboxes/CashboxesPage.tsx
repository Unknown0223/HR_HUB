'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  asCashboxMeta,
  displayCode,
  eventLabel,
  formatBalance,
  fmtDateTime,
  labelsOf,
  type CashboxMeta,
  type CashboxRef,
} from '@/lib/cashboxes';
import { MultiLookup } from './MultiLookup';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import extra from './page.module.css';

type Dict = { id: string; code: string; name: string; items?: DictItem[] };
type DictItem = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  meta?: CashboxMeta | null;
};
type Opt = { id: string; label: string };
type AuditRow = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  meta?: { userName?: string; name?: string; code?: string } | null;
};

const DICT_CODE = 'cashboxes';
const PAGE_SIZE = 50;
const LIST_FILTER_KEYS = ['q', 'code', 'name', 'isActive'] as const;
const HIST_FILTER_KEYS = ['q', 'from', 'to', 'user', 'event', 'product'] as const;

function refsFrom(ids: string[], options: Opt[]): CashboxRef[] {
  return ids
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is Opt => !!o)
    .map((o) => ({ id: o.id, label: o.label }));
}

function CashboxesInner({ historyMode }: { historyMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([
    ...LIST_FILTER_KEYS,
    ...HIST_FILTER_KEYS,
  ]);
  const q = filters.q;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [currencies, setCurrencies] = useState<Opt[]>([]);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [statusOpen, setStatusOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(filters.code || filters.name || filters.isActive),
  );

  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'history'>(
    historyMode ? 'history' : 'list',
  );
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [currencyIds, setCurrencyIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<AuditRow[]>([]);
  const [histFiltersOpen, setHistFiltersOpen] = useState(
    Boolean(
      filters.from ||
        filters.to ||
        filters.user ||
        filters.event ||
        filters.product,
    ),
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    return rows.filter((r) => {
      if (codeF && !displayCode(r.code).toLowerCase().includes(codeF) && !r.code.toLowerCase().includes(codeF)) {
        return false;
      }
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const meta = asCashboxMeta(r.meta);
      const blob = [
        displayCode(r.code),
        r.name,
        formatBalance(meta.balance),
        labelsOf(meta.responsible),
        r.isActive === false ? 'неактивный' : 'активный',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [rows, q, filters.code, filters.name, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filtered, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, lookups, org] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra'),
        apiFetch<{ employees?: Opt[]; locations?: Opt[] }>('/api/catalog/lookups'),
        apiFetch<{ tenant?: { name?: string }; settings?: { orgName?: string } }>(
          '/api/settings/org',
        ).catch((): { tenant?: { name?: string }; settings?: { orgName?: string } } => ({})),
      ]);
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      const cur = (list || []).find((d) => d.code === 'currencies');
      if (!dict) {
        setError('Справочник «Кассы» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      setRows(
        [...(dict.items || [])].sort((a, b) =>
          a.name.localeCompare(b.name, 'ru'),
        ),
      );
      setEmployees(lookups.employees || []);
      setLocations(lookups.locations || []);
      setCurrencies(
        (cur?.items || []).map((i) => ({
          id: i.code,
          label: `${i.code} ${i.name}`.trim(),
        })),
      );
      setOrgName(
        org.settings?.orgName || org.tenant?.name || '',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const logs = await apiFetch<AuditRow[]>(
        '/api/settings/audit?entity=DictionaryItem',
      );
      const ids = new Set(rows.map((r) => r.id));
      const list = (Array.isArray(logs) ? logs : []).filter(
        (h) => h.entityId && ids.has(h.entityId),
      );
      setHistory(list);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, filters.code, filters.name, filters.isActive]);

  useEffect(() => {
    if (mode === 'history' && rows.length) void loadHistory();
  }, [mode, rows]);

  function resetForm() {
    setCode('');
    setName('');
    setResponsibleIds([]);
    setLocationIds([]);
    setCurrencyIds([]);
    setActive(true);
    setError('');
  }

  function openCreate() {
    setEditId(null);
    resetForm();
    setMode('create');
  }

  function openEdit(row: DictItem) {
    const meta = asCashboxMeta(row.meta);
    setEditId(row.id);
    setCode(displayCode(row.code));
    setName(row.name);
    setResponsibleIds((meta.responsible || []).map((x) => x.id));
    setLocationIds((meta.locations || []).map((x) => x.id));
    setCurrencyIds((meta.currencies || []).map((x) => x.id));
    setActive(row.isActive !== false);
    setError('');
    setMode('edit');
  }

  async function save() {
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    const nextCode =
      code.trim() ||
      existing?.code ||
      `AUTO_${Date.now().toString(36).toUpperCase()}`;
    setSaving(true);
    setError('');
    try {
      const body = {
        code: nextCode,
        name: name.trim(),
        isActive: active,
        meta: {
          responsible: refsFrom(responsibleIds, employees),
          locations: refsFrom(locationIds, locations),
          currencies: refsFrom(currencyIds, currencies),
          balance: existing ? asCashboxMeta(existing.meta).balance ?? null : null,
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

  async function setActiveIds(ids: string[], isActive: boolean) {
    if (!dictId || !ids.length) return;
    setBusy(true);
    setStatusOpen(false);
    try {
      for (const id of ids) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive }),
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка изменения статуса');
    } finally {
      setBusy(false);
    }
  }

  async function deleteIds(ids: string[]) {
    if (!dictId || !ids.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: `Удалить выбранные кассы (${ids.length})?`,
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'danger',
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      for (const id of ids) {
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
      `cashboxes-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => {
        const meta = asCashboxMeta(r.meta);
        return {
          Код: displayCode(r.code),
          Название: r.name,
          Баланс: formatBalance(meta.balance),
          'Материально ответственное лицо': labelsOf(meta.responsible),
          Статус: r.isActive === false ? 'Неактивный' : 'Активный',
        };
      }),
    );
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    const path = historyMode ? '/catalog/cashboxes/history' : '/catalog/cashboxes';
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const histFiltered = useMemo(() => {
    return history.filter((h) => {
      if (filters.from && h.createdAt.slice(0, 10) < filters.from) return false;
      if (filters.to && h.createdAt.slice(0, 10) > filters.to) return false;
      if (filters.user) {
        const u = (h.meta?.userName || '').toLowerCase();
        if (!u.includes(filters.user.trim().toLowerCase())) return false;
      }
      if (filters.event && h.action !== filters.event) return false;
      if (filters.product) {
        const p = (h.meta?.name || '').toLowerCase();
        if (!p.includes(filters.product.trim().toLowerCase())) return false;
      }
      const qq = q.trim().toLowerCase();
      if (!qq) return true;
      const blob = [
        fmtDateTime(h.createdAt),
        h.meta?.userName,
        eventLabel(h.action),
        orgName,
        h.meta?.name,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [history, filters.from, filters.to, filters.user, filters.event, filters.product, q, orgName]);

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{
            title: mode === 'edit' ? 'Касса (изменение)' : 'Касса (создание)',
            siblings: [],
          }}
        />
        <div className={formStyles.page}>
          <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
            <button
              type="button"
              className={formStyles.btnSave}
              disabled={saving}
              onClick={() => void save()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={formStyles.btnClose}
              onClick={() => setMode('list')}
            >
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={`${formStyles.card} ${extra.cardWide}`}>
            <div className={formStyles.layout}>
              <div>
                <div className={formStyles.field}>
                  <label>Код</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Название <span className={formStyles.req}>*</span>
                  </label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className={formStyles.field}>
                  <label>Материально ответственные лица</label>
                  <MultiLookup
                    value={responsibleIds}
                    options={employees}
                    onChange={setResponsibleIds}
                  />
                </div>
              </div>
              <div>
                <div className={formStyles.field}>
                  <label>Рабочие зоны</label>
                  <MultiLookup
                    value={locationIds}
                    options={locations}
                    onChange={setLocationIds}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>Валюты</label>
                  <MultiLookup
                    value={currencyIds}
                    options={currencies}
                    onChange={setCurrencyIds}
                  />
                </div>
                <div className={formStyles.statusBlock}>
                  <span className={formStyles.fieldLabel}>Статус</span>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'history') {
    return (
      <div className={styles.wrap}>
        <PageSubnav
          group={{ title: 'История изменений', siblings: [] }}
        />
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <FilterPanel
              inline
              urlSync
              open={histFiltersOpen}
              onToggle={() => setHistFiltersOpen((v) => !v)}
              fields={[
                {
                  type: 'dateRange',
                  fromKey: 'from',
                  toKey: 'to',
                  label: 'Дата и время изменения',
                },
                {
                  type: 'text',
                  key: 'user',
                  label: 'Пользователь',
                  placeholder: 'Поиск...',
                },
                {
                  type: 'select',
                  key: 'event',
                  label: 'Тип события',
                  options: [
                    { value: 'dictionary.item.create', label: 'Создан' },
                    { value: 'dictionary.item.update', label: 'Изменен' },
                    { value: 'dictionary.item.delete', label: 'Удален' },
                  ],
                },
                {
                  type: 'text',
                  key: 'product',
                  label: 'Продукт',
                  placeholder: 'Поиск...',
                },
              ]}
            />
            <button
              type="button"
              className={formStyles.btnClose}
              onClick={() => {
                if (historyMode) router.push('/catalog/cashboxes');
                else setMode('list');
              }}
            >
              Закрыть
            </button>
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
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() =>
                downloadCsv(
                  `cashboxes-history-${new Date().toISOString().slice(0, 10)}.csv`,
                  histFiltered.map((h) => ({
                    'Дата и время изменения': fmtDateTime(h.createdAt),
                    Пользователь: h.meta?.userName || '',
                    'Тип события': eventLabel(h.action),
                    Организация: orgName,
                    Продукт: h.meta?.name || '',
                  })),
                )
              }
            >
              Excel
            </button>
            <span className={styles.pagerMeta}>
              {histFiltered.length} / {history.length}
            </span>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата и время изменения</th>
                <th>Пользователь</th>
                <th>Тип события</th>
                <th>Организация</th>
                <th>Продукт</th>
              </tr>
            </thead>
            <tbody>
              {histFiltered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                histFiltered.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDateTime(h.createdAt)}</td>
                    <td>{h.meta?.userName || '—'}</td>
                    <td>{eventLabel(h.action)}</td>
                    <td>{orgName || '—'}</td>
                    <td>{h.meta?.name || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderRow(row: DictItem) {
    const open = focusId === row.id;
    const meta = asCashboxMeta(row.meta);
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
            aria-label={`Выбрать ${row.name}`}
          />
        </td>
        <td>{displayCode(row.code)}</td>
        <td className={styles.nameCell}>
          <span className={styles.nameText}>{row.name}</span>
          {open ? (
            <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => openEdit(row)}>
                Изменить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void setActiveIds([row.id], row.isActive === false)
                }
              >
                {row.isActive === false ? 'Активный' : 'Неактивный'}
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => void deleteIds([row.id])}
              >
                Удалить
              </button>
            </div>
          ) : null}
        </td>
        <td>{formatBalance(meta.balance) || '—'}</td>
        <td>{labelsOf(meta.responsible) || '—'}</td>
        <td>
          <span className={row.isActive === false ? extra.badgeOff : extra.badge}>
            {row.isActive === false ? 'Неактивный' : 'Активный'}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav
        group={{
          title: 'Кассы',
          siblings: [
            { label: 'История изменений', href: '/catalog/cashboxes/history' },
          ],
        }}
      />
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
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'name',
                label: 'Название',
                placeholder: 'Поиск...',
              },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            aria-label="Обновить"
          >
            ↻
          </button>
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
                        void setActiveIds(Array.from(selected), false)
                      }
                    >
                      Неактивный {selected.size}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setActiveIds(Array.from(selected), true)
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
                onClick={() => void deleteIds(Array.from(selected))}
              >
                Удалить {selected.size}
              </button>
            </>
          ) : null}
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
          <button type="button" className={styles.exportBtn} onClick={exportCsv}>
            Excel
          </button>
          <span className={styles.pagerMeta}>
            {filtered.length} / {rows.length}
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
          <button type="button" className={styles.toolBtn} onClick={() => void load()}>
            Обновить
          </button>
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
                    filtered.length > 0 &&
                    filtered.every((r) => selected.has(r.id))
                  }
                  onChange={(e) => {
                    if (!e.target.checked) setSelected(new Set());
                    else setSelected(new Set(filtered.map((r) => r.id)));
                  }}
                  aria-label="Выбрать все"
                />
              </th>
              <th>Код</th>
              <th>Название</th>
              <th>Баланс</th>
              <th>Материально ответственное лицо</th>
              <th>Статус</th>
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
            {paged.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashboxesPage({ historyMode }: { historyMode?: boolean }) {
  return (
    <Suspense fallback={<div className={styles.wrap}>Загрузка…</div>}>
      <CashboxesInner historyMode={historyMode} />
    </Suspense>
  );
}
