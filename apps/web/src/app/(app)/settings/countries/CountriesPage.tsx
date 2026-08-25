'use client';

import { confirm } from '@/lib/dialogs';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { SearchLookup } from '@/app/(app)/catalog/avg-salaries/SearchLookup';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { fmtDateTime } from '@/lib/currencies';
import {
  asGeoMeta,
  autoGeoCode,
  histEventLabel,
  regionOfCountry,
  type GeoItem,
} from '@/lib/countries';
import styles from '../../catalog/absence-types/page.module.css';
import formStyles from '../../catalog/report-templates/form.module.css';
import local from '../../catalog/document-types/page.module.css';
import extra from '../../catalog/cashboxes/page.module.css';
import ui from './page.module.css';

type Dict = { id: string; code: string; name: string; items?: GeoItem[] };
type AuditRow = {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  meta?: { userName?: string; name?: string; code?: string } | null;
};

const PATH = '/settings/countries';
const PAGE_SIZE = 50;
const FILTER_KEYS = ['q', 'name', 'isActive'] as const;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function CountriesInner({ historyMode }: { historyMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const countryParam = searchParams.get('country') || '';

  const [countryDictId, setCountryDictId] = useState<string | null>(null);
  const [regionDictId, setRegionDictId] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoItem[]>([]);
  const [regions, setRegions] = useState<GeoItem[]>([]);
  const [orgName, setOrgName] = useState('Lalaku');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(q);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(filters.name || filters.isActive));
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [kind, setKind] = useState<'country' | 'region'>('country');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [altName, setAltName] = useState('');
  const [gps, setGps] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [docId, setDocId] = useState(searchParams.get('doc') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || isoMonthsAgo(3));
  const [dateTo, setDateTo] = useState(searchParams.get('to') || isoToday());
  const [lagDays, setLagDays] = useState(searchParams.get('lag') || '');
  const [fieldsText, setFieldsText] = useState(searchParams.get('fields') || '');
  const [applied, setApplied] = useState({
    docId: searchParams.get('doc') || '',
    from: searchParams.get('from') || isoMonthsAgo(3),
    to: searchParams.get('to') || isoToday(),
    lag: searchParams.get('lag') || '',
    fields: searchParams.get('fields') || '',
  });

  const focusCountry = countries.find((c) => c.id === countryParam) || null;
  const oblastsView = Boolean(focusCountry) && !historyMode;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [admin, org] = await Promise.all([
        apiFetch<Dict[]>('/api/settings/dictionaries?kind=admin'),
        apiFetch<{ settings?: { orgName?: string }; tenant?: { name: string } }>('/api/settings/org'),
      ]);
      const cDict = (admin || []).find((d) => d.code === 'countries');
      const rDict = (admin || []).find((d) => d.code === 'regions');
      if (!cDict) {
        setError('Справочник «Страны» не найден');
        return;
      }
      setCountryDictId(cDict.id);
      setRegionDictId(rDict?.id || null);
      setCountries([...(cDict.items || [])].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setRegions(rDict?.items || []);
      setOrgName(org.settings?.orgName || org.tenant?.name || 'Lalaku');
      if (historyMode) {
        const qs = new URLSearchParams();
        qs.set('entity', 'DictionaryItem');
        if (applied.from) qs.set('from', applied.from);
        if (applied.to) qs.set('to', applied.to);
        const hist = await apiFetch<AuditRow[]>(`/api/settings/audit?${qs.toString()}`);
        setAudit(hist || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyMode, applied.from, applied.to]);

  const rowSource = oblastsView
    ? regions.filter((r) => (focusCountry ? regionOfCountry(r, focusCountry) : true))
    : countries;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rowSource.filter((r) => {
      const m = asGeoMeta(r.meta);
      if (filters.name && !r.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.isActive === '1' && r.isActive === false) return false;
      if (filters.isActive === '0' && r.isActive !== false) return false;
      if (!qq) return true;
      return [r.name, r.code, m.altName, m.gps].join(' ').toLowerCase().includes(qq);
    });
  }, [rowSource, q, filters.name, filters.isActive]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setFocusId(null);
  }, [q, filters.name, filters.isActive, countryParam, historyMode]);

  const geoIds = useMemo(() => new Set([...countries, ...regions].map((x) => x.id)), [countries, regions]);
  const docOptions = useMemo(
    () => [
      ...countries.map((c) => ({ id: c.id, label: `Страна: ${c.name}` })),
      ...regions.map((r) => ({ id: r.id, label: `Регион: ${r.name}` })),
    ],
    [countries, regions],
  );

  const histFiltered = useMemo(() => {
    let rows = audit.filter((a) => !a.entityId || geoIds.has(a.entityId));
    if (applied.docId) rows = rows.filter((a) => a.entityId === applied.docId);
    if (filters.name) {
      const n = filters.name.toLowerCase();
      rows = rows.filter((a) => (a.meta?.userName || '').toLowerCase().includes(n));
    }
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((a) =>
        [fmtDateTime(a.createdAt), a.meta?.userName, histEventLabel(a.action), orgName, a.meta?.name]
          .join(' ')
          .toLowerCase()
          .includes(qq),
      );
    }
    return rows;
  }, [audit, geoIds, applied.docId, q, orgName, filters.name]);

  function fill(row?: GeoItem) {
    const m = asGeoMeta(row?.meta);
    setName(row?.name || '');
    setAltName(m.altName || '');
    setGps(m.gps || '');
    setCode(row?.code || '');
    setActive(row ? row.isActive !== false : true);
  }

  function openCreate(nextKind: 'country' | 'region') {
    if (nextKind === 'region' && !focusCountry) {
      setError('Сначала откройте области страны');
      return;
    }
    setKind(nextKind);
    setEditId(null);
    fill();
    setMode('create');
    setError('');
  }

  function openEdit(row: GeoItem, nextKind: 'country' | 'region') {
    setKind(nextKind);
    setEditId(row.id);
    fill(row);
    setMode('edit');
    setError('');
  }

  function dictIdFor(k: 'country' | 'region') {
    return k === 'country' ? countryDictId : regionDictId;
  }

  async function save() {
    const dictId = dictIdFor(kind);
    if (!dictId) return;
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    const list = kind === 'country' ? countries : regions;
    const existing = editId ? list.find((r) => r.id === editId) : null;
    const nextCode = (code.trim() || existing?.code || autoGeoCode(name, kind === 'country' ? 'C' : 'R')).slice(0, 16);
    setSaving(true);
    setError('');
    try {
      const meta =
        kind === 'country'
          ? { altName: altName.trim() || undefined, gps: gps.trim() || undefined }
          : {
              altName: altName.trim() || undefined,
              gps: gps.trim() || undefined,
              countryId: focusCountry?.id || asGeoMeta(existing?.meta).countryId,
              countryCode: focusCountry?.code || asGeoMeta(existing?.meta).countryCode,
              countryName: focusCountry?.name || asGeoMeta(existing?.meta).countryName,
            };
      const body = {
        code: nextCode,
        name: name.trim(),
        isActive: active,
        sortOrder: existing?.sortOrder ?? list.length + 1,
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

  async function deleteIds(ids: string[], label?: string, k?: 'country' | 'region') {
    const dictId = dictIdFor(k || (oblastsView ? 'region' : 'country'));
    if (!dictId || !ids.length) return;
    if (
      !(await confirm({
        title: 'Удаление',
        message: label || `Удалить выбранные записи (${ids.length})?`,
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
        await apiFetch(`/api/settings/dictionaries/${dictId}/items/${id}/delete`, { method: 'POST' });
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

  function patchUrl(patch: Record<string, string | null>, path = PATH) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  function applySearch() {
    patchUrl({ q: searchDraft.trim() || null }, historyMode ? `${PATH}/history` : PATH);
  }

  function applyParams() {
    if (!docId) {
      setError('Укажите документ');
      return;
    }
    if (!dateFrom || !dateTo) {
      setError('Укажите период');
      return;
    }
    setError('');
    setApplied({ docId, from: dateFrom, to: dateTo, lag: lagDays, fields: fieldsText });
    patchUrl(
      {
        doc: docId,
        from: dateFrom,
        to: dateTo,
        lag: lagDays.trim() || null,
        fields: fieldsText.trim() || null,
      },
      `${PATH}/history`,
    );
    setParamsOpen(false);
  }

  function resetParams() {
    const from = isoMonthsAgo(3);
    const to = isoToday();
    setDocId('');
    setDateFrom(from);
    setDateTo(to);
    setLagDays('');
    setFieldsText('');
  }

  const title =
    mode !== 'list'
      ? kind === 'region'
        ? mode === 'create'
          ? 'Регион (создание)'
          : 'Регион (изменение)'
        : mode === 'create'
          ? 'Страна (создание)'
          : 'Страна (изменение)'
      : historyMode
        ? 'История изменений'
        : oblastsView
          ? 'Области'
          : 'Страны';

  function pager(totalFiltered: number, totalAll: number) {
    const count = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
    return (
      <>
        <span className={styles.pagerMeta}>
          {totalFiltered} / {totalAll}
        </span>
        <button type="button" className={styles.toolBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ‹
        </button>
        <span className={styles.pagerMeta}>{Math.min(page, count)}</span>
        <button
          type="button"
          className={styles.toolBtn}
          disabled={page >= count}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
          ↻
        </button>
      </>
    );
  }

  if (mode !== 'list') {
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title, siblings: [] }} />
        <div className={formStyles.page}>
          <div className={formStyles.actions} style={{ marginBottom: '0.35rem' }}>
            <button type="button" className={formStyles.btnSave} disabled={saving} onClick={() => void save()}>
              Сохранить
            </button>
            <button type="button" className={formStyles.btnClose} onClick={() => setMode('list')}>
              Закрыть
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={`${formStyles.card} ${formStyles.cardForm}`}>
            <div className={formStyles.field}>
              <label>
                Название <span className={formStyles.req}>*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label>Альтернативное название</label>
              <input value={altName} onChange={(e) => setAltName(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label>GPS координаты</label>
              <div className={ui.gpsWrap}>
                <input value={gps} readOnly placeholder="" />
                <button
                  type="button"
                  className={ui.gpsBtn}
                  aria-label="Карта"
                  onClick={() => {
                    const next = window.prompt('GPS координаты (широта, долгота)', gps);
                    if (next != null) setGps(next.trim());
                  }}
                >
                  📍
                </button>
                <button type="button" className={ui.gpsBtn} aria-label="Очистить" onClick={() => setGps('')}>
                  ×
                </button>
              </div>
            </div>
            <div className={formStyles.field} style={{ maxWidth: 280 }}>
              <label>Код</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className={formStyles.field}>
              <label>Статус</label>
              <label className={formStyles.toggleRow}>
                <button
                  type="button"
                  className={`${formStyles.toggle} ${active ? formStyles.toggleOn : ''}`}
                  onClick={() => setActive((v) => !v)}
                  aria-pressed={active}
                />
                <span>Активный</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (historyMode) {
    const histPaged = histFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return (
      <div className={styles.wrap}>
        <PageSubnav group={{ title: 'История изменений', siblings: [] }} />
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.toolbar}>
          <div className={styles.leftActions}>
            <button type="button" className={formStyles.btnSave} onClick={() => setParamsOpen(true)}>
              Параметры
            </button>
            <button type="button" className={formStyles.btnClose} onClick={() => router.push(PATH)}>
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
            <FilterPanel
              inline
              urlSync
              open={filtersOpen}
              onToggle={() => setFiltersOpen((v) => !v)}
              fields={[{ type: 'text', key: 'name', label: 'Пользователь', placeholder: 'Поиск...' }]}
            />
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() =>
                downloadCsv(
                  'countries-history.csv',
                  histFiltered.map((h) => ({
                    'Дата и время изменения': fmtDateTime(h.createdAt),
                    Пользователь: h.meta?.userName || '',
                    'Тип события': histEventLabel(h.action),
                    Организация: orgName,
                    Продукт: 'Verifix',
                  })),
                )
              }
            >
              Excel
            </button>
            {pager(histFiltered.length, audit.length)}
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
              {loading ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : histPaged.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                histPaged.map((h) => {
                  const open = detailId === h.id;
                  const extraFields = applied.fields
                    .split(/[,\n]/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const blob = (h.meta || {}) as Record<string, unknown>;
                  const details = extraFields.length
                    ? extraFields.map((k) => `${k}: ${blob[k] ?? '—'}`).join('\n')
                    : JSON.stringify(blob, null, 2);
                  return (
                    <tr key={h.id}>
                      <td className={styles.nameCell}>
                        <span className={styles.nameText}>{fmtDateTime(h.createdAt)}</span>
                        <div className={`${styles.inlineActions} ${styles.rowActions}`}>
                          <button type="button" onClick={() => setDetailId(open ? null : h.id)}>
                            Детали
                          </button>
                        </div>
                        {open ? <pre className={ui.details}>{details || '—'}</pre> : null}
                      </td>
                      <td>{h.meta?.userName || '—'}</td>
                      <td>{histEventLabel(h.action)}</td>
                      <td>{orgName}</td>
                      <td>Verifix</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {paramsOpen ? (
          <div className={ui.overlay} onClick={() => setParamsOpen(false)}>
            <div className={ui.modal} onClick={(e) => e.stopPropagation()}>
              <h3 className={ui.modalTitle}>Параметры</h3>
              <div className={formStyles.field}>
                <label>
                  Документ <span className={formStyles.req}>*</span>
                </label>
                <SearchLookup value={docId} options={docOptions} onChange={setDocId} />
              </div>
              <div className={formStyles.field}>
                <label>
                  Дата начала <span className={formStyles.req}>*</span>
                </label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className={formStyles.field}>
                <label>
                  Дата окончания <span className={formStyles.req}>*</span>
                </label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className={formStyles.field}>
                <label>Разница в днях между датой изменения и датой доставки</label>
                <input value={lagDays} onChange={(e) => setLagDays(e.target.value)} />
              </div>
              <div className={formStyles.field}>
                <label>Поля</label>
                <textarea rows={4} value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} />
              </div>
              <div className={ui.modalFooter}>
                <button type="button" className={formStyles.btnSave} onClick={applyParams}>
                  Выбрать
                </button>
                <button type="button" className={formStyles.btnClose} onClick={resetParams}>
                  Сбросить
                </button>
                <button type="button" className={formStyles.btnClose} onClick={() => setParamsOpen(false)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function areaNames(country: GeoItem) {
    return regions
      .filter((r) => regionOfCountry(r, country))
      .map((r) => r.name)
      .join(', ');
  }

  const listKind: 'country' | 'region' = oblastsView ? 'region' : 'country';

  return (
    <div className={styles.wrap}>
      <PageSubnav group={{ title, siblings: [] }} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <button type="button" className={styles.createBtn} onClick={() => openCreate(listKind)}>
            Создать
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void load()} aria-label="Обновить">
            ↻
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              className={local.btnDanger}
              disabled={busy}
              onClick={() => void deleteIds(Array.from(selected), undefined, listKind)}
            >
              Удалить {selected.size}
            </button>
          ) : null}
          {oblastsView ? (
            <button type="button" className={formStyles.btnClose} onClick={() => patchUrl({ country: null })}>
              Закрыть
            </button>
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
              { type: 'text', key: 'name', label: 'Название', placeholder: 'Поиск...' },
              { type: 'isActive', key: 'isActive', label: 'Статус' },
            ]}
          />
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() =>
              downloadCsv(
                oblastsView ? 'regions.csv' : 'countries.csv',
                filtered.map((r) => {
                  const m = asGeoMeta(r.meta);
                  return {
                    Название: r.name,
                    Код: r.code,
                    'Альт. название': m.altName || '',
                    GPS: m.gps || '',
                    Области: oblastsView ? '' : areaNames(r),
                    Статус: r.isActive === false ? 'Неактивный' : 'Активный',
                  };
                }),
              )
            }
          >
            Excel
          </button>
          {pager(filtered.length, rowSource.length)}
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())
                  }
                  aria-label="Выбрать все"
                />
              </th>
              <th>Название</th>
              {oblastsView ? <th>Код</th> : <th>Области</th>}
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const open = focusId === row.id;
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
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <span className={styles.nameText}>{row.name}</span>
                      {open ? (
                        <div
                          className={`${styles.inlineActions} ${styles.rowActions}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={() => openEdit(row, listKind)}>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() => void deleteIds([row.id], `Удалить «${row.name}»?`, listKind)}
                          >
                            Удалить
                          </button>
                          {!oblastsView ? (
                            <button type="button" onClick={() => patchUrl({ country: row.id })}>
                              Области
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>{oblastsView ? row.code : areaNames(row)}</td>
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

export function CountriesPage({ historyMode }: { historyMode?: boolean }) {
  return (
    <Suspense fallback={<p className={styles.empty}>Загрузка…</p>}>
      <CountriesInner historyMode={historyMode} />
    </Suspense>
  );
}
