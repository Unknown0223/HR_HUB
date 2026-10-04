import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/core/brand/worklyn_mark.dart';

void main() {
  test('palette follows the calendar season', () {
    expect(WorklynPalette.forMonth(12), WorklynPalette.winter);
    expect(WorklynPalette.forMonth(2), WorklynPalette.winter);
    expect(WorklynPalette.forMonth(3), WorklynPalette.spring);
    expect(WorklynPalette.forMonth(5), WorklynPalette.spring);
    expect(WorklynPalette.forMonth(6), WorklynPalette.summer);
    expect(WorklynPalette.forMonth(8), WorklynPalette.summer);
    expect(WorklynPalette.forMonth(9), WorklynPalette.autumn);
    expect(WorklynPalette.forMonth(11), WorklynPalette.autumn);
  });

  testWidgets('mark renders at the requested size', (tester) async {
    await tester.pumpWidget(
      const Center(child: WorklynMark(size: 40, palette: WorklynPalette.winter)),
    );
    expect(tester.getSize(find.byType(WorklynMark)), const Size(40, 40));
  });
}
