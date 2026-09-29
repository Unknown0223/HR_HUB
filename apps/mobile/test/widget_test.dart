import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/core/theme/app_theme.dart';

void main() {
  test('brand colors match HR HUB', () {
    // Light green tokens from AppColors (app_theme.dart).
    expect(AppColors.sidebar.toARGB32(), 0xFFF1F8F1);
    expect(AppColors.accent.toARGB32(), 0xFF2FA350);
  });
}
