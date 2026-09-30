import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/core/api/api_client.dart';
import 'package:hr_hub_mobile/core/security/app_lock.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MemoryStorage extends Fake implements FlutterSecureStorage {
  final values = <String, String>{};

  @override
  Future<String?> read({required String key, AppleOptions? iOptions, AndroidOptions? aOptions,
          LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async =>
      values[key];

  @override
  Future<void> write({required String key, required String? value, AppleOptions? iOptions,
      AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions,
      WindowsOptions? wOptions}) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({required String key, AppleOptions? iOptions, AndroidOptions? aOptions,
      LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    values.remove(key);
  }
}

Future<ProviderContainer> _container(_MemoryStorage storage) async {
  final c = ProviderContainer(overrides: [secureStorageProvider.overrideWithValue(storage)]);
  c.read(appLockProvider);
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
  return c;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('no PIN yet: ready and unlocked, so the gate asks to create one', () async {
    final c = await _container(_MemoryStorage());
    final s = c.read(appLockProvider);
    expect(s.ready, isTrue);
    expect(s.hasPin, isFalse);
    expect(s.locked, isFalse);
  });

  test('a saved PIN locks the app on start and unlocks with the right code', () async {
    final storage = _MemoryStorage();
    await (await _container(storage)).read(appLockProvider.notifier).setPin('2468');

    final c = await _container(storage);
    expect(c.read(appLockProvider).locked, isTrue);
    expect(await c.read(appLockProvider.notifier).verify('2468'), PinCheck.ok);
    expect(c.read(appLockProvider).locked, isFalse);
  });

  test('wrong PINs are counted across restarts and run out after the limit', () async {
    final storage = _MemoryStorage();
    await (await _container(storage)).read(appLockProvider.notifier).setPin('2468');

    var c = await _container(storage);
    for (var i = 0; i < kPinMaxAttempts - 1; i++) {
      expect(await c.read(appLockProvider.notifier).verify('0000'), PinCheck.wrong);
    }
    c = await _container(storage);
    expect(c.read(appLockProvider).attemptsLeft, 1);
    expect(await c.read(appLockProvider.notifier).verify('0000'), PinCheck.exhausted);
  });

  test('a short trip to the background does not re-lock', () async {
    final storage = _MemoryStorage();
    final c = await _container(storage);
    final lock = c.read(appLockProvider.notifier);
    await lock.setPin('2468');
    lock
      ..didChangeAppLifecycleState(AppLifecycleState.paused)
      ..didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(c.read(appLockProvider).locked, isFalse);
  });

  test('reset (logout) forgets the PIN and fingerprint opt-in', () async {
    final storage = _MemoryStorage();
    final c = await _container(storage);
    final lock = c.read(appLockProvider.notifier);
    await lock.setPin('2468');
    await lock.setBiometric(true);
    await lock.reset();
    expect(c.read(appLockProvider).hasPin, isFalse);
    expect(c.read(appLockProvider).biometric, isFalse);
    expect(storage.values, isEmpty);
  });
}
