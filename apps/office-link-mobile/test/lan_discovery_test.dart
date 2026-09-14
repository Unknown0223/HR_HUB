import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/core/device/hikvision_client.dart';

void main() {
  test('validIp accepts LAN addresses', () {
    expect(validIp('192.168.0.116'), isTrue);
    expect(validIp('10.0.0.1'), isTrue);
    expect(validIp(''), isFalse);
  });
}
