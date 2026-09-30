import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../api/api_client.dart';
import '../biometrics/biometric_service.dart';

const _kPin = 'appLockPin';
const _kFails = 'appLockFails';

/// Wrong PINs in a row before the session is dropped and the password is required again.
const kPinMaxAttempts = 5;

/// Time in the background after which the app asks for the PIN again.
const kRelockAfter = Duration(seconds: 30);

class AppLockState {
  const AppLockState({
    this.ready = false,
    this.hasPin = false,
    this.locked = false,
    this.biometric = false,
    this.failures = 0,
  });

  /// PIN presence has been read from storage.
  final bool ready;
  final bool hasPin;
  final bool locked;

  /// User opted in to unlocking with fingerprint.
  final bool biometric;
  final int failures;

  int get attemptsLeft => kPinMaxAttempts - failures;

  AppLockState copyWith({bool? hasPin, bool? locked, bool? biometric, int? failures}) {
    return AppLockState(
      ready: true,
      hasPin: hasPin ?? this.hasPin,
      locked: locked ?? this.locked,
      biometric: biometric ?? this.biometric,
      failures: failures ?? this.failures,
    );
  }
}

enum PinCheck { ok, wrong, exhausted }

/// Local 4-digit lock over a long-lived session: the password is typed once at login,
/// afterwards the app opens with the PIN or fingerprint.
class AppLockNotifier extends StateNotifier<AppLockState> with WidgetsBindingObserver {
  AppLockNotifier(this._ref) : super(const AppLockState()) {
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  final Ref _ref;
  DateTime? _backgroundAt;

  FlutterSecureStorage get _secure => _ref.read(secureStorageProvider);
  BiometricService get _bio => _ref.read(biometricServiceProvider);

  Future<String?> _read(String key) => _secure.read(key: key);
  Future<void> _write(String key, String value) => _secure.write(key: key, value: value);
  Future<void> _delete(String key) => _secure.delete(key: key);

  Future<void> _load() async {
    final pin = await _read(_kPin);
    final fails = int.tryParse(await _read(_kFails) ?? '') ?? 0;
    final hasPin = pin != null && pin.length == 4;
    state = AppLockState(
      ready: true,
      hasPin: hasPin,
      locked: hasPin,
      biometric: hasPin && await _bio.isEnabled,
      failures: fails,
    );
  }

  Future<void> setPin(String pin) async {
    await _write(_kPin, pin);
    await _delete(_kFails);
    state = state.copyWith(hasPin: true, locked: false, failures: 0);
  }

  Future<bool> matches(String pin) async => await _read(_kPin) == pin;

  Future<PinCheck> verify(String pin) async {
    if (await matches(pin)) {
      unlock();
      return PinCheck.ok;
    }
    final fails = state.failures + 1;
    await _write(_kFails, '$fails');
    state = state.copyWith(failures: fails);
    return fails >= kPinMaxAttempts ? PinCheck.exhausted : PinCheck.wrong;
  }

  Future<bool> unlockWithBiometric() async {
    if (!state.biometric) return false;
    final ok = await _bio.authenticate(
      reason: 'Ilovani ochish uchun tasdiqlang',
      allowSkipIfUnavailable: false,
    );
    if (ok) unlock();
    return ok;
  }

  void unlock() {
    if (state.failures > 0) _delete(_kFails);
    state = state.copyWith(locked: false, failures: 0);
  }

  void lock() {
    if (state.hasPin) state = state.copyWith(locked: true);
  }

  Future<void> setBiometric(bool enabled) async {
    await _bio.setEnabled(enabled);
    state = state.copyWith(biometric: enabled);
  }

  /// Logout: the next account on this device sets its own PIN.
  Future<void> reset() async {
    await _delete(_kPin);
    await _delete(_kFails);
    await _bio.setEnabled(false);
    state = const AppLockState(ready: true);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    switch (lifecycle) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _backgroundAt ??= DateTime.now();
      case AppLifecycleState.resumed:
        final since = _backgroundAt;
        _backgroundAt = null;
        if (since != null && DateTime.now().difference(since) >= kRelockAfter) lock();
      default:
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}

final appLockProvider = StateNotifierProvider<AppLockNotifier, AppLockState>((ref) {
  return AppLockNotifier(ref);
});
