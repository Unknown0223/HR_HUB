import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kBiometricEnabled = 'biometricEnabled';

final biometricServiceProvider = Provider<BiometricService>((_) {
  return BiometricService();
});

/// Fingerprint / Face unlock via platform biometrics (local_auth).
class BiometricService {
  BiometricService({LocalAuthentication? auth})
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  Future<bool> get isEnabled async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kBiometricEnabled) ?? false;
  }

  Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kBiometricEnabled, value);
  }

  Future<bool> deviceSupportsBiometrics() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final supported = await _auth.isDeviceSupported();
      return canCheck || supported;
    } on PlatformException {
      return false;
    }
  }

  Future<List<BiometricType>> availableTypes() async {
    try {
      return await _auth.getAvailableBiometrics();
    } on PlatformException {
      return const [];
    }
  }

  /// Prompts fingerprint / device credential. Returns true on success.
  /// When [allowSkipIfUnavailable] is true (emulator), returns true if no hardware.
  Future<bool> authenticate({
    String reason = 'Worklyn — biometrik tasdiq',
    bool allowSkipIfUnavailable = true,
  }) async {
    try {
      final supported = await deviceSupportsBiometrics();
      if (!supported) {
        return allowSkipIfUnavailable;
      }
      final types = await availableTypes();
      if (types.isEmpty && allowSkipIfUnavailable) {
        // Emulator without enrolled fingerprints.
        return true;
      }
      // Fingerprint only: the system "Use PIN" fallback would ask for the phone's screen-lock PIN,
      // which users confuse with the app PIN — cancelling returns them to the app keypad instead.
      return await _auth.authenticate(
        localizedReason: reason,
        authMessages: const [
          AndroidAuthMessages(
            signInTitle: 'Worklyn',
            biometricHint: 'Barmoq izingizni sensorga tekkizing',
            biometricNotRecognized: 'Barmoq izi tanilmadi, qayta urinib ko‘ring',
            biometricSuccess: 'Tasdiqlandi',
            biometricRequiredTitle: 'Barmoq izi qo‘shilmagan',
            goToSettingsButton: 'Sozlamalar',
            goToSettingsDescription: 'Telefon sozlamalarida barmoq izini qo‘shing',
            cancelButton: 'PIN-kod bilan kirish',
          ),
        ],
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on PlatformException {
      return allowSkipIfUnavailable;
    }
  }

  /// Gate used before sensitive punches when user enabled biometrics in settings.
  Future<bool> confirmIfEnabled({
    String reason = 'Belgilashni tasdiqlang',
  }) async {
    if (!await isEnabled) return true;
    return authenticate(reason: reason, allowSkipIfUnavailable: true);
  }
}
