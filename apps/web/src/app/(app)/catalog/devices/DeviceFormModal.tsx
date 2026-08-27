'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ModalPortal } from '@/components/ModalPortal';
import styles from './page.module.css';

export type DeviceMeta = {
  deviceType?: string;
  timezone?: string;
  battery?: number | null;
  trackingType?: 'in' | 'out' | 'mark';
  autoGenerateIn?: boolean;
  autoGenerateOut?: boolean;
  ignorePhotos?: boolean;
  ignoreMarks?: boolean;
  invalidMarks?: boolean;
  sendSingleTracking?: boolean;
  periodicReboot?: boolean;
  useBasicSettings?: boolean;
  hikCentral?: {
    gatewayHost?: string;
    gatewayPort?: number | string;
    deviceId?: string;
    isupKey?: string;
  };
  [key: string]: unknown;
};

export function punchLockActive(meta?: DeviceMeta | null): boolean {
  const guard = meta?.clockGuard;
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) return false;
  const lock = (guard as Record<string, unknown>).punchLock;
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return false;
  return (lock as Record<string, unknown>).active === true;
}

export function passwordOutOfSync(meta?: DeviceMeta | null, status?: string | null): boolean {
  if (status === 'auth_failed') return true;
  const auth = meta?.auth;
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return false;
  return (auth as Record<string, unknown>).passwordOutOfSync === true;
}

export type DeviceFormValues = {
  name: string;
  serialNumber: string;
  locationId: string;
  model: string;
  adapterType: string;
  host: string;
  port: string;
  username: string;
  password: string;
  isActive: boolean;
  meta: DeviceMeta;
};

type Loc = { id: string; name: string; code: string };
type FormTab = 'main' | 'link' | 'tracking';

const emptyMeta = (): DeviceMeta => ({
  deviceType: 'Hikvision',
  trackingType: 'mark',
  autoGenerateIn: true,
  autoGenerateOut: true,
  ignorePhotos: false,
  ignoreMarks: false,
  invalidMarks: false,
  sendSingleTracking: true,
  periodicReboot: false,
  useBasicSettings: true,
  hikCentral: {
    gatewayHost: 'hikvision.verifix.com',
    gatewayPort: 6362,
    deviceId: '',
    isupKey: '',
  },
});

export function blankDeviceForm(): DeviceFormValues {
  return {
    name: '',
    serialNumber: '',
    locationId: '',
    model: '',
    adapterType: 'hikvision',
    host: '',
    port: '80',
    username: 'admin',
    password: '',
    isActive: true,
    meta: emptyMeta(),
  };
}

type Props = {
  open: boolean;
  title: string;
  initial: DeviceFormValues;
  deviceId?: string | null;
  deviceStatus?: string | null;
  busy?: boolean;
  onClose: () => void;
  /** sync=true starts persons sync; locationChanged helps avoid double-sync */
  onSave: (
    values: DeviceFormValues,
    sync: boolean,
    meta?: { locationChanged: boolean },
  ) => Promise<void>;
};

const TABS: Array<{ id: FormTab; label: string }> = [
  { id: 'main', label: 'Основные' },
  { id: 'link', label: 'Связь и пароль' },
  { id: 'tracking', label: 'Трекинг' },
];

export function DeviceFormModal({
  open,
  title,
  initial,
  deviceId,
  deviceStatus,
  busy,
  onClose,
  onSave,
}: Props) {
  const [values, setValues] = useState(initial);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [termPass, setTermPass] = useState('');
  const [syncPass, setSyncPass] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [savingMode, setSavingMode] = useState<'idle' | 'save' | 'sync'>('idle');
  const [tab, setTab] = useState<FormTab>('main');
  const [initialLocationId, setInitialLocationId] = useState(initial.locationId);
  const [locFilter, setLocFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(initial);
    setInitialLocationId(initial.locationId);
    setErr('');
    setOkMsg('');
    setTermPass('');
    setSyncPass('');
    setPwdMsg('');
    setSavingMode('idle');
    setTab('main');
    setLocFilter('');
    void apiFetch<Loc[]>('/api/attendance/locations')
      .then((d) => setLocations(Array.isArray(d) ? d : []))
      .catch(() => setLocations([]));
  }, [open, initial]);

  if (!open) return null;

  const locked = !!busy || savingMode !== 'idle' || pwdBusy;
  const locQ = locFilter.trim().toLowerCase();
  const filteredLocations = locQ
    ? locations.filter((l) =>
        [l.name, l.code].some((x) => String(x || '').toLowerCase().includes(locQ)),
      )
    : locations;

  function setMeta(patch: Partial<DeviceMeta>) {
    setValues((v) => ({ ...v, meta: { ...v.meta, ...patch } }));
  }

  function setHk(patch: NonNullable<DeviceMeta['hikCentral']>) {
    setValues((v) => ({
      ...v,
      meta: {
        ...v.meta,
        hikCentral: { ...(v.meta.hikCentral || {}), ...patch },
      },
    }));
  }

  async function submit(sync: boolean) {
    setErr('');
    setOkMsg('');
    if (!values.name.trim() || !values.serialNumber.trim()) {
      setErr('Название и серийный номер обязательны');
      setTab('main');
      return;
    }
    if (!values.locationId.trim()) {
      setErr('Локация обязательна — по ней загружаются сотрудники на терминал');
      setTab('main');
      return;
    }
    const locationChanged = values.locationId !== initialLocationId;
    setSavingMode(sync ? 'sync' : 'save');
    try {
      await onSave(values, sync, { locationChanged });
      setOkMsg(
        sync
          ? locationChanged
            ? 'Сохранено. Синхронизация сотрудников уже запущена (смена локации).'
            : 'Сохранено. Синхронизация сотрудников запущена.'
          : 'Сохранено',
      );
      setInitialLocationId(values.locationId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingMode('idle');
    }
  }

  return (
    <ModalPortal>
      <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
        <div className={styles.modal}>
          <div className={styles.modalHead}>
            <h2>{title}</h2>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={locked}>
              Закрыть
            </button>
          </div>

          <div className={styles.formTabs} role="tablist" aria-label="Разделы устройства">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? styles.formTabActive : styles.formTab}
                disabled={locked}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.modalBody}>
            {tab === 'main' ? (
              <>
                <p className={`${styles.tabHint} ${styles.full}`}>
                  Основные данные терминала. Локация нужна, чтобы система знала, каких сотрудников
                  загружать на устройство.
                </p>
                <label>
                  Название
                  <input
                    value={values.name}
                    onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                    disabled={locked}
                  />
                </label>
                <label>
                  Тип устройства
                  <select
                    value={values.adapterType}
                    disabled={locked}
                    onChange={(e) => {
                      const adapterType = e.target.value;
                      setValues((v) => ({
                        ...v,
                        adapterType,
                        meta: {
                          ...v.meta,
                          deviceType:
                            adapterType === 'hikvision'
                              ? 'Hikvision'
                              : adapterType === 'zkteco'
                                ? 'ZKTeco'
                                : 'Mock',
                        },
                      }));
                    }}
                  >
                    <option value="hikvision">Hikvision</option>
                    <option value="zkteco">ZKTeco</option>
                    <option value="mock">Mock</option>
                  </select>
                </label>
                <label>
                  Локация *
                  <input
                    type="search"
                    value={locFilter}
                    onChange={(e) => setLocFilter(e.target.value)}
                    placeholder="Фильтр локаций по названию..."
                    disabled={locked}
                    style={{ marginBottom: '0.35rem' }}
                  />
                  <select
                    value={values.locationId}
                    onChange={(e) => setValues((v) => ({ ...v, locationId: e.target.value }))}
                    required
                    disabled={locked}
                  >
                    <option value="">Выберите локацию</option>
                    {filteredLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Серийный номер
                  <input
                    value={values.serialNumber}
                    onChange={(e) => setValues((v) => ({ ...v, serialNumber: e.target.value }))}
                    disabled={locked}
                  />
                </label>
                <label>
                  Модель устройства
                  <input
                    value={values.model}
                    onChange={(e) => setValues((v) => ({ ...v, model: e.target.value }))}
                    placeholder="DS-K1T343"
                    disabled={locked}
                  />
                </label>
                <div className={styles.toggleRow}>
                  <span>Статус: {values.isActive ? 'Активный' : 'Неактивный'}</span>
                  <input
                    type="checkbox"
                    checked={values.isActive}
                    disabled={locked}
                    onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
                  />
                </div>
                <p className={`${styles.tabHint} ${styles.full}`}>
                  HikCentral (если терминал подключён через облачный шлюз)
                </p>
                <label>
                  Адрес шлюза HikCentral
                  <input
                    value={values.meta.hikCentral?.gatewayHost || ''}
                    onChange={(e) => setHk({ gatewayHost: e.target.value })}
                    disabled={locked}
                  />
                </label>
                <label>
                  Порт шлюза HikCentral
                  <input
                    value={String(values.meta.hikCentral?.gatewayPort ?? '')}
                    onChange={(e) => setHk({ gatewayPort: e.target.value })}
                    disabled={locked}
                  />
                </label>
                <label>
                  ID устройства (HikCentral)
                  <input
                    value={values.meta.hikCentral?.deviceId || ''}
                    onChange={(e) => setHk({ deviceId: e.target.value })}
                    disabled={locked}
                  />
                </label>
                <label>
                  Ключ ISUP
                  <input
                    value={values.meta.hikCentral?.isupKey || ''}
                    onChange={(e) => setHk({ isupKey: e.target.value })}
                    disabled={locked}
                  />
                </label>
              </>
            ) : null}

            {tab === 'link' ? (
              <>
                <p className={`${styles.tabHint} ${styles.full}`}>
                  LAN-подключение к терминалу. Пароль в форме сохраняется вместе с «Сохранить».
                  Кнопки ниже — только для сверки/смены пароля на самом устройстве.
                </p>
                <label>
                  Хост
                  <input
                    value={values.host}
                    onChange={(e) => setValues((v) => ({ ...v, host: e.target.value }))}
                    placeholder="192.168.1.50"
                    disabled={locked}
                  />
                </label>
                <label>
                  Порт
                  <input
                    value={values.port}
                    onChange={(e) => setValues((v) => ({ ...v, port: e.target.value }))}
                    placeholder="80"
                    disabled={locked}
                  />
                </label>
                <label>
                  Логин (ISAPI)
                  <input
                    value={values.username}
                    onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
                    placeholder="admin"
                    autoComplete="username"
                    disabled={locked}
                  />
                </label>
                <label>
                  Пароль (ISAPI)
                  <input
                    type="password"
                    value={values.password}
                    onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                    placeholder={
                      values.username ? '•••••• (оставьте пустым, чтобы не менять)' : 'пароль активации'
                    }
                    autoComplete="new-password"
                    disabled={locked}
                  />
                </label>
                {deviceId ? (
                  <div className={styles.pwdBox}>
                    <p className={styles.pwdBoxTitle}>Пароль на терминале</p>
                    {passwordOutOfSync(values.meta, deviceStatus) ? (
                      <div className={styles.lockBanner}>
                        Пароль на терминале не совпадает с сервером. Введите текущий пароль
                        устройства и сохраните его, иначе терминал выйдет из-под контроля
                        администратора.
                      </div>
                    ) : null}
                    <label>
                      Текущий пароль (сохранить на сервер)
                      <input
                        type="password"
                        value={syncPass}
                        onChange={(e) => setSyncPass(e.target.value)}
                        placeholder="Если пароль сменили на самом устройстве"
                        autoComplete="off"
                        maxLength={16}
                        disabled={locked}
                      />
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={
                          locked || syncPass.trim().length < 8 || syncPass.trim().length > 16
                        }
                        onClick={async () => {
                          setPwdMsg('');
                          setPwdBusy(true);
                          try {
                            await apiFetch(`/api/attendance/devices/${deviceId}/sync-password`, {
                              method: 'POST',
                              body: JSON.stringify({ password: syncPass.trim() }),
                            });
                            setPwdMsg('Пароль терминала сохранён на сервере');
                            setSyncPass('');
                          } catch (e) {
                            setPwdMsg(e instanceof Error ? e.message : 'Ошибка сохранения пароля');
                          } finally {
                            setPwdBusy(false);
                          }
                        }}
                      >
                        {pwdBusy ? 'Сохранение…' : 'Сохранить пароль с терминала'}
                      </button>
                    </label>
                    <label>
                      Новый пароль (сменить на терминале)
                      <input
                        type="password"
                        value={termPass}
                        onChange={(e) => setTermPass(e.target.value)}
                        placeholder="8–16 символов, буквы и цифры"
                        autoComplete="new-password"
                        maxLength={16}
                        disabled={locked}
                      />
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={
                          locked ||
                          termPass.trim().length < 8 ||
                          termPass.trim().length > 16
                        }
                        onClick={async () => {
                          setPwdMsg('');
                          setPwdBusy(true);
                          try {
                            await apiFetch(
                              `/api/attendance/devices/${deviceId}/change-password`,
                              {
                                method: 'POST',
                                body: JSON.stringify({ newPassword: termPass.trim() }),
                              },
                            );
                            setPwdMsg('Пароль терминала изменён');
                            setTermPass('');
                            setValues((v) => ({ ...v, password: '' }));
                          } catch (e) {
                            setPwdMsg(e instanceof Error ? e.message : 'Ошибка смены пароля');
                          } finally {
                            setPwdBusy(false);
                          }
                        }}
                      >
                        {pwdBusy ? 'Смена…' : 'Сменить пароль на терминале'}
                      </button>
                    </label>
                    {pwdMsg ? (
                      <small
                        className={
                          pwdMsg.includes('изменён') || pwdMsg.includes('сохранён')
                            ? styles.pwdOk
                            : styles.pwdErr
                        }
                        style={{ gridColumn: '1 / -1' }}
                      >
                        {pwdMsg}
                      </small>
                    ) : (
                      <small className={styles.pwdHint} style={{ gridColumn: '1 / -1' }}>
                        Эти кнопки не сохраняют остальные поля. Для названия, локации и настроек
                        нажмите «Сохранить» внизу.
                      </small>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === 'tracking' ? (
              <>
                <p className={`${styles.tabHint} ${styles.full}`}>
                  Как обрабатывать отметки с этого терминала.
                </p>
                <div className={styles.toggleRow}>
                  <span>Игнорировать фотографии с этого устройства</span>
                  <input
                    type="checkbox"
                    checked={!!values.meta.ignorePhotos}
                    disabled={locked}
                    onChange={(e) => setMeta({ ignorePhotos: e.target.checked })}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <span>Игнорировать отметки с устройства</span>
                  <input
                    type="checkbox"
                    checked={!!values.meta.ignoreMarks}
                    disabled={locked}
                    onChange={(e) => setMeta({ ignoreMarks: e.target.checked })}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <span>Недействительные отметки</span>
                  <input
                    type="checkbox"
                    checked={!!values.meta.invalidMarks}
                    disabled={locked}
                    onChange={(e) => setMeta({ invalidMarks: e.target.checked })}
                  />
                </div>
                <div className={`${styles.toggleRow} ${styles.full}`}>
                  <span>Отправлять только один тип трекинга с устройства</span>
                  <input
                    type="checkbox"
                    checked={!!values.meta.sendSingleTracking}
                    disabled={locked}
                    onChange={(e) => setMeta({ sendSingleTracking: e.target.checked })}
                  />
                </div>
                <div className={styles.full}>
                  <div style={{ marginBottom: '0.35rem', fontSize: '0.8rem', color: '#4b5563' }}>
                    Типы трекинга
                  </div>
                  <div className={styles.radioGroup}>
                    {(
                      [
                        ['in', 'Приход'],
                        ['out', 'Уход'],
                        ['mark', 'Отметка'],
                      ] as const
                    ).map(([k, label]) => (
                      <label
                        key={k}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <input
                          type="radio"
                          name="trackingType"
                          checked={values.meta.trackingType === k}
                          disabled={locked}
                          onChange={() => setMeta({ trackingType: k })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.full}>
                  <div style={{ marginBottom: '0.35rem', fontSize: '0.8rem', color: '#4b5563' }}>
                    Тип авто-генерации
                  </div>
                  <div className={styles.checkGroup}>
                    <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={!!values.meta.autoGenerateIn}
                        disabled={locked}
                        onChange={(e) => setMeta({ autoGenerateIn: e.target.checked })}
                      />
                      Авто-генерация приходов
                    </label>
                    <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
                      <input
                        type="checkbox"
                        checked={!!values.meta.autoGenerateOut}
                        disabled={locked}
                        onChange={(e) => setMeta({ autoGenerateOut: e.target.checked })}
                      />
                      Авто-генерация уходов
                    </label>
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <span>Периодические перезагрузки устройства</span>
                  <input
                    type="checkbox"
                    checked={!!values.meta.periodicReboot}
                    disabled={locked}
                    onChange={(e) => setMeta({ periodicReboot: e.target.checked })}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className={styles.modalFoot}>
            {err ? (
              <p className={`${styles.modalStatus} ${styles.modalStatusErr}`}>{err}</p>
            ) : null}
            {okMsg ? (
              <p className={`${styles.modalStatus} ${styles.modalStatusOk}`}>{okMsg}</p>
            ) : null}
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={locked}>
              Закрыть
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={locked}
              onClick={() => void submit(false)}
            >
              {savingMode === 'save' ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={locked}
              onClick={() => void submit(true)}
              title="Сохраняет устройство и запускает загрузку сотрудников локации"
            >
              {savingMode === 'sync' ? 'Сохранение…' : 'Сохранить и синхронизировать'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
