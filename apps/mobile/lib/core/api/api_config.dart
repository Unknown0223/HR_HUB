/// API base URL configuration.
///
/// Default is the production web (its `/api` proxies to the API).
/// Local dev: `--dart-define=API_BASE_URL=http://10.0.2.2:3001/api` (Android emulator)
/// or `http://<PC LAN IP>:3001/api` on a real device.
class ApiConfig {
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://hr-akfa.up.railway.app/api',
  );

  /// Max GPS accuracy (meters) accepted client-side before calling API.
  static const double maxGpsAccuracyM = 100;
}
