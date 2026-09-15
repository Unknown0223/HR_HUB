import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:xml/xml.dart';

import '../security/passwords.dart';

const kUnauthorized = 'unauthorized';
const kOk = 'ok';
const kTimeout = 'timeout';
const kOffline = 'offline';
const kError = 'error';

class ProbeResult {
  const ProbeResult({
    required this.kind,
    this.message = '',
    this.host = '',
    this.port = 80,
    this.name = '',
    this.serialNumber = '',
    this.model = '',
  });

  final String kind;
  final String message;
  final String host;
  final int port;
  final String name;
  final String serialNumber;
  final String model;
}

class DeviceState {
  const DeviceState({
    required this.state,
    this.label = '',
    this.host = '',
    this.port = 80,
    this.name = '',
    this.serialNumber = '',
    this.model = '',
    this.detail = '',
  });

  /// new | configured | unknown
  final String state;
  final String label;
  final String host;
  final int port;
  final String name;
  final String serialNumber;
  final String model;
  final String detail;
}

String stateLabelUz(String state) {
  switch (state) {
    case 'new':
      return 'Yangi';
    case 'configured':
      return 'Admin bor';
    default:
      return 'Noma\'lum';
  }
}

bool validIp(String ip) {
  final parts = ip.trim().split('.');
  if (parts.length != 4) return false;
  for (final p in parts) {
    final n = int.tryParse(p);
    if (n == null || n < 0 || n > 255) return false;
  }
  return true;
}

String? ipv4Prefix(String? ip) {
  if (ip == null || !validIp(ip)) return null;
  if (ip.startsWith('127.') || ip.startsWith('169.254.')) return null;
  final parts = ip.split('.');
  return '${parts[0]}.${parts[1]}.${parts[2]}';
}

bool sameSubnet(String a, String b) {
  final pa = ipv4Prefix(a);
  final pb = ipv4Prefix(b);
  return pa != null && pb != null && pa == pb;
}

Map<String, String> parseWwwAuthenticate(String header) {
  final out = <String, String>{};
  if (header.trim().isEmpty) return out;
  var body = header.trim();
  if (body.toLowerCase().startsWith('digest')) {
    body = body.substring(6).trim();
  }
  for (final m in RegExp(r'([a-zA-Z]+)="([^"]*)"').allMatches(body)) {
    out[m.group(1)!.toLowerCase()] = m.group(2)!;
  }
  for (final m in RegExp(r'([a-zA-Z]+)=([^,\s"]+)').allMatches(body)) {
    final key = m.group(1)!.toLowerCase();
    out.putIfAbsent(key, () => m.group(2)!.trim());
  }
  return out;
}

String _md5Hex(String text) => md5.convert(utf8.encode(text)).toString();

String buildDigestHeader({
  required Map<String, String> challenge,
  required String username,
  required String password,
  required String method,
  required String uri,
  String nc = '00000001',
  String? cnonce,
}) {
  final realm = challenge['realm'] ?? '';
  final nonce = challenge['nonce'] ?? '';
  final qop = (challenge['qop'] ?? '').split(',').first.trim();
  final opaque = challenge['opaque'] ?? '';
  final algorithm = challenge['algorithm'] ?? 'MD5';
  final cn = cnonce ??
      List.generate(8, (_) => Random.secure().nextInt(256))
          .map((b) => b.toRadixString(16).padLeft(2, '0'))
          .join();
  final ha1 = _md5Hex('$username:$realm:$password');
  final ha2 = _md5Hex('${method.toUpperCase()}:$uri');
  final response = qop.isNotEmpty
      ? _md5Hex('$ha1:$nonce:$nc:$cn:$qop:$ha2')
      : _md5Hex('$ha1:$nonce:$ha2');
  final parts = <String>[
    'username="$username"',
    'realm="$realm"',
    'nonce="$nonce"',
    'uri="$uri"',
    'response="$response"',
    'algorithm="$algorithm"',
  ];
  if (qop.isNotEmpty) {
    parts.addAll(['qop=$qop', 'nc=$nc', 'cnonce="$cn"']);
  }
  if (opaque.isNotEmpty) parts.add('opaque="$opaque"');
  return 'Digest ${parts.join(', ')}';
}

String _xmlText(XmlDocument doc, List<String> names) {
  for (final el in doc.descendants.whereType<XmlElement>()) {
    final tag = el.name.local;
    if (names.contains(tag) && el.innerText.trim().isNotEmpty) {
      return el.innerText.trim();
    }
  }
  return '';
}

Future<List<int>> _readHttpBytes(HttpClientResponse response) async {
  final builder = BytesBuilder(copy: false);
  await for (final chunk in response) {
    builder.add(chunk);
  }
  return builder.takeBytes();
}

/// LAN-friendly HTTP via dart:io (Windows discovery.py style).
class HikvisionClient {
  Future<bool> tcpOpen(
    String host, {
    int port = 80,
    Duration timeout = const Duration(milliseconds: 800),
  }) async {
    try {
      final socket = await Socket.connect(host, port, timeout: timeout);
      await socket.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<({int status, Map<String, String> headers, Uint8List body})> httpRequest({
    required String host,
    required int port,
    required String method,
    required String path,
    Map<String, String>? headers,
    List<int>? body,
    String? contentType,
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final client = HttpClient();
    client.connectionTimeout = timeout;
    client.idleTimeout = timeout;
    try {
      final req = await client.openUrl(
        method.toUpperCase(),
        Uri.parse('http://$host:$port$path'),
      );
      req.headers.set(HttpHeaders.acceptHeader, '*/*');
      req.followRedirects = false;
      if (headers != null) {
        headers.forEach((k, v) => req.headers.set(k, v));
      }
      if (body != null) {
        req.headers.set(
          HttpHeaders.contentTypeHeader,
          contentType ?? 'application/xml',
        );
        req.contentLength = body.length;
        req.add(body);
      }
      final res = await req.close().timeout(timeout);
      final bytes = await _readHttpBytes(res).timeout(timeout);
      final h = <String, String>{};
      res.headers.forEach((name, values) {
        if (values.isNotEmpty) h[name.toLowerCase()] = values.join(', ');
      });
      return (status: res.statusCode, headers: h, body: Uint8List.fromList(bytes));
    } on TimeoutException {
      throw TimeoutException('timeout');
    } on SocketException catch (e) {
      throw OfflineException(e.message);
    } on HttpException catch (e) {
      throw OfflineException(e.message);
    } on IOException catch (e) {
      throw OfflineException('$e');
    } finally {
      client.close(force: true);
    }
  }

  Future<({int status, Map<String, String> headers, Uint8List body})> digestRequest({
    required String host,
    required int port,
    required String method,
    required String path,
    required String username,
    required String password,
    List<int>? body,
    String contentType = 'application/xml',
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final first = await httpRequest(
      host: host,
      port: port,
      method: method,
      path: path,
      body: body,
      contentType: contentType,
      timeout: timeout,
    );
    final www = first.headers['www-authenticate'] ?? '';
    if (first.status != 401 || !www.toLowerCase().contains('digest')) {
      return first;
    }
    final challenge = parseWwwAuthenticate(www);
    final auth = buildDigestHeader(
      challenge: challenge,
      username: username,
      password: password,
      method: method,
      uri: path,
    );
    return httpRequest(
      host: host,
      port: port,
      method: method,
      path: path,
      headers: {'Authorization': auth},
      body: body,
      contentType: contentType,
      timeout: timeout,
    );
  }

  Future<ProbeResult> probeOnline(String host, {int port = 80}) async {
    if (!validIp(host)) {
      return const ProbeResult(kind: kError, message: 'IP noto‘g‘ri');
    }
    try {
      final open = await tcpOpen(host, port: port, timeout: const Duration(seconds: 2));
      if (!open) {
        return ProbeResult(
          kind: kOffline,
          host: host,
          port: port,
          message: 'Port $port yopiq / yetib bo‘lmadi',
        );
      }
      final r = await httpRequest(
        host: host,
        port: port,
        method: 'GET',
        path: '/ISAPI/System/deviceInfo',
        timeout: const Duration(seconds: 5),
      );
      final text = utf8.decode(r.body, allowMalformed: true);
      var name = '';
      var serial = '';
      var model = '';
      try {
        final doc = XmlDocument.parse(text);
        name = _xmlText(doc, ['deviceName', 'DeviceName']);
        serial = _xmlText(doc, ['serialNumber', 'SerialNumber']);
        model = _xmlText(doc, ['model', 'Model']);
      } catch (_) {}
      if (r.status == 401) {
        return ProbeResult(
          kind: kOk,
          host: host,
          port: port,
          message: 'Digest kerak',
          name: name,
          serialNumber: serial,
          model: model,
        );
      }
      if (r.status >= 200 && r.status < 400) {
        return ProbeResult(
          kind: kOk,
          host: host,
          port: port,
          name: name,
          serialNumber: serial,
          model: model,
        );
      }
      return ProbeResult(
        kind: kError,
        host: host,
        port: port,
        message: 'HTTP ${r.status}',
      );
    } on TimeoutException {
      return ProbeResult(kind: kTimeout, host: host, port: port, message: 'Timeout');
    } on OfflineException catch (e) {
      return ProbeResult(kind: kOffline, host: host, port: port, message: e.message);
    } catch (e) {
      return ProbeResult(kind: kError, host: host, port: port, message: '$e');
    }
  }

  Future<DeviceState> detectState(String host, {int port = 80}) async {
    final probe = await probeOnline(host, port: port);
    if (probe.kind != kOk) {
      return DeviceState(
        state: 'unknown',
        label: stateLabelUz('unknown'),
        host: host,
        port: port,
        name: probe.name,
        serialNumber: probe.serialNumber,
        model: probe.model,
        detail: '${probe.kind}: ${probe.message}',
      );
    }
    // 401 Digest without body parse = configured admin device.
    if (probe.message.toLowerCase().contains('digest')) {
      return DeviceState(
        state: 'configured',
        label: stateLabelUz('configured'),
        host: host,
        port: port,
        name: probe.name,
        serialNumber: probe.serialNumber,
        model: probe.model,
        detail: 'HTTP 401 Digest',
      );
    }
    return DeviceState(
      state: 'new',
      label: stateLabelUz('new'),
      host: host,
      port: port,
      name: probe.name,
      serialNumber: probe.serialNumber,
      model: probe.model,
      detail: 'probe ok',
    );
  }

  Future<ProbeResult> verifyPassword({
    required String host,
    required int port,
    required String username,
    required String password,
  }) async {
    try {
      final r = await digestRequest(
        host: host,
        port: port,
        method: 'GET',
        path: '/ISAPI/System/deviceInfo',
        username: username,
        password: password,
        timeout: const Duration(seconds: 8),
      );
      if (r.status == 401) {
        return ProbeResult(
          kind: kUnauthorized,
          host: host,
          port: port,
          message: 'Parol noto‘g‘ri',
        );
      }
      if (r.status >= 400) {
        return ProbeResult(kind: kError, host: host, port: port, message: 'HTTP ${r.status}');
      }
      final text = utf8.decode(r.body, allowMalformed: true);
      var name = '';
      var serial = '';
      var model = '';
      try {
        final doc = XmlDocument.parse(text);
        name = _xmlText(doc, ['deviceName', 'DeviceName']);
        serial = _xmlText(doc, ['serialNumber', 'SerialNumber']);
        model = _xmlText(doc, ['model', 'Model']);
      } catch (_) {}
      return ProbeResult(
        kind: kOk,
        host: host,
        port: port,
        name: name,
        serialNumber: serial,
        model: model,
      );
    } on TimeoutException {
      return ProbeResult(kind: kTimeout, host: host, port: port, message: 'Timeout');
    } on OfflineException catch (e) {
      return ProbeResult(kind: kOffline, host: host, port: port, message: e.message);
    } catch (e) {
      return ProbeResult(kind: kError, host: host, port: port, message: '$e');
    }
  }

  Future<String> resolveSecurityUserId({
    required String host,
    required int port,
    required String username,
    required String password,
  }) async {
    try {
      final r = await digestRequest(
        host: host,
        port: port,
        method: 'GET',
        path: '/ISAPI/Security/users',
        username: username,
        password: password,
        timeout: const Duration(seconds: 10),
      );
      if (r.status >= 400 || r.body.isEmpty) return '1';
      final doc = XmlDocument.parse(utf8.decode(r.body, allowMalformed: true));
      final wanted = username.toLowerCase();
      var fallback = '1';
      for (final el in doc.descendants.whereType<XmlElement>()) {
        if (el.name.local != 'User') continue;
        var uid = '';
        var uname = '';
        for (final child in el.childElements) {
          if (child.name.local == 'id') uid = child.innerText.trim();
          if (child.name.local == 'userName') uname = child.innerText.trim();
        }
        if (uid.isNotEmpty) fallback = uid;
        if (uname.toLowerCase() == wanted && uid.isNotEmpty) return uid;
      }
      return fallback;
    } catch (_) {
      return '1';
    }
  }

  Future<Map<String, dynamic>> changeAdminPassword({
    required String host,
    required int port,
    required String username,
    required String oldPassword,
    required String newPassword,
  }) async {
    final user = username.trim().isEmpty ? 'admin' : username.trim();
    final oldPwd = oldPassword.trim();
    final newPwd = newPassword.trim();
    if (host.isEmpty || oldPwd.isEmpty || newPwd.isEmpty) {
      return {'ok': false, 'reason': 'missing', 'message': 'Parol yoki host yo‘q'};
    }
    final rule = hikvisionPasswordError(newPwd, username: user);
    if (rule != null) {
      return {'ok': false, 'reason': 'policy', 'message': rule};
    }
    try {
      final uid = await resolveSecurityUserId(
        host: host,
        port: port,
        username: user,
        password: oldPwd,
      );
      final xml = '<?xml version="1.0" encoding="UTF-8"?>'
          '<User>'
          '<id>${xmlEscape(uid)}</id>'
          '<userName>${xmlEscape(user)}</userName>'
          '<password>${xmlEscape(newPwd)}</password>'
          '<loginPassword>${xmlEscape(oldPwd)}</loginPassword>'
          '<userLevel>Administrator</userLevel>'
          '</User>';
      final r = await digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: '/ISAPI/Security/users/$uid',
        username: user,
        password: oldPwd,
        body: utf8.encode(xml),
        timeout: const Duration(seconds: 15),
      );
      if (r.status == 401) {
        return {
          'ok': false,
          'reason': kUnauthorized,
          'message': 'Joriy parol noto‘g‘ri yoki ruxsat yo‘q',
        };
      }
      if (r.status >= 400) {
        final detail = utf8.decode(r.body, allowMalformed: true);
        return {
          'ok': false,
          'reason': kError,
          'message':
              'Terminal parolni rad etdi (HTTP ${r.status}): ${detail.length > 200 ? detail.substring(0, 200) : detail}',
        };
      }
      final check = await verifyPassword(
        host: host,
        port: port,
        username: user,
        password: newPwd,
      );
      if (check.kind != kOk) {
        return {
          'ok': false,
          'reason': check.kind,
          'message': 'Parol o‘zgardi, lekin yangi parol bilan kirib bo‘lmadi',
        };
      }
      return {'ok': true};
    } on TimeoutException {
      return {'ok': false, 'reason': kTimeout, 'message': 'Tarmoq kutish vaqti tugadi'};
    } on OfflineException catch (e) {
      return {'ok': false, 'reason': kOffline, 'message': e.message};
    } catch (e) {
      return {'ok': false, 'reason': kError, 'message': '$e'};
    }
  }

  /// Configure terminal to POST punches to Railway (HttpHostNotification).
  Future<Map<String, dynamic>> configureHttpHostNotification({
    required String host,
    required int port,
    required String username,
    required String password,
    required String apiHostName,
    required int apiPort,
    required String urlPath,
    String protocolType = 'HTTPS',
  }) async {
    final pathClean = urlPath.startsWith('/') ? urlPath : '/$urlPath';
    final jsonBody = jsonEncode({
      'HttpHostNotification': {
        'id': '1',
        'url': pathClean,
        'protocolType': protocolType,
        'parameterFormatType': 'JSON',
        'addressingFormatType': 'hostname',
        'hostName': apiHostName,
        'portNo': apiPort,
        'httpAuthenticationMethod': 'none',
      },
    });
    final xmlBody = '<?xml version="1.0" encoding="UTF-8"?>'
        '<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">'
        '<HttpHostNotification>'
        '<id>1</id>'
        '<url>${xmlEscape(pathClean)}</url>'
        '<protocolType>${xmlEscape(protocolType)}</protocolType>'
        '<parameterFormatType>JSON</parameterFormatType>'
        '<addressingFormatType>hostname</addressingFormatType>'
        '<hostName>${xmlEscape(apiHostName)}</hostName>'
        '<portNo>$apiPort</portNo>'
        '<httpAuthenticationMethod>none</httpAuthenticationMethod>'
        '</HttpHostNotification>'
        '</HttpHostNotificationList>';

    Future<Map<String, dynamic>> attempt({
      required String path,
      required List<int> body,
      required String contentType,
    }) async {
      final r = await digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: path,
        username: username,
        password: password,
        body: body,
        contentType: contentType,
        timeout: const Duration(seconds: 15),
      );
      if (r.status < 400) return {'ok': true, 'status': r.status, 'path': path};
      return {
        'ok': false,
        'status': r.status,
        'path': path,
        'body': utf8.decode(r.body, allowMalformed: true),
      };
    }

    try {
      var res = await attempt(
        path: '/ISAPI/Event/notification/httpHosts/1?format=json',
        body: utf8.encode(jsonBody),
        contentType: 'application/json',
      );
      if (res['ok'] == true) return res;
      res = await attempt(
        path: '/ISAPI/Event/notification/httpHosts?format=json',
        body: utf8.encode(jsonEncode({
          'HttpHostNotificationList': {
            'HttpHostNotification': [
              jsonDecode(jsonBody)['HttpHostNotification'],
            ],
          },
        })),
        contentType: 'application/json',
      );
      if (res['ok'] == true) return res;
      res = await attempt(
        path: '/ISAPI/Event/notification/httpHosts',
        body: utf8.encode(xmlBody),
        contentType: 'application/xml',
      );
      return res;
    } on TimeoutException {
      return {'ok': false, 'reason': kTimeout, 'message': 'Timeout'};
    } on OfflineException catch (e) {
      return {'ok': false, 'reason': kOffline, 'message': e.message};
    } catch (e) {
      return {'ok': false, 'reason': kError, 'message': '$e'};
    }
  }

  /// Upsert person + enroll face JPEG (base64) on LAN terminal.
  Future<Map<String, dynamic>> enrollFace({
    required String host,
    required int port,
    required String username,
    required String password,
    required String employeeNo,
    required String employeeName,
    required String faceBase64,
  }) async {
    final emp = employeeNo.replaceAll(RegExp(r'\D'), '');
    final no = emp.isEmpty ? employeeNo.trim() : emp;
    if (no.isEmpty) {
      return {'ok': false, 'message': 'employeeNo empty'};
    }
    final name = employeeName.trim().isEmpty ? no : employeeName.trim();
    var b64 = faceBase64.trim();
    if (b64.contains(',')) b64 = b64.split(',').last.trim();
    if (b64.isEmpty) return {'ok': false, 'message': 'empty face'};

    try {
      final userXml = '<?xml version="1.0" encoding="UTF-8"?>'
          '<UserInfo>'
          '<employeeNo>${xmlEscape(no)}</employeeNo>'
          '<name>${xmlEscape(name)}</name>'
          '<userType>normal</userType>'
          '<Valid>'
          '<enable>true</enable>'
          '<beginTime>2020-01-01T00:00:00</beginTime>'
          '<endTime>2037-12-31T23:59:59</endTime>'
          '</Valid>'
          '<doorRight>1</doorRight>'
          '<RightPlan><doorNo>1</doorNo><planTemplateNo>1</planTemplateNo></RightPlan>'
          '</UserInfo>';
      final u = await digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: '/ISAPI/AccessControl/UserInfo/Record?format=json',
        username: username,
        password: password,
        body: utf8.encode(jsonEncode({
          'UserInfo': {
            'employeeNo': no,
            'name': name,
            'userType': 'normal',
            'Valid': {
              'enable': true,
              'beginTime': '2020-01-01T00:00:00',
              'endTime': '2037-12-31T23:59:59',
            },
            'doorRight': '1',
            'RightPlan': [
              {'doorNo': 1, 'planTemplateNo': 1},
            ],
          },
        })),
        contentType: 'application/json',
        timeout: const Duration(seconds: 20),
      );
      if (u.status >= 400) {
        await digestRequest(
          host: host,
          port: port,
          method: 'PUT',
          path: '/ISAPI/AccessControl/UserInfo/Record',
          username: username,
          password: password,
          body: utf8.encode(userXml),
          contentType: 'application/xml',
          timeout: const Duration(seconds: 20),
        );
      }

      final faceJson = jsonEncode({
        'faceURL': '',
        'faceLibType': 'blackFD',
        'FDID': '1',
        'FPID': no,
        'employeeNo': no,
        'name': name,
        'faceLib': {
          'faceLibType': 'blackFD',
          'FDID': '1',
        },
        'FaceDataRecord': {
          'faceLibType': 'blackFD',
          'FDID': '1',
          'FPID': no,
          'employeeNo': no,
          'name': name,
          'faceURL': '',
        },
      });
      // Prefer FaceDataRecord with embedded base64 when firmware accepts it.
      final facePayload = jsonEncode({
        'faceLibType': 'blackFD',
        'FDID': '1',
        'FPID': no,
        'employeeNo': no,
        'name': name,
        'faceURL': 'data:image/jpeg;base64,$b64',
      });
      var f = await digestRequest(
        host: host,
        port: port,
        method: 'POST',
        path: '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
        username: username,
        password: password,
        body: utf8.encode(facePayload),
        contentType: 'application/json',
        timeout: const Duration(seconds: 30),
      );
      if (f.status < 400 ||
          utf8.decode(f.body, allowMalformed: true).contains('deviceUserAlreadyExistFace')) {
        return {'ok': true};
      }
      // Fallback: put face image as raw multipart-ish JSON record without URL.
      f = await digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: '/ISAPI/Intelligent/FDLib/FDSetUp?format=json',
        username: username,
        password: password,
        body: utf8.encode(faceJson),
        contentType: 'application/json',
        timeout: const Duration(seconds: 20),
      );
      if (f.status < 400) return {'ok': true};
      return {
        'ok': false,
        'message': 'Face enroll HTTP ${f.status}: ${utf8.decode(f.body, allowMalformed: true).substring(0, 180)}',
      };
    } on TimeoutException {
      return {'ok': false, 'reason': kTimeout, 'message': 'Timeout'};
    } on OfflineException catch (e) {
      return {'ok': false, 'reason': kOffline, 'message': e.message};
    } catch (e) {
      return {'ok': false, 'reason': kError, 'message': '$e'};
    }
  }

  /// Remove person from terminal (frees face memory).
  Future<Map<String, dynamic>> deleteUser({
    required String host,
    required int port,
    required String username,
    required String password,
    required String employeeNo,
  }) async {
    final emp = employeeNo.replaceAll(RegExp(r'\D'), '');
    final no = emp.isEmpty ? employeeNo.trim() : emp;
    if (no.isEmpty) return {'ok': false, 'message': 'employeeNo empty'};
    try {
      final payload = {
        'UserInfoDelCond': {
          'EmployeeNoList': [
            {'employeeNo': no},
          ],
        },
      };
      final r = await digestRequest(
        host: host,
        port: port,
        method: 'PUT',
        path: '/ISAPI/AccessControl/UserInfo/Delete?format=json',
        username: username,
        password: password,
        body: utf8.encode(jsonEncode(payload)),
        contentType: 'application/json',
        timeout: const Duration(seconds: 20),
      );
      final text = utf8.decode(r.body, allowMalformed: true).toLowerCase();
      if (r.status < 400 ||
          text.contains('employeenotexist') ||
          text.contains('usernotexist') ||
          text.contains('invalidoperation')) {
        return {'ok': true};
      }
      return {
        'ok': false,
        'message': 'Delete HTTP ${r.status}: ${text.substring(0, text.length.clamp(0, 160))}',
      };
    } on TimeoutException {
      return {'ok': false, 'reason': kTimeout, 'message': 'Timeout'};
    } on OfflineException catch (e) {
      return {'ok': false, 'reason': kOffline, 'message': e.message};
    } catch (e) {
      return {'ok': false, 'reason': kError, 'message': '$e'};
    }
  }
}

class TimeoutException implements Exception {
  TimeoutException(this.message);
  final String message;
}

class OfflineException implements Exception {
  OfflineException(this.message);
  final String message;
}
