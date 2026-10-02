import 'dart:io';

import 'package:flutter/services.dart';

/// Server ("internet") time derived from the HTTP `Date` header of API responses.
/// Punches are stamped by the server; the phone uses this only to show the same time
/// and to notice a manually changed device clock.
class ServerClock {
  ServerClock._();

  static const _channel = MethodChannel('hrhub/system');

  /// The phone clock may differ from the server by this much before we warn.
  static const tolerance = Duration(minutes: 2);

  static Duration? _offset;

  /// Server time minus device time; null until the first API response.
  static Duration? get offset => _offset;

  static DateTime now() => DateTime.now().add(_offset ?? Duration.zero);

  static bool get deviceClockWrong =>
      _offset != null && _offset!.abs() > tolerance;

  /// [sentAt]/[receivedAt] are device times around the request; the header only has
  /// whole seconds, so half a second is added back on average.
  static void observe(String? dateHeader, DateTime sentAt, DateTime receivedAt) {
    if (dateHeader == null || dateHeader.isEmpty) return;
    final DateTime server;
    try {
      server = HttpDate.parse(dateHeader);
    } catch (_) {
      return;
    }
    final rtt = receivedAt.difference(sentAt);
    if (rtt.isNegative || rtt > const Duration(seconds: 10)) return;
    final deviceMid = sentAt.add(rtt ~/ 2);
    _offset = server
        .add(const Duration(milliseconds: 500))
        .difference(deviceMid.toUtc());
  }

  /// Whether Android's "Set time automatically" (network time) is on; true elsewhere.
  static Future<bool> autoTimeEnabled() async {
    if (!Platform.isAndroid) return true;
    try {
      return await _channel.invokeMethod<bool>('autoTimeEnabled') ?? true;
    } catch (_) {
      return true;
    }
  }
}
