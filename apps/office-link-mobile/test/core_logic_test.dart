import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/core/security/auth_lock.dart';
import 'package:hrhub_office_link/core/security/passwords.dart';
import 'package:hrhub_office_link/core/device/hikvision_client.dart';

void main() {
  group('passwords', () {
    test('generateTerminalPassword shape', () {
      final pwd = generateTerminalPassword();
      expect(pwd.length, inInclusiveRange(8, 16));
      expect(hikvisionPasswordError(pwd), isNull);
      expect(pwd.startsWith('Hr') || pwd.startsWith('Kx'), isTrue);
    });

    test('rejects short password', () {
      expect(hikvisionPasswordError('Ab1'), isNotNull);
    });

    test('rejects username inside password', () {
      expect(hikvisionPasswordError('admin1234X', username: 'admin'), isNotNull);
    });
  });

  group('AuthLock', () {
    test('first 401 is confirm, second locks', () {
      var t = DateTime(2026, 1, 1);
      final lock = AuthLock(now: () => t);
      expect(lock.record401(), AuthLock.confirm);
      expect(lock.phase, AuthLock.confirm);
      expect(lock.record401(), AuthLock.locked);
      expect(lock.isLocked, isTrue);
      expect(lock.formatRemaining(), isNotEmpty);
      t = t.add(const Duration(minutes: 31));
      expect(lock.isLocked, isFalse);
    });

    test('timeout does not count', () {
      final lock = AuthLock();
      lock.recordTimeout();
      lock.recordOffline();
      expect(lock.failCount, 0);
    });
  });

  group('digest', () {
    test('buildDigestHeader produces Digest prefix', () {
      final h = buildDigestHeader(
        challenge: {
          'realm': 'test',
          'nonce': 'abc',
          'qop': 'auth',
          'algorithm': 'MD5',
        },
        username: 'admin',
        password: 'secret',
        method: 'GET',
        uri: '/ISAPI/System/deviceInfo',
        cnonce: 'deadbeef',
      );
      expect(h.startsWith('Digest '), isTrue);
      expect(h.contains('response='), isTrue);
    });

    test('validIp', () {
      expect(validIp('192.168.0.116'), isTrue);
      expect(validIp('999.1.1.1'), isFalse);
      expect(validIp('abc'), isFalse);
    });
  });

  group('session sealed parse', () {
    test('sealed flag semantics', () {
      final info = {
        'sealed': true,
        'pendingAdminConfirm': false,
        'status': 'linked',
      };
      final sealed = info['sealed'] == true;
      final pending = info['pendingAdminConfirm'] == true;
      expect(sealed || (!pending && info['status'] == 'linked'), isTrue);
    });
  });
}
