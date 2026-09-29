import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

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

/// Collects several fixes from the platform GPS provider (not the fused
/// provider), rejects stale fixes and averages the most precise ones.
class LocationGuard {
  static const _channel = MethodChannel('hrhub/location_integrity');
  static const _maxFixAge = Duration(seconds: 30);

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

  Future<PreciseFix> acquire({
    Duration timeout = const Duration(seconds: 14),
    double targetAccuracy = 15,
    int minSamples = 3,
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

    final settings = Platform.isAndroid
        ? AndroidSettings(
            accuracy: LocationAccuracy.best,
            distanceFilter: 0,
            forceLocationManager: true,
            intervalDuration: const Duration(seconds: 1),
          )
        : const LocationSettings(
            accuracy: LocationAccuracy.best,
            distanceFilter: 0,
          );

    final samples = <Position>[];
    final done = Completer<void>();
    final sub = Geolocator.getPositionStream(locationSettings: settings).listen(
      (p) {
        if (DateTime.now().difference(p.timestamp).abs() > _maxFixAge) return;
        samples.add(p);
        onSample?.call(p, samples.length);
        final best = samples.map((s) => s.accuracy).reduce((a, b) => a < b ? a : b);
        if (samples.length >= minSamples && best <= targetAccuracy && !done.isCompleted) {
          done.complete();
        }
      },
      onError: (Object e) {
        if (!done.isCompleted) done.completeError(e);
      },
    );
    try {
      await done.future.timeout(timeout, onTimeout: () {});
    } finally {
      await sub.cancel();
    }

    if (samples.isEmpty) {
      throw LocationGuardException(
        'GPS signali topilmadi — ochiq joyga chiqib qayta urinib ko‘ring',
      );
    }

    final apps = await _scanApps();
    final integrity = LocationIntegrity(
      mockLocation: samples.any((s) => s.isMocked),
      activeMockApp: apps['activeMockApp'] as String?,
      mockApps: ((apps['mockApps'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      developerOptions: apps['developerOptions'] == true,
      provider: Platform.isAndroid ? 'android_gps' : 'ios_core_location',
    );

    // Inverse-variance weighted mean of fixes close to the best accuracy.
    final best = samples.map((s) => s.accuracy).reduce((a, b) => a < b ? a : b);
    final good = samples.where((s) => s.accuracy <= best * 1.5 + 1).toList();
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
