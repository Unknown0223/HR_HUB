/** Pure helpers for YuNet detection output and SFace alignment (no I/O, unit-tested). */

export type Point = [number, number];

export interface DetectedFace {
  box: [number, number, number, number];
  /** Right eye, left eye, nose tip, right mouth corner, left mouth corner (YuNet order). */
  landmarks: Point[];
  score: number;
}

export const YUNET_STRIDES = [8, 16, 32] as const;

/** ArcFace/SFace 112×112 template for the five YuNet landmarks. */
export const SFACE_TEMPLATE: Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export type YunetOutputs = Record<string, Float32Array>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Decodes YuNet (2023mar) heads into faces in input-pixel coordinates; mirrors
 * OpenCV's FaceDetectorYN post-processing.
 */
export function decodeYunet(
  out: YunetOutputs,
  inputSize: number,
  scoreThreshold: number,
): DetectedFace[] {
  const faces: DetectedFace[] = [];
  for (const stride of YUNET_STRIDES) {
    const cls = out[`cls_${stride}`];
    const obj = out[`obj_${stride}`];
    const bbox = out[`bbox_${stride}`];
    const kps = out[`kps_${stride}`];
    if (!cls || !obj || !bbox || !kps) continue;
    const cols = Math.floor(inputSize / stride);
    const rows = Math.floor(inputSize / stride);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const score = Math.sqrt(clamp01(cls[idx]) * clamp01(obj[idx]));
        if (score < scoreThreshold) continue;
        const cx = (c + bbox[idx * 4]) * stride;
        const cy = (r + bbox[idx * 4 + 1]) * stride;
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;
        const landmarks: Point[] = [];
        for (let n = 0; n < 5; n++) {
          landmarks.push([
            (kps[idx * 10 + 2 * n] + c) * stride,
            (kps[idx * 10 + 2 * n + 1] + r) * stride,
          ]);
        }
        faces.push({ box: [cx - w / 2, cy - h / 2, w, h], landmarks, score });
      }
    }
  }
  return nms(faces, 0.3);
}

function iou(a: DetectedFace['box'], b: DetectedFace['box']): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(faces: DetectedFace[], threshold: number): DetectedFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: DetectedFace[] = [];
  for (const f of sorted) {
    if (kept.every((k) => iou(k.box, f.box) <= threshold)) kept.push(f);
  }
  return kept;
}

/** Scales a face found on a resized image back to source pixels. */
export function scaleFace(face: DetectedFace, factor: number): DetectedFace {
  return {
    score: face.score,
    box: face.box.map((v) => v / factor) as DetectedFace['box'],
    landmarks: face.landmarks.map(([x, y]) => [x / factor, y / factor] as Point),
  };
}

/** Least-squares similarity (rotation + uniform scale + shift) mapping src → dst. */
export function similarityTransform(src: Point[], dst: Point[]) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0];
    msy += src[i][1];
    mdx += dst[i][0];
    mdy += dst[i][1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let a = 0, b = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - msx, sy = src[i][1] - msy;
    const dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    varS += sx * sx + sy * sy;
  }
  const c = varS > 0 ? a / varS : 1;
  const s = varS > 0 ? b / varS : 0;
  return { c, s, tx: mdx - (c * msx - s * msy), ty: mdy - (s * msx + c * msy) };
}

export function applyTransform(
  t: ReturnType<typeof similarityTransform>,
  [x, y]: Point,
): Point {
  return [t.c * x - t.s * y + t.tx, t.s * x + t.c * y + t.ty];
}

/**
 * Warps an RGB image so the landmarks land on the SFace template and returns the
 * 1×3×112×112 float tensor (RGB, 0–255) the model expects.
 */
export function alignForSface(
  rgb: Uint8Array | Buffer,
  width: number,
  height: number,
  landmarks: Point[],
): Float32Array {
  const size = 112;
  const t = similarityTransform(landmarks, SFACE_TEMPLATE);
  const det = t.c * t.c + t.s * t.s || 1;
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const du = u - t.tx;
      const dv = v - t.ty;
      const x = (t.c * du + t.s * dv) / det;
      const y = (-t.s * du + t.c * dv) / det;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      for (let ch = 0; ch < 3; ch++) {
        const px = (xx: number, yy: number) =>
          xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : rgb[(yy * width + xx) * 3 + ch];
        const top = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx;
        const bottom = px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx;
        out[ch * plane + v * size + u] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}
