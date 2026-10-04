import 'dart:async';

import 'package:flutter/material.dart';

/// Decorative looping animations (drifting art, falling petals, glow sweeps) repaint the
/// screen every frame, and the frosted cards above them re-blur on every frame too. On
/// mid-range phones that starves typing and taps, so the loops hold still while the user
/// is entering something.
class AmbientMotion {
  AmbientMotion._();

  static final calm = ValueNotifier<bool>(false);
  static Timer? _resume;

  /// Input activity (e.g. a PIN key): keep the loops still for a few seconds.
  static void poke() {
    calm.value = true;
    _resume?.cancel();
    _resume = Timer(const Duration(seconds: 5), () => calm.value = false);
  }
}

/// For a [State] that owns looping ambient controllers: call [syncAmbient] from `build`.
mixin AmbientMotionState<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    AmbientMotion.calm.addListener(_onCalm);
  }

  @override
  void dispose() {
    AmbientMotion.calm.removeListener(_onCalm);
    super.dispose();
  }

  void _onCalm() {
    if (mounted) setState(() {});
  }

  /// True while the loops should hold still (keyboard up, recent input, reduced motion).
  bool get ambientStill =>
      MediaQuery.disableAnimationsOf(context) ||
      MediaQuery.viewInsetsOf(context).bottom > 0 ||
      AmbientMotion.calm.value;

  void syncAmbient(AnimationController c, {bool reverse = false}) {
    if (ambientStill) {
      if (c.isAnimating) c.stop();
    } else if (!c.isAnimating) {
      c.repeat(reverse: reverse);
    }
  }
}
