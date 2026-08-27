'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  blankLocationForm,
  LocationFormModal,
  type LocationFormValues,
} from '../LocationFormModal';
import styles from './page.module.css';

type Tab = 'info' | 'divisions' | 'persons' | 'devices' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Основная информация' },
  { id: 'divisions', label: 'Подразделения' },
  { id: 'persons', label: 'Физические лица' },
  { id: 'devices', label: 'Устройства' },
  { id: 'history', label: 'История изменений' },
];

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
  createdAt?: string;
  updatedAt?: string;
  locationTypeId?: string | null;
  locationType?: { id: string; code: string; name: string } | null;
  meta?: Record<string, unknown> | null;
  region?: string | null;
  bssid?: string | null;
  restrictMarks?: boolean;
  polygonalAnalysis?: string | null;
  createdByLabel?: string | null;
  updatedByLabel?: string | null;
  geolocation?: string | null;
  employeeCount?: number;
  divisions?: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    openedAt?: string | null;
    divisionGroup?: { name: string } | null;
    _count?: { employees?: number };
  }>;
  persons?: Array<{
    id: string;
    pin?: string | null;
    fullName: string;
    divisionName?: string | null;
    positionName?: string | null;
    attachmentNote?: string | null;
  }>;
  devices?: Array<{
    id: string;
    name: string;
    serialNumber: string;
    adapterType: string;
    status: string;
    isActive: boolean;
    lastSeenAt?: string | null;
  }>;
  changeHistory?: Array<{
    at?: string;
    by?: string;
    action?: string;
  }>;
};

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('ru-RU');
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('ru-RU');
}

function yesNo(v?: boolean | null) {
  if (v === true) return 'Да';
  if (v === false) return 'Нет';
  return 'Нет';
}

function shortId(id: string) {
  const n = parseInt(id.replace(/\D/g, '').slice(-6) || '0', 10);
  return String(n || id.slice(0, 6));
}

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
    region: row.region || (typeof meta.region === 'string' ? meta.region : '') || '',
    bssid: row.bssid || (typeof meta.bssid === 'string' ? meta.bssid : '') || '',
    restrictMarks: row.restrictMarks === true || meta.restrictMarks === true,
    polygonalAnalysis:
      row.polygonalAnalysis ||
      (typeof meta.polygonalAnalysis === 'string' ? meta.polygonalAnalysis : '') ||
      '',
  };
}

function mapEmbedUrl(lat: number, lon: number, radiusM: number) {
  // Yandex: ll = lon,lat ; zoom ~ radius
  let z = 16;
  if (radiusM >= 800) z = 13;
  else if (radiusM >= 400) z = 14;
  else if (radiusM >= 200) z = 15;
  else if (radiusM < 80) z = 17;
  const ll = `${lon}%2C${lat}`;
  const pt = `${lon},${lat},pm2rdm`;
  return `https://yandex.ru/map-widget/v1/?ll=${ll}&z=${z}&pt=${pt}&l=map`;
}

function LocationDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get('tab') as Tab) || 'info';
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'info';

  const [row, setRow] = useState<Location | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<Location>(`/api/attendance/locations/${id}`);
      setRow(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRow(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const setTab = (next: Tab) => {
    router.replace(`/catalog/locations/${id}?tab=${next}`);
    setSearch('');
  };

  async function save(values: LocationFormValues) {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/locations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
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
        }),
      });
      setEditOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const filteredPersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = row?.persons || [];
    if (!q) return list;
    return list.filter((p) =>
      [p.fullName, p.pin, p.divisionName, p.positionName]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [row, search]);

  const filteredDivisions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = row?.divisions || [];
    if (!q) return list;
    return list.filter((d) =>
      [d.name, d.code, d.divisionGroup?.name]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [row, search]);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = row?.devices || [];
    if (!q) return list;
    return list.filter((d) =>
      [d.name, d.serialNumber, d.adapterType, d.status]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [row, search]);

  if (loading) return <p>Загрузка…</p>;
  if (!row) return <p className={styles.error}>{error || 'Локация не найдена'}</p>;

  const lat = row.latitude;
  const lon = row.longitude;
  const hasGeo = lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon);

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>Локация (просмотр)</h1>
        <div className={styles.actions}>
          <button type="button" className={styles.btnEdit} onClick={() => setEditOpen(true)}>
            Изменить
          </button>
          <Link href="/catalog/locations" className={styles.btnGhost}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sideHead}>
            <div className={styles.sideName}>{row.name}</div>
            <div className={styles.sideId}>({shortId(row.id)})</div>
            <span className={row.isActive ? styles.badgeActive : styles.badgeInactive}>
              {row.isActive ? 'Активный' : 'Неактивный'}
            </span>
            {row.isGlobal || row.meta?.global === true ? (
              <span className={styles.badgeOk} style={{ marginLeft: 6 }}>
                Глобальная
              </span>
            ) : null}
          </div>
          <nav className={styles.nav}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? styles.navItemActive : styles.navItem}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className={styles.main}>
          {tab === 'info' ? (
            <>
              <h2 className={styles.sectionTitle}>Основная информация</h2>
              <div className={styles.infoLayout}>
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <label>Локация</label>
                    <div>{row.name || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Адрес</label>
                    <div>{row.address || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Тип локации</label>
                    <div>{row.locationType?.name || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Глобальная</label>
                    <div>{row.isGlobal || row.meta?.global === true ? 'Да' : 'Нет'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Регион</label>
                    <div>{row.region || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Код</label>
                    <div>{row.code || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Временная зона</label>
                    <div>{row.timezone || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>BSSID</label>
                    <div>{row.bssid || '—'}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Ограничение отметок</label>
                    <div>{yesNo(!!row.restrictMarks)}</div>
                  </div>
                  <div className={styles.field}>
                    <label>Полигональный анализ</label>
                    <div>{row.polygonalAnalysis || '—'}</div>
                  </div>
                </div>

                <div className={styles.geoBlock}>
                  <div className={styles.geoMeta}>
                    <div className={styles.field}>
                      <label>Геолокация</label>
                      <div>
                        {row.geolocation ||
                          (hasGeo ? `${lat}, ${lon}` : '—')}
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label>Погрешность координат (в метрах)</label>
                      <div>{row.geoRadiusM ?? 150}</div>
                    </div>
                  </div>
                  <div className={styles.mapWrap}>
                    {hasGeo ? (
                      <iframe
                        title="Яндекс карта локации"
                        className={styles.mapFrame}
                        src={mapEmbedUrl(lat!, lon!, row.geoRadiusM ?? 150)}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    ) : (
                      <div className={styles.mapFallback}>
                        Координаты не заданы — укажите широту и долготу при изменении
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.audit}>
                <div className={styles.auditItem}>
                  <label>Создал</label>
                  <div>{row.createdByLabel || 'System'}</div>
                </div>
                <div className={styles.auditItem}>
                  <label>Изменил</label>
                  <div>{row.updatedByLabel || 'System'}</div>
                </div>
                <div className={styles.auditItem}>
                  <label>Время создания</label>
                  <div>{fmtDt(row.createdAt)}</div>
                </div>
                <div className={styles.auditItem}>
                  <label>Дата изменения</label>
                  <div>{fmtDt(row.updatedAt)}</div>
                </div>
              </div>
            </>
          ) : null}

          {tab === 'divisions' ? (
            <>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Подразделения
                </h2>
                <input
                  className={styles.search}
                  placeholder="Поиск..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Код</th>
                    <th>Группа</th>
                    <th>Сотрудники</th>
                    <th>Дата открытия</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDivisions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredDivisions.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/divisions/${d.id}`} className={styles.link}>
                            {d.name}
                          </Link>
                        </td>
                        <td>{d.code}</td>
                        <td>{d.divisionGroup?.name || '—'}</td>
                        <td>{d._count?.employees ?? 0}</td>
                        <td>{fmtDate(d.openedAt)}</td>
                        <td>
                          <span className={styles.pillActive}>
                            {d.isActive ? 'Активный' : 'Неактивный'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'persons' ? (
            <>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Физические лица
                </h2>
                <input
                  className={styles.search}
                  placeholder="Поиск..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ПИН</th>
                    <th>ФИО</th>
                    <th>Подразделение</th>
                    <th>Позиция</th>
                    <th>Тип прикрепления</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersons.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredPersons.map((p) => (
                      <tr key={p.id}>
                        <td>{p.pin || '—'}</td>
                        <td>
                          <Link href={`/employees/${p.id}`} className={styles.link}>
                            {p.fullName}
                          </Link>
                        </td>
                        <td>{p.divisionName || '—'}</td>
                        <td>{p.positionName || '—'}</td>
                        <td>
                          {p.attachmentNote === 'auto'
                            ? 'Авто'
                            : p.attachmentNote === 'manual'
                              ? 'Вручную'
                              : p.attachmentNote || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'devices' ? (
            <>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Устройства
                </h2>
                <input
                  className={styles.search}
                  placeholder="Поиск..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Серийный №</th>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Последняя активность</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/catalog/devices/${d.id}`} className={styles.link}>
                            {d.name}
                          </Link>
                        </td>
                        <td>{d.serialNumber}</td>
                        <td>{d.adapterType}</td>
                        <td>{d.isActive ? d.status : 'Неактивный'}</td>
                        <td>{fmtDt(d.lastSeenAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'history' ? (
            <>
              <h2 className={styles.sectionTitle}>История изменений</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Пользователь</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {!row.changeHistory?.length ? (
                    <tr>
                      <td colSpan={3} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    row.changeHistory.map((h, i) => (
                      <tr key={`${h.at}-${i}`}>
                        <td>{fmtDt(h.at)}</td>
                        <td>{h.by || '—'}</td>
                        <td>
                          {h.action === 'create'
                            ? 'Создание'
                            : h.action === 'update'
                              ? 'Изменение'
                              : h.action || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      </div>

      <LocationFormModal
        open={editOpen}
        title="Локация (изменение)"
        initial={toForm(row)}
        busy={busy}
        onClose={() => !busy && setEditOpen(false)}
        onSave={save}
      />
    </div>
  );
}

export default function LocationDetailPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LocationDetailInner />
    </Suspense>
  );
}
