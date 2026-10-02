import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

const _maxEdge = 1600;

/// Back-camera photo as the base, selfie inset in the top-left corner and a
/// stamp bar at the bottom. Returns JPEG bytes.
Future<Uint8List> composePhotoReport({
  required String backPath,
  required String selfiePath,
  required String stamp,
}) async {
  final back = await File(backPath).readAsBytes();
  final selfie = await File(selfiePath).readAsBytes();
  return compute(_compose, _ComposeArgs(back, selfie, stamp));
}

/// Liveness selfie downsized for the server-side match with the profile photo.
Future<Uint8List> faceMatchSelfie(String selfiePath) async {
  final bytes = await File(selfiePath).readAsBytes();
  return compute(_shrinkSelfie, bytes);
}

Uint8List _shrinkSelfie(Uint8List bytes) {
  final raw = img.decodeImage(bytes);
  if (raw == null) throw StateError('Rasmni o‘qib bo‘lmadi');
  var face = img.bakeOrientation(raw);
  const edge = 720;
  if (face.width > edge || face.height > edge) {
    face = face.width >= face.height
        ? img.copyResize(face, width: edge)
        : img.copyResize(face, height: edge);
  }
  return img.encodeJpg(face, quality: 85);
}

class _ComposeArgs {
  const _ComposeArgs(this.back, this.selfie, this.stamp);
  final Uint8List back;
  final Uint8List selfie;
  final String stamp;
}

Uint8List _compose(_ComposeArgs a) {
  final backRaw = img.decodeImage(a.back);
  final selfieRaw = img.decodeImage(a.selfie);
  if (backRaw == null || selfieRaw == null) {
    throw StateError('Rasmni o‘qib bo‘lmadi');
  }
  var base = img.bakeOrientation(backRaw);
  final longest = base.width > base.height ? base.width : base.height;
  if (longest > _maxEdge) {
    base = base.width >= base.height
        ? img.copyResize(base, width: _maxEdge)
        : img.copyResize(base, height: _maxEdge);
  }

  final selfie = img.bakeOrientation(selfieRaw);
  final insetW = (base.width * 0.32).round();
  final inset = img.copyResize(selfie, width: insetW);
  final margin = (base.width * 0.03).round().clamp(12, 40);
  const border = 6;
  img.fillRect(
    base,
    x1: margin - border,
    y1: margin - border,
    x2: margin + inset.width + border,
    y2: margin + inset.height + border,
    color: img.ColorRgb8(255, 255, 255),
    radius: 10,
  );
  img.compositeImage(base, inset, dstX: margin, dstY: margin);

  final lines = a.stamp.split('\n');
  final font = base.width >= 1000 ? img.arial48 : img.arial24;
  final lineH = font.lineHeight + 6;
  final barH = lines.length * lineH + 16;
  img.fillRect(
    base,
    x1: 0,
    y1: base.height - barH,
    x2: base.width,
    y2: base.height,
    color: img.ColorRgba8(0, 0, 0, 150),
  );
  for (var i = 0; i < lines.length; i++) {
    img.drawString(
      base,
      lines[i],
      font: font,
      x: 18,
      y: base.height - barH + 8 + i * lineH,
      color: img.ColorRgb8(255, 255, 255),
    );
  }
  return img.encodeJpg(base, quality: 85);
}
