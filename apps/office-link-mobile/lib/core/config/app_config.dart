/// App config loaded from assets + runtime overrides.
class AppConfig {
  const AppConfig({
    required this.apiUrl,
    required this.webUrl,
    required this.tenantCode,
    required this.recoveryEmail,
  });

  final String apiUrl;
  final String webUrl;
  final String tenantCode;
  final String recoveryEmail;

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      apiUrl: (json['apiUrl'] as String? ?? '').trim().replaceAll(RegExp(r'/$'), ''),
      webUrl: (json['webUrl'] as String? ?? '').trim().replaceAll(RegExp(r'/$'), ''),
      tenantCode: (json['tenantCode'] as String? ?? 'demo').trim(),
      recoveryEmail:
          (json['recoveryEmail'] as String? ?? 'botirovanvar96@gmail.com').trim(),
    );
  }

  AppConfig copyWith({
    String? apiUrl,
    String? webUrl,
    String? tenantCode,
    String? recoveryEmail,
  }) {
    return AppConfig(
      apiUrl: apiUrl ?? this.apiUrl,
      webUrl: webUrl ?? this.webUrl,
      tenantCode: tenantCode ?? this.tenantCode,
      recoveryEmail: recoveryEmail ?? this.recoveryEmail,
    );
  }
}
