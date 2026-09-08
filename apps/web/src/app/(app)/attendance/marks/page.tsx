'use client';
import { confirm as confirmDialog } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
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
import { apiFetch, type PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { mediaSrc } from '@/lib/media';
import { prefsConfigFromColumns } from '@/lib/table-field-defs/from-columns';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

const FILTER_KEYS = [
  'q',
  'divisionId',
  'locationId',
  'employeeId',
  'markTypes',
  'dateFrom',
  'dateTo',
] as const;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  tabNumber?: string;
  faceProfile?: { photoUrl?: string | null } | null;
  division?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
};

type Mark = {
  id: string;
  occurredAt: string;
  markType: string;
  markTypeLabel: string;
  deviceType?: string | null;
  identificationType?: string | null;
  locationName?: string | null;
  deviceName?: string | null;
  isValid?: boolean;
  clockTamper?: boolean;
  note?: string | null;
  photoUrl?: string | null;
  employee?: Emp | null;
  device?: { id: string; name: string; location?: { name: string } | null } | null;
};

type Named = { id: string; name: string };

const marksListPrefs = prefsConfigFromColumns({
  storageKey: 'hrhub.table.marks.v1',
  title: 'Отметки',
  columns: [
    { key: 'photo', label: 'Фото' },
    { key: 'person', label: 'Физическое лицо' },
    { key: 'location', label: 'Локация' },
    { key: 'deviceType', label: 'Тип устройства' },
    { key: 'markType', label: 'Тип отметки' },
    { key: 'identificationType', label: 'Тип идентификации' },
    { key: 'time', label: 'Время' },
    { key: 'division', label: 'Подразделение' },
    { key: 'job', label: 'Должность' },
    { key: 'note', label: 'Примечание' },
    { key: 'deviceName', label: 'Устройство' },
  ],
  defaultColumns: [
    'photo',
    'person',
    'location',
    'deviceType',
    'markType',
    'identificationType',
    'time',
  ],
  defaultSearchKeys: ['person', 'location', 'deviceName', 'note'],
  defaultSort: [{ key: 'time', dir: 'desc' }],
  searchableKeys: ['person', 'location', 'deviceName', 'note', 'deviceType', 'markType'],
});

const MARK_TYPE_OPTS = [
  { key: 'in', label: 'Приход' },
  { key: 'out', label: 'Уход' },
  { key: 'estimated_out', label: 'Такминий уход' },
  { key: 'mark', label: 'Отметка' },
  { key: 'break_in', label: 'Перерыв приход' },
  { key: 'break_out', label: 'Перерыв уход' },
];

function empName(e?: Emp | null) {
  if (!e) return '—';
  return [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');
}

function fmtDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function typeClass(t: string) {
  if (t === 'in') return styles.dotIn;
  if (t === 'out') return styles.dotOut;
  if (t === 'estimated_out') return styles.dotEst;
  if (t === 'break_in' || t === 'break_out') return styles.dotBreak;
  return styles.dotMark;
}

function markDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function markCell(m: Mark, key: string): string {
  switch (key) {
    case 'photo':
      return m.photoUrl ? 'есть' : '';
    case 'person':
      return empName(m.employee) === '—' ? '' : empName(m.employee);
    case 'location':
      return m.locationName || m.device?.location?.name || '';
    case 'deviceType':
      return m.deviceType || '';
    case 'markType':
      return m.markTypeLabel || m.markType || '';
    case 'identificationType':
      return m.identificationType || '';
    case 'time': {
      const t = fmtDt(m.occurredAt);
      return m.clockTamper ? `${t} ⚠` : t;
    }
    case 'division':
      return m.employee?.division?.name || '';
    case 'job':
      return m.employee?.position?.name || '';
    case 'note':
      return m.note || '';
    case 'deviceName':
      return m.deviceName || m.device?.name || '';
    default:
      return '';
  }
}

function MarksInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl(FILTER_KEYS);
  const prefs = useTablePrefs(marksListPrefs);
  const [rows, setRows] = useState<Mark[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [searchDraft, setSearchDraft] = useState(filters.q || '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(filters.employeeId || filters.dateFrom || filters.dateTo),
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    action: string;
    markType?: string;
  } | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyFrom, setApplyFrom] = useState('');
  const [applyTo, setApplyTo] = useState('');
  const [divisions, setDivisions] = useState<Named[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [employees, setEmployees] = useState<Named[]>([]);
  const photos = usePhotoLightbox();

  const displayRows = useMemo(
    () => prefs.applySortToRows(rows, markCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [rows, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : marksListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const scopeLabel = useMemo(() => {
    const employeeId = (searchParams?.get('employeeId') || filters.employeeId || '').trim();
    const dateFrom = (searchParams?.get('dateFrom') || filters.dateFrom || '').trim();
    const dateTo = (searchParams?.get('dateTo') || filters.dateTo || '').trim();
    if (!employeeId && !dateFrom && !dateTo) return '';
    const emp = employees.find((e) => e.id === employeeId)?.name || '';
    const fmt = (iso: string) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return d && m && y ? `${d}.${m}.${y}` : iso;
    };
    const date =
      dateFrom && dateTo && dateFrom !== dateTo
        ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
        : fmt(dateFrom || dateTo);
    return [emp, date].filter(Boolean).join(' · ');
  }, [employees, filters.dateFrom, filters.dateTo, filters.employeeId, searchParams]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const selectedValid = checkedIds.filter((id) => {
    const r = rows.find((x) => x.id === id);
    return r && r.isValid !== false;
  }).length;
  const selectedInvalid = checkedIds.length - selectedValid;
  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked =
    displayRows.some((r) => checked[r.id]) && !allPageChecked;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  function urlFilter(key: string) {
    return (searchParams?.get(key) || filters[key] || '').trim();
  }

  async function load(p = page) {
    setLoading(true);
    setError('');
    try {
      const employeeId = urlFilter('employeeId');
      const dateFrom = urlFilter('dateFrom') || urlFilter('from');
      const dateTo = urlFilter('dateTo') || urlFilter('to');
      const qs = new URLSearchParams();
      qs.set('page', String(p));
      qs.set('limit', '50');
      const q = (urlFilter('q') || searchDraft).trim();
      if (q) qs.set('q', q);
      if (urlFilter('divisionId')) qs.set('divisionId', urlFilter('divisionId'));
      if (urlFilter('locationId')) qs.set('locationId', urlFilter('locationId'));
      if (employeeId) qs.set('employeeId', employeeId);
      if (urlFilter('markTypes')) qs.set('markTypes', urlFilter('markTypes'));
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      const data = await apiFetch<PageResult<Mark> | Mark[]>(
        `/api/attendance/marks?${qs.toString()}`,
      );
      const raw = Array.isArray(data) ? data : data.items || [];
      const scoped = raw.filter((m) => {
        if (employeeId && m.employee?.id !== employeeId) return false;
        const day = markDay(m.occurredAt);
        if (dateFrom && day && day < dateFrom) return false;
        if (dateTo && day && day > dateTo) return false;
        return true;
      });
      setRows(scoped);
      setTotal(
        Array.isArray(data)
          ? scoped.length
          : employeeId || dateFrom || dateTo
            ? scoped.length
            : data.total || scoped.length,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q,
    filters.divisionId,
    filters.locationId,
    filters.employeeId,
    filters.markTypes,
    filters.dateFrom,
    filters.dateTo,
  ]);

  useEffect(() => {
    setSearchDraft(filters.q || '');
  }, [filters.q]);

  useEffect(() => {
    void (async () => {
      try {
        const [divs, locs, emps] = await Promise.all([
          apiFetch<Named[] | PageResult<Named>>('/api/organization/divisions').catch(
            () => [],
          ),
          apiFetch<Named[]>('/api/attendance/locations').catch(() => []),
          apiFetch<
            | { id: string; firstName: string; lastName: string }[]
            | PageResult<{ id: string; firstName: string; lastName: string }>
          >('/api/employees?status=active&limit=300').catch(() => []),
        ]);
        const dItems = Array.isArray(divs) ? divs : divs.items || [];
        setDivisions(dItems.map((d) => ({ id: d.id, name: d.name })));
        setLocations(
          (Array.isArray(locs) ? locs : []).map((l) => ({ id: l.id, name: l.name })),
        );
        const eItems = Array.isArray(emps) ? emps : emps.items || [];
        const mapped = eItems.map((e) => ({
          id: e.id,
          name: `${e.lastName} ${e.firstName}`,
        }));
        const focusedId = (searchParams?.get('employeeId') || '').trim();
        if (focusedId && !mapped.some((e) => e.id === focusedId)) {
          const one = await apiFetch<{
            id: string;
            firstName: string;
            lastName: string;
            middleName?: string | null;
          }>(`/api/employees/${focusedId}`).catch(() => null);
          if (one) {
            mapped.unshift({
              id: one.id,
              name: [one.lastName, one.firstName, one.middleName].filter(Boolean).join(' '),
            });
          }
        }
        setEmployees(mapped);
      } catch {
        /* ignore */
      }
    })();
  }, [searchParams]);

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of displayRows) {
        if (on) next[r.id] = true;
        else delete next[r.id];
      }
      return next;
    });
  }

  function exportCsv() {
    downloadCsv(
      `marks-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((m) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          if (k === 'photo') {
            obj[prefs.labelOf(k)] = m.photoUrl ? 'есть' : '—';
            continue;
          }
          obj[prefs.labelOf(k)] = markCell(m, k) || '—';
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
    router.replace(qs ? `/attendance/marks?${qs}` : '/attendance/marks', { scroll: false });
  }

  async function runBulk(action: string, markType?: string) {
    if (!checkedIds.length) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ affected: number }>('/api/attendance/marks/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: checkedIds, action, markType }),
      });
      setInfo(`Готово: ${res.affected}`);
      setChecked({});
      setConfirm(null);
      setTypeOpen(false);
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function runOne(id: string, action: string, markType?: string) {
    setBusy(true);
    try {
      if (action === 'delete') {
        await apiFetch(`/api/attendance/marks/${id}`, { method: 'DELETE' });
      } else if (action === 'set_valid' || action === 'set_invalid') {
        await apiFetch(`/api/attendance/marks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isValid: action === 'set_valid' }),
        });
      } else if (action === 'set_type' && markType) {
        await apiFetch(`/api/attendance/marks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ markType }),
        });
      }
      await load(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="marks" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTimesheet}`}>
          <i className="fas fa-fingerprint" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Отметки</h1>
          <p className={shared.pageSubtitle}>
            Журнал отметок посещаемости: приход, уход, перерывы
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
          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.createBtn}
              onClick={() => setCreateOpen((v) => !v)}
            >
              <i className="fas fa-plus" aria-hidden />
              Создать ▾
            </button>
            {createOpen ? (
              <div className={styles.menu}>
                <Link href="/attendance/marks/copy" onClick={() => setCreateOpen(false)}>
                  Копирование отметок
                </Link>
                <Link href="/attendance/marks/import" onClick={() => setCreateOpen(false)}>
                  Импорт
                </Link>
              </div>
            ) : null}
          </div>
          <FilterPanel
            inline
            urlSync
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            fields={[
              { type: 'dateFrom', key: 'dateFrom', label: 'Дата с' },
              { type: 'dateTo', key: 'dateTo', label: 'Дата по' },
              {
                type: 'select',
                key: 'divisionId',
                label: 'Подразделение',
                options: divisions.map((d) => ({ value: d.id, label: d.name })),
              },
              {
                type: 'select',
                key: 'locationId',
                label: 'Локация',
                options: locations.map((l) => ({ value: l.id, label: l.name })),
              },
              {
                type: 'select',
                key: 'employeeId',
                label: 'Физическое лицо',
                options: employees.map((e) => ({ value: e.id, label: e.name })),
              },
              {
                type: 'select',
                key: 'markTypes',
                label: 'Тип отметки',
                options: MARK_TYPE_OPTS.map((t) => ({ value: t.key, label: t.label })),
              },
              { type: 'text', key: 'q', label: 'Поиск', placeholder: 'Поиск...' },
            ]}
          />
        </div>
        <div className={styles.rightTools}>
          <span className={styles.countBadge}>
            {rows.length} / {total}
          </span>
          <div className={styles.pager}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1;
                setPage(p);
                void load(p);
              }}
            >
              ‹
            </button>
            <button type="button" className={styles.pageBtnActive}>
              {page}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                void load(p);
              }}
            >
              ›
            </button>
          </div>
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
            onClick={() => void load(page)}
            title="Обновить"
            aria-label="Обновить"
          >
            <i className="fas fa-sync-alt" aria-hidden />
          </button>
          <TablePrefsMenuButton prefs={prefs} onExport={exportCsv} />
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.info}>{info}</p> : null}
      {scopeLabel ? <p className={styles.scope}>{scopeLabel}</p> : null}

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() => setTypeOpen((v) => !v)}
            >
              <i className="fas fa-exchange-alt" aria-hidden />
              Изменить тип
            </button>
            {typeOpen ? (
              <div className={styles.menu}>
                {MARK_TYPE_OPTS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() =>
                      setConfirm({
                        title: `Изменить тип на «${t.label}» для ${checkedIds.length}?`,
                        action: 'set_type',
                        markType: t.key,
                      })
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {selectedInvalid > 0 ? (
            <button
              type="button"
              className={`${styles.bulkBtn} ${styles.bulkOk}`}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Сделать действительными отметки в количестве ${selectedInvalid}?`,
                  action: 'set_valid',
                })
              }
            >
              <i className="fas fa-check" aria-hidden />
              Действ. {selectedInvalid}
            </button>
          ) : null}
          {selectedValid > 0 ? (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Сделать недействительными отметки в количестве ${selectedValid}?`,
                  action: 'set_invalid',
                })
              }
            >
              <i className="fas fa-ban" aria-hidden />
              Недейств. {selectedValid}
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkDanger}`}
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: `Удалить отметки в количестве ${checkedIds.length}?`,
                action: 'delete',
              })
            }
          >
            <i className="fas fa-trash" aria-hidden />
            Удалить
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              setApplyFrom(start.toISOString().slice(0, 10));
              setApplyTo(now.toISOString().slice(0, 10));
              setApplyOpen(true);
            }}
          >
            <i className="fas fa-sliders-h" aria-hidden />
            Настройки
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
                {visibleCols.map((key) => (
                  <th key={key}>{prefs.labelOf(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !displayRows.length ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && !displayRows.length ? (
                <tr>
                  <td colSpan={colCount} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : null}
              {displayRows.map((m) => {
                const photo = mediaSrc(m.photoUrl);
                const slides = displayRows
                  .map((x) => ({
                    src: mediaSrc(x.photoUrl) || '',
                    caption: `${empName(x.employee)} · ${x.markTypeLabel || x.markType} · ${fmtDt(x.occurredAt)}`,
                  }))
                  .filter((s) => s.src);
                const idx = photo ? slides.findIndex((s) => s.src === photo) : -1;
                const open = selectedId === m.id;
                const isChecked = Boolean(checked[m.id]);
                return (
                  <Fragment key={m.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : m.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(m.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'photo') {
                          return (
                            <td key={key}>
                              {photo ? (
                                <PhotoThumb
                                  src={photo}
                                  alt=""
                                  className={styles.photo}
                                  lightbox={photos}
                                  slides={slides}
                                  index={idx < 0 ? 0 : idx}
                                />
                              ) : (
                                <span className={styles.photoEmpty} />
                              )}
                            </td>
                          );
                        }
                        if (key === 'person') {
                          return (
                            <td
                              key={key}
                              className={`${styles.nameCell} ${
                                m.isValid === false ? styles.invalid : ''
                              }`}
                            >
                              {empName(m.employee)}
                            </td>
                          );
                        }
                        if (key === 'markType') {
                          return (
                            <td key={key}>
                              <span className={typeClass(m.markType)}>
                                {m.markTypeLabel || m.markType}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'time') {
                          return (
                            <td
                              key={key}
                              className={styles.codeCell}
                              title={
                                m.clockTamper
                                  ? m.note || 'Время терминала скорректировано'
                                  : undefined
                              }
                            >
                              {fmtDt(m.occurredAt)}
                              {m.clockTamper ? ' ⚠' : ''}
                            </td>
                          );
                        }
                        return <td key={key}>{markCell(m, key) || '—'}</td>;
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/attendance/marks/${m.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотреть
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                void runOne(
                                  m.id,
                                  m.isValid === false ? 'set_valid' : 'set_invalid',
                                )
                              }
                            >
                              <i
                                className={
                                  m.isValid === false ? 'fas fa-check' : 'fas fa-ban'
                                }
                                aria-hidden
                              />
                              {m.isValid === false
                                ? 'Сделать действ.'
                                : 'Сделать недейств.'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setChecked({ [m.id]: true });
                                setTypeOpen(true);
                              }}
                            >
                              <i className="fas fa-exchange-alt" aria-hidden />
                              Изменить тип
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              onClick={async () => {
                                if (await confirmDialog('Удалить отметку?'))
                                  void runOne(m.id, 'delete');
                              }}
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
            Показано <strong>{rows.length}</strong> из <strong>{total}</strong>
          </p>
        </div>
      </div>

      <FormModal
        open={Boolean(confirm)}
        title={confirm?.title || 'Подтверждение'}
        onClose={() => setConfirm(null)}
        width="sm"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={busy}
              onClick={() =>
                confirm && void runBulk(confirm.action, confirm.markType)
              }
            >
              Да
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setConfirm(null)}
            >
              Нет
            </button>
          </>
        }
      >
        <p style={{ margin: 0, color: '#64788f', fontSize: 13 }}>
          Подтвердите выполнение операции для выбранных отметок.
        </p>
      </FormModal>

      <FormModal
        open={applyOpen}
        title="Применение настроек для отметок"
        onClose={() => setApplyOpen(false)}
        width="sm"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              onClick={() => {
                setApplyOpen(false);
                router.push('/catalog/devices');
              }}
            >
              Применить
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              onClick={() => setApplyOpen(false)}
            >
              Отменить
            </button>
          </>
        }
      >
        <div className={modal.fields}>
          <label className={modal.field}>
            <span>Дата начала</span>
            <input
              type="date"
              value={applyFrom}
              onChange={(e) => setApplyFrom(e.target.value)}
            />
          </label>
          <label className={modal.field}>
            <span>Дата окончания</span>
            <input
              type="date"
              value={applyTo}
              onChange={(e) => setApplyTo(e.target.value)}
            />
          </label>
        </div>
      </FormModal>
      {photos.node}
    </div>
  );
}

export default function MarksPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <MarksInner />
    </Suspense>
  );
}
