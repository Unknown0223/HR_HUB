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

  /// Each company's server; `{name}` is the short company name typed on the login screen.
  static const String serverTemplate = String.fromEnvironment(
    'SERVER_URL_TEMPLATE',
    defaultValue: 'https://hr-{name}.up.railway.app/api',
  );

  /// Max GPS accuracy (meters) accepted client-side before calling API.
  static const double maxGpsAccuracyM = 100;

  static final _shortName = RegExp(r'^[a-z0-9][a-z0-9-]{0,40}$');
  static final _plainHost = RegExp(r'^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(/|$)');

  /// Turns what the user typed into an API base URL: a short company name (`akfa`)
  /// fills [serverTemplate]; a host or full URL is used as-is (for self-hosted / dev servers).
  static String? resolveServer(String input) {
    final raw = input.trim();
    if (raw.isEmpty) return defaultBaseUrl;
    final name = raw.toLowerCase();
    if (_shortName.hasMatch(name)) return serverTemplate.replaceAll('{name}', name);
    if (!raw.contains('.') && !raw.contains(':')) return null;

    var url = raw.contains('://')
        ? raw
        : '${_plainHost.hasMatch(raw) ? 'http' : 'https'}://$raw';
    url = url.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(url);
    if (uri == null || uri.host.isEmpty) return null;
    if (uri.path.isEmpty) url = '$url/api';
    return url;
  }

  /// What to show in the server field for a saved base URL: the short company name when the URL
  /// came from [serverTemplate], otherwise the URL itself.
  static String displayServer(String baseUrl) {
    final parts = serverTemplate.split('{name}');
    if (parts.length == 2 && baseUrl.startsWith(parts[0]) && baseUrl.endsWith(parts[1])) {
      final name = baseUrl.substring(parts[0].length, baseUrl.length - parts[1].length);
      if (_shortName.hasMatch(name)) return name;
    }
    return baseUrl;
  }

  /// Short host for the hint under the server field, e.g. `hr-akfa.up.railway.app`.
  static String hostOf(String baseUrl) {
    final uri = Uri.tryParse(baseUrl);
    if (uri == null || uri.host.isEmpty) return baseUrl;
    return uri.hasPort ? '${uri.host}:${uri.port}' : uri.host;
  }
}
