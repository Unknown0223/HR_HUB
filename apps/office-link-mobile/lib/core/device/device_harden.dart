import 'dart:convert';

import 'hikvision_client.dart';

const defaultRecoveryEmail = 'botirovanvar96@gmail.com';
const liveDetLevelMax = 'professional';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String normalizeRecoveryEmail(String? value) {
  final email = (value ?? '').trim();
  return email.isEmpty ? defaultRecoveryEmail : email;
}

bool isValidEmail(String value) => _emailRe.hasMatch(value.trim());

/// Recovery email + live-body anti-spoof (best-effort).
class DeviceHarden {
  DeviceHarden(this.client);

  final HikvisionClient client;

  Future<Map<String, dynamic>> setRecoveryEmail({
    required String host,
    required int port,
    required String username,
    required String password,
    required String email,
  }) async {
    final target = normalizeRecoveryEmail(email);
    if (!isValidEmail(target)) {
      return {'ok': false, 'message': 'Noto‘g‘ri email: $target'};
    }
    final payload = {
      'SecurityEmail': {
        'password': password,
        'SecurityInformation': [
          {'emailAddress': target},
        ],
      },
    };
    try {
      final r = await client.digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: '/ISAPI/Security/email/parameter?format=json',
        username: username,
        password: password,
        body: utf8.encode(jsonEncode(payload)),
        contentType: 'application/json',
      );
      if (r.status >= 400) {
        final text = utf8.decode(r.body, allowMalformed: true);
        return {
          'ok': false,
          'message': text.isEmpty
              ? 'HTTP ${r.status}'
              : text.substring(0, text.length > 200 ? 200 : text.length),
          'email': target,
        };
      }
      return {'ok': true, 'email': target};
    } catch (e) {
      return {'ok': false, 'message': '$e', 'email': target};
    }
  }

  Future<Map<String, dynamic>> ensureLiveDetection({
    required String host,
    required int port,
    required String username,
    required String password,
    String level = liveDetLevelMax,
  }) async {
    const path = '/ISAPI/AccessControl/CardReaderCfg/1?format=json';
    try {
      final get = await client.digestRequest(
        host: host,
        port: port,
        method: 'GET',
        path: path,
        username: username,
        password: password,
      );
      if (get.status >= 400) {
        return {'ok': false, 'error': 'GET HTTP ${get.status}'};
      }
      final text = utf8.decode(get.body, allowMalformed: true);
      final data = jsonDecode(text);
      if (data is! Map || data['CardReaderCfg'] is! Map) {
        return {'ok': false, 'error': 'no CardReaderCfg'};
      }
      final cfg = Map<String, dynamic>.from(data['CardReaderCfg'] as Map);
      final beforeLevel = '${cfg['liveDetLevelSet'] ?? ''}';
      final need = cfg['livingBodyDetect'] != true ||
          beforeLevel.toLowerCase() != level.toLowerCase() ||
          cfg['enableLiveDetAntiAttack'] != true;
      if (!need) {
        return {
          'ok': true,
          'changed': false,
          'livingBodyDetect': cfg['livingBodyDetect'],
          'liveDetLevelSet': cfg['liveDetLevelSet'],
          'enableLiveDetAntiAttack': cfg['enableLiveDetAntiAttack'],
          'ready': true,
        };
      }
      final body = Map<String, dynamic>.from(data);
      final nextCfg = Map<String, dynamic>.from(cfg);
      nextCfg['livingBodyDetect'] = true;
      nextCfg['liveDetLevelSet'] = level;
      nextCfg['enableLiveDetAntiAttack'] = true;
      body['CardReaderCfg'] = nextCfg;
      final put = await client.digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: path,
        username: username,
        password: password,
        body: utf8.encode(jsonEncode(body)),
        contentType: 'application/json',
      );
      if (put.status >= 400) {
        return {'ok': false, 'error': 'PUT HTTP ${put.status}'};
      }
      return {
        'ok': true,
        'changed': true,
        'livingBodyDetect': true,
        'liveDetLevelSet': level,
        'enableLiveDetAntiAttack': true,
        'ready': true,
      };
    } catch (e) {
      return {'ok': false, 'error': '$e'};
    }
  }
}
