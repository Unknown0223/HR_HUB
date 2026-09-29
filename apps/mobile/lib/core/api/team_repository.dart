import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

final teamRepositoryProvider = Provider<TeamRepository>((ref) {
  return TeamRepository(ref.read(apiClientProvider));
});

/// Employee photos sit behind auth, so they are fetched with the session and cached per URL.
final teamPhotoProvider = FutureProvider.family<Uint8List?, String>((ref, url) {
  return ref.read(teamRepositoryProvider).photoBytes(url);
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
  }) =>
      _api.get('/team/$employeeId/timesheet', query: {
        'year': '$year',
        'month': '$month',
      });

  /// Location is only present while the employee is inside working hours.
  Future<Map<String, dynamic>> live(String employeeId) =>
      _api.get('/team/$employeeId/live');

  Future<Uint8List?> photoBytes(String url) async {
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
      return u.replace(scheme: base.scheme, host: base.host, port: base.port).toString();
    }
    return url;
  }
}
