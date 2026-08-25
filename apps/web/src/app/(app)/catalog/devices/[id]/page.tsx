'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { mediaSrc } from '@/lib/media';
import { PhotoThumb, usePhotoLightbox } from '@/components/PhotoLightbox';
import { ModalPortal } from '@/components/ModalPortal';
import {
  blankDeviceForm,
  DeviceFormModal,
  punchLockActive,
  passwordOutOfSync,
  type DeviceFormValues,
  type DeviceMeta,
} from '../DeviceFormModal';
import styles from './page.module.css';

type Tab =
  | 'info'
  | 'persons'
  | 'marks'
  | 'ignored-persons'
  | 'ignored-divisions'
  | 'commands'
  | 'all-marks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Основная информация' },
  { id: 'persons', label: 'Физические лица' },
  { id: 'marks', label: 'Отметки' },
  { id: 'ignored-persons', label: 'Игнорируемые физические лица' },
  { id: 'ignored-divisions', label: 'Игнорируемые подразделения' },
  { id: 'commands', label: 'Команды' },
  { id: 'all-marks', label: 'Все отметки' },
];

type Device = {
  id: string;
  name: string;
  serialNumber: string;
  model?: string | null;
  adapterType: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  status: string;
  lastSeenAt?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  meta?: DeviceMeta | null;
  location?: { id: string; name: string; code: string; timezone?: string } | null;
};

type Person = {
  id: string;
  pin?: string | null;
  fullName: string;
  role?: string;
  synchronized?: boolean;
};

type Mark = {
  id: string;
  occurredAt?: string | null;
  markTypeLabel?: string;
  identificationType?: string | null;
  locationName?: string | null;
  employee?: { firstName?: string; lastName?: string; tabNumber?: string } | null;
  fullName?: string | null;
  photoUrl?: string | null;
  isDoorEvent?: boolean;
};

type Command = {
  id: number | string;
  type: string;
  employeeName?: string | null;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
};

type IgnoredPerson = {
  id: string;
  fullName: string;
  divisionName?: string | null;
  positionName?: string | null;
};

type IgnoredDivision = {
  id: string;
  name: string;
  openedAt?: string | null;
  isActive?: boolean;
  divisionGroup?: { name: string } | null;
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
  return '—';
}

function trackingLabel(t?: string) {
  if (t === 'in') return 'Приход';
  if (t === 'out') return 'Уход';
  return 'Отметка';
}

function empName(m: Mark) {
  if (m.fullName) return m.fullName;
  if (!m.employee) return '—';
  return [m.employee.lastName, m.employee.firstName].filter(Boolean).join(' ') || '—';
}

function toForm(d: Device): DeviceFormValues {
  return {
    name: d.name,
    serialNumber: d.serialNumber,
    locationId: d.location?.id || '',
    model: d.model || '',
    adapterType: d.adapterType || 'mock',
    host: d.host || '',
    port: d.port != null ? String(d.port) : '',
    username: d.username || 'admin',
    password: '',
    isActive: d.isActive,
    meta: { ...(blankDeviceForm().meta), ...(d.meta || {}) },
  };
}

function DeviceDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get('tab') as Tab) || 'info';
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'info';

  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [ignoreScope, setIgnoreScope] = useState<'attached' | 'available'>('attached');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const photos = usePhotoLightbox();

  const [persons, setPersons] = useState<Person[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [ignoredPersons, setIgnoredPersons] = useState<IgnoredPerson[]>([]);
  const [ignoredDivisions, setIgnoredDivisions] = useState<IgnoredDivision[]>([]);

  const setTab = useCallback(
    (next: Tab) => {
      router.replace(`/catalog/devices/${id}?tab=${next}`);
      setSearch('');
      setSelectedIds([]);
      setIgnoreScope('attached');
    },
    [id, router],
  );

  async function loadDevice() {
    setLoading(true);
    setError('');
    try {
      const d = await apiFetch<Device>(`/api/attendance/devices/${id}`);
      setDevice(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }

  const loadTabData = useCallback(async () => {
    if (!id) return;
    try {
      if (tab === 'persons') {
        const data = await apiFetch<Person[]>(`/api/attendance/devices/${id}/persons`);
        setPersons(Array.isArray(data) ? data : []);
      } else if (tab === 'marks' || tab === 'all-marks') {
        const qs = tab === 'all-marks' ? '?all=1&limit=100' : '?limit=100';
        const data = await apiFetch<{ items?: Mark[] } | Mark[]>(
          `/api/attendance/devices/${id}/marks${qs}`,
        );
        const items = Array.isArray(data) ? data : data.items || [];
        setMarks(items);
      } else if (tab === 'commands') {
        const data = await apiFetch<{ items?: Command[] }>(
          `/api/attendance/devices/${id}/commands`,
        );
        setCommands(Array.isArray(data.items) ? (data.items as Command[]) : []);
      } else if (tab === 'ignored-persons') {
        const data = await apiFetch<IgnoredPerson[]>(
          `/api/attendance/devices/${id}/ignored-persons?scope=${ignoreScope}`,
        );
        setIgnoredPersons(Array.isArray(data) ? data : []);
      } else if (tab === 'ignored-divisions') {
        const data = await apiFetch<IgnoredDivision[]>(
          `/api/attendance/devices/${id}/ignored-divisions?scope=${ignoreScope}`,
        );
        setIgnoredDivisions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки раздела');
    }
  }, [id, tab, ignoreScope]);

  useEffect(() => {
    void loadDevice();
  }, [id]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  const meta = device?.meta || {};
  const hk = meta.hikCentral || {};

  const filteredPersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter((p) =>
      [p.fullName, p.pin, p.role].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [persons, search]);

  const filteredMarks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return marks;
    return marks.filter((m) =>
      [empName(m), m.markTypeLabel, m.locationName, m.identificationType]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [marks, search]);

  const filteredCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      [c.type, c.employeeName, String(c.id)]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [commands, search]);

  const filteredIgnoredPersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ignoredPersons;
    return ignoredPersons.filter((p) =>
      [p.fullName, p.divisionName, p.positionName]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [ignoredPersons, search]);

  const filteredIgnoredDivisions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ignoredDivisions;
    return ignoredDivisions.filter((d) =>
      [d.name, d.divisionGroup?.name].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [ignoredDivisions, search]);

  async function save(values: DeviceFormValues, sync: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name.trim(),
          serialNumber: values.serialNumber.trim(),
          locationId: values.locationId || null,
          model: values.model || null,
          adapterType: values.adapterType,
          host: values.host || null,
          port: values.port ? Number(values.port) : null,
          username: values.username.trim() || null,
          ...(values.password.trim() ? { password: values.password } : {}),
          isActive: values.isActive,
          meta: values.meta,
        }),
      });
      if (sync) {
        await apiFetch(`/api/attendance/devices/${id}/sync`, { method: 'POST' });
      }
      setEditOpen(false);
      await loadDevice();
      await loadTabData();
    } finally {
      setBusy(false);
    }
  }

  async function doSync() {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${id}/sync`, { method: 'POST' });
      setSyncOpen(false);
      await loadDevice();
      await loadTabData();
    } finally {
      setBusy(false);
    }
  }

  async function doSyncClock() {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ ok?: boolean; message?: string }>(
        `/api/attendance/devices/${id}/remote`,
        { method: 'POST', body: JSON.stringify({ action: 'sync_clock' }) },
      );
      setError(res.message || (res.ok === false ? 'Синхронизация часов не удалась' : ''));
      await loadDevice();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Синхронизация часов не удалась');
    } finally {
      setBusy(false);
    }
  }

  async function syncPersons() {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/devices/${id}/persons/sync`, { method: 'POST' });
      await loadTabData();
    } finally {
      setBusy(false);
    }
  }

  function toggleId(rowId: string) {
    setSelectedIds((prev) =>
      prev.includes(rowId) ? prev.filter((x) => x !== rowId) : [...prev, rowId],
    );
  }

  async function applyIgnoredPersons() {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const method = ignoreScope === 'available' ? 'POST' : 'DELETE';
      await apiFetch(`/api/attendance/devices/${id}/ignored-persons`, {
        method,
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      await loadTabData();
    } finally {
      setBusy(false);
    }
  }

  async function applyIgnoredDivisions() {
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const method = ignoreScope === 'available' ? 'POST' : 'DELETE';
      await apiFetch(`/api/attendance/devices/${id}/ignored-divisions`, {
        method,
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      await loadTabData();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Загрузка…</p>;
  if (!device) return <p className={styles.error}>{error || 'Устройство не найдено'}</p>;

  return (
    <div>
      <div className={styles.topBar}>
        <h1 className={styles.title}>Устройство (просмотр)</h1>
        <div className={styles.actions}>
          <button type="button" className={styles.btnEdit} onClick={() => setEditOpen(true)}>
            Изменить
          </button>
          <button type="button" className={styles.btnSync} onClick={() => setSyncOpen(true)}>
            Синхронизировать устройство
          </button>
          <button
            type="button"
            className={styles.btnSync}
            disabled={busy}
            onClick={() => void doSyncClock()}
            title="Выставить на терминале время сервера (UTC+5)"
          >
            Синхронизировать часы
          </button>
          <Link href="/catalog/devices" className={styles.btnGhost}>
            Закрыть
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.deviceId}>
            {device.serialNumber}
            {device.model ? ` (${device.model})` : ''}
          </div>
          <span className={device.isActive ? styles.badgeActive : styles.badgeInactive}>
            {device.isActive ? 'Активный' : 'Неактивный'}
          </span>
          {punchLockActive(device.meta) ? (
            <span className={styles.badgeLocked}>Отметки заблокированы</span>
          ) : null}
          {passwordOutOfSync(device.meta, device.status) ? (
            <span className={styles.badgeLocked}>Пароль не совпадает</span>
          ) : null}
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
              {punchLockActive(device.meta) ? (
                <div className={styles.lockBanner}>
                  На терминале введён пароль администратора. Отметки остановлены и снова
                  включатся после выхода в сеть и синхронизации с сервером. Пароль
                  терминала перезаписывается на сервер, чтобы устройство не осталось
                  под контролем другого сотрудника.
                </div>
              ) : null}
              {passwordOutOfSync(device.meta, device.status) ? (
                <div className={styles.lockBanner}>
                  Пароль на терминале изменён локально и не совпадает с сервером.
                  Откройте карточку устройства и сохраните текущий пароль терминала —
                  иначе администратор потеряет управление.
                </div>
              ) : null}
              <div className={styles.infoGrid}>
                <div className={styles.field}>
                  <label>Тип устройства</label>
                  <div>
                    {(typeof meta.deviceType === 'string' && meta.deviceType) ||
                      (device.adapterType === 'hikvision' ? 'Hikvision' : device.adapterType)}
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Недействительные отметки</label>
                  <div>{yesNo(!!meta.invalidMarks)}</div>
                </div>
                <div className={styles.field}>
                  <label>Название</label>
                  <div>{device.name}</div>
                </div>
                <div className={styles.field}>
                  <label>Использовать основные настройки</label>
                  <div>{yesNo(meta.useBasicSettings !== false)}</div>
                </div>
                <div className={styles.field}>
                  <label>Локация</label>
                  <div>{device.location?.name || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Тип трекинга с устройства</label>
                  <div>{trackingLabel(meta.trackingType as string | undefined)}</div>
                </div>
                <div className={styles.field}>
                  <label>Последняя активность</label>
                  <div>{fmtDt(device.lastSeenAt)}</div>
                </div>
                <div className={styles.field}>
                  <label>Авто-генерация приходов</label>
                  <div>{yesNo(!!meta.autoGenerateIn)}</div>
                </div>
                <div className={styles.field}>
                  <label>Авто-генерация уходов</label>
                  <div>{yesNo(!!meta.autoGenerateOut)}</div>
                </div>
              </div>
              <div className={styles.techBlock}>
                <div className={styles.field}>
                  <label>Адрес шлюза устройства HikCentral</label>
                  <div>{hk.gatewayHost || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Порт шлюза устройства HikCentral</label>
                  <div>{hk.gatewayPort ?? '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>ID устройства</label>
                  <div>{hk.deviceId || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label>Ключ ISUP</label>
                  <div>{hk.isupKey || '—'}</div>
                </div>
              </div>
              <div className={styles.audit}>
                <span>Создан: {fmtDt(device.createdAt)}</span>
                <span>Изменён: {fmtDt(device.updatedAt)}</span>
              </div>
            </>
          ) : null}

          {tab === 'persons' ? (
            <>
              <div className={styles.toolbar}>
                <div className={styles.leftActions}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    Физические лица
                  </h2>
                  <button
                    type="button"
                    className={styles.btnSync}
                    disabled={busy}
                    onClick={() => void syncPersons()}
                  >
                    Синхронизировать физические лица
                  </button>
                </div>
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
                    <th>Роль</th>
                    <th>Синхронизирован</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersons.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredPersons.map((p) => (
                      <tr key={p.id}>
                        <td>{p.pin || '—'}</td>
                        <td>
                          <span className={styles.avatar}>
                            {(p.fullName || '?').slice(0, 1)}
                          </span>
                          {p.fullName}
                        </td>
                        <td>{p.role || 'Обычный пользователь'}</td>
                        <td>{p.synchronized ? 'Да' : 'Нет'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'marks' || tab === 'all-marks' ? (
            <>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  {tab === 'all-marks' ? 'Все отметки' : 'Отметки'}
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
                    {tab === 'all-marks' ? <th>Фото</th> : null}
                    <th>Физическое лицо</th>
                    {tab === 'marks' ? <th>Локация</th> : null}
                    {tab === 'marks' ? <th>Тип идентификации</th> : null}
                    <th>Тип отметки</th>
                    <th>{tab === 'all-marks' ? 'Время отметки' : 'Время'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarks.length === 0 ? (
                    <tr>
                      <td colSpan={tab === 'all-marks' ? 4 : 5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredMarks.map((m) => {
                      const photo = mediaSrc(m.photoUrl);
                      const slides = filteredMarks
                        .map((x) => ({
                          src: mediaSrc(x.photoUrl) || '',
                          caption: empName(x),
                        }))
                        .filter((s) => s.src);
                      const idx = photo ? slides.findIndex((s) => s.src === photo) : -1;
                      return (
                      <tr key={m.id}>
                        {tab === 'all-marks' ? (
                          <td>
                            {photo ? (
                              <PhotoThumb
                                src={photo}
                                alt=""
                                className={styles.avatar}
                                lightbox={photos}
                                slides={slides}
                                index={idx < 0 ? 0 : idx}
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                        ) : null}
                        <td>{empName(m)}</td>
                        {tab === 'marks' ? <td>{m.locationName || device.location?.name || '—'}</td> : null}
                        {tab === 'marks' ? (
                          <td>{m.identificationType || 'Распознавание лица'}</td>
                        ) : null}
                        <td>
                          <span className={styles.markDot}>{m.markTypeLabel || 'Отметка'}</span>
                        </td>
                        <td>{fmtDt(m.occurredAt)}</td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'ignored-persons' ? (
            <>
              <div className={styles.toolbar}>
                <div className={styles.leftActions}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    Игнорируемые физические лица
                  </h2>
                  <div className={styles.scopeTabs}>
                    <button
                      type="button"
                      className={ignoreScope === 'attached' ? styles.scopeTabActive : styles.scopeTab}
                      onClick={() => {
                        setIgnoreScope('attached');
                        setSelectedIds([]);
                      }}
                    >
                      Прикрепленные
                    </button>
                    <button
                      type="button"
                      className={ignoreScope === 'available' ? styles.scopeTabActive : styles.scopeTab}
                      onClick={() => {
                        setIgnoreScope('available');
                        setSelectedIds([]);
                      }}
                    >
                      Доступные
                    </button>
                  </div>
                  {selectedIds.length ? (
                    <button
                      type="button"
                      className={styles.btnEdit}
                      disabled={busy}
                      onClick={() => void applyIgnoredPersons()}
                    >
                      {ignoreScope === 'available' ? 'Прикрепить' : 'Открепить'} ({selectedIds.length})
                    </button>
                  ) : null}
                </div>
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
                    <th />
                    <th>ФИО</th>
                    <th>Подразделение</th>
                    <th>Позиция</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIgnoredPersons.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredIgnoredPersons.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={() => toggleId(p.id)}
                          />
                        </td>
                        <td>
                          <span className={styles.avatar}>{(p.fullName || '?').slice(0, 1)}</span>
                          {p.fullName}
                        </td>
                        <td>{p.divisionName || '—'}</td>
                        <td>{p.positionName || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'ignored-divisions' ? (
            <>
              <div className={styles.toolbar}>
                <div className={styles.leftActions}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                    Игнорируемые подразделения
                  </h2>
                  <div className={styles.scopeTabs}>
                    <button
                      type="button"
                      className={ignoreScope === 'attached' ? styles.scopeTabActive : styles.scopeTab}
                      onClick={() => {
                        setIgnoreScope('attached');
                        setSelectedIds([]);
                      }}
                    >
                      Прикрепленные
                    </button>
                    <button
                      type="button"
                      className={ignoreScope === 'available' ? styles.scopeTabActive : styles.scopeTab}
                      onClick={() => {
                        setIgnoreScope('available');
                        setSelectedIds([]);
                      }}
                    >
                      Доступные
                    </button>
                  </div>
                  {selectedIds.length ? (
                    <button
                      type="button"
                      className={styles.btnEdit}
                      disabled={busy}
                      onClick={() => void applyIgnoredDivisions()}
                    >
                      {ignoreScope === 'available' ? 'Прикрепить' : 'Открепить'} ({selectedIds.length})
                    </button>
                  ) : null}
                </div>
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
                    <th />
                    <th>Название</th>
                    <th>Группа подразделений</th>
                    <th>Дата открытия</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIgnoredDivisions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredIgnoredDivisions.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(d.id)}
                            onChange={() => toggleId(d.id)}
                          />
                        </td>
                        <td>{d.name}</td>
                        <td>{d.divisionGroup?.name || '—'}</td>
                        <td>{fmtDate(d.openedAt)}</td>
                        <td>
                          <span className={styles.pillActive}>
                            {d.isActive === false ? 'Неактивный' : 'Активный'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : null}

          {tab === 'commands' ? (
            <>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Команды
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
                    <th>ИД команды</th>
                    <th>Тип команды</th>
                    <th>Сотрудник</th>
                    <th>Дата создания</th>
                    <th>Дата начала обработки</th>
                    <th>Дата конца обработки</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommands.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.empty}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    filteredCommands.map((c) => (
                      <tr key={String(c.id)}>
                        <td>{c.id}</td>
                        <td>
                          {c.type === 'punch_lock'
                            ? 'Блокировка отметок (пароль администратора)'
                            : c.type === 'punch_unlock'
                              ? 'Разблокировка после синхронизации'
                              : c.type}
                        </td>
                        <td>{c.employeeName || '—'}</td>
                        <td>{fmtDt(c.createdAt)}</td>
                        <td>{fmtDt(c.startedAt)}</td>
                        <td>{fmtDt(c.finishedAt)}</td>
                        <td>
                          <span className={styles.statusOk}>
                            {c.status === 'completed' ? 'Завершено' : c.status || '—'}
                          </span>
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

      <DeviceFormModal
        open={editOpen}
        title="Устройство (изменение)"
        initial={toForm(device)}
        deviceId={device.id}
        deviceStatus={device.status}
        busy={busy}
        onClose={() => !busy && setEditOpen(false)}
        onSave={save}
      />

      {syncOpen ? (
        <ModalPortal>
          <div className={styles.confirmBackdrop}>
            <div className={styles.confirmBox}>
              <p>Синхронизировать устройство?</p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setSyncOpen(false)}
                >
                  Нет
                </button>
                <button
                  type="button"
                  className={styles.btnSync}
                  disabled={busy}
                  onClick={() => void doSync()}
                >
                  Да
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
      {photos.node}
    </div>
  );
}

export default function DeviceDetailPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <DeviceDetailInner />
    </Suspense>
  );
}
