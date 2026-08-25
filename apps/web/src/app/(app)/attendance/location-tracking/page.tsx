'use client';
import { alert } from '@/lib/dialogs';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalPortal } from '@/components/ModalPortal';
import { PageSubnav } from '@/components/PageSubnav';
import { apiFetch } from '@/lib/api';
import styles from './page.module.css';

type Loc = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geoRadiusM?: number;
};

type Track = {
  id: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracyM?: number | null;
};

type Mark = {
  id: string;
  markTypeLabel?: string;
  locationName?: string | null;
  occurredAt: string;
};

type Emp = { id: string; firstName: string; lastName: string; tabNumber?: string };
type Div = { id: string; name: string };

function LocationTrackingInner() {
  const router = useRouter();
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [divisions, setDivisions] = useState<Div[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [showLocs, setShowLocs] = useState(true);
  const [showGps, setShowGps] = useState(true);
  const [showMarkers, setShowMarkers] = useState(false);
  const [tab, setTab] = useState<'visits' | 'gps' | 'locs'>('visits');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDist, setConfirmDist] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const mapCenter = useMemo(() => {
    const pts = [
      ...(showGps ? tracks : []),
      ...(showLocs
        ? locations.filter((l) => l.latitude != null && l.longitude != null)
        : []),
    ];
    if (!pts.length) return { lat: 41.3111, lon: 69.2797 };
    const last = pts[pts.length - 1] as { latitude: number | null; longitude: number | null };
    return { lat: Number(last.latitude), lon: Number(last.longitude) };
  }, [tracks, locations, showGps, showLocs]);

  const mapSrc = useMemo(() => {
    const lat = mapCenter.lat;
    const lon = mapCenter.lon;
    return `https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=13&l=map`;
  }, [mapCenter]);

  useEffect(() => {
    void (async () => {
      try {
        const [emps, divs] = await Promise.all([
          apiFetch<Emp[] | { items: Emp[] }>('/api/employees?limit=200&status=active'),
          apiFetch<Div[] | { items: Div[] }>('/api/organization/divisions').catch(() => []),
        ]);
        setEmployees(Array.isArray(emps) ? emps : emps.items || []);
        setDivisions(Array.isArray(divs) ? divs : divs.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка');
      }
    })();
  }, []);

  async function load() {
    if (!employeeId) {
      setError('Выберите сотрудника');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const qs = new URLSearchParams({ from, to, employeeId });
      if (divisionId) qs.set('divisionId', divisionId);
      const data = await apiFetch<{
        locations: Loc[];
        tracks: Track[];
        marks: Mark[];
        distanceKm: number;
      }>(`/api/attendance/location-tracking?${qs}`);
      setLocations(data.locations || []);
      setTracks(data.tracks || []);
      setMarks(data.marks || []);
      setDistanceKm(data.distanceKm || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.wrap} ${fullscreen ? styles.fullscreen : ''}`}>
      <PageSubnav groupKey="marks" titleOverride="Отслеживание местоположения" />
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setFullscreen((v) => !v)}
          >
            Полноэкранный режим
          </button>
          <button
            type="button"
            className={styles.btnWarn}
            onClick={() => setConfirmDist(true)}
            disabled={!tracks.length}
          >
            Рассчитать пройденное расстояние
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => router.push('/attendance/marks')}
          >
            Закрыть
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {fullscreen ? (
        <p className={styles.hint}>
          To&apos;liq ekran rejimidan chiqish uchun Esc yoki tugmani bosing
        </p>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.mapPane}>
          <iframe title="map" src={mapSrc} className={styles.map} />
          {showMarkers && tracks.length ? (
            <div className={styles.mapOverlay}>
              Точек GPS: {tracks.length}
              {showLocs ? ` · Локаций: ${locations.length}` : ''}
            </div>
          ) : null}
        </div>

        <aside className={styles.side}>
          <label className={styles.field}>
            <span>Период</span>
            <div className={styles.row}>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </label>
          <label className={styles.field}>
            <span>Подразделение</span>
            <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">Все</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>
              Сотрудник <em>*</em>
            </span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Выберите…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.btnLoad}
            disabled={busy}
            onClick={() => void load()}
          >
            Загрузить
          </button>
          <div className={styles.exports}>
            <span>HTML</span>
            <span>EXCEL</span>
            <span>CSV</span>
            <span>XML</span>
          </div>

          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={showLocs}
              onChange={(e) => setShowLocs(e.target.checked)}
            />
            Показать локации
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={showGps}
              onChange={(e) => setShowGps(e.target.checked)}
            />
            Показать GPS отслеживание
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => setShowMarkers(e.target.checked)}
            />
            Показать маркеры GPS отслеживания
          </label>

          <div className={styles.tabs}>
            <button
              type="button"
              className={tab === 'visits' ? styles.tabActive : styles.tab}
              onClick={() => setTab('visits')}
            >
              Посещения
            </button>
            <button
              type="button"
              className={tab === 'gps' ? styles.tabActive : styles.tab}
              onClick={() => setTab('gps')}
            >
              GPS отслеживание
            </button>
            <button
              type="button"
              className={tab === 'locs' ? styles.tabActive : styles.tab}
              onClick={() => setTab('locs')}
            >
              Локации
            </button>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Локация</th>
                </tr>
              </thead>
              <tbody>
                {tab === 'visits' &&
                  (marks.length ? (
                    marks.map((m) => (
                      <tr key={m.id}>
                        <td>{m.markTypeLabel || 'Отметка'}</td>
                        <td>{m.locationName || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className={styles.empty}>
                        нет данных
                      </td>
                    </tr>
                  ))}
                {tab === 'gps' &&
                  (tracks.length ? (
                    tracks.slice(0, 50).map((t) => (
                      <tr key={t.id}>
                        <td>GPS</td>
                        <td>
                          {t.latitude.toFixed(5)}, {t.longitude.toFixed(5)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className={styles.empty}>
                        нет данных
                      </td>
                    </tr>
                  ))}
                {tab === 'locs' &&
                  (locations.length ? (
                    locations.map((l) => (
                      <tr key={l.id}>
                        <td>Локация</td>
                        <td>{l.name}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className={styles.empty}>
                        нет данных
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>

      {confirmDist ? (
        <ModalPortal>
          <div className={styles.modalBackdrop}>
            <div className={styles.modal}>
              <p>Рассчитать пройденное расстояние для всех?</p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnLoad}
                  onClick={async () => {
                    setConfirmDist(false);
                    await alert(`Пройдено: ${distanceKm} км`);
                  }}
                >
                  Да
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setConfirmDist(false)}
                >
                  Нет
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

export default function LocationTrackingPage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <LocationTrackingInner />
    </Suspense>
  );
}
