'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  TIMEZONES,
  asOrgMeta,
  autoOrgCode,
  type OrgItem,
  type OrgMeta,
} from '@/lib/organizations';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../../catalog/cashboxes/page.module.css';
import ui from './page.module.css';

type Dict = { id: string; code: string; name: string; items?: OrgItem[] };
type Opt = { id: string; label: string };

const DICT_CODE = 'orgs';
const PAGE_SIZE = 50;
const PATH = '/settings/organizations';
const FILTER_KEYS = ['q', 'inn', 'code', 'name', 'phone', 'email', 'isActive'] as const;

const TZ_OPTS: Opt[] = TIMEZONES.map((t) => ({ id: t.id, label: t.label }));

function OrganizationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;

  const [dictId, setDictId] = useState<string | null>(null);
  const [rows, setRows] = useState<OrgItem[]>([]);
  const [currencies, setCurrencies] = useState<Opt[]>([]);
  const [legalEntities, setLegalEntities] = useState<Opt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      filters.inn ||
        filters.code ||
        filters.name ||
        filters.phone ||
        filters.email ||
        filters.isActive,
    ),
  );
  const [statusOpen, setStatusOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'view'>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [altName, setAltName] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tashkent');
  const [seq, setSeq] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [active, setActive] = useState(true);
  const [vatPayer, setVatPayer] = useState(false);
  const [vatRate, setVatRate] = useState('');
  const [excisePayer, setExcisePayer] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const m = asOrgMeta(r.meta);
      if (filters.inn && !(m.inn || '').toLowerCase().includes(filters.inn.toLowerCase()))
        return false;
      if (filters.code && !r.code.toLowerCase().includes(filters.code.toLowerCase()))
        return false;
      if (filters.name && !r.name.toLowerCase().includes(filters.name.toLowerCase()))
        return false;
      if (filters.phone && !(m.phone || '').includes(filters.phone)) return false;
      if (filters.email && !(m.email || '').toLowerCase().includes(filters.email.toLowerCase()))
        return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      return [r.code, r.name, m.inn, m.phone, m.email, r.isActive === false ? 'неактивный' : 'активный']
        .join(' ')
        .toLowerCase()
        .includes(qq);
    });
  }, [
    rows,
    q,
    filters.inn,
    filters.code,
    filters.name,
    filters.phone,
    filters.email,
    filters.isActive,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [admin, extraDicts] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin'),
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=extra'),
      ]);
      const dict = (admin || []).find((d) => d.code === DICT_CODE);
      const legal = (admin || []).find((d) => d.code === 'legal_entities');
      const cur = (extraDicts || []).find((d) => d.code === 'currencies');
      if (!dict) {
        setError('Справочник «Организации» не найден');
        setRows([]);
        setDictId(null);
        return;
      }
      setDictId(dict.id);
      setRows(
        [...(dict.items || [])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'ru'),
        ),
      );
      setLegalEntities(
        (legal?.items || [])
          .filter((i) => i.isActive !== false)
          .map((i) => ({ id: i.id, label: i.name })),
      );
      setCurrencies(
        (cur?.items || [])
          .filter((i) => i.isActive !== false && i.code !== '_CFG')
          .map((i) => ({ id: i.id, label: `${i.code} ${i.name}` })),
      );
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
  }, [q, filters.inn, filters.code, filters.name, filters.phone, filters.email, filters.isActive]);

  function fillForm(row?: OrgItem) {
    const m = asOrgMeta(row?.meta);
    setName(row?.name || '');
    setCode(row?.code || '');
    setInn(m.inn || '');
    setPhone(m.phone || '');
    setEmail(m.email || '');
    setAltName(m.altName || '');
    setCurrencyId(m.currencyId || currencies[0]?.id || '');
    setTimezone(m.timezone || 'Asia/Tashkent');
    setSeq(row?.sortOrder != null ? String(row.sortOrder) : '');
    setLegalEntityId(m.legalEntityId || legalEntities[0]?.id || '');
    setActive(row ? row.isActive !== false : true);
    setVatPayer(Boolean(m.vatPayer));
    setVatRate(m.vatRate != null ? String(m.vatRate) : '');
    setExcisePayer(Boolean(m.excisePayer));
  }

  function openCreate() {
    setEditId(null);
    fillForm();
    setCurrencyId(currencies[0]?.id || '');
    setLegalEntityId(legalEntities[0]?.id || '');
    setMode('create');
    setError('');
  }

  function openEdit(row: OrgItem) {
    setEditId(row.id);
    fillForm(row);
    setMode('edit');
    setError('');
  }

  function openView(row: OrgItem) {
    setEditId(row.id);
    fillForm(row);
    setMode('view');
    setError('');
  }

  function buildMeta(): OrgMeta {
    const cur = currencies.find((c) => c.id === currencyId);
    const le = legalEntities.find((c) => c.id === legalEntityId);
    const rate = Number(vatRate.replace(',', '.'));
    return {
      inn: inn.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      altName: altName.trim() || undefined,
      currencyId: currencyId || undefined,
      currencyName: cur?.label,
      timezone: timezone || undefined,
      legalEntityId: legalEntityId || undefined,
      legalEntityName: le?.label,
      vatPayer,
      vatRate: vatPayer && Number.isFinite(rate) ? rate : null,
      excisePayer,
    };
  }

  async function save() {
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    if (!currencyId) {
      setError('Укажите базовую валюту');
      return;
    }
    if (!legalEntityId) {
      setError('Укажите юридическое лицо');
      return;
    }
    if (vatPayer && !vatRate.trim()) {
      setError('Укажите ставку НДС');
      return;
    }
    const existing = editId ? rows.find((r) => r.id === editId) : null;
    const nextCode = (code.trim() || existing?.code || autoOrgCode(name)).slice(0, 32);
    const sortOrder = seq.trim() ? Number(seq) : existing?.sortOrder ?? rows.length + 1;
    setSaving(true);
    setError('');
    try {
      const body = {
        code: nextCode,
        name: name.trim(),
        isActive: active,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        meta: buildMeta(),
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

  async function deleteIds(ids: string[], label?: string) {
    if (!dictId || !ids.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: label || `Удалить выбранные организации (${ids.length})?`,
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
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}/delete`, {
          method: 'POST',
        });
      }
      setSelected(new Set());
      setFocusId(null);
      setMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  function patchUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
  }

  function applySearch() {
    patchUrl({ q: searchDraft.trim() || null });
  }

  const title =
    mode === 'create'
      ? 'Организация (создание)'
      : mode === 'edit'
        ? 'Организация (изменение)'
        : mode === 'view'
          ? 'Организация (просмотр)'
          : 'Организации';
  const locked = mode === 'view';

  function fieldReadonly(value: string) {
    return <div className={local.readonly}>{value || '—'}</div>;
  }

  if (mode !== 'list') {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title, siblings: [] }} />
        <div className={formStyles.page}>
          <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
            {locked ? (
              <button
                type="button"
                className={styles.createBtn}
                onClick={() => {
                  const row = rows.find((r) => r.id === editId);
                  if (row) openEdit(row);
                }}
              >
                Изменить
              </button>
            ) : (
              <button
                type="button"
                className={formStyles.btnSave}
                disabled={saving}
                onClick={() => void save()}
              >
                Сохранить
              </button>
            )}
            <button
              type="button"
              className={formStyles.btnClose}
              onClick={() => setMode('list')}
            >
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={`${formStyles.card} ${formStyles.cardForm}`}>
            <div className={formStyles.layout}>
              <div>
                <div className={formStyles.field}>
                  <label>
                    Название <span className={formStyles.req}>*</span>
                  </label>
                  {locked ? (
                    fieldReadonly(name)
                  ) : (
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>
                    Базовая валюта <span className={formStyles.req}>*</span>
                  </label>
                  {locked ? (
                    fieldReadonly(currencies.find((c) => c.id === currencyId)?.label || '')
                  ) : (
                    <SearchLookup
                      value={currencyId}
                      options={currencies}
                      onChange={setCurrencyId}
                    />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>Часовой пояс</label>
                  {locked ? (
                    fieldReadonly(TZ_OPTS.find((t) => t.id === timezone)?.label || timezone)
                  ) : (
                    <SearchLookup
                      value={timezone}
                      options={TZ_OPTS}
                      allowClear
                      onChange={setTimezone}
                    />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>Порядковый номер</label>
                  {locked ? (
                    fieldReadonly(seq)
                  ) : (
                    <input value={seq} onChange={(e) => setSeq(e.target.value)} />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>Статус</label>
                  <label className={formStyles.toggleRow}>
                    <button
                      type="button"
                      className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                      disabled={locked}
                      onClick={() => setActive((v) => !v)}
                      aria-pressed={active}
                    />
                    <span>Активный</span>
                  </label>
                </div>
              </div>
              <div>
                <div className={formStyles.field}>
                  <label>
                    Юридическое лицо <span className={formStyles.req}>*</span>
                  </label>
                  {locked ? (
                    fieldReadonly(
                      legalEntities.find((c) => c.id === legalEntityId)?.label || '',
                    )
                  ) : (
                    <SearchLookup
                      value={legalEntityId}
                      options={legalEntities}
                      onChange={setLegalEntityId}
                    />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>Альтернативное название</label>
                  {locked ? (
                    fieldReadonly(altName)
                  ) : (
                    <input value={altName} onChange={(e) => setAltName(e.target.value)} />
                  )}
                </div>
                <div className={formStyles.field}>
                  <label>НДС</label>
                  <div className={ui.vatRow}>
                    <label className={formStyles.toggleRow}>
                      <button
                        type="button"
                        className={`${formStyles.toggle} ${vatPayer ? formStyles.toggleOn : ''}`}
                        disabled={locked}
                        onClick={() => setVatPayer((v) => !v)}
                        aria-pressed={vatPayer}
                      />
                      <span>
                        {vatPayer
                          ? 'Является плательщиком НДС'
                          : 'Не является плательщиком НДС'}
                      </span>
                    </label>
                    {vatPayer ? (
                      <div className={formStyles.field}>
                        <label>
                          Ставка НДС (%) <span className={formStyles.req}>*</span>
                        </label>
                        {locked ? (
                          fieldReadonly(vatRate)
                        ) : (
                          <input
                            value={vatRate}
                            inputMode="decimal"
                            onChange={(e) => setVatRate(e.target.value)}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={formStyles.field}>
                  <label>Акциз</label>
                  <label className={formStyles.toggleRow}>
                    <button
                      type="button"
                      className={`${formStyles.toggle} ${excisePayer ? formStyles.toggleOn : ''}`}
                      disabled={locked}
                      onClick={() => setExcisePayer((v) => !v)}
                      aria-pressed={excisePayer}
                    />
                    <span>
                      {excisePayer
                        ? 'Является плательщиком акцизов'
                        : 'Не является плательщиком акцизов'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title: 'Организации', siblings: [] }} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={openCreate}>
            Создать
          </button>
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
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'text', key: 'inn', label: 'ИНН', placeholder: 'Поиск...' },
              { type: 'text', key: 'code', label: 'Код', placeholder: 'Поиск...' },
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'text', key: 'phone', label: 'Телефон', placeholder: 'Поиск...' },
              { type: 'text', key: 'email', label: 'Email', placeholder: 'Поиск...' },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                'organizations.csv',
                filtered.map((r) => {
                  const m = asOrgMeta(r.meta);
                  return {
                    ИНН: m.inn || '',
                    Код: r.code,
                    Название: r.name,
                    Телефон: m.phone || '',
                    Email: m.email || '',
                    Статус: r.isActive === false ? 'Неактивный' : 'Активный',
                  };
                }),
              )
            }
          >
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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 && filtered.every((r) => selected.has(r.id))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set(),
                    )
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th>ИНН</th>
              <th>Код</th>
              <th>Название</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const open = focusId === row.id;
                const m = asOrgMeta(row.meta);
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
                    <td>{m.inn || ''}</td>
                    <td>{row.code}</td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{row.name}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={() => openView(row)}>
                            Просмотреть
                          </button>
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
                            onClick={() =>
                              void deleteIds([row.id], `Удалить «${row.name}»?`)
                            }
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>{m.phone || ''}</td>
                    <td>{m.email || ''}</td>
                    <td>
                      <span className={row.isActive === false ? extra.badgeOff : extra.badge}>
                        {row.isActive === false ? 'Неактивный' : 'Активный'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrganizationsPage() {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <OrganizationsInner />
    </Suspense>
  );
}
