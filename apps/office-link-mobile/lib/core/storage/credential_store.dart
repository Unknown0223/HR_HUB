import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Minimal secure KV for tests / production flutter_secure_storage.
abstract class SecureKv {
  Future<void> write({required String key, required String value});
  Future<String?> read({required String key});
  Future<void> delete({required String key});
}

class FlutterSecureKv implements SecureKv {
  FlutterSecureKv([FlutterSecureStorage? storage])
      : _s = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _s;

  @override
  Future<void> write({required String key, required String value}) =>
      _s.write(key: key, value: value);

  @override
  Future<String?> read({required String key}) => _s.read(key: key);

  @override
  Future<void> delete({required String key}) => _s.delete(key: key);
}

class MemorySecureKv implements SecureKv {
  final Map<String, String> _m = {};

  @override
  Future<void> write({required String key, required String value}) async {
    _m[key] = value;
  }

  @override
  Future<String?> read({required String key}) async => _m[key];

  @override
  Future<void> delete({required String key}) async {
    _m.remove(key);
  }
}

/// Persist pairing token, link key, session id, and recovery credential.
///
/// Device password is stored in:
/// 1) encrypted secure storage
/// 2) `HRHUB-Link/data/device-credential.json` under app documents (Windows parity)
class CredentialStore {
  CredentialStore({
    SecureKv? secure,
    SharedPreferences? prefs,
    Directory? dataDirOverride,
  })  : _secure = secure ?? FlutterSecureKv(),
        _dataDirOverride = dataDirOverride;

  static const _kPairing = 'pairing_token';
  static const _kLinkKey = 'link_key';
  static const _kSessionId = 'provision_session_id';
  static const _kCredential = 'device_credential_json';
  static const _kLocationId = 'location_id';
  static const credentialFileName = 'device-credential.json';

  final SecureKv _secure;
  final Directory? _dataDirOverride;
  SharedPreferences? _prefs;
  Directory? _dataDir;

  Future<SharedPreferences> _p() async =>
      _prefs ??= await SharedPreferences.getInstance();

  /// App documents / HRHUB-Link / data  (visible recovery folder).
  Future<Directory> dataDirectory() async {
    if (_dataDirOverride != null) {
      final override = _dataDirOverride;
      final d = Directory('${override.path}/HRHUB-Link/data');
      if (!await d.exists()) await d.create(recursive: true);
      _dataDir = d;
      return d;
    }
    if (_dataDir != null) return _dataDir!;
    final docs = await getApplicationDocumentsDirectory();
    final d = Directory('${docs.path}/HRHUB-Link/data');
    if (!await d.exists()) await d.create(recursive: true);
    _dataDir = d;
    return d;
  }

  Future<File> credentialFile() async {
    final dir = await dataDirectory();
    return File('${dir.path}/$credentialFileName');
  }

  Future<String?> pairingToken() async {
    try {
      return await _secure.read(key: _kPairing);
    } catch (_) {
      return null;
    }
  }

  Future<void> setPairingToken(String? token) async {
    final t = (token ?? '').trim();
    try {
      if (t.isEmpty) {
        await _secure.delete(key: _kPairing);
      } else {
        await _secure.write(key: _kPairing, value: t);
      }
    } catch (_) {}
  }

  Future<String?> linkKey() async {
    try {
      return await _secure.read(key: _kLinkKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> setLinkKey(String? key) async {
    final k = (key ?? '').trim();
    try {
      if (k.isEmpty) {
        await _secure.delete(key: _kLinkKey);
      } else {
        await _secure.write(key: _kLinkKey, value: k);
      }
    } catch (_) {}
  }

  Future<String?> sessionId() async {
    try {
      return await _secure.read(key: _kSessionId);
    } catch (_) {
      return null;
    }
  }

  Future<void> setSessionId(String? id) async {
    final s = (id ?? '').trim();
    try {
      if (s.isEmpty) {
        await _secure.delete(key: _kSessionId);
      } else {
        await _secure.write(key: _kSessionId, value: s);
      }
    } catch (_) {}
  }

  Future<String?> locationId() async {
    final p = await _p();
    return p.getString(_kLocationId);
  }

  Future<void> setLocationId(String? id) async {
    final p = await _p();
    final v = (id ?? '').trim();
    if (v.isEmpty) {
      await p.remove(_kLocationId);
    } else {
      await p.setString(_kLocationId, v);
    }
  }

  Map<String, dynamic> _payload({
    required String host,
    required String password,
    String username = 'admin',
    int port = 80,
    String serial = '',
    String locationId = '',
    String phase = 'rotated',
    String deviceId = '',
  }) {
    return {
      'host': host.trim(),
      'port': port,
      'username': username.trim().isEmpty ? 'admin' : username.trim(),
      'password': password.trim(),
      'serialNumber': serial.trim(),
      'locationId': locationId.trim(),
      'deviceId': deviceId.trim(),
      'phase': phase,
      'savedAt': DateTime.now().toUtc().toIso8601String(),
      'note':
          'HR HUB Link recovery — yangi admin parol. Web vault ishlamasa shu yerdan tiklang.',
    };
  }

  Future<void> saveDeviceCredential({
    required String host,
    required String password,
    String username = 'admin',
    int port = 80,
    String serial = '',
    String locationId = '',
    String phase = 'rotated',
    String deviceId = '',
  }) async {
    final pwd = password.trim();
    if (pwd.isEmpty) {
      throw ArgumentError('password required for recovery save');
    }
    final payload = _payload(
      host: host,
      password: pwd,
      username: username,
      port: port,
      serial: serial,
      locationId: locationId,
      phase: phase,
      deviceId: deviceId,
    );
    final raw = jsonEncode(payload);
    try {
      await _secure.write(key: _kCredential, value: raw);
    } catch (_) {}

    final file = await credentialFile();
    await file.writeAsString('$raw\n', flush: true);
  }

  Future<Map<String, dynamic>?> readDeviceCredential() async {
    try {
      final raw = await _secure.read(key: _kCredential);
      final fromSecure = _parseCredential(raw);
      if (fromSecure != null) return fromSecure;
    } catch (_) {}

    try {
      final file = await credentialFile();
      if (await file.exists()) {
        return _parseCredential(await file.readAsString());
      }
    } catch (_) {}
    return null;
  }

  Map<String, dynamic>? _parseCredential(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final data = jsonDecode(raw);
      if (data is! Map) return null;
      final map = Map<String, dynamic>.from(data);
      final pwd = '${map['password'] ?? ''}'.trim();
      if (pwd.isEmpty) return null;
      return map;
    } catch (_) {
      return null;
    }
  }

  Future<String> formatCredentialForDisplay(Map<String, dynamic>? data) async {
    String pathHint;
    try {
      pathHint = (await credentialFile()).path;
    } catch (_) {
      pathHint = 'HRHUB-Link/data/$credentialFileName';
    }
    if (data == null) {
      return 'Saqlangan parol yo‘q.\n\n'
          'Sabab: hali «Ulash» muvaffaqiyatli tugamagan.\n'
          'Ulashdan keyin fayl shu yerda paydo bo‘ladi:\n'
          '$pathHint';
    }
    return 'Host: ${data['host'] ?? '—'}\n'
        'Port: ${data['port'] ?? 80}\n'
        'Login: ${data['username'] ?? 'admin'}\n'
        'Parol: ${data['password']}\n'
        'Serial: ${data['serialNumber'] ?? '—'}\n'
        'Bosqich: ${data['phase'] ?? '—'}\n'
        'Saqlangan: ${data['savedAt'] ?? '—'}\n'
        'Fayl: $pathHint';
  }
}
