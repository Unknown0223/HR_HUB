import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_state.dart';

extension ScreenCache on AutoDisposeRef<Object?> {
  /// Keeps a screen's data for [duration] after the screen closes, so reopening it shows
  /// the last result instantly instead of a spinner. Pull-to-refresh and the existing
  /// `invalidate` calls still reload it. Bound to the signed-in user: another account
  /// never sees the cached data.
  void cacheFor(Duration duration) {
    watch(authProvider.select((a) => a.user?.id));
    final link = keepAlive();
    final timer = Timer(duration, link.close);
    onDispose(timer.cancel);
  }
}

const screenCacheTtl = Duration(minutes: 3);
