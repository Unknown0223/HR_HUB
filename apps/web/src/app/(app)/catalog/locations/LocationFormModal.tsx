'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ModalPortal } from '@/components/ModalPortal';
import styles from './page.module.css';

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

  if (!open) return null;

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
    <ModalPortal>
      <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
            Закрыть
          </button>
        </div>
        <div className={styles.modalBody}>
          <label>
            Локация (название)
            <input
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
          </label>
          <label>
            Код
            <input
              value={values.code}
              onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
              placeholder="AND1"
            />
          </label>
          <label>
            Тип локации
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
          <label>
            Регион
            <input
              value={values.region}
              onChange={(e) => setValues((v) => ({ ...v, region: e.target.value }))}
              placeholder="Andijon"
            />
          </label>
          <label className={styles.full}>
            Адрес
            <input
              value={values.address}
              onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
            />
          </label>
          <label>
            Временная зона
            <input
              value={values.timezone}
              onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
              placeholder="Asia/Tashkent"
            />
          </label>
          <label>
            BSSID
            <input
              value={values.bssid}
              onChange={(e) => setValues((v) => ({ ...v, bssid: e.target.value }))}
            />
          </label>
          <label>
            Широта
            <input
              value={values.latitude}
              onChange={(e) => setValues((v) => ({ ...v, latitude: e.target.value }))}
              placeholder="40.790345"
            />
          </label>
          <label>
            Долгота
            <input
              value={values.longitude}
              onChange={(e) => setValues((v) => ({ ...v, longitude: e.target.value }))}
              placeholder="72.331761"
            />
          </label>
          <label>
            Погрешность (м)
            <input
              value={values.geoRadiusM}
              onChange={(e) => setValues((v) => ({ ...v, geoRadiusM: e.target.value }))}
            />
          </label>
          <label>
            Полигональный анализ
            <input
              value={values.polygonalAnalysis}
              onChange={(e) => setValues((v) => ({ ...v, polygonalAnalysis: e.target.value }))}
            />
          </label>
          <div className={styles.toggleRow}>
            <span>Ограничение отметок</span>
            <input
              type="checkbox"
              checked={values.restrictMarks}
              onChange={(e) => setValues((v) => ({ ...v, restrictMarks: e.target.checked }))}
            />
          </div>
          <div className={styles.toggleRow}>
            <span>Статус: {values.isActive ? 'Активный' : 'Неактивный'}</span>
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
            />
          </div>
        </div>
        {err ? <p className={styles.error} style={{ padding: '0 1.1rem' }}>{err}</p> : null}
        <div className={styles.modalFoot}>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
            Закрыть
          </button>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void submit()}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
