import 'dart:math' as math;
import 'dart:typed_data';

/// Dart copy of apps/api/src/face/face-geometry.ts: phone and server must align
/// faces identically, otherwise their similarity scores drift apart.

typedef FacePoint = (double, double);

class DetectedFace {
  const DetectedFace(this.box, this.landmarks, this.score);

  /// x, y, width, height.
  final List<double> box;

  /// Right eye, left eye, nose tip, right mouth corner, left mouth corner (YuNet order).
  final List<FacePoint> landmarks;
  final double score;

  double get area => box[2] * box[3];

  DetectedFace scaled(double factor) => DetectedFace(
    [for (final v in box) v / factor],
    [for (final (x, y) in landmarks) (x / factor, y / factor)],
    score,
  );
}

const yunetStrides = [8, 16, 32];

/// ArcFace/SFace 112×112 template for the five YuNet landmarks.
const sfaceTemplate = <FacePoint>[
  (38.2946, 51.6963),
  (73.5318, 51.5014),
  (56.0252, 71.7366),
  (41.5493, 92.3655),
  (70.7299, 92.2041),
];

double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

/// Decodes YuNet (2023mar) heads into faces in input-pixel coordinates.
List<DetectedFace> decodeYunet(
  Map<String, Float32List> out,
  int inputSize,
  double scoreThreshold,
) {
  final faces = <DetectedFace>[];
  for (final stride in yunetStrides) {
    final cls = out['cls_$stride'];
    final obj = out['obj_$stride'];
    final bbox = out['bbox_$stride'];
    final kps = out['kps_$stride'];
    if (cls == null || obj == null || bbox == null || kps == null) continue;
    final cols = inputSize ~/ stride;
    final rows = inputSize ~/ stride;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        final idx = r * cols + c;
        final score = math.sqrt(_clamp01(cls[idx]) * _clamp01(obj[idx]));
        if (score < scoreThreshold) continue;
        final cx = (c + bbox[idx * 4]) * stride;
        final cy = (r + bbox[idx * 4 + 1]) * stride;
        final w = math.exp(bbox[idx * 4 + 2]) * stride;
        final h = math.exp(bbox[idx * 4 + 3]) * stride;
        faces.add(
          DetectedFace(
            [cx - w / 2, cy - h / 2, w, h],
            [
              for (var n = 0; n < 5; n++)
                (
                  (kps[idx * 10 + 2 * n] + c) * stride,
                  (kps[idx * 10 + 2 * n + 1] + r) * stride,
                ),
            ],
            score,
          ),
        );
      }
    }
  }
  return nms(faces, 0.3);
}

double _iou(List<double> a, List<double> b) {
  final x1 = math.max(a[0], b[0]);
  final y1 = math.max(a[1], b[1]);
  final x2 = math.min(a[0] + a[2], b[0] + b[2]);
  final y2 = math.min(a[1] + a[3], b[1] + b[3]);
  final inter = math.max(0.0, x2 - x1) * math.max(0.0, y2 - y1);
  final union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

List<DetectedFace> nms(List<DetectedFace> faces, double threshold) {
  final sorted = [...faces]..sort((a, b) => b.score.compareTo(a.score));
  final kept = <DetectedFace>[];
  for (final f in sorted) {
    if (kept.every((k) => _iou(k.box, f.box) <= threshold)) kept.add(f);
  }
  return kept;
}

/// Least-squares similarity (rotation + uniform scale + shift) mapping src → dst.
({double c, double s, double tx, double ty}) similarityTransform(
  List<FacePoint> src,
  List<FacePoint> dst,
) {
  final n = src.length;
  var msx = 0.0, msy = 0.0, mdx = 0.0, mdy = 0.0;
  for (var i = 0; i < n; i++) {
    msx += src[i].$1;
    msy += src[i].$2;
    mdx += dst[i].$1;
    mdy += dst[i].$2;
  }
  msx /= n;
  msy /= n;
  mdx /= n;
  mdy /= n;
  var a = 0.0, b = 0.0, varS = 0.0;
  for (var i = 0; i < n; i++) {
    final sx = src[i].$1 - msx, sy = src[i].$2 - msy;
    final dx = dst[i].$1 - mdx, dy = dst[i].$2 - mdy;
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    varS += sx * sx + sy * sy;
  }
  final c = varS > 0 ? a / varS : 1.0;
  final s = varS > 0 ? b / varS : 0.0;
  return (c: c, s: s, tx: mdx - (c * msx - s * msy), ty: mdy - (s * msx + c * msy));
}

/// Warps an RGB image so the landmarks land on the SFace template and returns the
/// 1×3×112×112 float tensor (RGB, 0–255) the model expects.
Float32List alignForSface(
  Uint8List rgb,
  int width,
  int height,
  List<FacePoint> landmarks,
) {
  const size = 112;
  final t = similarityTransform(landmarks, sfaceTemplate);
  final det = (t.c * t.c + t.s * t.s) == 0 ? 1.0 : t.c * t.c + t.s * t.s;
  final out = Float32List(3 * size * size);
  const plane = size * size;
  double px(int x, int y, int ch) =>
      x < 0 || y < 0 || x >= width || y >= height
      ? 0
      : rgb[(y * width + x) * 3 + ch].toDouble();
  for (var v = 0; v < size; v++) {
    for (var u = 0; u < size; u++) {
      final du = u - t.tx;
      final dv = v - t.ty;
      final x = (t.c * du + t.s * dv) / det;
      final y = (-t.s * du + t.c * dv) / det;
      final x0 = x.floor(), y0 = y.floor();
      final fx = x - x0, fy = y - y0;
      for (var ch = 0; ch < 3; ch++) {
        final top = px(x0, y0, ch) * (1 - fx) + px(x0 + 1, y0, ch) * fx;
        final bottom =
            px(x0, y0 + 1, ch) * (1 - fx) + px(x0 + 1, y0 + 1, ch) * fx;
        out[ch * plane + v * size + u] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

double cosineSimilarity(List<double> a, List<double> b) {
  var dot = 0.0, na = 0.0, nb = 0.0;
  for (var i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / math.sqrt(na * nb) : 0;
}
