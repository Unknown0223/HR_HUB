/// API base URL configuration.
///
/// Android emulator → host machine: `http://10.0.2.2:3001/api`
/// iOS simulator → `http://localhost:3001/api`
/// Real device → your PC LAN IP, e.g. `http://192.168.1.10:3001/api`
class ApiConfig {
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3001/api',
  );

  /// Max GPS accuracy (meters) accepted client-side before calling API.
  static const double maxGpsAccuracyM = 100;
}
