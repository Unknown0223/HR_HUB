'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  BASE_NAME,
  CFG_CODE,
  ROUNDING_FORMATS,
  ROUNDING_TYPES,
  affixKindLabel,
  asCurrencyMeta,
  eventLabel,
  formatRate,
  fmtDate,
  fmtDateTime,
  isBaseCurrency,
  isHiddenCurrency,
  matchCbuRow,
  parseRate,
  rateOnDate,
  roundingTypeLabel,
  todayISO,
  upsertRate,
  type CurrencyMeta,
  type CurrencyRate,
} from '@/lib/currencies';
import styles from '../absence-types/page.module.css';
import formStyles from '../report-templates/form.module.css';
import local from '../document-types/page.module.css';
import extra from './page.module.css';

type Dict = { id: string; code: string; name: string; items?: DictItem[] };
type DictItem = {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  meta?: CurrencyMeta | null;
};
type AuditRow = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  meta?: { userName?: string; name?: string; code?: string } | null;
};
type CbuRow = { code: string; ccy: string; rate: number; name: string };

type Mode = 'list' | 'create' | 'edit' | 'view' | 'history';
type ViewTab = 'main' | 'rates' | 'history';

const DICT_CODE = 'currencies';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'code', 'name', 'unit', 'isActive', 'rateDate'] as const;
const HIST_FILTER_KEYS = ['q', 'from', 'to', 'user', 'event'] as const;

export function CurrenciesPage({ historyMode }: { historyMode?: boolean }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <CurrenciesInner historyMode={historyMode} />
    </Suspense>
  );
}

function CurrenciesInner({ historyMode }: { historyMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS, ...HIST_FILTER_KEYS]);
  const q = filters.q;
  const rateDate = filters.rateDate || todayISO();

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<DictItem[]>([]);
  const [cfgRow, setCfgRow] = useState<DictItem | null>(null);
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
    Boolean(filters.code || filters.name || filters.unit || filters.isActive),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoCbu, setAutoCbu] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [mode, setMode] = useState<Mode>(historyMode ? 'history' : 'list');
  const [viewTab, setViewTab] = useState<ViewTab>('main');
  const [editId, setEditId] = useState<string | null>(null);
  const [viewRow, setViewRow] = useState<DictItem | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [iso, setIso] = useState('');
  const [unit, setUnit] = useState('');
  const [subunit, setSubunit] = useState('');
  const [affixKind, setAffixKind] = useState<'prefix' | 'postfix'>('postfix');
  const [affix, setAffix] = useState('');
  const [roundingType, setRoundingType] = useState('nearest');
  const [rounding, setRounding] = useState('####.##0000');
  const [sortOrder, setSortOrder] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<AuditRow[]>([]);
  const [histKind, setHistKind] = useState<'currency' | 'rate'>('currency');
  const [histFiltersOpen, setHistFiltersOpen] = useState(false);
  const [rateFiltersOpen, setRateFiltersOpen] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [rateFormDate, setRateFormDate] = useState(todayISO());
  const [rateFormValue, setRateFormValue] = useState('');
  const [rateSelected, setRateSelected] = useState<Set<string>>(new Set());

  const visibleRows = useMemo(
    () => rows.filter((r) => !isHiddenCurrency(r.code)),
    [rows],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const codeF = (filters.code || '').trim().toLowerCase();
    const nameF = (filters.name || '').trim().toLowerCase();
    const unitF = (filters.unit || '').trim().toLowerCase();
    return visibleRows.filter((r) => {
      const meta = asCurrencyMeta(r.meta);
      if (codeF && !r.code.toLowerCase().includes(codeF)) return false;
      if (nameF && !r.name.toLowerCase().includes(nameF)) return false;
      if (unitF && !(meta.unit || '').toLowerCase().includes(unitF)) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      const blob = [
        r.code,
        r.name,
        meta.unit,
        meta.iso,
        formatRate(rateOnDate(meta.rates, rateDate)),
        r.isActive === false ? 'неактивный' : 'активный',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [
    visibleRows,
    q,
    filters.code,
    filters.name,
    filters.unit,
    filters.isActive,
    rateDate,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const p = Math.min(page, pageCount);
    return filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filtered, page, pageCount]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, org] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra'),
        apiFetch<{ tenant?: { name?: string }; settings?: { orgName?: string } }>(
          '/api/settings/org',
        ).catch((): { tenant?: { name?: string }; settings?: { orgName?: string } } => ({})),
      ]);
      const dict = (list || []).find((d) => d.code === DICT_CODE);
      if (!dict) {
        setError('Справочник «Валюты» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      const items = [...(dict.items || [])].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.code.localeCompare(b.code, 'ru', { numeric: true }),
      );
      setCfgRow(items.find((i) => i.code === CFG_CODE) || null);
      setAutoCbu(
        Boolean(asCurrencyMeta(items.find((i) => i.code === CFG_CODE)?.meta).autoCbu),
      );
      setRows(items);
      setOrgName(org.settings?.orgName || org.tenant?.name || '');
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
    setPage(1);
  }, [q, filters.code, filters.name, filters.unit, filters.isActive, rateDate]);

  function resetForm() {
    setCode('');
    setName('');
    setIso('');
    setUnit('');
    setSubunit('');
    setAffixKind('postfix');
    setAffix('');
    setRoundingType('nearest');
    setRounding('####.##0000');
    setSortOrder(
      String((visibleRows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) || 0) + 1),
    );
    setActive(true);
    setError('');
  }

  function fillForm(row: DictItem) {
    const meta = asCurrencyMeta(row.meta);
    setEditId(row.id);
    setCode(row.code);
    setName(row.name);
    setIso(meta.iso || '');
    setUnit(meta.unit || '');
    setSubunit(meta.subunit || '');
    setAffixKind(meta.affixKind === 'prefix' ? 'prefix' : 'postfix');
    setAffix(meta.affix || '');
    setRoundingType(meta.roundingType || 'nearest');
    setRounding(meta.rounding || '####.##0000');
    setSortOrder(row.sortOrder != null ? String(row.sortOrder) : '');
    setActive(row.isActive !== false);
    setError('');
  }

  function openCreate() {
    setEditId(null);
    resetForm();
    setMode('create');
  }

  function openEdit(row: DictItem) {
    fillForm(row);
    setMode('edit');
  }

  async function openView(row: DictItem) {
    setViewRow(row);
    setViewTab('main');
    setHistKind('currency');
    setRateSelected(new Set());
    setMode('view');
    await loadHistory(row.id);
  }

  async function loadHistory(id?: string) {
    try {
      const logs = await apiFetch<AuditRow[]>(
        id
          ? `/api/settings/audit?entity=DictionaryItem&entityId=${encodeURIComponent(id)}`
          : '/api/settings/audit?entity=DictionaryItem',
      );
      const ids = new Set(visibleRows.map((r) => r.id));
      const list = (Array.isArray(logs) ? logs : []).filter((h) =>
        id ? true : h.entityId && ids.has(h.entityId),
      );
      setHistory(list);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    if (mode === 'view' && viewTab === 'history' && viewRow) {
      void loadHistory(viewRow.id);
    }
    if ((mode === 'history' || historyMode) && visibleRows.length) {
      void loadHistory();
    }
  }, [mode, viewTab, viewRow, historyMode, visibleRows.length]);

  function formMeta(existing?: CurrencyMeta): CurrencyMeta {
    return {
      ...existing,
      iso: iso.trim().toUpperCase() || undefined,
      unit: unit.trim() || undefined,
      subunit: subunit.trim() || undefined,
      affixKind,
      affix: affix.trim() || undefined,
      roundingType,
      rounding,
    };
  }

  async function save() {
    if (!dictId) return;
    if (!code.trim()) {
      setError('Укажите код');
      return;
    }
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    const meta = formMeta(asCurrencyMeta(existing?.meta));
    setSaving(true);
    setError('');
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        sortOrder: sortOrder.trim() === '' ? 0 : Number(sortOrder) || 0,
        isActive: active,
        meta,
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
        message: `Удалить выбранные валюты (${ids.length})?`,
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
      if (viewRow && ids.includes(viewRow.id)) setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!dictId) return;
    setSavingSettings(true);
    setError('');
    try {
      const body = {
        code: CFG_CODE,
        name: 'Настройки валют',
        isActive: false,
        meta: { autoCbu },
      };
      if (cfgRow) {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${cfgRow.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/api/settings/dictionaries/${dictId}/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setSettingsOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения настроек');
    } finally {
      setSavingSettings(false);
    }
  }

  async function patchRates(row: DictItem, rates: CurrencyRate[], extra?: Partial<CurrencyMeta>) {
    if (!dictId) return;
    const meta = { ...asCurrencyMeta(row.meta), rates, ...extra };
    const updated = await apiFetch<DictItem>(
      `/api/settings/dictionaries/${dictId}/items/${row.id}`,
      { method: 'PATCH', body: JSON.stringify({ meta }) },
    );
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated, meta } : r)));
    setViewRow((cur) => (cur && cur.id === row.id ? { ...cur, ...updated, meta } : cur));
  }

  async function saveRate() {
    if (!viewRow) return;
    const n = parseRate(rateFormValue);
    if (!rateFormDate) {
      setError('Укажите дату курса');
      return;
    }
    if (n == null) {
      setError('Укажите курс валют');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const meta = asCurrencyMeta(viewRow.meta);
      const rates = upsertRate(meta.rates, rateFormDate, n);
      const rateLog = [
        {
          createdAt: new Date().toISOString(),
          date: rateFormDate,
          rate: n,
        },
        ...(meta.rateLog || []),
      ].slice(0, 200);
      await patchRates(viewRow, rates, { rateLog });
      setRateModal(false);
      setRateFormValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения курса');
    } finally {
      setBusy(false);
    }
  }

  async function applyCbu(row?: DictItem | null) {
    if (
      !(await confirm({
        title: 'Курс ЦБ Узбекистана',
        message:
          'Вы уверены что хотите установите курс валюты по ЦБ Узбекистана?',
        confirmText: 'Да',
        cancelText: 'Нет',
        variant: 'primary',
      }))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<{ date: string; rates: CbuRow[] }>(
        `/api/settings/cbu-rates?date=${encodeURIComponent(rateDate)}`,
      );
      const day = data.date || rateDate;
      const targets = row ? [row] : visibleRows;
      for (const item of targets) {
        const meta = asCurrencyMeta(item.meta);
        let nextRate: number | null = null;
        if (isBaseCurrency(item.code, meta)) nextRate = 1;
        else {
          const hit = (data.rates || []).find((c) => matchCbuRow(item.code, meta, c));
          if (hit) nextRate = hit.rate;
        }
        if (nextRate == null) continue;
        const rates = upsertRate(meta.rates, day, nextRate);
        const rateLog = [
          { createdAt: new Date().toISOString(), date: day, rate: nextRate },
          ...(meta.rateLog || []),
        ].slice(0, 200);
        await patchRates(item, rates, { rateLog });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки курса ЦБ');
    } finally {
      setBusy(false);
    }
  }

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    const path = historyMode ? '/catalog/currencies/history' : '/catalog/currencies';
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  function setRateDate(v: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (v) params.set('rateDate', v);
    else params.delete('rateDate');
    const qs = params.toString();
    router.replace(qs ? `/catalog/currencies?${qs}` : '/catalog/currencies', {
      scroll: false,
    });
  }

  function exportCsv() {
    downloadCsv(
      `currencies-${todayISO()}.csv`,
      filtered.map((r) => {
        const meta = asCurrencyMeta(r.meta);
        return {
          Код: r.code,
          'Базовая денежная единица': meta.unit || '',
          Название: r.name,
          'Курс валют': formatRate(rateOnDate(meta.rates, rateDate)),
          Статус: r.isActive === false ? 'Неактивный' : 'Активный',
        };
      }),
    );
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
      const qq = q.trim().toLowerCase();
      if (!qq) return true;
      const blob = [
        fmtDateTime(h.createdAt),
        h.meta?.userName,
        eventLabel(h.action),
        orgName,
        h.meta?.name,
        h.meta?.code,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(qq);
    });
  }, [history, filters.from, filters.to, filters.user, filters.event, q, orgName]);

  const viewRates = useMemo(() => {
    const list = [...(asCurrencyMeta(viewRow?.meta).rates || [])].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const from = filters.from;
    const to = filters.to;
    const qq = q.trim().toLowerCase();
    return list.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!qq) return true;
      return `${fmtDate(r.date)} ${r.rate}`.toLowerCase().includes(qq);
    });
  }, [viewRow, filters.from, filters.to, q]);

  const viewRateLog = useMemo(() => {
    const list = asCurrencyMeta(viewRow?.meta).rateLog || [];
    const qq = q.trim().toLowerCase();
    return list.filter((r) => {
      if (filters.from && r.createdAt.slice(0, 10) < filters.from) return false;
      if (filters.to && r.createdAt.slice(0, 10) > filters.to) return false;
      if (!qq) return true;
      return `${fmtDateTime(r.createdAt)} ${r.date} ${r.rate}`.toLowerCase().includes(qq);
    });
  }, [viewRow, filters.from, filters.to, q]);

  function renderForm(title: string) {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title, siblings: [] }} />
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
                  <label>
                    Код <span className={formStyles.req}>*</span>
                  </label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} />
                  <p className={extra.hint}>
                    Для автоматического обновления курса введите код валюты (три
                    латинских символа, например USD). Справочник:{' '}
                    <a
                      className={extra.isoWiki}
                      href="https://en.wikipedia.org/wiki/ISO_4217"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ISO 4217
                    </a>
                  </p>
                </div>
                <div className={formStyles.field}>
                  <label>
                    Название <span className={formStyles.req}>*</span>
                  </label>
                  <input
                    value={name}
                    placeholder="Поиск"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>Базовая денежная единица</label>
                  <input value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
                <div className={formStyles.field}>
                  <div className={formStyles.radioRow}>
                    <label className={formStyles.radio}>
                      <input
                        type="radio"
                        checked={affixKind === 'prefix'}
                        onChange={() => setAffixKind('prefix')}
                      />
                      Префикс
                    </label>
                    <label className={formStyles.radio}>
                      <input
                        type="radio"
                        checked={affixKind === 'postfix'}
                        onChange={() => setAffixKind('postfix')}
                      />
                      Постфикс
                    </label>
                  </div>
                  <input
                    value={affix}
                    placeholder={affixKind === 'prefix' ? 'Префикс' : 'Постфикс'}
                    onChange={(e) => setAffix(e.target.value)}
                    style={{ marginTop: '0.4rem' }}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Тип округления <span className={formStyles.req}>*</span>
                  </label>
                  <select
                    value={roundingType}
                    onChange={(e) => setRoundingType(e.target.value)}
                  >
                    {ROUNDING_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={`${formStyles.field} ${formStyles.sortField}`}>
                  <label>Порядковый номер</label>
                  <input
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <div className={formStyles.field}>
                  <label>Разменная денежная единица</label>
                  <input
                    value={subunit}
                    onChange={(e) => setSubunit(e.target.value)}
                  />
                </div>
                <div className={formStyles.field}>
                  <label>
                    Округление <span className={formStyles.req}>*</span>
                  </label>
                  <select
                    value={rounding}
                    onChange={(e) => setRounding(e.target.value)}
                  >
                    {ROUNDING_FORMATS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={formStyles.field}>
                  <label>ISO</label>
                  <input
                    value={iso}
                    placeholder="USD"
                    onChange={(e) => setIso(e.target.value)}
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

  function historyToolbar() {
    return (
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
            label: 'Дата события',
          },
          { type: 'text', key: 'user', label: 'Пользователь', placeholder: 'Поиск...' },
          {
            type: 'select',
            key: 'event',
            label: 'Событие',
            options: [
              { value: 'dictionary.item.create', label: 'Создан' },
              { value: 'dictionary.item.update', label: 'Изменен' },
              { value: 'dictionary.item.delete', label: 'Удален' },
            ],
          },
        ]}
      />
    );
  }

  function rightSearch(countShown: number, countTotal: number, onExcel?: () => void) {
    return (
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
        {onExcel ? (
          <button type="button" className={styles.exportBtn} onClick={onExcel}>
            Excel
          </button>
        ) : null}
        <span className={styles.pagerMeta}>
          {countShown} / {countTotal}
        </span>
      </div>
    );
  }

  if (mode === 'create' || mode === 'edit') {
    return renderForm(mode === 'edit' ? 'Валюта (изменение)' : 'Валюта (создание)');
  }

  if (mode === 'view' && viewRow) {
    const meta = asCurrencyMeta(viewRow.meta);
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title: 'Валюта (просмотр)', siblings: [] }} />
        <div className={formStyles.actions} style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => openEdit(viewRow)}
          >
            Изменить
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
        <div className={local.viewLayout}>
          <aside className={local.side}>
            <div className={extra.sideName}>{viewRow.name}</div>
            <div className={extra.sideId}>({viewRow.code})</div>
            <span className={viewRow.isActive === false ? extra.badgeOff : extra.badge}>
              {viewRow.isActive === false ? 'Неактивный' : 'Активный'}
            </span>
            <nav className={local.sideNav}>
              <button
                type="button"
                className={viewTab === 'main' ? local.sideNavOn : undefined}
                onClick={() => setViewTab('main')}
              >
                Основная информация
              </button>
              <button
                type="button"
                className={viewTab === 'rates' ? local.sideNavOn : undefined}
                onClick={() => setViewTab('rates')}
              >
                Курсы
              </button>
              <button
                type="button"
                className={viewTab === 'history' ? local.sideNavOn : undefined}
                onClick={() => setViewTab('history')}
              >
                История изменений
              </button>
            </nav>
          </aside>

          {viewTab === 'main' ? (
            <div className={formStyles.card}>
              <h2 className={local.section}>Основная информация</h2>
              <div className={extra.viewGrid3}>
                <div className={formStyles.field}>
                  <label>Код</label>
                  <div className={local.readonly}>{viewRow.code}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Базовая денежная единица</label>
                  <div className={local.readonly}>{meta.unit || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Разменная денежная единица</label>
                  <div className={local.readonly}>{meta.subunit || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Название</label>
                  <div className={local.readonly}>{viewRow.name}</div>
                </div>
                <div className={formStyles.field}>
                  <label>{affixKindLabel(meta.affixKind) || 'Постфикс'}</label>
                  <div className={local.readonly}>{meta.affix || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Округление</label>
                  <div className={local.readonly}>{meta.rounding || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Тип округления</label>
                  <div className={local.readonly}>
                    {roundingTypeLabel(meta.roundingType) || '—'}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Порядковый номер</label>
                  <div className={local.readonly}>
                    {viewRow.sortOrder != null ? viewRow.sortOrder : '—'}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Создано</label>
                  <div className={local.readonly}>{fmtDateTime(meta.createdAt)}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Создал</label>
                  <div className={local.readonly}>{meta.createdBy || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Изменил</label>
                  <div className={local.readonly}>{meta.updatedBy || '—'}</div>
                </div>
                <div className={formStyles.field}>
                  <label>Изменено</label>
                  <div className={local.readonly}>{fmtDateTime(meta.updatedAt)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {viewTab === 'rates' ? (
            <div className={extra.ratesCard}>
              <div className={styles.toolbar}>
                <div className={styles.leftActions}>
                  <button
                    type="button"
                    className={styles.createBtn}
                    onClick={() => {
                      setRateFormDate(rateDate);
                      setRateFormValue('');
                      setRateModal(true);
                    }}
                  >
                    Установить курс
                  </button>
                  <button
                    type="button"
                    className={styles.createBtn}
                    disabled={busy}
                    onClick={() => void applyCbu(viewRow)}
                  >
                    Установить курс валюты по ЦБ Узбекистана
                  </button>
                  <FilterPanel
                    inline
                    urlSync
                    open={rateFiltersOpen}
                    onToggle={() => setRateFiltersOpen((v) => !v)}
                    fields={[
                      {
                        type: 'dateRange',
                        fromKey: 'from',
                        toKey: 'to',
                        label: 'Дата курса',
                      },
                    ]}
                  />
                </div>
                {rightSearch(viewRates.length, (meta.rates || []).length, () =>
                  downloadCsv(
                    `currency-rates-${viewRow.code}-${todayISO()}.csv`,
                    viewRates.map((r) => ({
                      'Дата курса': fmtDate(r.date),
                      'Курс валют': r.rate,
                    })),
                  ),
                )}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={
                            viewRates.length > 0 &&
                            viewRates.every((r) => rateSelected.has(r.date))
                          }
                          onChange={(e) => {
                            if (!e.target.checked) setRateSelected(new Set());
                            else setRateSelected(new Set(viewRates.map((r) => r.date)));
                          }}
                          aria-label="Выбрать все"
                        />
                      </th>
                      <th>Дата курса</th>
                      <th>Курс валют</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRates.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.empty}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      viewRates.map((r) => (
                        <tr key={r.date}>
                          <td>
                            <input
                              type="checkbox"
                              checked={rateSelected.has(r.date)}
                              onChange={(e) => {
                                setRateSelected((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(r.date);
                                  else next.delete(r.date);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td>{fmtDate(r.date)}</td>
                          <td>{r.rate}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {viewTab === 'history' ? (
            <div className={extra.ratesCard}>
              <div className={extra.historyHead}>
                <h2 className={local.section} style={{ margin: 0 }}>
                  История изменений
                </h2>
                <div className={extra.histLinks}>
                  <button
                    type="button"
                    className={histKind === 'currency' ? extra.histOn : undefined}
                    onClick={() => setHistKind('currency')}
                  >
                    Валюта
                  </button>
                  <button
                    type="button"
                    className={histKind === 'rate' ? extra.histOn : undefined}
                    onClick={() => setHistKind('rate')}
                  >
                    Курс валют
                  </button>
                </div>
              </div>
              <div className={styles.toolbar}>
                <div className={styles.leftActions}>{historyToolbar()}</div>
                {rightSearch(
                  histKind === 'rate' ? viewRateLog.length : histFiltered.length,
                  histKind === 'rate'
                    ? (meta.rateLog || []).length
                    : history.length,
                )}
              </div>
              <div className={styles.tableWrap}>
                {histKind === 'rate' ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата события</th>
                        <th>Пользователь</th>
                        <th>Событие</th>
                        <th>Организация</th>
                        <th>Продукт</th>
                        <th>Дата курса</th>
                        <th>Курс валют</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewRateLog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={styles.empty}>
                            Нет данных
                          </td>
                        </tr>
                      ) : (
                        viewRateLog.map((h, i) => (
                          <tr key={`${h.createdAt}-${i}`}>
                            <td>{fmtDateTime(h.createdAt)}</td>
                            <td>{h.userName || '—'}</td>
                            <td>Изменен</td>
                            <td>{orgName || '—'}</td>
                            <td>{viewRow.name}</td>
                            <td>{fmtDate(h.date)}</td>
                            <td>{h.rate}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата события</th>
                        <th>Пользователь</th>
                        <th>Событие</th>
                        <th>Организация</th>
                        <th>Название</th>
                        <th>Код</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={styles.empty}>
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
                            <td>{h.meta?.name || viewRow.name}</td>
                            <td>{h.meta?.code || viewRow.code}</td>
                            <td>
                              {viewRow.isActive === false ? 'Неактивный' : 'Активный'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {rateModal ? (
          <div className={extra.overlay} onClick={() => setRateModal(false)}>
            <div
              className={extra.modal}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={extra.modalTitle}>Добавить курс</h3>
              <div className={formStyles.field}>
                <label>
                  Дата курса <span className={formStyles.req}>*</span>
                </label>
                <input
                  type="date"
                  value={rateFormDate}
                  onChange={(e) => setRateFormDate(e.target.value)}
                />
              </div>
              <div className={formStyles.field}>
                <label>
                  Курс валют <span className={formStyles.req}>*</span>
                </label>
                <input
                  value={rateFormValue}
                  onChange={(e) => setRateFormValue(e.target.value)}
                />
              </div>
              <div className={formStyles.field}>
                <label>Базовая валюта</label>
                <div className={local.readonly}>{BASE_NAME}</div>
              </div>
              <div className={extra.modalFooter}>
                <button
                  type="button"
                  className={formStyles.btnSave}
                  disabled={busy}
                  onClick={() => void saveRate()}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className={formStyles.btnClose}
                  onClick={() => setRateModal(false)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === 'history') {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title: 'История изменений', siblings: [] }} />
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            {historyToolbar()}
            <button
              type="button"
              className={formStyles.btnClose}
              onClick={() => {
                if (historyMode) router.push('/catalog/currencies');
                else setMode('list');
              }}
            >
              Закрыть
            </button>
          </div>
          {rightSearch(histFiltered.length, history.length, () =>
            downloadCsv(
              `currencies-history-${todayISO()}.csv`,
              histFiltered.map((h) => ({
                'Дата события': fmtDateTime(h.createdAt),
                Пользователь: h.meta?.userName || '',
                Событие: eventLabel(h.action),
                Организация: orgName,
                Название: h.meta?.name || '',
                Код: h.meta?.code || '',
              })),
            ),
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата события</th>
                <th>Пользователь</th>
                <th>Событие</th>
                <th>Организация</th>
                <th>Название</th>
                <th>Код</th>
              </tr>
            </thead>
            <tbody>
              {histFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
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
                    <td>{h.meta?.code || '—'}</td>
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
    const meta = asCurrencyMeta(row.meta);
    const rate = rateOnDate(meta.rates, rateDate);
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
        <td className={styles.nameCell}>
          <span className={styles.nameText}>{row.code}</span>
          {open ? (
            <div
              className={`${styles.inlineActions} ${styles.rowActions}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => void openView(row)}>
                Просмотреть
              </button>
              <button type="button" onClick={() => openEdit(row)}>
                Изменить
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void setActiveIds([row.id], row.isActive === false)}
              >
                {row.isActive === false ? 'Активный' : 'Неактивный'}
              </button>
              <button type="button" onClick={() => void deleteIds([row.id])}>
                Удалить
              </button>
            </div>
          ) : null}
        </td>
        <td>{meta.unit || '—'}</td>
        <td>{row.name}</td>
        <td>{rate == null ? '' : rate}</td>
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
          title: 'Валюты',
          siblings: [
            { label: 'История изменений', href: '/catalog/currencies/history' },
          ],
        }}
      />
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
          <button
            type="button"
            className={styles.createBtn}
            onClick={() => setSettingsOpen(true)}
          >
            Настройки
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            title="История изменений"
            onClick={() => router.push('/catalog/currencies/history')}
          >
            ◷
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
                key: 'unit',
                label: 'Базовая денежная единица',
                placeholder: 'Поиск...',
              },
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              {
                type: 'dateFrom',
                key: 'rateDate',
                label: 'Дата курса',
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
                      onClick={() => void setActiveIds(Array.from(selected), false)}
                    >
                      Неактивный {selected.size}
                    </button>
                    <button
                      type="button"
                      onClick={() => void setActiveIds(Array.from(selected), true)}
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
          <label className={extra.dateField}>
            <span>Дата курса</span>
            <input
              type="date"
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
            />
          </label>
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
            {filtered.length} / {visibleRows.length}
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
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => void load()}
            aria-label="Обновить"
          >
            ↻
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
              <th>Базовая денежная единица</th>
              <th>Название</th>
              <th>Курс валют</th>
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
            ) : (
              paged.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {settingsOpen ? (
        <div className={extra.overlay} onClick={() => setSettingsOpen(false)}>
          <div
            className={`${extra.modal} ${extra.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={extra.modalTitle}>Настройки</h3>
            <div className={formStyles.statusBlock}>
              <span className={formStyles.fieldLabel}>
                Автоматическое обновление по курсу центрального банка Узбекистана
              </span>
              <label className={formStyles.toggleRow}>
                <button
                  type="button"
                  className={`${formStyles.toggle} ${autoCbu ? formStyles.toggleOn : ''}`}
                  onClick={() => setAutoCbu((v) => !v)}
                  aria-pressed={autoCbu}
                />
                <span>{autoCbu ? 'Да' : 'Нет'}</span>
              </label>
            </div>
            <div className={extra.modalFooter}>
              <button
                type="button"
                className={formStyles.btnSave}
                disabled={savingSettings}
                onClick={() => void saveSettings()}
              >
                Сохранить
              </button>
              <button
                type="button"
                className={formStyles.btnClose}
                onClick={() => setSettingsOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
