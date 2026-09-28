class ApiException implements Exception {
  ApiException(
    this.message, {
    this.statusCode,
    this.serverMessage,
    this.code,
  });

  final String message;
  final int? statusCode;

  /// Machine-readable backend code, e.g. `GPS_OUTSIDE_COMMENT_REQUIRED`.
  final String? code;

  /// Raw backend message before localization.
  final String? serverMessage;

  bool get isEmployeeNotLinked =>
      serverMessage?.startsWith('User is not linked to an active employee') ??
      false;

  @override
  String toString() => message;
}
