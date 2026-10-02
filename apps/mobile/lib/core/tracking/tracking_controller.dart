import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../app_version.dart';
import '../errors/api_exception.dart';

/// Native side of background GPS (see TrackingService.kt).
class TrackingNativeStatus {
  const TrackingNativeStatus(this.raw);
  final Map<String, dynamic> raw;

  bool get running => raw['running'] == true;
  bool get enabled => raw['enabled'] == true;
  bool get hasToken => raw['hasToken'] == true;
  String? get state => raw['state']?.toString();
  String? get windowReason => raw['windowReason']?.toString();
  bool get batteryOptimizationIgnored => raw['batteryOptimizationIgnored'] == true;
  int get sentTotal => (raw['sentTotal'] as num?)?.toInt() ?? 0;
  String? get model => raw['model']?.toString();

  DateTime? _ms(String key) {
    final v = (raw[key] as num?)?.toInt() ?? 0;
    return v > 0 ? DateTime.fromMillisecondsSinceEpoch(v) : null;
  }

  DateTime? get lastSentAt => _ms('lastSentAt');
  DateTime? get lastFixAt => _ms('lastFixAt');
}

class TrackingController {
  TrackingController(this._ref);

  static const _channel = MethodChannel('hrhub/tracking');
  final Ref _ref;

  ApiClient get _api => _ref.read(apiClientProvider);

  Future<TrackingNativeStatus> nativeStatus() async {
    try {
      final res = await _channel.invokeMapMethod<String, dynamic>('status');
      return TrackingNativeStatus(res ?? const {});
    } on MissingPluginException {
      return const TrackingNativeStatus({});
    }
  }

  /// Registers this phone once per login and keeps the foreground service alive.
  /// Users without a linked employee card are simply not tracked.
  Future<void> ensureStarted() => _pending ??= _ensureStarted().whenComplete(() => _pending = null);

  Future<void>? _pending;

  Future<void> _ensureStarted() async {
    final status = await nativeStatus();
    final baseUrl = _api.dio.options.baseUrl;
    try {
      if (status.enabled && status.hasToken) {
        if (!status.running) await _channel.invokeMethod('start', {'baseUrl': baseUrl});
        return;
      }
      final res = await _api.post('/tracking/register', data: {
        'platform': 'android',
        if (status.model != null) 'model': status.model,
        'appVersion': appVersion,
      });
      final token = res['token']?.toString();
      if (token == null || token.isEmpty) return;
      await _channel.invokeMethod('start', {'baseUrl': baseUrl, 'token': token});
    } on ApiException {
      return;
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    }
  }

  Future<void> stop() async {
    try {
      await _api.post('/tracking/revoke');
    } catch (_) {}
    try {
      await _channel.invokeMethod('stop');
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> serverStatus() async {
    try {
      return await _api.get('/tracking/me');
    } catch (_) {
      return null;
    }
  }

  Future<bool> openAutostartSettings() async {
    try {
      return await _channel.invokeMethod<bool>('openAutostartSettings') ?? false;
    } catch (_) {
      return false;
    }
  }
}

final trackingControllerProvider = Provider<TrackingController>((ref) => TrackingController(ref));
