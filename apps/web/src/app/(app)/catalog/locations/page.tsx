'use client';

import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import {
  TablePrefsMenuButton,
  TablePrefsModals,
  useTablePrefs,
} from '@/components/table-prefs';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { locationListPrefs } from '@/lib/table-field-defs/catalog-lists';
import {
  blankLocationForm,
  LocationFormModal,
  type LocationFormValues,
} from './LocationFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

type Location = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  geoRadiusM?: number;
  isActive: boolean;
  isGlobal?: boolean;
  locationTypeId?: string | null;
  locationType?: { id: string; code: string; name: string } | null;
  deviceCount?: number;
  devicesOffline?: boolean;
  devicesOfflineLabel?: string;
  employeeCount?: number;
  geolocation?: string | null;
  meta?: Record<string, unknown> | null;
  _count?: { devices?: number; qrCodes?: number; divisions?: number };
};

const FILTER_KEYS = ['q', 'name', 'geo', 'accuracy', 'status', 'typeId'] as const;

function toForm(row: Location): LocationFormValues {
  const meta = row.meta || {};
  return {
    code: row.code,
    name: row.name,
    address: row.address || '',
    timezone: row.timezone || 'Asia/Tashkent',
    latitude: row.latitude != null ? String(row.latitude) : '',
    longitude: row.longitude != null ? String(row.longitude) : '',
    geoRadiusM: row.geoRadiusM != null ? String(row.geoRadiusM) : '150',
    locationTypeId: row.locationTypeId || row.locationType?.id || '',
    isActive: row.isActive,
    isGlobal: row.isGlobal === true || meta.global === true,
    region: typeof meta.region === 'string' ? meta.region : '',
    bssid: typeof meta.bssid === 'string' ? meta.bssid : '',
    restrictMarks: meta.restrictMarks === true,
    polygonalAnalysis:
      typeof meta.polygonalAnalysis === 'string' ? meta.polygonalAnalysis : '',
  };
}

function bodyFromForm(values: LocationFormValues) {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    address: values.address.trim() || null,
    timezone: values.timezone.trim() || 'Asia/Tashkent',
    latitude: values.latitude.trim() ? Number(values.latitude) : null,
    longitude: values.longitude.trim() ? Number(values.longitude) : null,
    geoRadiusM: values.geoRadiusM.trim() ? Number(values.geoRadiusM) : 150,
    locationTypeId: values.locationTypeId || null,
    isActive: values.isActive,
    isGlobal: values.isGlobal,
    meta: {
      region: values.region.trim() || null,
      bssid: values.bssid.trim() || null,
      restrictMarks: values.restrictMarks,
      polygonalAnalysis: values.polygonalAnalysis.trim() || null,
      global: values.isGlobal,
      updatedByLabel: 'Admin',
    },
  };
}

function geoText(row: Location) {
  if (row.geolocation) return row.geolocation;
  if (row.latitude != null && row.longitude != null) {
    return `${row.latitude}, ${row.longitude}`;
  }
  return '';
}

function deviceCountOf(row: Location) {
  return row.deviceCount ?? row._count?.devices ?? 0;
}

function locationCell(row: Location, key: string): string {
  const meta = row.meta || {};
  switch (key) {
    case 'name':
      return row.name || '';
    case 'code':
      return row.code || '';
    case 'address':
      return row.address || '';
    case 'locationType':
      return row.locationType?.name || '';
    case 'region':
      return typeof meta.region === 'string' ? meta.region : '';
    case 'timezone':
      return row.timezone || '';
    case 'deviceCount':
      return String(deviceCountOf(row));
    case 'devicesOffline':
      return row.devicesOfflineLabel ?? (row.devicesOffline ? 'Да' : 'Нет');
    case 'employeeCount':
      return String(row.employeeCount ?? 0);
    case 'latlng':
      return geoText(row);
    case 'isActive':
      return row.isActive ? 'Активная' : 'Неактивная';
    default:
      return '';
  }
}

function LocationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const prefs = useTablePrefs(locationListPrefs);
  const q = filters.q;
  const nameFilter = filters.name;
  const geoFilter = filters.geo;
  const accuracyFilter = filters.accuracy;
  const statusFilter = filters.status;
  const typeFilter = filters.typeId;

  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(nameFilter || geoFilter || accuracyFilter || statusFilter || typeFilter),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Location[]>('/api/attendance/locations');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
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
    const create = searchParams.get('create') === '1';
    const edit = searchParams.get('edit');
    if (create || edit) {
      setEditId(edit || null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const t = r.locationType;
      if (t?.id) map.set(t.id, t.name);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const qq = q.trim().toLowerCase();
      if (qq) {
        const hit = [r.name, r.code, r.address, r.locationType?.name, geoText(r)]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(qq));
        if (!hit) return false;
      }
      const nameQ = nameFilter.trim().toLowerCase();
      if (nameQ && !`${r.name} ${r.code}`.toLowerCase().includes(nameQ)) return false;
      const geoQ = geoFilter.trim().toLowerCase();
      if (geoQ && !geoText(r).toLowerCase().includes(geoQ)) return false;
      if (accuracyFilter.trim()) {
        const acc = Number(accuracyFilter);
        if (!Number.isNaN(acc) && (r.geoRadiusM ?? 150) !== acc) return false;
      }
      if (statusFilter === 'active' && !r.isActive) return false;
      if (statusFilter === 'inactive' && r.isActive) return false;
      if (typeFilter && (r.locationType?.id || r.locationTypeId || '') !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [rows, q, nameFilter, geoFilter, accuracyFilter, statusFilter, typeFilter]);

  const displayRows = useMemo(
    () => prefs.applySortToRows(filtered, locationCell),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs methods read prefs.state
    [filtered, prefs.state.sort],
  );

  const visibleCols = prefs.columns.length
    ? prefs.columns
    : locationListPrefs.defaultColumns;
  const colCount = 1 + visibleCols.length;

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );

  const allPageChecked =
    displayRows.length > 0 && displayRows.every((r) => checked[r.id]);
  const somePageChecked = displayRows.some((r) => checked[r.id]) && !allPageChecked;

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

  function applySearch() {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    else params.delete('q');
    const qs = params.toString();
    router.replace(qs ? `/catalog/locations?${qs}` : '/catalog/locations', {
      scroll: false,
    });
  }

  function openCreate() {
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    if (searchParams.get('create') === '1' || searchParams.get('edit')) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('create');
      params.delete('edit');
      const qs = params.toString();
      router.replace(qs ? `/catalog/locations?${qs}` : '/catalog/locations', {
        scroll: false,
      });
    }
  }

  const editing = editId ? rows.find((r) => r.id === editId) || null : null;
  const initialValues = useMemo(
    () => (editing ? toForm(editing) : blankLocationForm()),
    [editing],
  );

  async function save(values: LocationFormValues) {
    setBusy(true);
    try {
      const body = bodyFromForm(values);
      if (editing) {
        await apiFetch(`/api/attendance/locations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch<Location>('/api/attendance/locations', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      closeModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(row: Location) {
    if (
      !(await confirm(
        `Удалить локацию «${row.name}»? Если есть связанные устройства — она будет деактивирована.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/attendance/locations/${row.id}`, { method: 'DELETE' });
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: 'delete' | 'activate' | 'deactivate') {
    const targets = filtered.filter((r) => checked[r.id]);
    if (targets.length === 0) return;

    if (action === 'delete') {
      if (
        !(await confirm(
          `Удалить выбранные локации (${targets.length} шт.)? Локации со связанными устройствами будут деактивированы.`,
        ))
      ) {
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
            await apiFetch(`/api/attendance/locations/${row.id}`, { method: 'DELETE' });
          } else {
            const isActive = action === 'activate';
            if (row.isActive === isActive) continue;
            await apiFetch(`/api/attendance/locations/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive }),
            });
          }
        } catch {
          failed += 1;
        }
      }
      setChecked({});
      setSelectedId(null);
      await load();
      if (failed > 0) setError(`Часть операций не выполнена: ${failed}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: Location, value: boolean) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/attendance/locations/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: value }),
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: value } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `locations-${new Date().toISOString().slice(0, 10)}.csv`,
      displayRows.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const k of visibleCols) {
          obj[prefs.labelOf(k)] = locationCell(r, k) || '—';
        }
        return obj;
      }),
    );
  }

  const metrics = useMemo(() => {
    let active = 0;
    let withDevices = 0;
    let offline = 0;
    for (const r of rows) {
      if (r.isActive) active += 1;
      if (deviceCountOf(r) > 0) withDevices += 1;
      if (r.devicesOffline) offline += 1;
    }
    return [
      { label: 'Всего', value: rows.length },
      { label: 'Активные', value: active, accent: 'ok' as const },
      { label: 'С устройствами', value: withDevices, accent: 'accent' as const },
      { label: 'Офлайн-устройства', value: offline, accent: 'danger' as const },
    ];
  }, [rows]);

  return (
    <div className={styles.page}>
      <PageSubnav groupKey="locations" />
      <TablePrefsModals prefs={prefs} />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTransfer}`}>
          <i className="fas fa-map-marker-alt" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>Локации</h1>
          <p className={shared.pageSubtitle}>
            Офисы, склады, геозоны и привязка терминалов
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

      <div className={styles.metrics}>
        {metrics.map((m) => (
          <div key={m.label} className={styles.metricCard}>
            <p className={styles.metricLabel}>{m.label}</p>
            <p
              className={`${styles.metricValue} ${
                m.accent === 'ok'
                  ? styles.mOk
                  : m.accent === 'danger'
                    ? styles.mDanger
                    : m.accent === 'accent'
                      ? styles.mAccent
                      : ''
              }`}
            >
              {m.value}
            </p>
          </div>
        ))}
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
              { type: 'search', label: 'Поиск', placeholder: 'Поиск...' },
              {
                type: 'text',
                key: 'name',
                label: 'Локация',
                placeholder: 'Название / код',
              },
              { type: 'text', key: 'geo', label: 'Геолокация', placeholder: 'lat, lon' },
              {
                type: 'text',
                key: 'accuracy',
                label: 'Точность (м)',
                placeholder: '150',
              },
              {
                type: 'select',
                key: 'typeId',
                label: 'Тип локации',
                options: typeOptions,
              },
              {
                type: 'select',
                key: 'status',
                label: 'Статус',
                options: [
                  { value: 'active', label: 'Активная' },
                  { value: 'inactive', label: 'Неактивная' },
                ],
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

      {checkedIds.length > 0 ? (
        <div className={styles.bulkBar}>
          <span className={styles.bulkMeta}>
            Выбрано: <strong>{checkedIds.length}</strong>
          </span>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('activate')}
          >
            <i className="fas fa-check" aria-hidden />
            Активировать
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            disabled={busy}
            onClick={() => void runBulk('deactivate')}
          >
            <i className="fas fa-ban" aria-hidden />
            Деактивировать
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
                    Нет данных — нажмите «Создать»
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const open = selectedId === row.id;
                const isChecked = Boolean(checked[row.id]);
                const offlineLabel =
                  row.devicesOfflineLabel ?? (row.devicesOffline ? 'Да' : 'Нет');
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
                          aria-label={`Выбрать ${row.name}`}
                        />
                      </td>
                      {visibleCols.map((key) => {
                        if (key === 'name') {
                          return (
                            <td key={key}>
                              <div className={styles.locCell}>
                                <span className={styles.locIcon} aria-hidden>
                                  <i className="fas fa-map-marker-alt" />
                                </span>
                                <div>
                                  <div className={styles.nameCell}>
                                    {row.name}
                                    {row.isGlobal ? (
                                      <span className={styles.badgeOk}>Глобальная</span>
                                    ) : null}
                                  </div>
                                  <div className={styles.codeCell}>{row.code}</div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (key === 'deviceCount') {
                          return (
                            <td key={key}>
                              <span className={styles.countPill}>
                                {deviceCountOf(row)}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'devicesOffline') {
                          return (
                            <td key={key}>
                              <span
                                className={
                                  row.devicesOffline || offlineLabel === 'Да'
                                    ? styles.offlineYes
                                    : styles.offlineNo
                                }
                              >
                                {offlineLabel}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'isActive') {
                          return (
                            <td key={key}>
                              {row.isActive ? (
                                <span className={styles.statusActive}>Активная</span>
                              ) : (
                                <span className={styles.statusMuted}>Неактивная</span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={key}>{locationCell(row, key) || '—'}</td>
                        );
                      })}
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={colCount}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/locations/${row.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотр
                            </Link>
                            <button type="button" onClick={() => openEdit(row.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleActive(row, !row.isActive)}
                            >
                              <i
                                className={row.isActive ? 'fas fa-ban' : 'fas fa-check'}
                                aria-hidden
                              />
                              {row.isActive ? 'Деактивировать' : 'Активировать'}
                            </button>
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
            Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          </p>
        </div>
      </div>

      <LocationFormModal
        open={modalOpen}
        title={editing ? 'Локация (изменение)' : 'Локация (создание)'}
        initial={initialValues}
        busy={busy}
        onClose={() => {
          if (!busy) closeModal();
        }}
        onSave={save}
      />
    </div>
  );
}

export default function LocationsPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <LocationsInner />
    </Suspense>
  );
}
