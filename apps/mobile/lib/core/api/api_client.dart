import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../errors/api_exception.dart';
import '../time/server_clock.dart';
import 'api_config.dart';

class SessionTokens {
  const SessionTokens({required this.accessToken, required this.tenantId});
  final String accessToken;
  final String tenantId;
}

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  ),
);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref);
});

class ApiClient {
  ApiClient(this._ref) {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.defaultBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final storage = _ref.read(secureStorageProvider);
          final token = await storage.read(key: 'accessToken');
          final tenantId = await storage.read(key: 'tenantId');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          if (tenantId != null && tenantId.isNotEmpty) {
            options.headers['X-Tenant-Id'] = tenantId;
          }
          options.extra[_sentAtKey] = DateTime.now();
          return handler.next(options);
        },
        onResponse: (response, handler) {
          _observeClock(response);
          return handler.next(response);
        },
        onError: (error, handler) {
          final response = error.response;
          if (response != null) _observeClock(response);
          return handler.next(error);
        },
      ),
    );
  }

  static const _sentAtKey = 'hrhub.sentAt';

  final Ref _ref;
  late final Dio _dio;

  static void _observeClock(Response<dynamic> response) {
    final sentAt = response.requestOptions.extra[_sentAtKey];
    if (sentAt is! DateTime) return;
    ServerClock.observe(
      response.headers.value('date'),
      sentAt,
      DateTime.now(),
    );
  }

  Dio get dio => _dio;

  Future<void> setBaseUrl(String url) async {
    _dio.options.baseUrl = url;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('apiBaseUrl', url);
  }

  Future<void> restoreBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('apiBaseUrl');
    if (url != null && url.isNotEmpty) {
      _dio.options.baseUrl = url;
    }
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final res = await _dio.post(path, data: data);
      return _asMap(res.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final res = await _dio.get(path, queryParameters: query);
      return _asMap(res.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<dynamic> getDynamic(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final res = await _dio.get(path, queryParameters: query);
      return res.data;
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final res = await _dio.patch(path, data: data);
      return _asMap(res.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<Map<String, dynamic>> delete(String path) async {
    try {
      final res = await _dio.delete(path);
      return _asMap(res.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {'data': data};
  }

  static const _knownMessages = <String, String>{
    'User is not linked to an active employee (email must match)':
        'Hisobingiz faol xodim kartasiga bog‘lanmagan. HR bo‘limidan xodim '
            'kartasiga login emailingizni kiritishni so‘rang.',
    'Tenant required': 'Kompaniya tanlanmagan — qaytadan kiring.',
    'Unauthorized': 'Sessiya tugagan — qaytadan kiring.',
  };

  ApiException _mapError(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    String message;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        message = 'Server javob bermayapti. Internetni tekshirib, qayta urinib ko‘ring.';
      case DioExceptionType.connectionError:
        message = 'Serverga ulanib bo‘lmadi. Server manzili va internetni tekshiring.';
      default:
        message = e.message ?? 'Tarmoq xatosi';
    }
    if (data is Map) {
      final msg = data['message'];
      if (msg is String) {
        message = msg;
      } else if (msg is List && msg.isNotEmpty) {
        message = msg.join(', ');
      }
    }
    return ApiException(
      _knownMessages[message] ?? message,
      statusCode: status,
      serverMessage: message,
      code: data is Map ? data['code']?.toString() : null,
      details: data is Map ? Map<String, dynamic>.from(data) : null,
    );
  }
}
