'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/FormModal';
import modal from '@/components/form-modal.module.css';
import { apiFetch } from '@/lib/api';
import styles from './form.module.css';

export type LocationFormValues = {
  code: string;
  name: string;
  address: string;
  timezone: string;
  latitude: string;
  longitude: string;
  geoRadiusM: string;
  locationTypeId: string;
  isActive: boolean;
  isGlobal: boolean;
  region: string;
  bssid: string;
  restrictMarks: boolean;
  polygonalAnalysis: string;
};

type LocType = { id: string; code: string; name: string; isActive?: boolean };

export function blankLocationForm(): LocationFormValues {
  return {
    code: '',
    name: '',
    address: '',
    timezone: 'Asia/Tashkent',
    latitude: '',
    longitude: '',
    geoRadiusM: '150',
    locationTypeId: '',
    isActive: true,
    isGlobal: false,
    region: '',
    bssid: '',
    restrictMarks: false,
    polygonalAnalysis: '',
  };
}

type Props = {
  open: boolean;
  title: string;
  initial: LocationFormValues;
  busy?: boolean;
  onClose: () => void;
  onSave: (values: LocationFormValues) => Promise<void>;
};

export function LocationFormModal({ open, title, initial, busy, onClose, onSave }: Props) {
  const [values, setValues] = useState(initial);
  const [types, setTypes] = useState<LocType[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(initial);
    setErr('');
    void apiFetch<LocType[] | { items?: LocType[] }>('/api/catalog/location-types')
      .then((d) => {
        const items = Array.isArray(d) ? d : d.items || [];
        setTypes(items.filter((t) => t.isActive !== false));
      })
      .catch(() => setTypes([]));
  }, [open, initial]);

  async function submit() {
    setErr('');
    if (!values.code.trim() || !values.name.trim()) {
      setErr('Код и название обязательны');
      return;
    }
    try {
      await onSave(values);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  }

  return (
    <FormModal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      width="lg"
      footer={
        <>
          <button
            type="button"
            className={modal.btnPrimary}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={modal.btnGhost}
            disabled={busy}
            onClick={onClose}
          >
            Закрыть
          </button>
        </>
      }
    >
      {err ? <p className={modal.error}>{err}</p> : null}

      <div className={modal.fields}>
        <label className={modal.field}>
          <span>
            Локация (название) <em className={modal.req}>*</em>
          </span>
          <input
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        </label>

        <div className={styles.row2}>
          <label className={modal.field}>
            <span>
              Код <em className={modal.req}>*</em>
            </span>
            <input
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
              placeholder="AND1"
            />
          </label>

          <label className={modal.field}>
            <span>Тип локации</span>
            <select
              value={values.locationTypeId}
              onChange={(e) => setValues((v) => ({ ...v, locationTypeId: e.target.value }))}
            >
              <option value="">—</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={modal.field}>
          <span>Адрес</span>
          <input
            value={values.address}
            onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
          />
        </label>

        <div className={styles.row2}>
          <label className={modal.field}>
            <span>Регион</span>
            <input
              value={values.region}
              onChange={(e) => setValues((v) => ({ ...v, region: e.target.value }))}
              placeholder="Andijon"
            />
          </label>

          <label className={modal.field}>
            <span>Временная зона</span>
            <input
              value={values.timezone}
              onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
              placeholder="Asia/Tashkent"
            />
          </label>
        </div>

        <div className={styles.row2}>
          <label className={modal.field}>
            <span>Широта</span>
            <input
              value={values.latitude}
              onChange={(e) => setValues((v) => ({ ...v, latitude: e.target.value }))}
              placeholder="40.790345"
            />
          </label>

          <label className={modal.field}>
            <span>Долгота</span>
            <input
              value={values.longitude}
              onChange={(e) => setValues((v) => ({ ...v, longitude: e.target.value }))}
              placeholder="72.331761"
            />
          </label>
        </div>

        <div className={styles.row2}>
          <label className={modal.field}>
            <span>Погрешность (м)</span>
            <input
              value={values.geoRadiusM}
              onChange={(e) => setValues((v) => ({ ...v, geoRadiusM: e.target.value }))}
              inputMode="numeric"
            />
          </label>

          <label className={modal.field}>
            <span>BSSID</span>
            <input
              value={values.bssid}
              onChange={(e) => setValues((v) => ({ ...v, bssid: e.target.value }))}
            />
          </label>
        </div>

        <label className={modal.field}>
          <span>Полигональный анализ</span>
          <input
            value={values.polygonalAnalysis}
            onChange={(e) =>
              setValues((v) => ({ ...v, polygonalAnalysis: e.target.value }))
            }
          />
        </label>

        <div className={styles.checkGroup}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={values.restrictMarks}
              onChange={(e) =>
                setValues((v) => ({ ...v, restrictMarks: e.target.checked }))
              }
            />
            Ограничение отметок
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={values.isGlobal}
              onChange={(e) => setValues((v) => ({ ...v, isGlobal: e.target.checked }))}
            />
            <span className={styles.checkText}>
              Глобальная локация
              <small>
                Сотрудники этой локации загружаются на все устройства республики
              </small>
            </span>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
            />
            Активная
          </label>
        </div>
      </div>
    </FormModal>
  );
}
