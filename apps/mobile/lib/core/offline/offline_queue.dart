/// Offline punch/request queue stub (M2).
/// Full sync can enqueue payloads here and flush when online.
class OfflineQueue {
  OfflineQueue._();
  static final OfflineQueue instance = OfflineQueue._();

  final List<Map<String, dynamic>> _pending = [];

  List<Map<String, dynamic>> get pending => List.unmodifiable(_pending);

  void enqueue(String type, Map<String, dynamic> payload) {
    _pending.add({
      'type': type,
      'payload': payload,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  void clear() => _pending.clear();

  /// Placeholder — wire to MeRepository when implementing full offline.
  Future<int> flush() async {
    // no-op stub
    final n = _pending.length;
    _pending.clear();
    return n;
  }
}
