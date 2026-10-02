import 'ru_attendance.dart';
import 'ru_auth.dart';
import 'ru_common.dart';
import 'ru_home.dart';
import 'ru_profile.dart';
import 'ru_requests.dart';

/// Russian text by its Uzbek source, split by app area. Not const: areas may repeat a key.
final Map<String, String> ruText = {
  ...ruCommon,
  ...ruHome,
  ...ruAttendance,
  ...ruRequests,
  ...ruProfile,
  ...ruAuth,
};
