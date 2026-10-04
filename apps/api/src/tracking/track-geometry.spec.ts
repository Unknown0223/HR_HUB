import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunk,
  cleanTrack,
  collapseStops,
  findJump,
  GAP_MS,
  haversineM,
  type RawPoint,
  simplify,
  splitAtGaps,
  splitByOffline,
  STOP_MIN_MS,
  trackDistanceM,
  travelMode,
} from './track-geometry';

const T0 = Date.parse('2026-09-29T09:00:00+05:00');
/** ~111 m per 0.001° of latitude. */
const pt = (minutes: number, dLat: number, extra: Partial<RawPoint> = {}): RawPoint => ({
  lat: 41.3 + dLat,
  lng: 69.24,
  at: T0 + minutes * 60_000,
  accuracy: 10,
  speed: null,
  ...extra,
});

describe('track geometry', () => {
  it('drops vague fixes, duplicate timestamps and teleport jumps', () => {
    const out = cleanTrack([
      pt(0, 0),
      pt(1, 0.001),
      pt(1, 0.0011),
      pt(2, 0.002, { accuracy: 250 }),
      pt(3, 0.5),
      pt(4, 0.003),
    ]);
    assert.deepEqual(
      out.map((p) => p.at),
      [pt(0, 0).at, pt(1, 0).at, pt(4, 0).at],
    );
  });

  it('keeps vague fixes when nothing better exists', () => {
    const out = cleanTrack([pt(0, 0, { accuracy: 200 }), pt(1, 0.001, { accuracy: 200 })]);
    assert.equal(out.length, 2);
  });

  it('collapses a long stay into one centre point and reports it as a stop', () => {
    const jitter = [0, 0.0002, -0.0002, 0.0001, 0, -0.0001, 0.0002].map((d, i) => pt(i * 2, 0.01 + d));
    const { points, stops } = collapseStops([pt(-2, 0), ...jitter, pt(16, 0.02)]);
    assert.equal(stops.length, 1);
    assert.equal(stops[0].minutes, 12);
    assert.equal(points.length, 3);
    assert.ok(haversineM(points[1], { lat: 41.31, lng: 69.24 }) < 20);
  });

  it('does not treat a short pause as a stop', () => {
    const short = STOP_MIN_MS / 60_000 - 2;
    const { stops, points } = collapseStops([pt(0, 0), pt(short, 0.0001), pt(short + 1, 0.01)]);
    assert.equal(stops.length, 0);
    assert.equal(points.length, 3);
  });

  it('splits only where the phone was silent and moved far', () => {
    const gapMin = GAP_MS / 60_000 + 5;
    const { runs, gaps } = splitAtGaps([
      pt(0, 0),
      pt(1, 0.001),
      pt(1 + gapMin, 0.0012),
      pt(2 + 2 * gapMin, 0.05),
      pt(3 + 2 * gapMin, 0.051),
    ]);
    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map((r) => r.length),
      [3, 2],
    );
    assert.equal(gaps.length, 1);
  });

  it('guesses walking vs driving from the median speed', () => {
    const walk = [0, 1, 2, 3].map((m) => pt(m, m * 0.0007));
    const drive = [0, 1, 2, 3].map((m) => pt(m, m * 0.006));
    assert.equal(travelMode(walk), 'foot');
    assert.equal(travelMode(drive), 'car');
    assert.equal(travelMode(walk.map((p) => ({ ...p, speed: 12 }))), 'car');
  });

  it('simplifies straight stretches but keeps corners', () => {
    const straight = [0, 1, 2, 3, 4].map((m) => pt(m, m * 0.001));
    const corner = [1, 2, 3].map((m) => ({ ...pt(4 + m, 0.004), lng: 69.24 + m * 0.001 }));
    const out = simplify([...straight, ...corner], 10);
    assert.deepEqual(
      out.map((p) => p.at),
      [straight[0].at, straight[4].at, corner[2].at],
    );
  });

  it('splits where internet was lost and regained, sharing the boundary fix', () => {
    const off = { offline: true };
    const run = [pt(0, 0), pt(1, 0.001, off), pt(2, 0.002, off), pt(3, 0.003), pt(4, 0.004)];
    const parts = splitByOffline(run);
    assert.deepEqual(
      parts.map((p) => [p.offline, p.points.map((x) => x.at)]),
      [
        [true, [run[0].at, run[1].at, run[2].at]],
        [false, [run[2].at, run[3].at, run[4].at]],
      ],
    );
    assert.deepEqual(
      splitByOffline([pt(0, 0), pt(1, 0.001)]).map((p) => p.offline),
      [false],
    );
  });

  it('reports a teleport but not driving or vague fixes', () => {
    // 0.05° ≈ 5.5 km
    assert.equal(findJump(null, [pt(0, 0), pt(5, 0.05)]), null, '66 km/h is a car');
    const jump = findJump(pt(0, 0), [pt(1, 0.05)]);
    assert.ok(jump);
    assert.ok(jump.speedKmh > 300);
    assert.equal(jump.to.at, pt(1, 0).at);
    assert.equal(
      findJump(pt(0, 0, { accuracy: 3_000 }), [pt(1, 0.05, { accuracy: 3_000 })]),
      null,
      'overlapping accuracy circles explain the move',
    );
    assert.equal(findJump(pt(0, 0), [pt(0, 0.01)]), null, 'hops under JUMP_MIN_M are noise');
  });

  it('chunks with a shared boundary point', () => {
    const parts = chunk([1, 2, 3, 4, 5, 6, 7], 3);
    assert.deepEqual(parts, [
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ]);
    assert.deepEqual(chunk([1, 2], 3), [[1, 2]]);
  });

  it('measures the day distance without stop jitter or silent gaps', () => {
    const walk = [pt(0, 0), pt(2, 0.005), pt(4, 0.01)];
    assert.ok(Math.abs(trackDistanceM(walk) - 1112) < 15, 'about 1.1 km walked');
    const jitter = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => pt(10 + m, m % 2 ? 0.0102 : 0.0098));
    assert.ok(Math.abs(trackDistanceM([...walk, ...jitter]) - trackDistanceM(walk)) < 5, 'standing still adds nothing');
    const silent = pt(4 + GAP_MS / 60_000 + 1, 0.05);
    assert.equal(trackDistanceM([...walk, silent]), trackDistanceM(walk), 'no line through a gap');
    assert.equal(trackDistanceM([]), 0);
  });
});
