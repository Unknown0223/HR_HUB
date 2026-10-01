'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaSrc } from '@/lib/media';
import { fmtHm } from '@/lib/tz';
import { escapeHtml, loadYandexMaps, type YMaps } from './yandex-maps';
import styles from './page.module.css';

export type LivePerson = {
  employeeId: string;
  fullName: string;
  positionId: string | null;
  position: string | null;
  division: string | null;
  divisionId: string | null;
  locationId: string | null;
  location: string | null;
  role: string | null;
  heads: { id: string; name: string }[];
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  lastFixAt: string | null;
  lastSeenAt: string | null;
  batteryPct: number | null;
  charging: boolean | null;
  state: string | null;
  online: boolean;
  workingNow: boolean;
  windowReason: string;
  tabNumber: string;
  phone: string | null;
  model: string | null;
};

export type TrackPoint = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  speedMps: number | null;
  batteryPct: number | null;
  offline?: boolean | null;
  recordedAt: string;
};

type LatLng = [number, number];

/** Server-built display line: snapped to roads where possible, with stays and data gaps. */
export type TrackPath = {
  /** `offline`: recorded while the phone had no internet and uploaded later. */
  segments: { coords: LatLng[]; matched: boolean; mode: 'car' | 'foot'; offline?: boolean }[];
  gaps: { from: LatLng; to: LatLng; minutes: number }[];
  stops: { lat: number; lng: number; from: string; to: string; minutes: number }[];
  distanceM: number;
};

/** Check-in/out made from the phone, at the spot where the phone was. */
export type TrackPunch = {
  id: string;
  kind: 'in' | 'out';
  at: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: string;
  valid: boolean;
  outsideGeofence: boolean;
  distanceM: number | null;
  locationName: string | null;
  photoUrl: string | null;
};

export type ColoredTrack = {
  employeeId: string;
  color: string;
  points: TrackPoint[];
  path?: TrackPath | null;
  punches?: TrackPunch[];
};

export const OFFLINE_COLOR = '#facc15';
const OFFLINE_ARROW_COLOR = '#b45309';
/** Punch flags stay above employee pins even while a pin is hovered. */
const PUNCH_Z = 1100;
const PIN_HOVER_Z = 1050;
export const PUNCH_IN_COLOR = '#16a34a';
export const PUNCH_OUT_COLOR = '#dc2626';

const ARROW_MIN_STEP_M = 180;
const ARROWS_PER_TRACK = 14;

function distM(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Screen bearing (clockwise from north) on a Mercator map. */
function bearingDeg(a: LatLng, b: LatLng) {
  const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  const dy = b[0] - a[0];
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function lineM(coords: LatLng[]) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distM(coords[i - 1], coords[i]);
  return m;
}

/** Evenly spaced arrow positions along a line, pointing the way the employee moved. */
function arrowsAlong(coords: LatLng[], step: number): { at: LatLng; deg: number }[] {
  if (coords.length < 2 || lineM(coords) < ARROW_MIN_STEP_M) return [];
  const out: { at: LatLng; deg: number }[] = [];
  let next = step / 2;
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = distM(a, b);
    while (len > 0 && walked + len >= next) {
      const f = (next - walked) / len;
      out.push({ at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], deg: bearingDeg(a, b) });
      next += step;
    }
    walked += len;
  }
  return out;
}

function hhmm(iso: string) {
  return fmtHm(iso) ?? '';
}

function punchBalloonHtml(p: TrackPunch, name: string) {
  const title = p.kind === 'in' ? 'Приход' : 'Уход';
  const photo = mediaSrc(p.photoUrl);
  const rows = [
    `<b style="color:${p.kind === 'in' ? PUNCH_IN_COLOR : PUNCH_OUT_COLOR}">${title} · ${hhmm(p.at)}</b>`,
    name ? `<div>${name}</div>` : '',
    `<div>Отметка с телефона${p.accuracyM != null ? ` · точность ±${Math.round(p.accuracyM)} м` : ''}</div>`,
    p.locationName ? `<div>${escapeHtml(p.locationName)}</div>` : '',
    p.outsideGeofence
      ? `<div style="color:${PUNCH_OUT_COLOR}">Вне территории${p.distanceM != null ? ` (${Math.round(p.distanceM)} м)` : ''}</div>`
      : '',
    p.valid ? '' : `<div style="color:${PUNCH_OUT_COLOR}">Не учитывается в табеле</div>`,
    photo ? `<img src="${escapeHtml(photo)}" alt="" style="margin-top:6px;width:180px;border-radius:8px;display:block"/>` : '',
  ];
  return `<div style="font:13px/1.45 system-ui,sans-serif;max-width:200px">${rows.join('')}</div>`;
}

/** Distinct route colours, assigned in selection order. Nothing yellow: that marks offline stretches. */
export const TRACK_COLORS = [
  '#1f8f45',
  '#2563eb',
  '#e5484d',
  '#475569',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#a21caf',
  '#4f46e5',
  '#0d9488',
  '#9333ea',
];

const TASHKENT: [number, number] = [41.3111, 69.2797];

export function personTone(p: LivePerson): 'live' | 'idle' | 'off' {
  if (p.online && p.workingNow) return 'live';
  if (p.online) return 'idle';
  return 'off';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

function pinHtml(p: LivePerson, photo: string | null, selected: boolean) {
  const tone = personTone(p);
  const ring = tone === 'live' ? styles.pinLive : tone === 'idle' ? styles.pinIdle : styles.pinOff;
  const face = photo
    ? `<img src="${escapeHtml(photo)}" alt="" class="${styles.pinImg}"/>`
    : `<span class="${styles.pinInitials}">${escapeHtml(initials(p.fullName))}</span>`;
  const battery =
    p.batteryPct == null
      ? ''
      : `<span class="${styles.pinBattery} ${p.batteryPct < 20 ? styles.pinBatteryLow : ''}">${
          p.charging ? '⚡' : ''
        }${p.batteryPct}%</span>`;
  const label = `<span class="${styles.pinLabel}">${escapeHtml(p.fullName.split(' ').slice(0, 2).join(' '))}</span>`;
  return `<div class="${styles.pin} ${ring} ${selected ? styles.pinSelected : ''}">
    ${tone === 'live' ? `<span class="${styles.pinPulse}"></span>` : ''}
    <div class="${styles.pinFace}">${face}</div>${battery}
    <span class="${styles.pinTip}"></span>${label}
  </div>`;
}

type Props = {
  people: LivePerson[];
  photoOf: (p: LivePerson) => string | null;
  selectedIds: string[];
  tracks: ColoredTrack[];
  onSelect: (employeeId: string) => void;
  /** Bounds are re-fitted to the visible pins whenever this changes (e.g. division filter). */
  fitKey: string;
};

export function LiveMap({ people, photoOf, selectedIds, tracks, onSelect, fitKey }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const ymapsRef = useRef<YMaps>(null);
  const mapRef = useRef<YMaps>(null);
  const marks = useRef(new Map<string, { placemark: YMaps; html: string }>());
  const trackLayer = useRef<YMaps>(null);
  const fittedFor = useRef<string | null>(null);
  const fittedTrackFor = useRef<string | null>(null);
  const pannedTo = useRef<string | null>(null);
  const selectionKey = selectedIds.join(',');
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    loadYandexMaps()
      .then((ymaps) => {
        if (cancelled || !box.current) return;
        ymapsRef.current = ymaps;
        mapRef.current = new ymaps.Map(
          box.current,
          { center: TASHKENT, zoom: 11, controls: ['zoomControl', 'typeSelector', 'fullscreenControl'] },
          { suppressMapOpenBlock: true },
        );
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    const resize = new ResizeObserver(() => mapRef.current?.container.fitToViewport());
    if (box.current) resize.observe(box.current);
    return () => {
      cancelled = true;
      resize.disconnect();
      mapRef.current?.destroy();
      mapRef.current = null;
      marks.current.clear();
    };
  }, []);

  useEffect(() => {
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    if (!ready || !ymaps || !map) return;

    const alive = new Set<string>();
    for (const p of people) {
      if (p.lat == null || p.lng == null) continue;
      alive.add(p.employeeId);
      const isSelected = selectedIds.includes(p.employeeId);
      const html = pinHtml(p, photoOf(p), isSelected);
      const coords = [p.lat, p.lng];
      const existing = marks.current.get(p.employeeId);
      if (existing) {
        existing.placemark.geometry.setCoordinates(coords);
        if (existing.html !== html) {
          existing.placemark.options.set('iconLayout', ymaps.templateLayoutFactory.createClass(html));
          existing.placemark.options.set('zIndex', isSelected ? 1000 : 100);
          existing.html = html;
        }
        continue;
      }
      const placemark = new ymaps.Placemark(
        coords,
        { hintContent: escapeHtml(p.fullName) },
        {
          iconLayout: ymaps.templateLayoutFactory.createClass(html),
          iconShape: { type: 'Rectangle', coordinates: [[-26, -64], [26, 0]] },
          zIndex: isSelected ? 1000 : 100,
          zIndexHover: PIN_HOVER_Z,
          zIndexActive: PIN_HOVER_Z,
        },
      );
      placemark.events.add('click', () => onSelectRef.current(p.employeeId));
      map.geoObjects.add(placemark);
      marks.current.set(p.employeeId, { placemark, html });
    }
    for (const [id, m] of marks.current) {
      if (!alive.has(id)) {
        map.geoObjects.remove(m.placemark);
        marks.current.delete(id);
      }
    }

    if (fittedFor.current !== fitKey && alive.size) {
      fittedFor.current = fitKey;
      const pts = people.filter((p) => p.lat != null && p.lng != null).map((p) => [p.lat, p.lng]);
      if (pts.length === 1) map.setCenter(pts[0], 15, { duration: 300 });
      else
        map.setBounds(ymaps.util.bounds.fromPoints(pts), { checkZoomRange: true, zoomMargin: 60, duration: 300 }).then(() => {
          if (map.getZoom() > 16) map.setZoom(16);
        });
    }
  }, [people, ready, selectedIds, photoOf, fitKey]);

  useEffect(() => {
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    if (!ready || !ymaps || !map) return;
    if (trackLayer.current) {
      map.geoObjects.remove(trackLayer.current);
      trackLayer.current = null;
    }
    const drawn = tracks.filter((t) => t.points.length || t.punches?.length);
    if (!drawn.length) {
      if (selectedIds.length !== 1) return;
      const p = people.find((x) => x.employeeId === selectedIds[0]);
      if (p?.lat != null && p.lng != null && pannedTo.current !== selectionKey) {
        pannedTo.current = selectionKey;
        map.panTo([p.lat, p.lng], { flying: true });
      }
      return;
    }
    const single = drawn.length === 1;
    const width = single ? 5 : 4;
    const layer = new ymaps.GeoObjectCollection();
    const arrowLayout = ymaps.templateLayoutFactory.createClass(
      `<div class="${styles.routeArrow}" style="transform:rotate($[properties.deg]deg)">` +
        '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2 L15 14 L9 11 L3 14 Z" ' +
        'fill="$[properties.color]" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>',
    );
    const stopLayout = ymaps.templateLayoutFactory.createClass(
      `<div class="${styles.routeStop}" style="border-color:$[properties.color]">$[properties.label]</div>`,
    );
    const punchLayout = ymaps.templateLayoutFactory.createClass(
      `<div class="${styles.punchPin}" style="--punch:$[properties.bg];--owner:$[properties.owner]">` +
        `<span class="${styles.punchDot}"></span>$[properties.label]<span class="${styles.punchTip}"></span></div>`,
    );
    for (const t of drawn) {
      const name = escapeHtml(people.find((p) => p.employeeId === t.employeeId)?.fullName ?? '');
      const pieces: { coords: LatLng[]; offline: boolean }[] = t.path?.segments.length
        ? t.path.segments.map((s) => ({ coords: s.coords, offline: s.offline === true }))
        : t.points.length
          ? [{ coords: t.points.map((p) => [p.latitude, p.longitude] as LatLng), offline: false }]
          : [];
      const lines = pieces.map((p) => p.coords);
      for (const { coords } of pieces) {
        layer.add(
          new ymaps.Polyline(coords, {}, { strokeColor: '#ffffff', strokeWidth: width + 4, strokeOpacity: 0.95 }),
        );
      }
      for (const { coords, offline } of pieces) {
        if (!offline) {
          layer.add(
            new ymaps.Polyline(coords, { hintContent: name }, { strokeColor: t.color, strokeWidth: width, strokeOpacity: 0.92 }),
          );
          continue;
        }
        layer.add(
          new ymaps.Polyline(coords, { hintContent: `${name}: записано без интернета` }, {
            strokeColor: OFFLINE_COLOR,
            strokeWidth: width,
            strokeOpacity: 1,
          }),
        );
        if (!single) {
          layer.add(
            new ymaps.Polyline(coords, { hintContent: `${name}: записано без интернета` }, {
              strokeColor: t.color,
              strokeWidth: 1.5,
              strokeOpacity: 0.9,
              strokeStyle: 'dash',
            }),
          );
        }
      }
      for (const g of t.path?.gaps ?? []) {
        layer.add(
          new ymaps.Polyline([g.from, g.to], { hintContent: `${name}: нет данных ${g.minutes} мин` }, {
            strokeColor: t.color,
            strokeWidth: 3,
            strokeOpacity: 0.6,
            strokeStyle: 'shortdash',
          }),
        );
      }
      const step = Math.max(ARROW_MIN_STEP_M, lines.reduce((m, c) => m + lineM(c), 0) / ARROWS_PER_TRACK);
      for (const { coords, offline } of pieces) {
        for (const a of arrowsAlong(coords, step)) {
          layer.add(
            new ymaps.Placemark(a.at, { deg: Math.round(a.deg), color: offline ? OFFLINE_ARROW_COLOR : t.color }, {
              iconLayout: arrowLayout,
              iconShape: { type: 'Circle', coordinates: [0, 0], radius: 8 },
              hasHint: false,
              zIndex: 150,
            }),
          );
        }
      }
      for (const s of t.path?.stops ?? []) {
        layer.add(
          new ymaps.Placemark(
            [s.lat, s.lng],
            {
              color: t.color,
              label: s.minutes >= 60 ? `${Math.floor(s.minutes / 60)}ч` : `${s.minutes}м`,
              hintContent: `${name}: остановка ${s.minutes} мин · ${hhmm(s.from)}–${hhmm(s.to)}`,
            },
            { iconLayout: stopLayout, iconShape: { type: 'Circle', coordinates: [0, 0], radius: 13 }, zIndex: 160 },
          ),
        );
      }
      if (lines.length) {
        const first = lines[0][0];
        const lastLine = lines[lines.length - 1];
        const firstAt = t.points[0]?.recordedAt;
        const lastAt = t.points[t.points.length - 1]?.recordedAt;
        layer.add(
          new ymaps.Placemark(first, { hintContent: `Начало${firstAt ? ` ${hhmm(firstAt)}` : ''} · ${name}` }, {
            preset: 'islands#circleDotIcon',
            iconColor: single ? '#0f766e' : t.color,
          }),
        );
        layer.add(
          new ymaps.Placemark(lastLine[lastLine.length - 1], {
            hintContent: `Последняя точка${lastAt ? ` ${hhmm(lastAt)}` : ''} · ${name}`,
          }, {
            preset: 'islands#circleIcon',
            iconColor: single ? '#334155' : t.color,
          }),
        );
      }
      for (const p of t.punches ?? []) {
        const title = p.kind === 'in' ? 'Приход' : 'Уход';
        layer.add(
          new ymaps.Placemark(
            [p.lat, p.lng],
            {
              label: `${title} ${hhmm(p.at)}`,
              bg: p.kind === 'in' ? PUNCH_IN_COLOR : PUNCH_OUT_COLOR,
              owner: t.color,
              hintContent: `${name}: ${title} ${hhmm(p.at)}`,
              balloonContent: punchBalloonHtml(p, name),
            },
            {
              iconLayout: punchLayout,
              iconShape: { type: 'Rectangle', coordinates: [[-48, -38], [48, 0]] },
              zIndex: PUNCH_Z,
              zIndexHover: PUNCH_Z,
              zIndexActive: PUNCH_Z,
              hideIconOnBalloonOpen: false,
              balloonOffset: [0, -36],
            },
          ),
        );
        if (p.accuracyM && p.accuracyM >= 15) {
          layer.add(
            new ymaps.Circle([[p.lat, p.lng], p.accuracyM], {}, {
              fillColor: p.kind === 'in' ? '#16a34a22' : '#dc262622',
              strokeColor: p.kind === 'in' ? PUNCH_IN_COLOR : PUNCH_OUT_COLOR,
              strokeOpacity: 0.5,
              strokeWidth: 1,
              interactivityModel: 'default#transparent',
            }),
          );
        }
      }
    }
    map.geoObjects.add(layer);
    trackLayer.current = layer;
    const drawnKey = `${selectionKey}|${drawn.map((t) => t.employeeId).join(',')}`;
    if (fittedTrackFor.current !== drawnKey) {
      fittedTrackFor.current = drawnKey;
      pannedTo.current = selectionKey;
      map.setBounds(layer.getBounds(), { checkZoomRange: true, zoomMargin: 60 });
    }
  }, [tracks, ready, selectionKey, selectedIds, people]);

  const withData = tracks.filter((t) => t.points.length || t.punches?.length);
  const hasOffline = withData.some((t) => t.path?.segments.some((s) => s.offline));
  const hasPunches = withData.some((t) => t.punches?.length);
  const hasGaps = withData.some((t) => t.path?.gaps.length);

  return (
    <div className={styles.mapBox}>
      <div ref={box} className={styles.map} />
      {withData.length ? (
        <div className={styles.mapLegend}>
          <span>
            <i className={styles.legendLine} style={{ background: withData.length === 1 ? withData[0].color : '#64748b' }} />
            Маршрут
          </span>
          {hasOffline ? (
            <span>
              <i className={styles.legendLine} style={{ background: OFFLINE_COLOR }} />
              Без интернета
            </span>
          ) : null}
          {hasGaps ? (
            <span>
              <i className={styles.legendDash} />
              Нет данных
            </span>
          ) : null}
          {hasPunches ? (
            <>
              <span>
                <i className={styles.legendPunch} style={{ background: PUNCH_IN_COLOR }} />
                Приход
              </span>
              <span>
                <i className={styles.legendPunch} style={{ background: PUNCH_OUT_COLOR }} />
                Уход
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className={styles.mapError}>
          <strong>{error}</strong>
          <span>Проверьте интернет и ключ NEXT_PUBLIC_YANDEX_MAPS_API_KEY.</span>
        </div>
      ) : null}
    </div>
  );
}
