import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import '../time/server_clock.dart';

/// Device-side signals that the location may be spoofed.
class LocationIntegrity {
  const LocationIntegrity({
    required this.mockLocation,
    required this.activeMockApp,
    required this.mockApps,
    required this.developerOptions,
    required this.provider,
  });

  /// At least one fix was flagged by Android as coming from a mock provider.
  final bool mockLocation;

  /// App selected in Developer options as the mock location app.
  final String? activeMockApp;

  /// Installed (non-system) apps requesting ACCESS_MOCK_LOCATION.
  final List<String> mockApps;
  final bool developerOptions;
  final String provider;

  bool get flagged =>
      mockLocation || (activeMockApp != null && activeMockApp!.isNotEmpty);

  Map<String, dynamic> toJson() => {
        'mockLocation': mockLocation,
        if (activeMockApp != null) 'activeMockApp': activeMockApp,
        if (mockApps.isNotEmpty) 'mockApps': mockApps,
        'provider': provider,
      };
}

class PreciseFix {
  const PreciseFix({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.samples,
    required this.integrity,
  });

  final double latitude;
  final double longitude;
  final double accuracy;
  final int samples;
  final LocationIntegrity integrity;
}

class LocationGuardException implements Exception {
  LocationGuardException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Collects several fixes from the platform GPS provider, rejects stale fixes and
/// averages the most precise ones. Indoors, where a cold GPS can take half a minute,
/// a one-shot fused (Wi-Fi/cell assisted) fix is requested as well.
class LocationGuard {
  static const _channel = MethodChannel('hrhub/location_integrity');
  static const _maxFixAge = Duration(seconds: 30);
  static const _warmFor = Duration(minutes: 2);

  static final _recent = <Position>[];
  static StreamSubscription<Position>? _warmSub;
  static Timer? _warmStop;

  static LocationSettings _gpsSettings() => Platform.isAndroid
      ? AndroidSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 0,
          forceLocationManager: true,
          intervalDuration: const Duration(seconds: 1),
        )
      : const LocationSettings(accuracy: LocationAccuracy.best, distanceFilter: 0);

  static bool _fresh(Position p) =>
      ServerClock.now().difference(p.timestamp).abs() <= _maxFixAge;

  /// Starts the GPS ahead of a punch (home screen, app resume) so the punch screen
  /// finds fresh fixes instead of a cold start. Stops by itself after [_warmFor].
  static Future<void> warmUp() async {
    _warmStop?.cancel();
    _warmStop = Timer(_warmFor, stopWarmUp);
    if (_warmSub != null) return;
    try {
      if (!await Permission.locationWhenInUse.isGranted) return;
      if (!await Geolocator.isLocationServiceEnabled()) return;
      if (_warmSub != null) return;
      _warmSub = Geolocator.getPositionStream(locationSettings: _gpsSettings()).listen(
        _remember,
        onError: (Object _) => stopWarmUp(),
      );
    } catch (_) {
      stopWarmUp();
    }
  }

  static void stopWarmUp() {
    _warmStop?.cancel();
    _warmStop = null;
    _warmSub?.cancel();
    _warmSub = null;
  }

  static void _remember(Position p) {
    if (!_fresh(p) || _recent.any((s) => s.timestamp == p.timestamp)) return;
    _recent
      ..add(p)
      ..removeWhere((s) => !_fresh(s));
    if (_recent.length > 10) _recent.removeRange(0, _recent.length - 10);
  }

  Future<Map<String, dynamic>> _scanApps() async {
    if (!Platform.isAndroid) return const {};
    try {
      final res = await _channel.invokeMapMethod<String, dynamic>('scan');
      return res ?? const {};
    } on PlatformException {
      return const {};
    } on MissingPluginException {
      return const {};
    }
  }

  /// Stops as soon as [minSamples] fixes reach [targetAccuracy]; after [settleAfter]
  /// one fix within [acceptableAccuracy] is good enough (indoors GPS rarely gets below
  /// 15 m). Fresh fixes from [warmUp] count, so a warmed-up GPS answers at once. If the
  /// GPS has nothing usable after [fusedAfter], a fused fix is requested in parallel.
  Future<PreciseFix> acquire({
    Duration timeout = const Duration(seconds: 10),
    double targetAccuracy = 20,
    Duration settleAfter = const Duration(seconds: 3),
    double acceptableAccuracy = 50,
    int minSamples = 2,
    Duration fusedAfter = const Duration(seconds: 2),
    void Function(Position sample, int count)? onSample,
  }) async {
    final perm = await Permission.locationWhenInUse.request();
    if (!perm.isGranted) {
      throw LocationGuardException('Joylashuv ruxsati berilmadi');
    }
    final precise = await Geolocator.getLocationAccuracy();
    if (precise == LocationAccuracyStatus.reduced) {
      throw LocationGuardException(
        'Taxminiy joylashuv yoqilgan — sozlamalarda «Aniq joylashuv»ni yoqing',
      );
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw LocationGuardException('GPS o‘chirilgan — yoqing');
    }

    final appsScan = _scanApps();
    final samples = <Position>[];
    final fused = <Position>{};
    final done = Completer<void>();
    final started = Stopwatch()..start();
    double bestAccuracy() =>
        samples.map((s) => s.accuracy).reduce((a, b) => a < b ? a : b);
    void checkDone() {
      if (done.isCompleted || samples.isEmpty) return;
      final settled = started.elapsed >= settleAfter;
      if (!settled && samples.length < minSamples) return;
      if (bestAccuracy() <= (settled ? acceptableAccuracy : targetAccuracy)) {
        done.complete();
      }
    }

    void add(Position p, {bool isFused = false}) {
      if (done.isCompleted || !_fresh(p)) return;
      samples.add(p);
      if (isFused) fused.add(p);
      onSample?.call(p, samples.length);
      checkDone();
    }

    for (final p in _recent.where(_fresh)) {
      add(p);
    }

    final sub = Geolocator.getPositionStream(locationSettings: _gpsSettings()).listen(
      (p) {
        _remember(p);
        add(p);
      },
      onError: (Object e) {
        if (!done.isCompleted && samples.isEmpty) done.completeError(e);
      },
    );
    final settle = Timer(settleAfter, checkDone);
    final fusedTimer = Timer(fusedAfter, () {
      if (done.isCompleted || !Platform.isAndroid) return;
      if (samples.isNotEmpty && bestAccuracy() <= acceptableAccuracy) return;
      Geolocator.getCurrentPosition(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.best,
          forceLocationManager: false,
          timeLimit: timeout - fusedAfter,
        ),
      ).then((p) => add(p, isFused: true), onError: (Object _) {});
    });
    try {
      await done.future.timeout(timeout, onTimeout: () {});
    } finally {
      settle.cancel();
      fusedTimer.cancel();
      await sub.cancel();
    }

    if (samples.isEmpty) {
      throw LocationGuardException(
        'GPS signali topilmadi — ochiq joyga chiqib qayta urinib ko‘ring',
      );
    }

    // Inverse-variance weighted mean of fixes close to the best accuracy.
    final best = bestAccuracy();
    final good = samples.where((s) => s.accuracy <= best * 1.5 + 1).toList();

    final apps = await appsScan;
    final integrity = LocationIntegrity(
      mockLocation: samples.any((s) => s.isMocked),
      activeMockApp: apps['activeMockApp'] as String?,
      mockApps: ((apps['mockApps'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      developerOptions: apps['developerOptions'] == true,
      provider: !Platform.isAndroid
          ? 'ios_core_location'
          : good.any((s) => !fused.contains(s))
              ? 'android_gps'
              : 'android_fused',
    );
    var wSum = 0.0, lat = 0.0, lon = 0.0;
    for (final s in good) {
      final w = 1 / (s.accuracy * s.accuracy + 1);
      wSum += w;
      lat += s.latitude * w;
      lon += s.longitude * w;
    }
    return PreciseFix(
      latitude: lat / wSum,
      longitude: lon / wSum,
      accuracy: best,
      samples: samples.length,
      integrity: integrity,
    );
  }
}
