import 'package:dio/dio.dart';

/// Cloud office-link HTTP client (same contracts as tools/office-link/api_client.py).
class OfficeLinkApi {
  OfficeLinkApi({
    required this.apiUrl,
    Dio? dio,
  }) : _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 20),
                receiveTimeout: const Duration(seconds: 45),
                sendTimeout: const Duration(seconds: 45),
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'HRHUB-OfficeLink-Android/1.0',
                },
                validateStatus: (s) => s != null && s < 500,
              ),
            );

  final String apiUrl;
  final Dio _dio;

  bool isSuccess(int? code) => code != null && code >= 200 && code < 300;

  Options _auth({String? pairingToken, String? linkKey}) {
    final headers = <String, dynamic>{};
    final token = (pairingToken ?? '').trim();
    final key = (linkKey ?? '').trim();
    if (token.isNotEmpty) headers['X-Pairing-Token'] = token;
    if (key.isNotEmpty) headers['X-Device-Link-Key'] = key;
    return Options(headers: headers);
  }

  Future<({int status, dynamic data})> _req(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? pairingToken,
    String? linkKey,
  }) async {
    final base = apiUrl.replaceAll(RegExp(r'/$'), '');
    final url = path.startsWith('/') ? '$base$path' : '$base/$path';
    try {
      final res = await _dio.request<dynamic>(
        url,
        data: body,
        options: _auth(pairingToken: pairingToken, linkKey: linkKey).copyWith(
          method: method.toUpperCase(),
        ),
      );
      return (status: res.statusCode ?? 0, data: res.data);
    } on DioException catch (e) {
      final detail = e.error?.toString() ?? e.message ?? '$e';
      final tip = detail.contains('connection abort') ||
              detail.contains('Connection refused') ||
              detail.contains('Failed host lookup') ||
              detail.contains('SocketException') ||
              e.type == DioExceptionType.connectionError ||
              e.type == DioExceptionType.connectionTimeout
          ? 'Telefon Railway API ga ulana olmadi (internet yo‘q yoki uzildi). '
              'Ofis Wi‑Fi da internet borligini tekshiring; terminalga LAN yetishi kifoya emas.'
          : detail;
      return (status: 0, data: {'error': tip, 'message': tip});
    }
  }

  Future<({int status, dynamic data})> ping({
    required String tenant,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'GET',
      '/api/attendance/office-link/ping?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> createSession({
    required String tenant,
    String? pairingToken,
    String? linkKey,
    String? host,
    String? serial,
  }) {
    final body = <String, dynamic>{'tenantCode': tenant};
    if ((host ?? '').trim().isNotEmpty) body['host'] = host!.trim();
    if ((serial ?? '').trim().isNotEmpty) body['serial'] = serial!.trim();
    return _req(
      'POST',
      '/api/attendance/office-link/session',
      body: body,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> getSession({
    required String sessionId,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'GET',
      '/api/attendance/office-link/session/${Uri.encodeComponent(sessionId)}',
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> patchProgress({
    required String tenant,
    required String sessionId,
    String step = '',
    String message = '',
    int? percent,
    String? status,
    String? host,
    String? serial,
    String? deviceId,
    String? pairingToken,
    String? linkKey,
  }) {
    final body = <String, dynamic>{
      'tenantCode': tenant,
      'step': step,
      'message': message,
    };
    if (percent != null) body['percent'] = percent;
    if (status != null) body['status'] = status;
    if (host != null) body['host'] = host;
    if (serial != null) body['serial'] = serial;
    if (deviceId != null) body['deviceId'] = deviceId;
    return _req(
      'PATCH',
      '/api/attendance/office-link/session/${Uri.encodeComponent(sessionId)}/progress',
      body: body,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> listLocations({
    required String tenant,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'GET',
      '/api/attendance/office-link/locations?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> registerDevice({
    required String tenant,
    required Map<String, dynamic> device,
    required String username,
    required String password,
    String? locationId,
    String? pairingToken,
    String? linkKey,
  }) {
    final body = <String, dynamic>{
      'tenantCode': tenant,
      'host': device['host'],
      'port': device['port'] ?? 80,
      'username': username,
      'password': password,
      'serialNumber': device['serialNumber'] ?? '',
      'name': device['name'] ?? '',
      'model': device['model'] ?? '',
    };
    final loc = (locationId ?? '').trim();
    if (loc.isNotEmpty) body['locationId'] = loc;
    return _req(
      'POST',
      '/api/attendance/office-link/device',
      body: body,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> listDevices({
    required String tenant,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'GET',
      '/api/attendance/office-link/devices?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> reconnectDevice({
    required String tenant,
    required String deviceId,
    required String host,
    int port = 80,
    String? serialNumber,
    String? pairingToken,
    String? linkKey,
  }) {
    final body = <String, dynamic>{
      'tenantCode': tenant,
      'deviceId': deviceId,
      'host': host,
      'port': port,
    };
    final serial = (serialNumber ?? '').trim();
    if (serial.isNotEmpty) body['serialNumber'] = serial;
    return _req(
      'POST',
      '/api/attendance/office-link/reconnect',
      body: body,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> pendingFaces({
    required String tenant,
    required String deviceId,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'GET',
      '/api/attendance/office-link/devices/${Uri.encodeComponent(deviceId)}/pending-faces?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

    Future<({int status, dynamic data})> ackFaceSync({
    required String tenant,
    required String deviceId,
    required String faceSyncId,
    required bool ok,
    String? error,
    String action = 'upsert',
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'POST',
      '/api/attendance/office-link/devices/${Uri.encodeComponent(deviceId)}/faces/${Uri.encodeComponent(faceSyncId)}/ack?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      body: {
        'ok': ok,
        if (error != null) 'error': error,
        'action': action,
      },
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  Future<({int status, dynamic data})> ensurePush({
    required String tenant,
    required String deviceId,
    String? pairingToken,
    String? linkKey,
  }) {
    return _req(
      'POST',
      '/api/attendance/office-link/devices/${Uri.encodeComponent(deviceId)}/ensure-push?tenantCode=${Uri.encodeQueryComponent(tenant)}',
      body: {},
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
  }

  static List<Map<String, dynamic>> parseLocations(dynamic data) {
    if (data is! Map) return const [];
    final raw = data['locations'] ?? data['items'] ?? data['data'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  static List<Map<String, dynamic>> parseDevices(dynamic data) {
    if (data is! Map) return const [];
    final raw = data['devices'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
}
