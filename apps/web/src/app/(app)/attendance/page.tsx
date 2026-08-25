'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilterPanel, type FilterFieldDef } from '@/components/FilterPanel';
import { PageSubnav } from '@/components/PageSubnav';
import { StatusBadge } from '@/components/StatusBadge';
import { apiFetch, PageResult } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { useUrlParam } from '@/lib/use-url-state';
import styles from '../../page-shared.module.css';

type Tab =
  | 'marks'
  | 'days'
  | 'devices'
  | 'locations'
  | 'schedules'
  | 'qr'
  | 'gps'
  | 'requests'
  | 'absences'
  | 'problems';

const TABS = [
  'marks',
  'days',
  'devices',
  'locations',
  'schedules',
  'qr',
  'gps',
  'requests',
  'absences',
  'problems',
] as const;

const LIST_PAGE_SIZE = 50;

const STATUS_FILTER_OPTIONS = [
  { value: 'pending', label: 'Ожидание' },
  { value: 'approved', label: 'Утверждён' },
  { value: 'rejected', label: 'Отклонён' },
];

function rowMatchesSearch(row: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const emp = row.employee as { lastName?: string; firstName?: string } | null | undefined;
  const typ = row.absenceType as { name?: string } | null | undefined;
  const parts = [
    row.title,
    row.type,
    row.note,
    emp?.lastName,
    emp?.firstName,
    typ?.name,
  ]
    .filter(Boolean)
    .map(String);
  return parts.some((p) => p.toLowerCase().includes(needle));
}

function rowInDateRange(
  row: Record<string, unknown>,
  from: string,
  to: string,
  startKey: string,
  endKey?: string,
): boolean {
  const start = String(row[startKey] ?? '').slice(0, 10);
  const end = String(row[endKey ?? startKey] ?? '').slice(0, 10);
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

export default function AttendancePage() {
  const router = useRouter();
  const [tab, setTab] = useUrlParam('tab', 'marks', TABS);
  const [reqType, setReqType] = useUrlParam('type', '');
  const [reqScope, setReqScope] = useUrlParam('scope', 'all');
  const [deviceFilter, setDeviceFilter] = useUrlParam('filter', '');
  const [action, setAction] = useUrlParam('action', '');
  const [scheduleMode, setScheduleMode] = useUrlParam('mode', 'schedules');
  const [dateFrom] = useUrlParam('dateFrom', '');
  const [dateTo] = useUrlParam('dateTo', '');
  const [statusFilter] = useUrlParam('status', '');
  const [search] = useUrlParam('q', '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<unknown[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<{ id: string; lastName: string; firstName: string }[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<
    { id: string; name: string; latitude?: number | null; longitude?: number | null; geoRadiusM?: number }[]
  >([]);
  const [schedules, setSchedules] = useState<{ id: string; name: string; code: string }[]>([]);
  const [qrCodes, setQrCodes] = useState<
    { id: string; code: string; label: string; isActive: boolean; location?: { name: string } | null }[]
  >([]);

  const pagedTabs = tab === 'marks' || tab === 'days';
  const filterableTabs =
    tab === 'marks' || tab === 'days' || tab === 'absences' || tab === 'requests';
  const exportableTabs =
    tab === 'marks' || tab === 'days' || tab === 'absences' || tab === 'requests';

  const filterFields = useMemo((): FilterFieldDef[] => {
    if (tab === 'marks' || tab === 'days') {
      return [{ type: 'dateFrom' }, { type: 'dateTo' }];
    }
    if (tab === 'absences' || tab === 'requests') {
      return [
        { type: 'dateFrom' },
        { type: 'dateTo' },
        { type: 'status', options: STATUS_FILTER_OPTIONS },
        { type: 'search' },
      ];
    }
    return [];
  }, [tab]);

  useEffect(() => {
    if (tab === 'locations') router.replace('/catalog/locations');
    if (tab === 'devices') router.replace('/catalog/devices');
    if (tab === 'marks') router.replace('/attendance/marks');
    if (tab === 'gps') router.replace('/attendance/gps-tracking');
    if (tab === 'problems') router.replace('/attendance/problems');
    if (tab === 'days') router.replace('/attendance/latest');
  }, [tab, router]);

  function marksRangeQs() {
    const p = new URLSearchParams();
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    const s = p.toString();
    return s ? `&${s}` : '';
  }

  async function load() {
    setError('');
    try {
      const reqQs = new URLSearchParams();
      if (reqType) reqQs.set('type', reqType);
      if (reqScope && reqScope !== 'all') reqQs.set('scope', reqScope);
      if (statusFilter && tab === 'requests') reqQs.set('status', statusFilter);
      const reqSuffix = reqQs.toString() ? `?${reqQs}` : '';

      const deviceQs = deviceFilter === 'new' ? '?filter=new' : '';

      const daysDate = dateFrom || dateTo;
      const daysQs = daysDate ? `&date=${daysDate}` : '';

      const map: Record<Tab, string> = {
        marks: `/api/attendance/marks?page=${page}&limit=${LIST_PAGE_SIZE}${marksRangeQs()}`,
        days: `/api/attendance/days?page=${page}&limit=${LIST_PAGE_SIZE}${daysQs}`,
        devices: `/api/attendance/devices${deviceQs}`,
        locations: '/api/attendance/locations',
        schedules: `/api/attendance/schedules${scheduleMode === 'rosters' ? '?mode=rosters' : ''}`,
        qr: '/api/attendance/qr-codes',
        gps: '/api/catalog/gps-tracks',
        requests: `/api/hr/requests${reqSuffix}`,
        absences: '/api/hr/absences',
        problems: '/api/attendance/problems',
      };
      if (pagedTabs) {
        const result = await apiFetch<PageResult<unknown>>(map[tab as Tab]);
        setData(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } else {
        const rows = await apiFetch<unknown[]>(map[tab as Tab]);
        if (tab === 'schedules' && scheduleMode === 'rosters') {
          // Flatten schedule → employee assignments for the roster view
          const scheds = rows as {
            id: string;
            code: string;
            name: string;
            startTime: string;
            endTime: string;
            graceMinutes: number;
            employees?: { id: string; firstName: string; lastName: string; tabNumber: string }[];
          }[];
          const assignments = scheds.flatMap((s) =>
            (s.employees ?? []).map((e) => ({
              id: `${s.id}:${e.id}`,
              employee: e,
              scheduleCode: s.code,
              scheduleName: s.name,
              startTime: s.startTime,
              endTime: s.endTime,
              graceMinutes: s.graceMinutes,
            })),
          );
          setData(assignments);
          setTotal(assignments.length);
          setSchedules(scheds);
        } else {
          setData(rows);
          setTotal(rows.length);
          if (tab === 'schedules') setSchedules(rows as typeof schedules);
        }
        setTotalPages(1);
        if (tab === 'qr') setQrCodes(rows as typeof qrCodes);
        if (tab === 'locations') setLocations(rows as typeof locations);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setData([]);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [tab, dateFrom, dateTo, statusFilter, search]);

  useEffect(() => {
    load();
  }, [tab, page, reqType, reqScope, deviceFilter, scheduleMode, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    apiFetch<PageResult<{ id: string; lastName: string; firstName: string }>>(
      '/api/employees?status=active&limit=500',
    )
      .then((r) => setEmployees(r.items))
      .catch(() => undefined);
    apiFetch<{ id: string; name: string }[]>('/api/hr/absence-types')
      .then(setAbsenceTypes)
      .catch(() => undefined);
    apiFetch<typeof locations>('/api/attendance/locations')
      .then(setLocations)
      .catch(() => undefined);
    apiFetch<{ id: string; name: string; code: string }[]>('/api/attendance/schedules')
      .then(setSchedules)
      .catch(() => undefined);
  }, []);

  async function createDevice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/devices', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        serialNumber: fd.get('serialNumber'),
        adapterType: fd.get('adapterType') || 'mock',
        locationId: fd.get('locationId') || undefined,
        model: fd.get('model') || undefined,
        host: fd.get('host') || undefined,
        username: fd.get('username') || undefined,
        password: fd.get('password') || undefined,
      }),
    });
    e.currentTarget.reset();
    setTab('devices');
    await load();
  }

  async function registerGw() {
    await apiFetch('/api/attendance/devices/register-gw', { method: 'POST' });
    await load();
  }

  async function createLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/locations', {
      method: 'POST',
      body: JSON.stringify({
        code: fd.get('code'),
        name: fd.get('name'),
        address: fd.get('address') || undefined,
        latitude: fd.get('latitude') ? Number(fd.get('latitude')) : undefined,
        longitude: fd.get('longitude') ? Number(fd.get('longitude')) : undefined,
        geoRadiusM: fd.get('geoRadiusM') ? Number(fd.get('geoRadiusM')) : 150,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function reviewAbsence(id: string, status: 'approved' | 'rejected') {
    await apiFetch(`/api/hr/absences/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function resolveProblem(id: string) {
    await apiFetch(`/api/attendance/problems/${id}/resolve`, { method: 'PATCH' });
    await load();
  }

  async function toggleQr(id: string, isActive: boolean) {
    await apiFetch(`/api/attendance/qr-codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    await load();
  }

  async function markAbsents() {
    await apiFetch('/api/attendance/days/mark-absents', { method: 'POST' });
    setTab('days');
    await load();
  }

  function useMyLocation(form: HTMLFormElement) {
    if (!navigator.geolocation) {
      setError('Геолокация не поддерживается браузером');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = form.elements.namedItem('latitude') as HTMLInputElement | null;
        const lon = form.elements.namedItem('longitude') as HTMLInputElement | null;
        if (lat) lat.value = String(pos.coords.latitude);
        if (lon) lon.value = String(pos.coords.longitude);
      },
      () => setError('GPS ruxsat berilmadi'),
    );
  }

  async function createAbsence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/hr/absences', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        absenceTypeId: fd.get('absenceTypeId'),
        startDate: fd.get('startDate'),
        endDate: fd.get('endDate'),
        note: fd.get('note') || undefined,
      }),
    });
    e.currentTarget.reset();
    setTab('absences');
    await load();
  }

  async function createRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const visibility =
      reqScope === 'mine' || reqScope === 'personal'
        ? 'personal'
        : reqScope === 'to_me'
          ? 'inbox'
          : 'shared';
    await apiFetch('/api/hr/requests', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        type: fd.get('type') || reqType || 'hr_change',
        title: fd.get('title'),
        visibility,
      }),
    });
    e.currentTarget.reset();
    setTab('requests');
    await load();
  }

  async function createSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/schedules', {
      method: 'POST',
      body: JSON.stringify({
        code: fd.get('code'),
        name: fd.get('name'),
        startTime: fd.get('startTime') || '09:00',
        endTime: fd.get('endTime') || '18:00',
        graceMinutes: Number(fd.get('graceMinutes') || 15),
      }),
    });
    e.currentTarget.reset();
    setTab('schedules');
    await load();
  }

  async function assignSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch(`/api/attendance/schedules/${fd.get('scheduleId')}/assign`, {
      method: 'POST',
      body: JSON.stringify({ employeeId: fd.get('employeeId') }),
    });
    await load();
  }

  async function createQr(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/qr-codes', {
      method: 'POST',
      body: JSON.stringify({
        label: fd.get('label'),
        locationId: fd.get('locationId') || undefined,
        code: fd.get('code') || undefined,
      }),
    });
    e.currentTarget.reset();
    setTab('qr');
    await load();
  }

  async function punchQr(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/punches/qr', {
      method: 'POST',
      body: JSON.stringify({
        qrCode: fd.get('qrCode'),
        employeeId: fd.get('employeeId'),
        direction: fd.get('direction') || 'IN',
      }),
    });
    setTab('marks');
    await load();
  }

  async function saveGpsLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch(`/api/attendance/locations/${fd.get('locationId')}`, {
      method: 'PATCH',
      body: JSON.stringify({
        latitude: Number(fd.get('latitude')),
        longitude: Number(fd.get('longitude')),
        geoRadiusM: Number(fd.get('geoRadiusM') || 150),
      }),
    });
    await load();
  }

  async function punchGps(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await apiFetch('/api/attendance/punches/gps', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        locationId: fd.get('locationId') || undefined,
        latitude: Number(fd.get('latitude')),
        longitude: Number(fd.get('longitude')),
        direction: fd.get('direction') || 'IN',
      }),
    });
    setTab('marks');
    await load();
  }

  async function review(id: string, status: 'approved' | 'rejected') {
    await apiFetch(`/api/hr/requests/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function cancelRequest(id: string) {
    await apiFetch(`/api/hr/requests/${id}/cancel`, { method: 'POST' });
    await load();
  }

  async function ingestDemoPunch() {
    const session = JSON.parse(localStorage.getItem('hrhub_session') || '{}');
    const tenantId = session?.tenant?.id;
    if (!tenantId) {
      setError('Tenant не найден — войдите снова');
      return;
    }
    await apiFetch('/api/attendance/punches/ingest', {
      method: 'POST',
      body: JSON.stringify({
        tenantId,
        employeeExternalId: 'face-0001',
        direction: 'IN',
        occurredAt: new Date().toISOString(),
        source: 'manual',
        serialNumber: 'MOCK-001',
      }),
    });
    setTab('marks');
    await load();
  }

  const rows = data as Record<string, unknown>[];

  const displayRows = useMemo(() => {
    if (tab === 'absences') {
      return rows.filter((r) => {
        if (statusFilter && String(r.status) !== statusFilter) return false;
        if (!rowMatchesSearch(r, search)) return false;
        return rowInDateRange(r, dateFrom, dateTo, 'startDate', 'endDate');
      });
    }
    if (tab === 'requests') {
      return rows.filter((r) => {
        if (!rowMatchesSearch(r, search)) return false;
        return rowInDateRange(r, dateFrom, dateTo, 'createdAt');
      });
    }
    return rows;
  }, [rows, tab, statusFilter, search, dateFrom, dateTo]);

  function exportCsv() {
    downloadCsv(`attendance-${tab}`, displayRows);
  }

  const attendanceSubnavKey =
    tab === 'requests'
      ? 'absence-requests'
      : tab === 'absences'
        ? 'absences'
        : tab === 'devices'
          ? 'devices'
          : tab === 'locations'
            ? 'locations'
            : tab === 'schedules'
              ? 'schedules'
              : tab === 'qr'
                ? 'qr'
                : tab === 'gps'
                  ? 'gps'
                  : tab === 'problems'
                    ? 'problems'
                    : tab === 'days'
                      ? 'days'
                      : 'marks';

  return (
    <div className={styles.wrap}>
      <PageSubnav groupKey={attendanceSubnavKey} />

      <header className={styles.header}>
        <div className={styles.rowActions}>
          {exportableTabs ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={exportCsv}
              disabled={!displayRows.length}
            >
              Экспорт CSV
            </button>
          ) : null}
          <button type="button" className={styles.btnSecondary} onClick={markAbsents}>
            Отметить отсутствующих
          </button>
          <button type="button" className={styles.btn} onClick={ingestDemoPunch}>
            Демо-отметка (Ali)
          </button>
        </div>
      </header>

      <div className={styles.tabs}>
        {(
          [
            ['marks', 'Отметки'],
            ['days', 'По дням'],
            ['schedules', 'Графики'],
            ['devices', 'Устройства'],
            ['locations', 'Локации'],
            ['qr', 'QR'],
            ['gps', 'GPS'],
            ['requests', 'Заявки'],
            ['absences', 'Отсутствия'],
            ['problems', 'Проблемы'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? styles.tabActive : styles.tab}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {filterableTabs ? (
        <FilterPanel
          open={filtersOpen}
          onToggle={() => setFiltersOpen((o) => !o)}
          fields={filterFields}
        />
      ) : null}

      {tab === 'requests' ? (
        <div className={styles.rowActions} style={{ marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(
            [
              ['', 'Все типы'],
              ['hr_change', 'Кадровые'],
              ['schedule_change', 'График'],
              ['roster_change', 'Расписание'],
              ['overtime', 'Сверхурочные'],
              ['location', 'Локация'],
              ['absence', 'Отсутствие'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k || 'all-types'}
              type="button"
              className={reqType === k ? styles.tabActive : styles.tab}
              onClick={() => setReqType(k)}
            >
              {label}
            </button>
          ))}
          {(
            [
              ['all', 'Общие/все'],
              ['mine', 'Мои'],
              ['available', 'Доступные'],
              ['to_me', 'Мне'],
              ['shared', 'Общие'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={reqScope === k ? styles.tabActive : styles.tab}
              onClick={() => setReqScope(k)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'devices' ? (
        <div className={styles.rowActions} style={{ marginBottom: '0.75rem', gap: '0.5rem' }}>
          <button
            type="button"
            className={!deviceFilter ? styles.tabActive : styles.tab}
            onClick={() => setDeviceFilter('')}
          >
            Все устройства
          </button>
          <button
            type="button"
            className={deviceFilter === 'new' ? styles.tabActive : styles.tab}
            onClick={() => setDeviceFilter('new')}
          >
            Новые
          </button>
        </div>
      ) : null}

      {tab === 'schedules' ? (
        <div className={styles.rowActions} style={{ marginBottom: '0.75rem', gap: '0.5rem' }}>
          <button
            type="button"
            className={scheduleMode !== 'rosters' ? styles.tabActive : styles.tab}
            onClick={() => setScheduleMode('schedules')}
          >
            Графики работы
          </button>
          <button
            type="button"
            className={scheduleMode === 'rosters' ? styles.tabActive : styles.tab}
            onClick={() => setScheduleMode('rosters')}
          >
            Расписания
          </button>
          <a href="/catalog/work-schedules" className={styles.tab} style={{ textDecoration: 'none' }}>
            Полный каталог →
          </a>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'devices' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form className={styles.form} onSubmit={createDevice}>
            <label>
              Наименование
              <input name="name" required placeholder="Hikvision Gate 2" />
            </label>
            <label>
              Серийный №
              <input name="serialNumber" required />
            </label>
            <label>
              Адаптер
              <select name="adapterType" defaultValue="mock">
                <option value="mock">mock</option>
                <option value="hikvision">hikvision (ISAPI)</option>
                <option value="zkteco">zkteco (Push)</option>
              </select>
            </label>
            <label>
              Модель
              <input name="model" placeholder="DS-K1T343" />
            </label>
            <label>
              Хост
              <input name="host" placeholder="192.168.1.50" />
            </label>
            <label>
              Логин
              <input name="username" placeholder="admin" />
            </label>
            <label>
              Пароль
              <input name="password" type="password" placeholder="••••••" />
            </label>
            <label>
              Локация
              <select name="locationId">
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={styles.btn} type="submit">
              Добавить устройство
            </button>
            <button className={styles.btnSecondary} type="button" onClick={registerGw}>
              Переподключить GW
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'locations' ? (
        <div
          className={styles.panel}
          style={{
            marginBottom: '1rem',
            outline: action === 'create' ? '2px solid var(--accent)' : undefined,
            outlineOffset: 2,
          }}
          id="location-create"
        >
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>
            {action === 'create' ? 'Локация — создать' : 'Новая локация'}
          </h2>
          <form
            className={styles.form}
            onSubmit={async (e) => {
              await createLocation(e);
              if (action === 'create') setAction('');
            }}
          >
            <label>
              Код
              <input name="code" required autoFocus={action === 'create'} />
            </label>
            <label>
              Наименование
              <input name="name" required />
            </label>
            <label>
              Адрес
              <input name="address" />
            </label>
            <label>
              Широта
              <input name="latitude" type="number" step="any" />
            </label>
            <label>
              Долгота
              <input name="longitude" type="number" step="any" />
            </label>
            <label>
              Радиус (м)
              <input name="geoRadiusM" type="number" defaultValue={150} />
            </label>
            <button className={styles.btn} type="submit">
              Добавить локацию
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'absences' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem' }}>
            <Link href="/catalog/absences">Все отсутствия сотрудников →</Link>
            {' · '}
            <Link href="/catalog/absence-types">Типы отпуска</Link>
          </p>
          <form className={styles.form} onSubmit={createAbsence}>
            <label>
              Сотрудник
              <select name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="absenceTypeId" required>
                {absenceTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              С
              <input name="startDate" type="date" required />
            </label>
            <label>
              По
              <input name="endDate" type="date" required />
            </label>
            <label>
              Примечание
              <input name="note" />
            </label>
            <button className={styles.btn} type="submit">
              Создать запрос
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'schedules' ? (
        <div className={styles.split} style={{ marginBottom: '1rem' }}>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={createSchedule}>
              <label>
                Код
                <input name="code" required placeholder="SHIFT-A" />
              </label>
              <label>
                Наименование
                <input name="name" required placeholder="Смена A 08–17" />
              </label>
              <label>
                Начало
                <input name="startTime" defaultValue="09:00" />
              </label>
              <label>
                Окончание
                <input name="endTime" defaultValue="18:00" />
              </label>
              <label>
                Допуск (мин)
                <input name="graceMinutes" type="number" defaultValue={15} />
              </label>
              <button className={styles.btn} type="submit">
                Создать график
              </button>
            </form>
          </div>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={assignSchedule}>
              <label>
                Grafik
                <select name="scheduleId" required>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сотрудник
                <select name="employeeId" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>
              <button className={styles.btn} type="submit">
                Назначить
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {tab === 'qr' ? (
        <div className={styles.split} style={{ marginBottom: '1rem' }}>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={createQr}>
              <label>
                Метка
                <input name="label" required placeholder="Вход QR" />
              </label>
              <label>
                Код (необязательно)
                <input name="code" placeholder="auto" />
              </label>
              <label>
                Локация
                <select name="locationId">
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className={styles.btn} type="submit">
                Создать QR
              </button>
            </form>
          </div>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={punchQr}>
              <label>
                QR-код
                <select name="qrCode" required>
                  {qrCodes.map((q) => (
                    <option key={q.id} value={q.code}>
                      {q.label} ({q.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сотрудник
                <select name="employeeId" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Направление
                <select name="direction" defaultValue="IN">
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                  <option value="AUTO">AUTO</option>
                </select>
              </label>
              <button className={styles.btn} type="submit">
                Отметить по QR
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {tab === 'gps' ? (
        <div className={styles.split} style={{ marginBottom: '1rem' }}>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={saveGpsLocation}>
              <label>
                Локация
                <select name="locationId" required>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.latitude != null ? ` (${l.latitude}, ${l.longitude})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Широта
                <input name="latitude" type="number" step="any" required defaultValue={41.3111} />
              </label>
              <label>
                Долгота
                <input name="longitude" type="number" step="any" required defaultValue={69.2797} />
              </label>
              <label>
                Радиус (м)
                <input name="geoRadiusM" type="number" defaultValue={150} />
              </label>
              <button className={styles.btn} type="submit">
                Сохранить геозону
              </button>
            </form>
          </div>
          <div className={styles.panel}>
            <form className={styles.form} onSubmit={punchGps}>
              <label>
                Сотрудник
                <select name="employeeId" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Локация
                <select name="locationId">
                  <option value="">авто</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Широта
                <input name="latitude" type="number" step="any" required defaultValue={41.3111} />
              </label>
              <label>
                Долгота
                <input name="longitude" type="number" step="any" required defaultValue={69.2797} />
              </label>
              <label>
                Направление
                <select name="direction" defaultValue="IN">
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                </select>
              </label>
              <button className={styles.btn} type="submit">
                Отметить по GPS
              </button>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={(e) => useMyLocation(e.currentTarget.form!)}
              >
                Моё местоположение
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {tab === 'requests' ? (
        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <form className={styles.form} onSubmit={createRequest}>
            <label>
              Сотрудник
              <select name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="type" defaultValue={reqType || 'hr_change'} key={reqType || 'hr_change'}>
                <option value="absence">absence</option>
                <option value="overtime">overtime</option>
                <option value="schedule_change">schedule_change</option>
                <option value="roster_change">roster_change</option>
                <option value="location">location</option>
                <option value="hr_change">hr_change</option>
              </select>
            </label>
            <label>
              Заголовок
              <input name="title" required />
            </label>
            <button className={styles.btn} type="submit">
              Отправить
            </button>
          </form>
        </div>
      ) : null}

      <div className={styles.panel}>
        <table>
          <thead>
            <tr>
              {tab === 'marks' && (
                <>
                  <th>Время</th>
                  <th>Сотрудник</th>
                  <th>Направление</th>
                  <th>Источник</th>
                  <th>Устройство</th>
                </>
              )}
              {tab === 'days' && (
                <>
                  <th>Сотрудник</th>
                  <th>Статус</th>
                  <th>Вход</th>
                  <th>Выход</th>
                  <th>Опоздание (мин)</th>
                </>
              )}
              {tab === 'devices' && (
                <>
                  <th>Наименование</th>
                  <th>Серийный №</th>
                  <th>Адаптер</th>
                  <th>Статус</th>
                  <th>Локация</th>
                </>
              )}
              {tab === 'locations' && (
                <>
                  <th>Код</th>
                  <th>Наименование</th>
                  <th>Адрес</th>
                  <th>Устройства</th>
                </>
              )}
              {tab === 'schedules' && scheduleMode !== 'rosters' && (
                <>
                  <th>Код</th>
                  <th>Наименование</th>
                  <th>Время</th>
                  <th>Допуск</th>
                  <th>Сотрудники</th>
                </>
              )}
              {tab === 'schedules' && scheduleMode === 'rosters' && (
                <>
                  <th>Сотрудник</th>
                  <th>Таб. №</th>
                  <th>График</th>
                  <th>Время</th>
                  <th>Допуск</th>
                </>
              )}
              {tab === 'qr' && (
                <>
                  <th>Метка</th>
                  <th>Код</th>
                  <th>Локация</th>
                  <th>Статус</th>
                  <th />
                </>
              )}
              {tab === 'gps' && (
                <>
                  <th>Сотрудник</th>
                  <th>Широта/Долгота</th>
                  <th>Точность (м)</th>
                  <th>Время</th>
                  <th>Источник</th>
                </>
              )}
              {tab === 'requests' && (
                <>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Видимость</th>
                  <th>Сотрудник</th>
                  <th>Статус</th>
                  <th />
                </>
              )}
              {tab === 'absences' && (
                <>
                  <th>Сотрудник</th>
                  <th>Тип</th>
                  <th>С</th>
                  <th>По</th>
                  <th>Статус</th>
                  <th />
                </>
              )}
              {tab === 'problems' && (
                <>
                  <th>Причина</th>
                  <th>Время</th>
                  <th>Данные</th>
                  <th />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => {
              const id = String(r.id);
              if (tab === 'marks') {
                const emp = r.employee as { lastName?: string; firstName?: string } | null;
                const device = r.device as { name?: string } | null;
                return (
                  <tr key={id}>
                    <td>{String(r.occurredAt).replace('T', ' ').slice(0, 19)}</td>
                    <td>
                      {emp ? `${emp.lastName} ${emp.firstName}` : String(r.employeeExternalId ?? '—')}
                    </td>
                    <td>{String(r.direction)}</td>
                    <td>{String(r.source)}</td>
                    <td>{device?.name ?? '—'}</td>
                  </tr>
                );
              }
              if (tab === 'days') {
                const emp = r.employee as { lastName?: string; firstName?: string } | null;
                return (
                  <tr key={id}>
                    <td>{emp ? `${emp.lastName} ${emp.firstName}` : '—'}</td>
                    <td>
                      <StatusBadge status={String(r.status)} />
                    </td>
                    <td>{r.firstInAt ? String(r.firstInAt).slice(11, 19) : '—'}</td>
                    <td>{r.lastOutAt ? String(r.lastOutAt).slice(11, 19) : '—'}</td>
                    <td>{String(r.lateMinutes ?? 0)}</td>
                  </tr>
                );
              }
              if (tab === 'devices') {
                const loc = r.location as { name?: string } | null;
                return (
                  <tr key={id}>
                    <td>{String(r.name)}</td>
                    <td>{String(r.serialNumber)}</td>
                    <td>{String(r.adapterType)}</td>
                    <td>
                      <span className={r.status === 'online' ? styles.badgeOk : styles.badge}>
                        {String(r.status) === 'locked' ? 'отметки заблокированы' : String(r.status)}
                      </span>
                    </td>
                    <td>{loc?.name ?? '—'}</td>
                  </tr>
                );
              }
              if (tab === 'locations') {
                const count = r._count as { devices?: number } | undefined;
                return (
                  <tr key={id}>
                    <td>{String(r.code)}</td>
                    <td>{String(r.name)}</td>
                    <td>{String(r.address ?? '—')}</td>
                    <td>{count?.devices ?? 0}</td>
                  </tr>
                );
              }
              if (tab === 'schedules') {
                if (scheduleMode === 'rosters') {
                  const emp = r.employee as {
                    lastName?: string;
                    firstName?: string;
                    tabNumber?: string;
                  } | null;
                  return (
                    <tr key={id}>
                      <td>{emp ? `${emp.lastName} ${emp.firstName}` : '—'}</td>
                      <td>{emp?.tabNumber ?? '—'}</td>
                      <td>
                        {String(r.scheduleName)} ({String(r.scheduleCode)})
                      </td>
                      <td>
                        {String(r.startTime)}–{String(r.endTime)}
                      </td>
                      <td>{String(r.graceMinutes)}</td>
                    </tr>
                  );
                }
                const count = r._count as { employees?: number } | undefined;
                return (
                  <tr key={id}>
                    <td>{String(r.code)}</td>
                    <td>{String(r.name)}</td>
                    <td>
                      {String(r.startTime)}–{String(r.endTime)}
                    </td>
                    <td>{String(r.graceMinutes)}</td>
                    <td>{count?.employees ?? 0}</td>
                  </tr>
                );
              }
              if (tab === 'qr') {
                const loc = r.location as { name?: string } | null;
                return (
                  <tr key={id}>
                    <td>{String(r.label)}</td>
                    <td>
                      <code>{String(r.code)}</code>
                    </td>
                    <td>{loc?.name ?? '—'}</td>
                    <td>
                      <span className={r.isActive ? styles.badgeOk : styles.badge}>
                        {r.isActive ? 'active' : 'off'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => toggleQr(id, !r.isActive)}
                      >
                        {r.isActive ? 'Удалить' : 'Включить'}
                      </button>
                    </td>
                  </tr>
                );
              }
              if (tab === 'gps') {
                const emp = r.employee as { lastName?: string; firstName?: string } | null;
                return (
                  <tr key={id}>
                    <td>{emp ? `${emp.lastName} ${emp.firstName}` : '—'}</td>
                    <td>
                      {r.latitude != null ? `${r.latitude}, ${r.longitude}` : '—'}
                    </td>
                    <td>{r.accuracyM != null ? String(r.accuracyM) : '—'}</td>
                    <td>{String(r.recordedAt ?? '').replace('T', ' ').slice(0, 19)}</td>
                    <td>{String(r.source ?? '—')}</td>
                  </tr>
                );
              }
              if (tab === 'requests') {
                const emp = r.employee as { lastName?: string; firstName?: string } | null;
                return (
                  <tr key={id}>
                    <td>{String(r.title)}</td>
                    <td>{String(r.type)}</td>
                    <td>{String(r.visibility ?? 'shared')}</td>
                    <td>{emp ? `${emp.lastName} ${emp.firstName}` : '—'}</td>
                    <td>
                      <StatusBadge status={String(r.status)} />
                    </td>
                    <td>
                      {r.status === 'pending' ? (
                        <span className={styles.rowActions}>
                          <button type="button" className={styles.btnSecondary} onClick={() => review(id, 'approved')}>
                            OK
                          </button>
                          <button type="button" className={styles.btnGhost} onClick={() => review(id, 'rejected')}>
                            Rad
                          </button>
                          <button type="button" className={styles.btnGhost} onClick={() => cancelRequest(id)}>
                            Отмена
                          </button>
                        </span>
                      ) : r.status === 'approved' ? (
                        <span className={styles.rowActions}>
                          <button type="button" className={styles.btnGhost} onClick={() => cancelRequest(id)}>
                            Отмена
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              }
              if (tab === 'absences') {
                const emp = r.employee as { lastName?: string; firstName?: string } | null;
                const typ = r.absenceType as { name?: string } | null;
                return (
                  <tr key={id}>
                    <td>{emp ? `${emp.lastName} ${emp.firstName}` : '—'}</td>
                    <td>{typ?.name ?? '—'}</td>
                    <td>{String(r.startDate).slice(0, 10)}</td>
                    <td>{String(r.endDate).slice(0, 10)}</td>
                    <td>
                      <StatusBadge status={String(r.status)} />
                    </td>
                    <td>
                      {r.status === 'pending' ? (
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() => reviewAbsence(id, 'approved')}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => reviewAbsence(id, 'rejected')}
                          >
                            Rad
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={id}>
                  <td>
                    {String(r.reason) === 'device_admin_login'
                      ? 'Пароль администратора на терминале'
                      : String(r.reason) === 'device_clock_skew'
                        ? 'Сдвиг часов терминала'
                        : String(r.reason) === 'device_clock_rollback'
                          ? 'Часы терминала откатили назад'
                          : String(r.reason)}
                  </td>
                  <td>{String(r.createdAt).slice(0, 19)}</td>
                  <td>
                    <code style={{ fontSize: 11 }}>{JSON.stringify(r.payload).slice(0, 80)}</code>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => resolveProblem(id)}
                    >
                      Решить
                    </button>
                  </td>
                </tr>
              );
            })}
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  Пусто
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {pagedTabs ? (
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Назад
            </button>
            <span>
              Стр. {page} / {totalPages} · всего {total}
            </span>
            <button
              type="button"
              className={styles.pagerBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
