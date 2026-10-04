import 'dart:async';
import 'dart:isolate';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:onnxruntime/onnxruntime.dart';

import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import 'face_geometry.dart';

/// Server reference embedding of the signed-in employee's profile photo.
class FaceReference {
  const FaceReference({required this.embedding, required this.threshold});

  final List<double> embedding;
  final double threshold;

  static FaceReference? fromJson(Map<String, dynamic> json) {
    final raw = json['embedding'];
    if (json['available'] != true || raw is! List || raw.isEmpty) return null;
    return FaceReference(
      embedding: [for (final v in raw) (v as num).toDouble()],
      threshold: (json['threshold'] as num?)?.toDouble() ?? 0.45,
    );
  }
}

/// Fetched once per signed-in employee (login / app start) and reused by every
/// punch. Null when there is no usable profile photo or the request failed.
final faceReferenceProvider = FutureProvider<FaceReference?>((ref) async {
  final employeeId = ref.watch(
    authProvider.select((a) => a.user?.employee?['id']?.toString()),
  );
  if (employeeId == null) return null;
  try {
    return FaceReference.fromJson(
      await ref.read(meRepositoryProvider).faceReference(),
    );
  } catch (_) {
    return null;
  }
});

enum FacePrecheck { match, mismatch, skipped }

/// On-device copy of the server pipeline (YuNet → SFace int8). It only fails fast
/// on an obvious mismatch; the server re-checks every punch with the full model.
class FaceVerifier {
  FaceVerifier._();
  static final instance = FaceVerifier._();

  /// The int8 phone model lands within ±0.03 of the server's fp32 score on staff
  /// photos, so the phone rejects only below `threshold - margin`.
  static const _margin = 0.05;
  static const _timeout = Duration(seconds: 6);

  Future<SendPort?>? _worker;

  /// Loads the models in a background isolate so the first punch does not wait.
  void warmUp() => _worker ??= _spawn();

  Future<SendPort?> _spawn() async {
    final watch = Stopwatch()..start();
    try {
      final det = await rootBundle.load(
        'assets/models/face_detection_yunet_2023mar.onnx',
      );
      final rec = await rootBundle.load(
        'assets/models/face_recognition_sface_2021dec_int8.onnx',
      );
      final ready = ReceivePort();
      await Isolate.spawn(_workerMain, [
        ready.sendPort,
        TransferableTypedData.fromList([det.buffer.asUint8List(det.offsetInBytes, det.lengthInBytes)]),
        TransferableTypedData.fromList([rec.buffer.asUint8List(rec.offsetInBytes, rec.lengthInBytes)]),
      ], debugName: 'face-verifier');
      final first = await ready.first;
      if (first is SendPort) {
        debugPrint('face verifier ready in ${watch.elapsedMilliseconds} ms');
        return first;
      }
      debugPrint('face verifier unavailable: $first');
    } catch (e) {
      debugPrint('face verifier unavailable: $e');
    }
    return null;
  }

  Future<Float32List?> _embed(Uint8List jpeg) async {
    final port = await (_worker ??= _spawn());
    if (port == null) return null;
    final reply = ReceivePort();
    port.send([reply.sendPort, TransferableTypedData.fromList([jpeg])]);
    try {
      final result = await reply.first;
      return result is Float32List ? result : null;
    } finally {
      reply.close();
    }
  }

  /// [selfie] is the downsized liveness selfie that is also sent to the server.
  Future<FacePrecheck> precheck(Uint8List selfie, FaceReference? reference) async {
    if (reference == null) {
      debugPrint('face precheck skipped: no reference');
      return FacePrecheck.skipped;
    }
    try {
      final watch = Stopwatch()..start();
      final embedding = await _embed(selfie).timeout(_timeout);
      if (embedding == null) {
        debugPrint('face precheck skipped: no face / runtime');
        return FacePrecheck.skipped;
      }
      final score = cosineSimilarity(embedding, reference.embedding);
      debugPrint(
        'face precheck score=${score.toStringAsFixed(3)} '
        'limit=${(reference.threshold - _margin).toStringAsFixed(2)} '
        'in ${watch.elapsedMilliseconds} ms',
      );
      return score < reference.threshold - _margin
          ? FacePrecheck.mismatch
          : FacePrecheck.match;
    } catch (e) {
      debugPrint('face precheck failed: $e');
      return FacePrecheck.skipped;
    }
  }
}

const _detectSize = 640;
const _workMaxEdge = 1024;
const _scoreThreshold = 0.7;

void _workerMain(List<Object> args) {
  final ready = args[0] as SendPort;
  final OrtSession detector;
  final OrtSession recognizer;
  try {
    OrtEnv.instance.init(level: OrtLoggingLevel.error);
    final options = OrtSessionOptions()
      ..setIntraOpNumThreads(2)
      ..setInterOpNumThreads(1);
    detector = OrtSession.fromBuffer(
      (args[1] as TransferableTypedData).materialize().asUint8List(),
      options,
    );
    recognizer = OrtSession.fromBuffer(
      (args[2] as TransferableTypedData).materialize().asUint8List(),
      options,
    );
    options.release();
  } catch (e) {
    ready.send('$e');
    return;
  }
  final inbox = ReceivePort();
  ready.send(inbox.sendPort);
  inbox.listen((message) {
    final m = message as List<Object>;
    final reply = m[0] as SendPort;
    Float32List? result;
    try {
      result = embedFaceSync(
        detector,
        recognizer,
        (m[1] as TransferableTypedData).materialize().asUint8List(),
      );
    } catch (e) {
      debugPrint('face embed failed: $e');
    }
    reply.send(result);
  });
}

/// 128-d SFace embedding of the largest face in [jpeg], or null without a face.
@visibleForTesting
Float32List? embedFaceSync(
  OrtSession detector,
  OrtSession recognizer,
  Uint8List jpeg,
) {
  final decoded = img.decodeImage(jpeg);
  if (decoded == null) return null;
  var work = img.bakeOrientation(decoded);
  if (work.width > _workMaxEdge || work.height > _workMaxEdge) {
    work = work.width >= work.height
        ? img.copyResize(work, width: _workMaxEdge, interpolation: img.Interpolation.linear)
        : img.copyResize(work, height: _workMaxEdge, interpolation: img.Interpolation.linear);
  }
  final width = work.width;
  final height = work.height;
  final rgb = work.getBytes(order: img.ChannelOrder.rgb);

  final factor = _detectSize / (width > height ? width : height);
  final dw = (width * factor).round().clamp(1, _detectSize);
  final dh = (height * factor).round().clamp(1, _detectSize);
  final small = img
      .copyResize(work, width: dw, height: dh, interpolation: img.Interpolation.linear)
      .getBytes(order: img.ChannelOrder.rgb);
  const plane = _detectSize * _detectSize;
  final input = Float32List(3 * plane);
  for (var y = 0; y < dh; y++) {
    for (var x = 0; x < dw; x++) {
      final src = (y * dw + x) * 3;
      final dst = y * _detectSize + x;
      input[dst] = small[src + 2].toDouble();
      input[plane + dst] = small[src + 1].toDouble();
      input[2 * plane + dst] = small[src].toDouble();
    }
  }

  final heads = _run(detector, input, const [1, 3, _detectSize, _detectSize]);
  final faces = decodeYunet(heads, _detectSize, _scoreThreshold);
  if (faces.isEmpty) return null;
  final largest = faces.reduce((a, b) => b.area > a.area ? b : a);
  final face = largest.scaled(factor);
  final aligned = alignForSface(rgb, width, height, face.landmarks);
  final out = _run(recognizer, aligned, const [1, 3, 112, 112]);
  return out[recognizer.outputNames.first];
}

Map<String, Float32List> _run(
  OrtSession session,
  Float32List data,
  List<int> shape,
) {
  final input = OrtValueTensor.createTensorWithDataList(data, shape);
  final runOptions = OrtRunOptions();
  try {
    final outputs = session.run(runOptions, {session.inputNames.first: input});
    final result = <String, Float32List>{};
    for (var i = 0; i < outputs.length; i++) {
      final value = outputs[i];
      final raw = value?.value;
      if (raw is List) {
        result[session.outputNames[i]] = Float32List.fromList(
          raw.flatten<double>(),
        );
      }
      value?.release();
    }
    return result;
  } finally {
    input.release();
    runOptions.release();
  }
}

extension on List {
  List<T> flatten<T>() {
    final flat = <T>[];
    for (final e in this) {
      if (e is List) {
        flat.addAll(e.flatten<T>());
      } else if (e is T) {
        flat.add(e);
      }
    }
    return flat;
  }
}
