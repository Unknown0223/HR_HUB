class SubmitResult {
  const SubmitResult({
    required this.kind,
    this.message = '',
    this.device = const {},
    this.remaining = 0,
  });

  /// linked | confirm | locked | timeout | offline | location | error | api | …
  final String kind;
  final String message;
  final Map<String, dynamic> device;
  final int remaining;
}

typedef StatusFn = void Function(String message);
