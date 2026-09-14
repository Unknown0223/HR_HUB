/// Hikvision-style password attempt lock (app-side).
///
/// 1st 401 → confirm (re-type, no auto-retry).
/// 2nd 401 → lock for [lockSeconds] (default 30 min).
/// Network timeout / offline is not a password fail.
class AuthLock {
  AuthLock({
    this.lockSeconds = defaultLockSeconds,
    this.maxFails = 2,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  static const int defaultLockSeconds = 30 * 60;
  static const String confirm = 'confirm';
  static const String locked = 'locked';
  static const String idle = 'idle';
  static const String success = 'success';

  final int lockSeconds;
  final int maxFails;
  final DateTime Function() _now;

  int failCount = 0;
  DateTime? lockUntil;

  void _expireIfDue() {
    if (failCount >= maxFails &&
        lockUntil != null &&
        !_now().isBefore(lockUntil!)) {
      failCount = 0;
      lockUntil = null;
    }
  }

  bool get isLocked {
    _expireIfDue();
    return failCount >= maxFails &&
        lockUntil != null &&
        _now().isBefore(lockUntil!);
  }

  int get remainingSeconds {
    if (!isLocked || lockUntil == null) return 0;
    final left = lockUntil!.difference(_now()).inSeconds;
    return left < 0 ? 0 : left;
  }

  bool get canAttempt => !isLocked;

  String get phase {
    if (isLocked) return locked;
    if (failCount == 1) return confirm;
    return idle;
  }

  void recordTimeout() {}
  void recordOffline() {}

  String record401() {
    if (isLocked) return locked;
    failCount += 1;
    if (failCount >= maxFails) {
      lockUntil = _now().add(Duration(seconds: lockSeconds));
      return locked;
    }
    return confirm;
  }

  void recordSuccess() {
    failCount = 0;
    lockUntil = null;
  }

  String formatRemaining() {
    final sec = remainingSeconds;
    final mins = sec ~/ 60;
    final rem = sec % 60;
    return '${mins.toString().padLeft(2, '0')}:${rem.toString().padLeft(2, '0')}';
  }
}
