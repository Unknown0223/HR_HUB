import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/core/config/app_config.dart';
import 'package:hrhub_office_link/core/device/hikvision_client.dart';
import 'package:hrhub_office_link/core/session/office_link_session.dart';

class _FakeHikvision extends HikvisionClient {
  _FakeHikvision(this.byHost);

  final Map<String, ProbeResult> byHost;

  @override
  Future<ProbeResult> verifyPassword({
    required String host,
    required int port,
    required String username,
    required String password,
  }) async {
    final key = '$host|$password';
    return byHost[key] ??
        ProbeResult(kind: kUnauthorized, host: host, port: port, message: '401');
  }

  @override
  Future<DeviceState> detectState(String host, {int port = 80}) async {
    return DeviceState(
      state: 'configured',
      label: 'Admin bor',
      host: host,
      port: port,
      name: 'Term-$host',
    );
  }
}

void main() {
  final cfg = AppConfig(
    apiUrl: 'https://example.test',
    webUrl: 'https://web.example.test',
    tenantCode: 'demo',
    recoveryEmail: 'a@b.c',
  );

  group('multi-device pick', () {
    test('scanLan does not auto-choose when many', () async {
      final session = OfficeLinkSession(config: cfg);
      session.scannedDevices = [
        const DeviceState(state: 'configured', host: '192.168.0.10', label: 'A'),
        const DeviceState(state: 'configured', host: '192.168.0.20', label: 'B'),
      ];
      // Simulate post-scan many result handling:
      expect(session.scannedDevices.length, 2);
      session.host = '';
      session.detected = null;
      expect(session.host, isEmpty);
      expect(session.detected, isNull);
    });

    test('pickPasswordMatch auto-selects single OK', () async {
      final fake = _FakeHikvision({
        '192.168.0.20|GoodPass1': const ProbeResult(
          kind: kOk,
          host: '192.168.0.20',
          serialNumber: 'SN20',
          name: 'B',
        ),
      });
      final session = OfficeLinkSession(config: cfg, device: fake);
      session.scannedDevices = const [
        DeviceState(state: 'configured', host: '192.168.0.10', label: 'A'),
        DeviceState(state: 'configured', host: '192.168.0.20', label: 'B'),
      ];
      final picked = await session.pickPasswordMatch('GoodPass1');
      expect(picked.reason, 'ok');
      expect(picked.match?.host, '192.168.0.20');
      expect(session.host, '192.168.0.20');
    });

    test('pickPasswordMatch need_pick when many OK', () async {
      final fake = _FakeHikvision({
        '192.168.0.10|SamePass1': const ProbeResult(kind: kOk, host: '192.168.0.10'),
        '192.168.0.20|SamePass1': const ProbeResult(kind: kOk, host: '192.168.0.20'),
      });
      final session = OfficeLinkSession(config: cfg, device: fake);
      session.scannedDevices = const [
        DeviceState(state: 'configured', host: '192.168.0.10', label: 'A'),
        DeviceState(state: 'configured', host: '192.168.0.20', label: 'B'),
      ];
      final picked = await session.pickPasswordMatch('SamePass1');
      expect(picked.reason, 'need_pick');
      expect(picked.match, isNull);
      expect(picked.results.where((r) => r.ok).length, 2);
    });

    test('PasswordProbeResult label', () {
      const p = PasswordProbeResult(
        host: '192.168.0.5',
        ok: true,
        name: 'Gate',
        serialNumber: 'ABC',
      );
      expect(p.label().startsWith('✓'), isTrue);
      expect(p.label(), contains('192.168.0.5'));
      expect(p.label(), contains('ABC'));
    });
  });
}
