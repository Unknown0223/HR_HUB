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
    meta: {
      region: values.region.trim() || null,
      bssid: values.bssid.trim() || null,
      restrictMarks: values.restrictMarks,
      polygonalAnalysis: values.polygonalAnalysis.trim() || null,
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
  const focus = filtered.find((r) => r.id === focusId) || null;

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

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey="locations" />
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
          <button type="button" className={styles.btnGhost} onClick={() => router.push('/attendance')}>
            Закрыть
          </button>
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
          <input
            className={styles.search}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className={styles.pagerMeta}>
            {filtered.length}/{rows.length}
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
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
              <th>Название</th>
              <th>Адрес</th>
              <th>Тип локации</th>
              <th>Кол-во устройств</th>
              <th>Устройства не в сети</th>
              <th>Кол-во сотрудников</th>
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
              filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className={
                      checked.has(r.id) || focusId === r.id ? styles.selected : undefined
                    }
                    onClick={() => setFocusId((id) => (id === r.id ? null : r.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.checkCol}>
                      <input
                        type="checkbox"
                        checked={checked.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{r.name}</td>
                    <td>{r.address || '—'}</td>
                    <td>{r.locationType?.name || '—'}</td>
                    <td>{r.deviceCount ?? r._count?.devices ?? 0}</td>
                    <td>{r.devicesOfflineLabel ?? (r.devicesOffline ? 'Да' : 'Нет')}</td>
                    <td>{r.employeeCount ?? 0}</td>
                  </tr>
                  {focus?.id === r.id ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid #e5e7eb' }}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/locations/${r.id}`}>Просмотр</Link>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(r);
                              setModalOpen(true);
                            }}
                          >
                            Изменить
                          </button>
                          <button type="button" onClick={() => void remove(r.id)}>
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
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
