'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import {
  blankLocationForm,
  LocationFormModal,
  type LocationFormValues,
} from './LocationFormModal';
import styles from './page.module.css';

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
  _count?: { devices?: number; qrCodes?: number; divisions?: number };
};

function toForm(row: Location): LocationFormValues {
  const meta = (row as Location & { meta?: Record<string, unknown> }).meta || {};
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
    polygonalAnalysis: typeof meta.polygonalAnalysis === 'string' ? meta.polygonalAnalysis : '',
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

function LocationsInner() {
  const router = useRouter();

  const [rows, setRows] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterGeo, setFilterGeo] = useState('');
  const [filterAccuracy, setFilterAccuracy] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [busy, setBusy] = useState(false);

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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const hit = [r.name, r.code, r.address, r.locationType?.name, geoText(r)]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(q));
        if (!hit) return false;
      }
      const nameQ = filterName.trim().toLowerCase();
      if (nameQ && !`${r.name} ${r.code}`.toLowerCase().includes(nameQ)) return false;
      const geoQ = filterGeo.trim().toLowerCase();
      if (geoQ && !geoText(r).toLowerCase().includes(geoQ)) return false;
      if (filterAccuracy.trim()) {
        const acc = Number(filterAccuracy);
        if (!Number.isNaN(acc) && (r.geoRadiusM ?? 150) !== acc) return false;
      }
      return true;
    });
  }, [rows, search, filterName, filterGeo, filterAccuracy]);

  const selectedIds = useMemo(() => [...checked], [checked]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => checked.has(r.id));

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusId(id);
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setChecked(new Set());
      setFocusId(null);
      return;
    }
    setChecked(new Set(filtered.map((r) => r.id)));
  }

  async function save(values: LocationFormValues) {
    setBusy(true);
    try {
      const body = bodyFromForm(values);
      let id = editing?.id;
      if (editing) {
        await apiFetch(`/api/attendance/locations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<Location>('/api/attendance/locations', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
      if (id) router.push(`/catalog/locations/${id}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm('Удалить локацию? Если есть связанные устройства — она будет деактивирована.'))) {
      return;
    }
    await apiFetch(`/api/attendance/locations/${id}`, { method: 'DELETE' });
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (focusId === id) setFocusId(null);
    await load();
  }

  async function bulkRemove() {
    if (!selectedIds.length) return;
    if (
      !(await confirm(
        `Удалить локации (${selectedIds.length})? Если есть связанные устройства — они будут деактивированы.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          apiFetch(`/api/attendance/locations/${id}`, { method: 'DELETE' }),
        ),
      );
      setChecked(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  const metrics = useMemo(() => {
    let active = 0;
    let withDevices = 0;
    let offline = 0;
    for (const r of rows) {
      if (r.isActive) active += 1;
      const dc = r.deviceCount ?? r._count?.devices ?? 0;
      if (dc > 0) withDevices += 1;
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

      <header className={styles.header}>
        <span className={styles.iconBadge} aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
        <div>
          <h1 className={styles.h1}>Локации</h1>
          <p className={styles.subtitle}>Офисы, склады, геозоны и привязка терминалов</p>
        </div>
      </header>

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
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Создать
          </button>
          {selectedIds.length > 0 ? (
            <button
              type="button"
              className={styles.btnBulkDanger}
              disabled={busy}
              onClick={() => void bulkRemove()}
            >
              Удалить {selectedIds.length}
            </button>
          ) : null}
          <label className={styles.filterField}>
            <span>Локация</span>
            <input
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Название / код"
            />
          </label>
          <label className={styles.filterField}>
            <span>Геолокация</span>
            <input
              value={filterGeo}
              onChange={(e) => setFilterGeo(e.target.value)}
              placeholder="lat, lon"
            />
          </label>
          <label className={styles.filterField}>
            <span>Точность (м)</span>
            <input
              value={filterAccuracy}
              onChange={(e) => setFilterAccuracy(e.target.value)}
              placeholder="150"
              inputMode="numeric"
            />
          </label>
        </div>
        <div className={styles.rightTools}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className={styles.search}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className={styles.pagerMeta}>
            {filtered.length}/{rows.length}
          </span>
          <button type="button" className={styles.iconBtn} onClick={() => void load()} aria-label="Обновить">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCol}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    disabled={!filtered.length || loading}
                    onChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Локация</th>
                <th>Адрес</th>
                <th>Тип</th>
                <th>Устройства</th>
                <th>Офлайн</th>
                <th>Сотрудники</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const open = focusId === r.id;
                  const deviceCount = r.deviceCount ?? r._count?.devices ?? 0;
                  const offlineLabel = r.devicesOfflineLabel ?? (r.devicesOffline ? 'Да' : 'Нет');
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`${checked.has(r.id) || open ? styles.selected : ''} ${open ? styles.rowOpen : ''}`}
                        onClick={() => setFocusId((id) => (id === r.id ? null : r.id))}
                      >
                        <td className={styles.checkCol}>
                          <input
                            type="checkbox"
                            checked={checked.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td>
                          <div className={styles.locCell}>
                            <span className={styles.locIcon} aria-hidden>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                            </span>
                            <div>
                              <div className={styles.name}>
                                {r.name}
                                {r.isGlobal ? (
                                  <span className={styles.badgeOk}>Глобальная</span>
                                ) : null}
                              </div>
                              <div className={styles.meta}>{r.code}</div>
                            </div>
                          </div>
                        </td>
                        <td>{r.address || '—'}</td>
                        <td>{r.locationType?.name || '—'}</td>
                        <td>
                          <span className={styles.countPill}>{deviceCount}</span>
                        </td>
                        <td>
                          <span
                            className={
                              r.devicesOffline || offlineLabel === 'Да'
                                ? styles.offlineYes
                                : styles.offlineNo
                            }
                          >
                            {offlineLabel}
                          </span>
                        </td>
                        <td>{r.employeeCount ?? 0}</td>
                      </tr>
                      {open ? (
                        <tr className={styles.expandRow}>
                          <td colSpan={7}>
                            <div className={styles.rowActions}>
                              <Link href={`/catalog/locations/${r.id}`}>Просмотр</Link>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(r);
                                  setModalOpen(true);
                                }}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void remove(r.id);
                                }}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.footer}>
          Показано <strong>{filtered.length}</strong> из <strong>{rows.length}</strong>
          {' · '}нажмите на строку для действий
        </div>
      </div>

      <LocationFormModal
        open={modalOpen}
        title={editing ? 'Локация (изменение)' : 'Локация (создание)'}
        initial={editing ? toForm(editing) : blankLocationForm()}
        busy={busy}
        onClose={() => {
          if (!busy) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
        onSave={save}
      />
    </div>
  );
}

export default function LocationsPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LocationsInner />
    </Suspense>
  );
}
