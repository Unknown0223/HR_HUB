import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

final meRepositoryProvider = Provider<MeRepository>((ref) {
  return MeRepository(ref.read(apiClientProvider));
});

class MeRepository {
  MeRepository(this._api);
  final ApiClient _api;

  Future<Map<String, dynamic>> today() => _api.get('/me/attendance/today');

  Future<Map<String, dynamic>> marks({String? from, String? to}) => _api.get(
    '/me/marks',
    query: {if (from != null) 'from': from, if (to != null) 'to': to},
  );

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
    String? startTime,
    String? endTime,
    String? note,
  }) => _api.post(
    '/me/absences',
    data: {
      'absenceTypeId': absenceTypeId,
      'startDate': startDate,
      'endDate': endDate,
      if (startTime != null) 'startTime': startTime,
      if (endTime != null) 'endTime': endTime,
      if (note != null && note.isNotEmpty) 'note': note,
    },
  );

  Future<Map<String, dynamic>> inbox() => _api.get('/me/inbox');

  Future<Map<String, dynamic>> reviewAbsence(String id, String status) =>
      _api.patch('/me/inbox/absences/$id', data: {'status': status});

  Future<Map<String, dynamic>> reviewRequest(
    String id,
    String status, {
    String? reviewNote,
  }) => _api.patch(
    '/me/inbox/requests/$id',
    data: {'status': status, if (reviewNote != null) 'reviewNote': reviewNote},
  );

  /// `{configured, inside, commentRequired, distanceM, radiusM, locationName}`
  Future<Map<String, dynamic>> checkGps({
    required double latitude,
    required double longitude,
  }) => _api.post(
    '/me/punches/gps/check',
    data: {'latitude': latitude, 'longitude': longitude},
  );

  /// Phone punch: explicit IN/OUT, composite photo report, liveness steps.
  Future<Map<String, dynamic>> punchMobile({
    required String direction,
    required double latitude,
    required double longitude,
    required double accuracy,
    required String photoBase64,
    required List<String> livenessSteps,
    required int livenessDurationMs,
    required Map<String, dynamic> integrity,
    String? comment,
  }) => _api.post(
    '/me/punches/mobile',
    data: {
      'direction': direction,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'photoBase64': photoBase64,
      'liveness': {
        'passed': true,
        'steps': livenessSteps,
        'durationMs': livenessDurationMs,
      },
      'integrity': integrity,
      if (comment != null && comment.trim().isNotEmpty)
        'comment': comment.trim(),
    },
  );

  /// `{ok, blocked, message}` — message is the warning to show the employee.
  Future<Map<String, dynamic>> reportMockLocation({
    required Map<String, dynamic> integrity,
    double? latitude,
    double? longitude,
  }) => _api.post(
    '/me/security/mock-location',
    data: {
      'integrity': integrity,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
    },
  );

  /// Prefer versioned mobile facade for tabel (days + marks + summary).
  Future<Map<String, dynamic>> tabel({int? year, int? month}) => _api.get(
    '/mobile/v1/attendance/tabel',
    query: {
      if (year != null) 'year': '$year',
      if (month != null) 'month': '$month',
    },
  );

  Future<Map<String, dynamic>> calendar({int? year, int? month}) => _api.get(
    '/mobile/v1/attendance/calendar',
    query: {
      if (year != null) 'year': '$year',
      if (month != null) 'month': '$month',
    },
  );

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

  /// `{period, totals: {accrued, withheld, advances, due}, accruals, withholdings, periodAdvances, baseSalary}`
  Future<Map<String, dynamic>> payrollSummary({int? year, int? month}) =>
      _api.get(
        '/me/payroll/summary',
        query: {
          if (year != null) 'year': '$year',
          if (month != null) 'month': '$month',
        },
      );

  /// `{limit: {id, name, maxAmount, reason, scope} | null, requests: [...]}`
  Future<Map<String, dynamic>> advances() => _api.get('/me/advances');

  Future<Map<String, dynamic>> createAdvance({
    required num amount,
    String? comment,
  }) => _api.post(
    '/me/advances',
    data: {
      'amount': amount,
      if (comment != null && comment.trim().isNotEmpty)
        'comment': comment.trim(),
    },
  );

  Future<Map<String, dynamic>> cancelAdvance(String id) =>
      _api.post('/me/advances/$id/cancel');

  /// Own HR card: personal data, contacts, work info, ids and documents.
  Future<Map<String, dynamic>> details() => _api.get('/me/details');

  Future<List<dynamic>> news() async {
    final data = await _api.getDynamic('/news');
    return data is List ? data : [];
  }

  Future<List<dynamic>> birthdays() async {
    final data = await _api.getDynamic('/news/birthdays');
    return data is List ? data : [];
  }

  /// Free-form message to HR; it lands in the HR inbox as a request.
  Future<Map<String, dynamic>> contactHr({
    required String title,
    required String note,
  }) => _api.post(
    '/me/requests',
    data: {'type': 'hr_change', 'title': title, 'note': note},
  );
}
