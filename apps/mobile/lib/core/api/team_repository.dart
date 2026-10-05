import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

final teamRepositoryProvider = Provider<TeamRepository>((ref) {
  return TeamRepository(ref.read(apiClientProvider));
});

/// Employee photos sit behind auth, so they are fetched with the session and cached per URL.
/// A failed fetch (cold start, token refresh, flaky network) is retried instead of being
/// cached as "no photo" for the rest of the session.
final teamPhotoProvider = FutureProvider.family<Uint8List?, String>((
  ref,
  url,
) async {
  final bytes = await ref.read(teamRepositoryProvider).photoBytes(url);
  if (bytes == null) {
    final retry = Timer(const Duration(seconds: 15), ref.invalidateSelf);
    ref.onDispose(retry.cancel);
  }
  return bytes;
});

/// Manager's view of the employees in the divisions they lead.
class TeamRepository {
  TeamRepository(this._api);
  final ApiClient _api;

  /// `{date, summary, items: [{employeeId, fullName, today, workingNow, location, ...}]}`
  Future<Map<String, dynamic>> list() => _api.get('/team');

  Future<Map<String, dynamic>> timesheet(
    String employeeId, {
    required int year,
    required int month,
  }) => _api.get(
    '/team/$employeeId/timesheet',
    query: {'year': '$year', 'month': '$month'},
  );

  /// Device mode: `{manager, livenessDirections, total, faceReady, items: [{employeeId, fullName, faceReady, firstIn, lastOut, ...}]}`.
  Future<Map<String, dynamic>> kiosk() => _api.get('/team/kiosk');

  /// One employee in front of the manager's phone, identified by face on the server.
  Future<Map<String, dynamic>> kioskPunch({
    required String direction,
    required double latitude,
    required double longitude,
    required double accuracy,
    required String selfieBase64,
    required String photoBase64,
    required List<String> livenessSteps,
    required int livenessDurationMs,
    required Map<String, dynamic> integrity,
    String? comment,
  }) => _api.post(
    '/team/kiosk/punch',
    data: {
      'direction': direction,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'selfieBase64': selfieBase64,
      'photoBase64': photoBase64,
      'liveness': {
        'passed': true,
        'steps': livenessSteps,
        'durationMs': livenessDurationMs,
      },
      'integrity': integrity,
      if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
    },
  );

  /// Location is only present while the employee is inside working hours.
  Future<Map<String, dynamic>> live(String employeeId) =>
      _api.get('/team/$employeeId/live');

  Future<Uint8List?> photoBytes(String url) async {
    if (url.startsWith('data:')) {
      try {
        return UriData.parse(url).contentAsBytes();
      } catch (_) {
        return null;
      }
    }
    try {
      final res = await _api.dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      final data = res.data;
      return data == null || data.isEmpty ? null : Uint8List.fromList(data);
    } catch (_) {
      return null;
    }
  }

  /// Media links point at the API host, which a phone cannot always reach;
  /// route loopback hosts through the configured base URL instead.
  String? mediaUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    final base = Uri.tryParse(_api.dio.options.baseUrl);
    if (base == null) return url;
    if (url.startsWith('/')) return base.resolve(url).toString();
    final u = Uri.tryParse(url);
    if (u == null) return url;
    if (u.host == 'localhost' || u.host == '127.0.0.1') {
      return u
          .replace(scheme: base.scheme, host: base.host, port: base.port)
          .toString();
    }
    return url;
  }
}
