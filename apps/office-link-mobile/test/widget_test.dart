import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/app.dart';

void main() {
  testWidgets('app boots to link screen title', (tester) async {
    await tester.pumpWidget(const OfficeLinkApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('HR HUB'), findsWidgets);
  });
}
