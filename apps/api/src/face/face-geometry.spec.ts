import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SFACE_TEMPLATE,
  alignForSface,
  applyTransform,
  cosineSimilarity,
  decodeYunet,
  nms,
  similarityTransform,
  type Point,
} from './face-geometry';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function emptyHeads(size: number) {
  const out: Record<string, Float32Array> = {};
  for (const s of [8, 16, 32]) {
    const n = (size / s) ** 2;
    out[`cls_${s}`] = new Float32Array(n);
    out[`obj_${s}`] = new Float32Array(n);
    out[`bbox_${s}`] = new Float32Array(n * 4);
    out[`kps_${s}`] = new Float32Array(n * 10);
  }
  return out;
}

describe('face geometry', () => {
  it('similarityTransform recovers rotation, scale and shift', () => {
    const angle = 0.3;
    const scale = 1.7;
    const c = scale * Math.cos(angle);
    const s = scale * Math.sin(angle);
    const src: Point[] = [[10, 20], [50, 22], [30, 40], [15, 60], [45, 61]];
    const dst = src.map(([x, y]) => [c * x - s * y + 5, s * x + c * y - 8] as Point);
    const t = similarityTransform(src, dst);
    close(t.c, c);
    close(t.s, s);
    close(t.tx, 5);
    close(t.ty, -8);
    const [x, y] = applyTransform(t, src[2]);
    close(x, dst[2][0]);
    close(y, dst[2][1]);
  });

  it('decodeYunet places a stride-16 anchor face in input pixels', () => {
    const size = 64;
    const heads = emptyHeads(size);
    const cols = size / 16;
    const r = 1, c = 2, idx = r * cols + c;
    heads.cls_16[idx] = 0.9;
    heads.obj_16[idx] = 0.9;
    heads.bbox_16.set([0.5, 0.5, Math.log(2), Math.log(3)], idx * 4);
    heads.kps_16.set([0.1, 0.2, 0, 0, 0, 0, 0, 0, 0, 0], idx * 10);
    const faces = decodeYunet(heads, size, 0.5);
    assert.equal(faces.length, 1);
    const f = faces[0];
    close(f.score, 0.9);
    close(f.box[0], (c + 0.5) * 16 - 16);
    close(f.box[1], (r + 0.5) * 16 - 24);
    close(f.box[2], 32);
    close(f.box[3], 48);
    close(f.landmarks[0][0], (0.1 + c) * 16);
    close(f.landmarks[0][1], (0.2 + r) * 16);
  });

  it('decodeYunet drops anchors below the score threshold', () => {
    const heads = emptyHeads(64);
    heads.cls_8[0] = 0.4;
    heads.obj_8[0] = 0.4;
    assert.equal(decodeYunet(heads, 64, 0.5).length, 0);
  });

  it('nms keeps the strongest of overlapping boxes', () => {
    const lm: Point[] = [];
    const kept = nms(
      [
        { box: [0, 0, 10, 10], landmarks: lm, score: 0.8 },
        { box: [1, 1, 10, 10], landmarks: lm, score: 0.9 },
        { box: [50, 50, 10, 10], landmarks: lm, score: 0.7 },
      ],
      0.3,
    );
    assert.deepEqual(kept.map((k) => k.score), [0.9, 0.7]);
  });

  it('alignForSface is an identity crop when landmarks already match the template', () => {
    const w = 112, h = 112;
    const rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        rgb[(y * w + x) * 3] = x;
        rgb[(y * w + x) * 3 + 1] = y;
        rgb[(y * w + x) * 3 + 2] = 7;
      }
    }
    const out = alignForSface(rgb, w, h, SFACE_TEMPLATE);
    const plane = 112 * 112;
    close(out[50 * 112 + 30], 30, 1e-3);
    close(out[plane + 50 * 112 + 30], 50, 1e-3);
    close(out[2 * plane + 50 * 112 + 30], 7, 1e-3);
  });

  it('cosineSimilarity', () => {
    close(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([2, 0])), 1);
    close(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 3])), 0);
    close(cosineSimilarity(Float32Array.from([0, 0]), Float32Array.from([1, 1])), 0);
  });
});
