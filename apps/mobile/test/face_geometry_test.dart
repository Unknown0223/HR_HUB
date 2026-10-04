import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/features/attendance/face_geometry.dart';

Map<String, Float32List> emptyHeads(int size) => {
  for (final s in yunetStrides) ...{
    'cls_$s': Float32List((size ~/ s) * (size ~/ s)),
    'obj_$s': Float32List((size ~/ s) * (size ~/ s)),
    'bbox_$s': Float32List((size ~/ s) * (size ~/ s) * 4),
    'kps_$s': Float32List((size ~/ s) * (size ~/ s) * 10),
  },
};

void main() {
  test('similarityTransform recovers rotation, scale and shift', () {
    const angle = 0.3, scale = 1.7;
    final c = scale * math.cos(angle), s = scale * math.sin(angle);
    const src = <FacePoint>[(10, 20), (50, 22), (30, 40), (15, 60), (45, 61)];
    final dst = [for (final (x, y) in src) (c * x - s * y + 5, s * x + c * y - 8)];
    final t = similarityTransform(src, dst);
    expect(t.c, closeTo(c, 1e-6));
    expect(t.s, closeTo(s, 1e-6));
    expect(t.tx, closeTo(5, 1e-6));
    expect(t.ty, closeTo(-8, 1e-6));
  });

  test('decodeYunet places a stride-16 anchor face in input pixels', () {
    const size = 64;
    final heads = emptyHeads(size);
    const cols = size ~/ 16, r = 1, c = 2, idx = r * cols + c;
    heads['cls_16']![idx] = 0.9;
    heads['obj_16']![idx] = 0.9;
    heads['bbox_16']!.setAll(idx * 4, [0.5, 0.5, math.log(2), math.log(3)]);
    heads['kps_16']!.setAll(idx * 10, [0.1, 0.2, 0, 0, 0, 0, 0, 0, 0, 0]);
    final faces = decodeYunet(heads, size, 0.5);
    expect(faces, hasLength(1));
    final f = faces.single;
    expect(f.score, closeTo(0.9, 1e-6));
    expect(f.box[0], closeTo((c + 0.5) * 16 - 16, 1e-4));
    expect(f.box[1], closeTo((r + 0.5) * 16 - 24, 1e-4));
    expect(f.box[2], closeTo(32, 1e-4));
    expect(f.box[3], closeTo(48, 1e-4));
    expect(f.landmarks[0].$1, closeTo((0.1 + c) * 16, 1e-4));
    expect(f.landmarks[0].$2, closeTo((0.2 + r) * 16, 1e-4));
  });

  test('decodeYunet drops anchors below the score threshold', () {
    final heads = emptyHeads(64);
    heads['cls_8']![0] = 0.4;
    heads['obj_8']![0] = 0.4;
    expect(decodeYunet(heads, 64, 0.5), isEmpty);
  });

  test('nms keeps the strongest of overlapping boxes', () {
    final kept = nms(const [
      DetectedFace([0, 0, 10, 10], [], 0.8),
      DetectedFace([1, 1, 10, 10], [], 0.9),
      DetectedFace([50, 50, 10, 10], [], 0.7),
    ], 0.3);
    expect(kept.map((k) => k.score), [0.9, 0.7]);
  });

  test('alignForSface is an identity crop when landmarks match the template', () {
    const w = 112, h = 112;
    final rgb = Uint8List(w * h * 3);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        rgb[(y * w + x) * 3] = x;
        rgb[(y * w + x) * 3 + 1] = y;
        rgb[(y * w + x) * 3 + 2] = 7;
      }
    }
    final out = alignForSface(rgb, w, h, sfaceTemplate);
    const plane = 112 * 112;
    expect(out[50 * 112 + 30], closeTo(30, 1e-3));
    expect(out[plane + 50 * 112 + 30], closeTo(50, 1e-3));
    expect(out[2 * plane + 50 * 112 + 30], closeTo(7, 1e-3));
  });

  test('cosineSimilarity', () {
    expect(cosineSimilarity([1, 0], [2, 0]), closeTo(1, 1e-9));
    expect(cosineSimilarity([1, 0], [0, 3]), closeTo(0, 1e-9));
    expect(cosineSimilarity([0, 0], [1, 1]), 0);
  });
}
