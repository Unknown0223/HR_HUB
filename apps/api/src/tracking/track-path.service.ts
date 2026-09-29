import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  chunk,
  cleanTrack,
  collapseStops,
  haversineM,
  type LatLng,
  type PathSegment,
  polylineM,
  type RawPoint,
  simplify,
  splitAtGaps,
  splitByOffline,
  type TrackPath,
  travelMode,
  type TravelMode,
} from './track-geometry';

type Matched = { coords: LatLng[]; distanceM: number };

/** Public OSRM servers cap `match` at 10 tracepoints; a self-hosted one can take 100. */
const CHUNK_POINTS = Math.max(3, Number(process.env.TRACK_MATCH_MAX_POINTS) || 10);
/** Shape tolerance before matching: the road network restores the detail in between. */
const SIMPLIFY_M = 15;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_IN_FLIGHT = Math.max(1, Number(process.env.TRACK_MATCH_CONCURRENCY) || 2);
const CACHE_LIMIT = 5_000;
/** A snapped route this much longer than the straight line is a wrong guess (e.g. a detour around a block). */
const MAX_DETOUR_RATIO = 2.5;
const MAX_DETOUR_EXTRA_M = 600;

const DEFAULT_URLS: Record<TravelMode, string> = {
  car: 'https://router.project-osrm.org',
  foot: 'https://routing.openstreetmap.de/routed-foot',
};

/**
 * Snaps GPS tracks onto the road network with an OSRM-compatible `match` service so the map shows
 * the streets actually travelled. `TRACK_MATCH_URL_CAR` / `TRACK_MATCH_URL_FOOT` point at other
 * (ideally self-hosted) servers; `TRACK_MATCH_DISABLED=1` falls back to the cleaned raw line.
 */
@Injectable()
export class TrackPathService {
  private readonly log = new Logger(TrackPathService.name);
  private readonly urls: Record<TravelMode, string> = {
    car: process.env.TRACK_MATCH_URL_CAR || DEFAULT_URLS.car,
    foot: process.env.TRACK_MATCH_URL_FOOT || DEFAULT_URLS.foot,
  };
  private readonly enabled = process.env.TRACK_MATCH_DISABLED !== '1';
  /** Finished chunks never change, so only the newest chunk of today's track is re-matched on poll. */
  private readonly cache = new Map<string, Promise<Matched | null>>();
  private inFlight = 0;
  private readonly queue: (() => void)[] = [];

  /**
   * Chunks still being matched after `budgetMs` are drawn raw for now; their requests keep running
   * and land in the cache, so the next poll gets the road-snapped line.
   */
  async build(points: RawPoint[], opts: { snap: boolean; budgetMs: number }): Promise<TrackPath> {
    const cleaned = cleanTrack(points);
    const { points: compact, stops } = collapseStops(cleaned);
    const { runs, gaps } = splitAtGaps(compact);

    const jobs = runs.map((run) => {
      const mode = travelMode(run);
      return splitByOffline(run).flatMap(({ points: piece, offline }) =>
        chunk(simplify(piece, SIMPLIFY_M), CHUNK_POINTS).map((part) => {
          const job = {
            part,
            mode,
            offline,
            done: false,
            result: null as Matched | null,
            promise: Promise.resolve(),
          };
          if (opts.snap && this.enabled && part.length >= 2) {
            job.promise = this.match(part, mode).then((r) => {
              job.result = r;
              job.done = true;
            });
          } else {
            job.done = true;
          }
          return job;
        }),
      );
    });

    const all = Promise.all(jobs.flat().map((j) => j.promise));
    await Promise.race([all, new Promise((r) => setTimeout(r, opts.budgetMs))]);

    const segments: PathSegment[] = [];
    let distanceM = 0;
    for (const run of jobs) {
      for (const job of run) {
        const raw: LatLng[] = job.part.map((p) => [p.lat, p.lng]);
        const matched = job.done ? job.result : null;
        const coords = matched?.coords ?? raw;
        distanceM += matched?.distanceM ?? polylineM(raw);
        const last = segments[segments.length - 1];
        if (
          last &&
          last.matched === !!matched &&
          last.mode === job.mode &&
          last.offline === job.offline &&
          sameRun(last, raw[0])
        ) {
          last.coords.push(...coords.slice(1));
        } else {
          segments.push({ coords: [...coords], matched: !!matched, mode: job.mode, offline: job.offline });
        }
      }
    }
    return { segments, gaps, stops, distanceM: Math.round(distanceM) };
  }

  private match(part: RawPoint[], mode: TravelMode): Promise<Matched | null> {
    const key = createHash('sha1')
      .update(mode)
      .update(part.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)},${p.at}`).join(';'))
      .digest('hex');
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const promise = this.throttled(() => this.request(part, mode)).catch((e: Error) => {
      this.log.warn(`Road matching failed (${mode}, ${part.length} pts): ${e.message}`);
      this.cache.delete(key);
      return null;
    });
    this.cache.set(key, promise);
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return promise;
  }

  /** Public routing servers throttle bursts; keep a handful of requests in flight at most. */
  private async throttled<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.queue.shift()?.();
    }
  }

  private async request(part: RawPoint[], mode: TravelMode): Promise<Matched | null> {
    const coords = part.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const radiuses = part.map((p) => Math.round(Math.min(60, Math.max(15, (p.accuracy ?? 25) * 1.5)))).join(';');
    const timestamps = part.map((p) => Math.floor(p.at / 1000)).join(';');
    const base = this.urls[mode].replace(/\/+$/, '');
    const url =
      `${base}/match/v1/driving/${coords}?overview=full&geometries=geojson&tidy=true&gaps=ignore` +
      `&radiuses=${radiuses}&timestamps=${timestamps}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = (await res.json().catch(() => null)) as {
      code?: string;
      matchings?: { geometry: { coordinates: [number, number][] }; distance: number }[];
    } | null;
    if (body?.code === 'NoMatch' || body?.code === 'NoSegment' || body?.code === 'TooBig') return null;
    if (!res.ok || body?.code !== 'Ok' || !body.matchings?.length) {
      throw new Error(`HTTP ${res.status} ${body?.code ?? ''}`.trim());
    }
    const out: LatLng[] = [];
    let distanceM = 0;
    for (const m of body.matchings) {
      distanceM += m.distance;
      for (const [lng, lat] of m.geometry.coordinates) out.push([lat, lng]);
    }
    const straight = polylineM(part.map((p) => [p.lat, p.lng]));
    if (out.length < 2 || distanceM > straight * MAX_DETOUR_RATIO + MAX_DETOUR_EXTRA_M) return null;
    // Snapping moves the ends onto the road; pin them back so consecutive chunks and markers line up.
    out[0] = [part[0].lat, part[0].lng];
    out[out.length - 1] = [part[part.length - 1].lat, part[part.length - 1].lng];
    return { coords: out, distanceM };
  }
}

function sameRun(seg: PathSegment, next: LatLng): boolean {
  const end = seg.coords[seg.coords.length - 1];
  return !!end && haversineM({ lat: end[0], lng: end[1] }, { lat: next[0], lng: next[1] }) < 1;
}
