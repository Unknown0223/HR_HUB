'use client';
import { confirm } from '@/lib/dialogs';

import Link from 'next/link';
import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageSubnav } from '@/components/PageSubnav';
import { ModalPortal } from '@/components/ModalPortal';
import { apiFetch } from '@/lib/api';
import {
  blankDeviceForm,
  DeviceFormModal,
  punchLockActive,
  type DeviceFormValues,
  type DeviceMeta,
} from './DeviceFormModal';
import styles from './page.module.css';

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
  const meta = { ...(blankDeviceForm().meta), ...(d.meta || {}) };
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

  const [rows, setRows] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.name, d.serialNumber, d.model, d.location?.name, deviceTypeLabel(d)]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const selectedIds = useMemo(() => [...checked], [checked]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => checked.has(d.id));
  const focus = filtered.find((d) => d.id === focusId) || null;

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
    setChecked(new Set(filtered.map((d) => d.id)));
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
      // Create + location change already schedule backend sync — only POST when sync
      // requested without a location change on an existing device.
      if (sync && id && editing && !locationChanged) {
        void apiFetch(`/api/attendance/devices/${id}/persons/sync`, { method: 'POST' }).catch(
          () => undefined,
        );
      }
      await load();
      if (id) {
        window.setTimeout(() => {
          setModalOpen(false);
          setEditing(null);
          router.push(`/catalog/devices/${id}`);
        }, 900);
      } else {
        setModalOpen(false);
        setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm('Удалить устройство?'))) return;
    await apiFetch(`/api/attendance/devices/${id}`, { method: 'DELETE' });
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
    if (!(await confirm(`Удалить устройства (${selectedIds.length})?`))) return;
    setBusy(true);
    try {
      await apiFetch('/api/attendance/devices/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setChecked(new Set());
      setFocusId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
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

  return (
    <div className={styles.wrap}>
      <PageSubnav formKey="devices" />
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
          <div className={styles.scopeTabs}>
            <button
              type="button"
              className={!filterNew ? styles.scopeTabActive : styles.scopeTab}
              onClick={() => router.push('/catalog/devices')}
            >
              Устройства
            </button>
            <button
              type="button"
              className={filterNew ? styles.scopeTabActive : styles.scopeTab}
              onClick={() => router.push('/catalog/devices?filter=new')}
            >
              Новые устройства
            </button>
          </div>
        </div>
        <div className={styles.rightTools}>
          <input
            className={styles.search}
            placeholder="Поиск: название, серийный, локация..."
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
              <th>Тип устройства</th>
              <th>Название</th>
              <th>Локация</th>
              <th>Временная зона</th>
              <th>Статус</th>
              <th>Последняя активность</th>
              <th>Заряд батареи</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Загрузка…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Нет данных
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <Fragment key={d.id}>
                  <tr
                    className={
                      checked.has(d.id) || focusId === d.id ? styles.selected : undefined
                    }
                    onClick={() => setFocusId((id) => (id === d.id ? null : d.id))}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.checkCol}>
                      <input
                        type="checkbox"
                        checked={checked.has(d.id)}
                        onChange={() => toggleOne(d.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{deviceTypeLabel(d)}</td>
                    <td>{d.name}</td>
                    <td>{d.location?.name || '—'}</td>
                    <td>
                      {(typeof d.meta?.timezone === 'string' && d.meta.timezone) ||
                        d.location?.timezone ||
                        '—'}
                    </td>
                    <td>
                      <span className={statusClass(d.status, punchLockActive(d.meta))}>
                        {statusLabel(d.status, d.isActive, punchLockActive(d.meta))}
                      </span>
                    </td>
                    <td>{fmtDt(d.lastSeenAt)}</td>
                    <td>
                      {typeof d.meta?.battery === 'number' ? `${d.meta.battery}%` : '—'}
                    </td>
                  </tr>
                  {focus?.id === d.id ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid #e5e7eb' }}>
                        <div className={styles.rowActions}>
                          <Link href={`/catalog/devices/${d.id}`}>Просмотр</Link>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(d);
                              setModalOpen(true);
                            }}
                          >
                            Изменить
                          </button>
                          <button type="button" onClick={() => void remove(d.id)}>
                            Удалить
                          </button>
                          <button type="button" onClick={() => openApply(d)}>
                            Применить настройки для отметок
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

      <DeviceFormModal
        open={modalOpen}
        title={editing ? 'Устройство (изменение)' : 'Устройство (создание)'}
        initial={editing ? toForm(editing) : blankDeviceForm()}
        deviceId={editing?.id || null}
        deviceStatus={editing?.status || null}
        busy={busy}
        onClose={() => {
          if (!busy) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
        onSave={save}
      />

      {applyOpen && applyDevice ? (
        <ModalPortal>
          <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
            <div className={styles.applyModal}>
              <div className={styles.modalHead}>
                <h2>Применить настройки для отметок</h2>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setApplyOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className={styles.applyBody}>
                <p className={styles.applyHint}>
                  Устройство: <strong>{applyDevice.name}</strong>
                </p>
                <label>
                  Дата начала
                  <input
                    type="date"
                    value={applyFrom}
                    onChange={(e) => setApplyFrom(e.target.value)}
                  />
                </label>
                <label>
                  Дата окончания
                  <input
                    type="date"
                    value={applyTo}
                    onChange={(e) => setApplyTo(e.target.value)}
                  />
                </label>
                {applyErr ? <p className={styles.error}>{applyErr}</p> : null}
                {applyMsg ? <p className={styles.applyOk}>{applyMsg}</p> : null}
              </div>
              <div className={styles.modalFoot}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setApplyOpen(false)}
                >
                  Отменить
                </button>
                <button
                  type="button"
                  className={styles.btnApply}
                  disabled={busy || !applyFrom || !applyTo}
                  onClick={() => void submitApply()}
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <DevicesInner />
    </Suspense>
  );
}
