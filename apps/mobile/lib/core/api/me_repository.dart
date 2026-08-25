import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

final meRepositoryProvider = Provider<MeRepository>((ref) {
  return MeRepository(ref.read(apiClientProvider));
});

class MeRepository {
  MeRepository(this._api);
  final ApiClient _api;

  Future<Map<String, dynamic>> today() => _api.get('/me/attendance/today');

  Future<Map<String, dynamic>> marks({String? from, String? to}) =>
      _api.get('/me/marks', query: {
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      });

  Future<Map<String, dynamic>> requests() => _api.get('/me/requests');

  Future<List<dynamic>> absenceTypes() async {
    final data = await _api.getDynamic('/me/absence-types');
    if (data is List) return data;
    return [];
  }

  Future<Map<String, dynamic>> createAbsence({
    required String absenceTypeId,
    required String startDate,
    required String endDate,
    String? note,
  }) =>
      _api.post('/me/absences', data: {
        'absenceTypeId': absenceTypeId,
        'startDate': startDate,
        'endDate': endDate,
        if (note != null && note.isNotEmpty) 'note': note,
      });

  Future<Map<String, dynamic>> inbox() => _api.get('/me/inbox');

  Future<Map<String, dynamic>> reviewAbsence(String id, String status) =>
      _api.patch('/me/inbox/absences/$id', data: {'status': status});

  Future<Map<String, dynamic>> reviewRequest(
    String id,
    String status, {
    String? reviewNote,
  }) =>
      _api.patch('/me/inbox/requests/$id', data: {
        'status': status,
        if (reviewNote != null) 'reviewNote': reviewNote,
      });

  Future<Map<String, dynamic>> punchGps({
    required double latitude,
    required double longitude,
    double? accuracy,
    String? direction,
  }) =>
      _api.post('/me/punches/gps', data: {
        'latitude': latitude,
        'longitude': longitude,
        if (accuracy != null) 'accuracy': accuracy,
        if (direction != null) 'direction': direction,
      });

  Future<Map<String, dynamic>> punchQr({
    required String qrCode,
    String? direction,
  }) =>
      _api.post('/me/punches/qr', data: {
        'qrCode': qrCode,
        if (direction != null) 'direction': direction,
      });

  Future<Map<String, dynamic>> punchFace({
    String? faceImageBase64,
    String? direction,
    bool mock = false,
  }) =>
      _api.post('/me/punches/face', data: {
        if (faceImageBase64 != null && faceImageBase64.isNotEmpty)
          'faceImageBase64': faceImageBase64,
        if (direction != null) 'direction': direction,
        if (mock) 'mock': true,
      });

  /// Prefer versioned mobile facade for tabel (days + marks + summary).
  Future<Map<String, dynamic>> tabel({int? year, int? month}) =>
      _api.get('/mobile/v1/attendance/tabel', query: {
        if (year != null) 'year': '$year',
        if (month != null) 'month': '$month',
      });

  Future<Map<String, dynamic>> calendar({int? year, int? month}) =>
      _api.get('/mobile/v1/attendance/calendar', query: {
        if (year != null) 'year': '$year',
        if (month != null) 'month': '$month',
      });

  Future<Map<String, dynamic>> teamToday() => _api.get('/me/team/today');

  Future<List<dynamic>> notifications({bool unreadOnly = false}) async {
    final data = await _api.getDynamic(
      '/me/notifications',
      query: unreadOnly ? {'unreadOnly': 'true'} : null,
    );
    if (data is List) return data;
    return [];
  }

  Future<void> markNotificationRead(String id) =>
      _api.patch('/me/notifications/$id/read');

  Future<void> markAllNotificationsRead() =>
      _api.patch('/me/notifications/read-all');

  Future<Map<String, dynamic>> payrollSummary() =>
      _api.get('/me/payroll/summary');
}
