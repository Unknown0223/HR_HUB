'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterPanel, useFilterFromUrl } from '@/components/FilterPanel';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  blankDeviceForm,
  DeviceFormModal,
  punchLockActive,
  type DeviceFormValues,
  type DeviceMeta,
} from './DeviceFormModal';
import styles from './page.module.css';
import shared from '../../../page-shared.module.css';

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
  meta?: DeviceMeta | null;
  location?: { id: string; name: string; code: string; timezone?: string } | null;
};

const FILTER_KEYS = ['q', 'status', 'location', 'active'] as const;
const COL_COUNT = 7;

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

function deviceTypeLabel(d: Device) {
  const metaType = d.meta && typeof d.meta.deviceType === 'string' ? d.meta.deviceType : null;
  if (metaType) return metaType;
  if (d.adapterType === 'hikvision') return 'Hikvision';
  if (d.adapterType === 'zkteco') return 'ZKTeco';
  return d.adapterType || '—';
}

function statusClass(status: string, locked?: boolean) {
  if (status.toLowerCase() === 'auth_failed') return styles.statusAuthFailed;
  if (locked) return styles.statusLocked;
  const s = status.toLowerCase();
  if (s === 'online' || s === 'в сети') return styles.statusOnline;
  if (s === 'offline' || s === 'не в сети') return styles.statusOffline;
  if (s === 'locked') return styles.statusLocked;
  if (s === 'new' || s === 'registered') return styles.statusNew;
  return styles.statusOther;
}

function statusLabel(status: string, isActive: boolean, locked?: boolean) {
  if (!isActive) return 'Неактивный';
  if (status.toLowerCase() === 'auth_failed') return 'Пароль не совпадает';
  if (locked || status.toLowerCase() === 'locked') return 'Отметки заблокированы';
  const s = status.toLowerCase();
  if (s === 'online') return 'В сети';
  if (s === 'offline') return 'Не в сети';
  if (s === 'registered' || s === 'new') return 'Новое';
  return status;
}

function toForm(d: Device): DeviceFormValues {
  const meta = { ...blankDeviceForm().meta, ...(d.meta || {}) };
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
    meta,
  };
}

function DevicesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterNew = searchParams.get('filter') === 'new';
  const filters = useFilterFromUrl([...FILTER_KEYS]);
  const q = filters.q;
  const statusFilter = filters.status;
  const locationFilter = filters.location;
  const activeFilter = filters.active;

  const [rows, setRows] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(q || statusFilter || locationFilter || activeFilter),
  );
  const [searchDraft, setSearchDraft] = useState(q);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDevice, setApplyDevice] = useState<Device | null>(null);
  const [applyFrom, setApplyFrom] = useState('');
  const [applyTo, setApplyTo] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [applyErr, setApplyErr] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = filterNew ? '?filter=new' : '';
      const data = await apiFetch<Device[]>(`/api/attendance/devices${qs}`);
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
  }, [filterNew]);

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

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.location?.id) map.set(r.location.id, r.location.name);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((d) =>
        [d.name, d.serialNumber, d.model, d.location?.name, deviceTypeLabel(d)]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(qq)),
      );
    }
    if (statusFilter === 'online') {
      list = list.filter((d) => d.isActive && d.status.toLowerCase() === 'online');
    } else if (statusFilter === 'offline') {
      list = list.filter(
        (d) => d.isActive && !['online', 'new', 'registered'].includes(d.status.toLowerCase()),
      );
    } else if (statusFilter === 'new') {
      list = list.filter((d) =>
        ['new', 'registered'].includes(d.status.toLowerCase()),
      );
    }
    if (activeFilter === 'active') list = list.filter((d) => d.isActive);
    else if (activeFilter === 'inactive') list = list.filter((d) => !d.isActive);
    if (locationFilter) {
      list = list.filter((d) => (d.location?.id || '') === locationFilter);
    }
    return list;
  }, [rows, q, statusFilter, locationFilter, activeFilter]);

  const checkedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked],
  );
  const allPageChecked = filtered.length > 0 && filtered.every((r) => checked[r.id]);
  const somePageChecked = filtered.some((r) => checked[r.id]) && !allPageChecked;

  const editing = editId ? rows.find((r) => r.id === editId) || null : null;

  function toggleCheck(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllPage(on: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
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
    router.replace(qs ? `/catalog/devices?${qs}` : '/catalog/devices', { scroll: false });
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
      router.replace(qs ? `/catalog/devices?${qs}` : '/catalog/devices', { scroll: false });
    }
  }

  async function save(
    values: DeviceFormValues,
    sync: boolean,
    meta?: { locationChanged: boolean },
  ) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        serialNumber: values.serialNumber.trim(),
        locationId: values.locationId || undefined,
        model: values.model || undefined,
        adapterType: values.adapterType,
        host: values.host || undefined,
        port: values.port ? Number(values.port) : undefined,
        username: values.username.trim() || undefined,
        isActive: values.isActive,
        meta: values.meta,
      };
      if (values.password.trim()) body.password = values.password;
      let id = editing?.id;
      const locationChanged =
        meta?.locationChanged === true ||
        (!!editing && (editing.location?.id || '') !== values.locationId);
      if (editing) {
        await apiFetch(`/api/attendance/devices/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<Device>('/api/attendance/devices', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        id = created.id;
      }
      if (sync && id && editing && !locationChanged) {
        void apiFetch(`/api/attendance/devices/${id}/persons/sync`, {
          method: 'POST',
        }).catch(() => undefined);
      }
      closeModal();
      await load();
      if (id) {
        window.setTimeout(() => {
          router.push(`/catalog/devices/${id}`);
        }, 400);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Device) {
    if (!(await confirm(`Удалить устройство «${row.name}»?`))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/attendance/devices/${row.id}`, { method: 'DELETE' });
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
    if (!targets.length) return;

    if (action === 'delete') {
      if (!(await confirm(`Удалить устройства (${targets.length} шт.)?`))) return;
      setBusy(true);
      setError('');
      try {
        await apiFetch('/api/attendance/devices/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({ ids: targets.map((t) => t.id) }),
        });
        setChecked({});
        setSelectedId(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка удаления');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setError('');
    let failed = 0;
    try {
      for (const row of targets) {
        try {
          const isActive = action === 'activate';
          if (row.isActive === isActive) continue;
          await apiFetch(`/api/attendance/devices/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
          });
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

  function openApply(d: Device) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    setApplyDevice(d);
    setApplyFrom(iso(start));
    setApplyTo(iso(now));
    setApplyMsg('');
    setApplyErr('');
    setApplyOpen(true);
  }

  async function submitApply() {
    if (!applyDevice) return;
    setBusy(true);
    setApplyErr('');
    setApplyMsg('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        marksUpdated: number;
        daysRecalculated: number;
      }>(`/api/attendance/devices/${applyDevice.id}/apply-mark-settings`, {
        method: 'POST',
        body: JSON.stringify({ from: applyFrom, to: applyTo }),
      });
      setApplyMsg(
        `Готово: отметок ${res.marksUpdated}, дней пересчитано ${res.daysRecalculated}`,
      );
    } catch (e) {
      setApplyErr(e instanceof Error ? e.message : 'Ошибка применения');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `devices-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((d) => ({
        Название: d.name,
        'Серийный номер': d.serialNumber || '',
        Тип: deviceTypeLabel(d),
        Локация: d.location?.name || '',
        Статус: statusLabel(d.status, d.isActive, punchLockActive(d.meta)),
        Активность: d.lastSeenAt || '',
      })),
    );
  }

  const metrics = useMemo(() => {
    let online = 0;
    let offline = 0;
    let inactive = 0;
    let neu = 0;
    for (const d of rows) {
      if (!d.isActive) {
        inactive += 1;
        continue;
      }
      const s = d.status.toLowerCase();
      if (s === 'online') online += 1;
      else if (s === 'new' || s === 'registered') neu += 1;
      else offline += 1;
    }
    return [
      { label: 'Всего', value: rows.length, kind: 'total' as const },
      { label: 'В сети', value: online, kind: 'online' as const },
      { label: 'Не в сети', value: offline, kind: 'offline' as const },
      { label: 'Новые', value: neu, kind: 'new' as const },
      { label: 'Неактивные', value: inactive, kind: 'inactive' as const },
    ];
  }, [rows]);

  return (
    <div className={styles.wrap}>
      <PageSubnav
        groupKey="devices"
        titleOverride={filterNew ? 'Новые устройства' : 'Устройства'}
      />

      <div className={shared.pageHeader}>
        <div className={`${shared.pageIconBadge} ${shared.pageIconBadgeTransfer}`}>
          <i className="fas fa-desktop" aria-hidden />
        </div>
        <div className={shared.pageHeaderText}>
          <h1 className={shared.pageTitle}>
            {filterNew ? 'Новые устройства' : 'Устройства'}
          </h1>
          <p className={shared.pageSubtitle}>
            {filterNew
              ? 'Терминалы, ожидающие настройки и привязки'
              : 'Терминалы Face ID, мобильные и QR-точки'}
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

      {!filterNew ? (
        <div className={styles.metrics}>
          {metrics.map((m) => (
            <div key={m.label} className={styles.metricCard}>
              <p className={styles.metricLabel}>{m.label}</p>
              <p className={`${styles.metricValue} ${styles[`m_${m.kind}`]}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

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
                type: 'select',
                key: 'status',
                label: 'Статус сети',
                options: [
                  { value: 'online', label: 'В сети' },
                  { value: 'offline', label: 'Не в сети' },
                  { value: 'new', label: 'Новые' },
                ],
              },
              {
                type: 'select',
                key: 'active',
                label: 'Активность',
                options: [
                  { value: 'active', label: 'Активные' },
                  { value: 'inactive', label: 'Неактивные' },
                ],
              },
              {
                type: 'select',
                key: 'location',
                label: 'Локация',
                options: locationOptions,
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
                <th>Устройство</th>
                <th>Локация</th>
                <th>Зона</th>
                <th>Статус</th>
                <th>Активность</th>
                <th>Батарея</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className={styles.empty}>
                    {filterNew ? 'Нет новых устройств' : 'Нет данных — нажмите «Создать»'}
                  </td>
                </tr>
              ) : null}
              {filtered.map((d) => {
                const online = d.isActive && d.status.toLowerCase() === 'online';
                const open = selectedId === d.id;
                const isChecked = Boolean(checked[d.id]);
                return (
                  <Fragment key={d.id}>
                    <tr
                      className={open || isChecked ? styles.rowSelected : undefined}
                      onClick={() => setSelectedId(open ? null : d.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(d.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Выбрать ${d.name}`}
                        />
                      </td>
                      <td>
                        <div className={styles.deviceCell}>
                          <span
                            className={`${styles.deviceIcon} ${
                              online ? styles.deviceIconOn : styles.deviceIconOff
                            }`}
                            aria-hidden
                          >
                            <i className="fas fa-desktop" />
                          </span>
                          <div>
                            <div className={styles.nameCell}>{d.name}</div>
                            <div className={styles.metaCell}>
                              {deviceTypeLabel(d)}
                              {d.serialNumber ? ` · ${d.serialNumber}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{d.location?.name || '—'}</td>
                      <td className={styles.mono}>
                        {(typeof d.meta?.timezone === 'string' && d.meta.timezone) ||
                          d.location?.timezone ||
                          '—'}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusChip} ${statusClass(
                            d.status,
                            punchLockActive(d.meta),
                          )}`}
                        >
                          {statusLabel(d.status, d.isActive, punchLockActive(d.meta))}
                        </span>
                      </td>
                      <td className={styles.mono}>{fmtDt(d.lastSeenAt)}</td>
                      <td>
                        {typeof d.meta?.battery === 'number'
                          ? `${d.meta.battery}%`
                          : '—'}
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.actionsRow}>
                        <td colSpan={COL_COUNT}>
                          <div className={styles.rowActions}>
                            <Link href={`/catalog/devices/${d.id}`}>
                              <i className="fas fa-eye" aria-hidden />
                              Просмотр
                            </Link>
                            <button type="button" onClick={() => openEdit(d.id)}>
                              <i className="fas fa-pen" aria-hidden />
                              Изменить
                            </button>
                            <button type="button" onClick={() => openApply(d)}>
                              <i className="fas fa-sliders-h" aria-hidden />
                              Применить настройки отметок
                            </button>
                            <Link href="/catalog/device-control">
                              <i className="fas fa-satellite-dish" aria-hidden />
                              Удалённое управление
                            </Link>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => void remove(d)}
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

      <DeviceFormModal
        open={modalOpen}
        title={editing ? 'Устройство (изменение)' : 'Устройство (создание)'}
        initial={editing ? toForm(editing) : blankDeviceForm()}
        deviceId={editing?.id || null}
        deviceStatus={editing?.status || null}
        busy={busy}
        onClose={() => {
          if (!busy) closeModal();
        }}
        onSave={save}
      />

      <FormModal
        open={applyOpen && Boolean(applyDevice)}
        title="Применить настройки для отметок"
        onClose={() => {
          if (!busy) setApplyOpen(false);
        }}
        width="sm"
        footer={
          <>
            <button
              type="button"
              className={modal.btnPrimary}
              disabled={busy || !applyFrom || !applyTo}
              onClick={() => void submitApply()}
            >
              Применить
            </button>
            <button
              type="button"
              className={modal.btnGhost}
              disabled={busy}
              onClick={() => setApplyOpen(false)}
            >
              Отменить
            </button>
          </>
        }
      >
        {applyDevice ? (
          <div className={modal.fields}>
            <p className={styles.applyHint}>
              Устройство: <strong>{applyDevice.name}</strong>
            </p>
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
            {applyErr ? <p className={modal.error}>{applyErr}</p> : null}
            {applyMsg ? <p className={styles.applyOk}>{applyMsg}</p> : null}
          </div>
        ) : null}
      </FormModal>
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<p className={shared.muted}>Загрузка…</p>}>
      <DevicesInner />
    </Suspense>
  );
}
