/** GPS track clean-up and shaping for map display: no I/O, so it is unit-testable. */

export type RawPoint = {
  lat: number;
  lng: number;
  /** Epoch milliseconds. */
  at: number;
  accuracy: number | null;
  speed: number | null;
  /** Recorded while the phone had no internet (uploaded later from its queue). */
  offline?: boolean;
};

export type TravelMode = 'car' | 'foot';
export type LatLng = [number, number];

export type Stop = { lat: number; lng: number; from: string; to: string; minutes: number };
export type Gap = { from: LatLng; to: LatLng; minutes: number };
export type PathSegment = { coords: LatLng[]; matched: boolean; mode: TravelMode; offline: boolean };
export type TrackPath = { segments: PathSegment[]; gaps: Gap[]; stops: Stop[]; distanceM: number };

/** Fixes worse than this are too vague to draw a street-level line through. */
export const MAX_DRAW_ACCURACY_M = 80;
/** Faster than any road vehicle an employee would use: a jump, not movement. */
const MAX_SPEED_MPS = 55;
export const STOP_RADIUS_M = 60;
export const STOP_MIN_MS = 5 * 60_000;
/** Silence this long while also moving far is drawn as a dashed gap, not a road. */
export const GAP_MS = 15 * 60_000;
const GAP_MIN_DISTANCE_M = 300;
/** Median speed above this (≈10 km/h) is treated as driving rather than walking. */
const CAR_SPEED_MPS = 2.8;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ≈250 km/h: no employee travels this fast on the ground, even after allowing for fix accuracy. */
export const JUMP_SPEED_MPS = 70;
/** Shorter hops are GPS noise (tunnels, cold starts), not a spoofed location. */
export const JUMP_MIN_M = 2_000;

export type Jump = { from: RawPoint; to: RawPoint; distanceM: number; minutes: number; speedKmh: number };

/**
 * First physically impossible move in `points` (after `prev`, the last fix already known). Both
 * fixes' accuracy radii are subtracted, so only moves that no honest reading explains are reported:
 * the typical trace of a location spoofer that hides the mock flag (e.g. on a rooted phone).
 */
export function findJump(prev: RawPoint | null, points: RawPoint[]): Jump | null {
  let last = prev;
  for (const p of [...points].sort((a, b) => a.at - b.at)) {
    if (last) {
      const distanceM = haversineM(last, p);
      const certainM = distanceM - (last.accuracy ?? 0) - (p.accuracy ?? 0);
      const seconds = Math.max(1, (p.at - last.at) / 1000);
      if (certainM > JUMP_MIN_M && certainM / seconds > JUMP_SPEED_MPS) {
        return {
          from: last,
          to: p,
          distanceM: Math.round(distanceM),
          minutes: Math.round(seconds / 6) / 10,
          speedKmh: Math.round((distanceM / seconds) * 3.6),
        };
      }
    }
    last = p;
  }
  return null;
}

/** Drops vague fixes, duplicate timestamps and physically impossible jumps. */
export function cleanTrack(points: RawPoint[]): RawPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const precise = sorted.filter((p) => p.accuracy == null || p.accuracy <= MAX_DRAW_ACCURACY_M);
  const source = precise.length >= 2 ? precise : sorted;
  const out: RawPoint[] = [];
  for (const p of source) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(p);
      continue;
    }
    const dt = (p.at - prev.at) / 1000;
    if (dt <= 0) continue;
    if (haversineM(prev, p) / dt > MAX_SPEED_MPS) continue;
    out.push(p);
  }
  return out;
}

/**
 * Collapses each stay (≥ STOP_MIN_MS within STOP_RADIUS_M) into one point at its centre, so the
 * GPS jitter of someone standing still does not draw a star of lines.
 */
export function collapseStops(points: RawPoint[]): { points: RawPoint[]; stops: Stop[] } {
  const out: RawPoint[] = [];
  const stops: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    let lat = points[i].lat;
    let lng = points[i].lng;
    while (j + 1 < points.length) {
      const n = j - i + 1;
      const centre = { lat, lng };
      if (haversineM(centre, points[j + 1]) > STOP_RADIUS_M) break;
      lat = (lat * n + points[j + 1].lat) / (n + 1);
      lng = (lng * n + points[j + 1].lng) / (n + 1);
      j++;
    }
    const span = points[j].at - points[i].at;
    if (j > i && span >= STOP_MIN_MS) {
      out.push({ ...points[i], lat, lng });
      stops.push({
        lat,
        lng,
        from: new Date(points[i].at).toISOString(),
        to: new Date(points[j].at).toISOString(),
        minutes: Math.round(span / 60_000),
      });
      i = j + 1;
    } else {
      out.push(points[i]);
      i++;
    }
  }
  return { points: out, stops };
}

/** Splits where the phone went silent and reappeared far away (no data about the way between). */
export function splitAtGaps(points: RawPoint[]): { runs: RawPoint[][]; gaps: Gap[] } {
  const runs: RawPoint[][] = [];
  const gaps: Gap[] = [];
  let run: RawPoint[] = [];
  for (const p of points) {
    const prev = run[run.length - 1];
    if (prev && p.at - prev.at > GAP_MS && haversineM(prev, p) > GAP_MIN_DISTANCE_M) {
      runs.push(run);
      gaps.push({ from: [prev.lat, prev.lng], to: [p.lat, p.lng], minutes: Math.round((p.at - prev.at) / 60_000) });
      run = [];
    }
    run.push(p);
  }
  if (run.length) runs.push(run);
  return { runs, gaps };
}

/**
 * Splits a run where the phone lost or regained internet. The leg into a fix takes that fix's
 * flag, and neighbouring pieces share their boundary fix so the line stays continuous.
 */
export function splitByOffline(run: RawPoint[]): { points: RawPoint[]; offline: boolean }[] {
  if (run.length < 2) return [{ points: run, offline: run[0]?.offline === true }];
  const out: { points: RawPoint[]; offline: boolean }[] = [];
  let start = 0;
  let flag = run[1].offline === true;
  for (let i = 2; i < run.length; i++) {
    const f = run[i].offline === true;
    if (f === flag) continue;
    out.push({ points: run.slice(start, i), offline: flag });
    start = i - 1;
    flag = f;
  }
  out.push({ points: run.slice(start), offline: flag });
  return out;
}

export function travelMode(points: RawPoint[]): TravelMode {
  const speeds: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const reported = points[i].speed;
    const dt = (points[i].at - points[i - 1].at) / 1000;
    const v = reported != null && reported >= 0 ? reported : dt > 0 ? haversineM(points[i - 1], points[i]) / dt : null;
    if (v != null) speeds.push(v);
  }
  if (!speeds.length) return 'foot';
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length / 2)] > CAR_SPEED_MPS ? 'car' : 'foot';
}

/**
 * Douglas–Peucker in a local metric projection: keeps turns, drops fixes along straight stretches,
 * so road matching needs far fewer requests without losing the shape of the way.
 */
export function simplify(points: RawPoint[], toleranceM: number): RawPoint[] {
  if (points.length <= 2) return points;
  const lat0 = (points[0].lat * Math.PI) / 180;
  const xy = points.map((p) => [p.lng * 111_320 * Math.cos(lat0), p.lat * 110_540] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Consecutive windows of at most `size` points that share their boundary point, so lines join up. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const out: T[][] = [];
  for (let start = 0; start < items.length - 1; start += size - 1) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

export function polylineM(coords: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += haversineM({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] });
  }
  return m;
}
