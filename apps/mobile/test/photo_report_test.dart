import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/features/attendance/photo_report.dart';
import 'package:image/image.dart' as img;

void main() {
  test('back photo is the base, selfie sits in the top-left corner', () async {
    final dir = await Directory.systemTemp.createTemp('photo_report');
    final back = img.Image(width: 2400, height: 3200)
      ..clear(img.ColorRgb8(0, 0, 255));
    final selfie = img.Image(width: 600, height: 800)
      ..clear(img.ColorRgb8(255, 0, 0));
    final backFile = File('${dir.path}/back.jpg')..writeAsBytesSync(img.encodeJpg(back));
    final selfieFile = File('${dir.path}/selfie.jpg')..writeAsBytesSync(img.encodeJpg(selfie));

    final bytes = await composePhotoReport(
      backPath: backFile.path,
      selfiePath: selfieFile.path,
      stamp: 'Worklyn | KIRISH | 01.01.2026 09:00:00',
    );
    final out = img.decodeJpg(bytes)!;

    expect(out.height, 1600);
    expect(out.width, 1200);
    final inset = out.getPixel(100, 100);
    expect(inset.r, greaterThan(200));
    expect(inset.b, lessThan(60));
    final base = out.getPixel(900, 800);
    expect(base.b, greaterThan(200));
    expect(base.r, lessThan(60));
    await dir.delete(recursive: true);
  });
}
