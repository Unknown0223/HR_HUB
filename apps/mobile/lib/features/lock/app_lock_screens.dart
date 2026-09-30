import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_state.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/router/app_router.dart';
import '../../core/security/app_lock.dart';
import '../../core/theme/app_theme.dart';
import '../auth/login_widgets.dart';
import 'pin_widgets.dart';

/// Sits above the router: after login it asks for a PIN once, then covers the app whenever
/// it is locked. The pages underneath keep their state.
class AppLockGate extends ConsumerWidget {
  const AppLockGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final lock = ref.watch(appLockProvider);

    Widget? cover;
    if (auth.isAuthenticated && !auth.loading) {
      if (!lock.ready) {
        cover = const ColoredBox(key: ValueKey('wait'), color: AppColors.bg);
      } else if (!lock.hasPin) {
        cover = const _BackGuard(key: ValueKey('setup'), child: PinSetupView());
      } else if (lock.locked) {
        cover = const _BackGuard(key: ValueKey('unlock'), child: UnlockView());
      }
    }

    return Stack(
      children: [
        // Screen readers must not read the app behind the lock.
        ExcludeSemantics(excluding: cover != null, child: child),
        Positioned.fill(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: ScaleTransition(scale: Tween(begin: 1.04, end: 1.0).animate(a), child: child),
            ),
            child: cover ?? const SizedBox.shrink(key: ValueKey('open')),
          ),
        ),
      ],
    );
  }
}

/// While the lock covers the app, Android "back" closes the app instead of popping pages hidden behind it.
class _BackGuard extends ConsumerStatefulWidget {
  const _BackGuard({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<_BackGuard> createState() => _BackGuardState();
}

class _BackGuardState extends ConsumerState<_BackGuard> {
  late final BackButtonDispatcher _root = ref.read(appRouterProvider).backButtonDispatcher;
  late final ChildBackButtonDispatcher _child = ChildBackButtonDispatcher(_root);

  @override
  void initState() {
    super.initState();
    FocusManager.instance.primaryFocus?.unfocus();
    _child
      ..addCallback(_onBack)
      ..takePriority();
  }

  Future<bool> _onBack() {
    SystemNavigator.pop();
    return SynchronousFuture(true);
  }

  @override
  void dispose() {
    _child.removeCallback(_onBack);
    _root.forget(_child);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class UnlockView extends ConsumerStatefulWidget {
  const UnlockView({super.key});

  @override
  ConsumerState<UnlockView> createState() => _UnlockViewState();
}

class _UnlockViewState extends ConsumerState<UnlockView> {
  String? _message;
  bool _confirmForgot = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _biometric());
  }

  Future<void> _biometric() async {
    if (!mounted || !ref.read(appLockProvider).biometric) return;
    if (await ref.read(appLockProvider.notifier).unlockWithBiometric()) _onUnlocked();
  }

  void _onUnlocked() => unawaited(ref.read(authProvider.notifier).revalidate());

  Future<bool> _check(String code) async {
    final result = await ref.read(appLockProvider.notifier).verify(code);
    switch (result) {
      case PinCheck.ok:
        _onUnlocked();
        return true;
      case PinCheck.wrong:
        final left = ref.read(appLockProvider).attemptsLeft;
        setState(() => _message = 'Noto‘g‘ri PIN-kod. Yana $left ta urinish qoldi');
        return false;
      case PinCheck.exhausted:
        await ref.read(authProvider.notifier).logout();
        return false;
    }
  }

  String _greeting() {
    final user = ref.read(authProvider).user;
    final first = user?.employee?['firstName']?.toString().trim() ?? '';
    final name = first.isNotEmpty ? first : (user?.displayName.split(' ').last ?? '');
    return name.isEmpty ? 'Xush kelibsiz!' : 'Salom, $name!';
  }

  @override
  Widget build(BuildContext context) {
    final lock = ref.watch(appLockProvider);
    return BrandBackdrop(
      child: PinStage(
        header: const LockBadge(icon: Icons.lock_rounded),
        title: _greeting(),
        subtitle: 'Ilovani ochish uchun PIN-kodni kiriting',
        message: _message,
        messageIsError: true,
        onComplete: _check,
        leadingKey: lock.biometric
            ? PadKey(
                onTap: _biometric,
                label: 'Barmoq izi',
                plain: true,
                child: const Icon(Icons.fingerprint_rounded, color: AppColors.accent, size: 38),
              )
            : null,
        footer: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: _confirmForgot
              ? Row(
                  key: const ValueKey('confirm'),
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Flexible(
                      child: Text(
                        'Parol bilan qayta kirasiz.',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkMuted),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _confirmForgot = false),
                      child: const Text('Bekor'),
                    ),
                    TextButton(
                      onPressed: () => ref.read(authProvider.notifier).logout(),
                      style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                      child: const Text('Chiqish', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ],
                )
              : TextButton(
                  key: const ValueKey('forgot'),
                  onPressed: () => setState(() => _confirmForgot = true),
                  child: const Text(
                    'PIN-kodni unutdingizmi?',
                    style: TextStyle(fontSize: 14.5, color: AppColors.accent, fontWeight: FontWeight.w700),
                  ),
                ),
        ),
      ),
    );
  }
}

enum _SetupStep { current, create, confirm, biometric }

/// First-time PIN creation (right after login) or, with [requireCurrent], changing it.
class PinSetupView extends ConsumerStatefulWidget {
  const PinSetupView({super.key, this.requireCurrent = false, this.onDone, this.onCancel});

  final bool requireCurrent;
  final VoidCallback? onDone;
  final VoidCallback? onCancel;

  @override
  ConsumerState<PinSetupView> createState() => _PinSetupViewState();
}

class _PinSetupViewState extends ConsumerState<PinSetupView> {
  late _SetupStep _step = widget.requireCurrent ? _SetupStep.current : _SetupStep.create;
  String _first = '';
  String? _message;
  bool _messageIsError = false;
  bool _bioBusy = false;

  static const _weak = {'1234', '4321', '0123', '9876', '1212', '2580'};

  void _go(_SetupStep step, {String? message, bool error = false}) => setState(() {
        _step = step;
        _message = message;
        _messageIsError = error;
      });

  Future<bool> _complete(String code) async {
    switch (_step) {
      case _SetupStep.current:
        if (await ref.read(appLockProvider.notifier).matches(code)) {
          _go(_SetupStep.create);
          return true;
        }
        setState(() {
          _message = 'Joriy PIN-kod noto‘g‘ri';
          _messageIsError = true;
        });
        return false;
      case _SetupStep.create:
        if (code.split('').toSet().length == 1 || _weak.contains(code)) {
          setState(() {
            _message = 'Juda oddiy kod — boshqasini tanlang';
            _messageIsError = true;
          });
          return false;
        }
        _first = code;
        _go(_SetupStep.confirm);
        return true;
      case _SetupStep.confirm:
        if (code != _first) {
          setState(() {
            _message = 'Kodlar mos kelmadi — qaytadan o‘ylab toping';
            _messageIsError = true;
          });
          return false;
        }
        if (await _canOfferBiometric()) {
          _go(_SetupStep.biometric);
        } else {
          await _finish(biometric: false);
        }
        return true;
      case _SetupStep.biometric:
        return true;
    }
  }

  Future<bool> _canOfferBiometric() async {
    if (widget.requireCurrent) return false;
    final types = await ref.read(biometricServiceProvider).availableTypes();
    return types.isNotEmpty;
  }

  Future<void> _enableBiometric() async {
    setState(() => _bioBusy = true);
    final ok = await ref.read(biometricServiceProvider).authenticate(
          reason: 'Barmoq izi bilan ochishni tasdiqlang',
          allowSkipIfUnavailable: false,
        );
    if (!mounted) return;
    setState(() => _bioBusy = false);
    if (ok) await _finish(biometric: true);
  }

  Future<void> _finish({required bool biometric}) async {
    final lock = ref.read(appLockProvider.notifier);
    if (biometric) await lock.setBiometric(true);
    await lock.setPin(_first);
    widget.onDone?.call();
  }

  @override
  Widget build(BuildContext context) {
    return BrandBackdrop(
      child: Stack(
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 280),
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(
                position: Tween(begin: const Offset(0.12, 0), end: Offset.zero).animate(a),
                child: child,
              ),
            ),
            child: _step == _SetupStep.biometric ? _biometricOffer() : _pinStep(),
          ),
          if (widget.onCancel != null)
            Positioned(
              right: 14,
              top: 16,
              child: Material(
                color: Colors.white.withValues(alpha: 0.75),
                shape: const CircleBorder(),
                child: IconButton(
                  onPressed: widget.onCancel,
                  icon: const Icon(Icons.close_rounded, size: 24, color: AppColors.ink),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _pinStep() {
    final (title, subtitle, icon) = switch (_step) {
      _SetupStep.current => ('Joriy PIN-kodni kiriting', 'O‘zgartirishdan oldin tasdiqlang', Icons.lock_rounded),
      _SetupStep.create => (
          'PIN-kod o‘rnating',
          'Ilovaga tez kirish uchun 4 xonali kod o‘ylab toping',
          Icons.lock_open_rounded,
        ),
      _ => ('PIN-kodni takrorlang', 'Xuddi shu 4 raqamni yana kiriting', Icons.lock_rounded),
    };
    return PinStage(
      key: ValueKey(_step),
      header: LockBadge(icon: icon),
      title: title,
      subtitle: subtitle,
      message: _message,
      messageIsError: _messageIsError,
      onComplete: _complete,
      onRejected: _step == _SetupStep.confirm
          ? () => _go(_SetupStep.create, message: _message, error: true)
          : null,
    );
  }

  Widget _biometricOffer() {
    return Column(
      key: const ValueKey('bio'),
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Align(alignment: Alignment.centerLeft, child: BrandChip()),
        ),
        const Spacer(),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: GlassPanel(
            padding: const EdgeInsets.fromLTRB(22, 18, 22, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const _PulsingFingerprint(),
                const SizedBox(height: 14),
                const Text(
                  'Barmoq izi bilan ochish',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900, color: AppColors.ink),
                ),
                const SizedBox(height: 8),
                const Text(
                  'PIN-kod o‘rnatildi. Endi ilovani bir teginish bilan ochishingiz mumkin — '
                  'PIN-kod zaxira sifatida qoladi.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.inkMuted, height: 1.4),
                ),
                const SizedBox(height: 26),
                GlowButton(label: 'Yoqish', busy: _bioBusy, onPressed: _enableBiometric),
                const SizedBox(height: 6),
                TextButton(
                  onPressed: _bioBusy ? null : () => _finish(biometric: false),
                  child: const Text(
                    'Keyinroq',
                    style: TextStyle(fontSize: 15, color: AppColors.inkMuted, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PulsingFingerprint extends StatefulWidget {
  const _PulsingFingerprint();

  @override
  State<_PulsingFingerprint> createState() => _PulsingFingerprintState();
}

class _PulsingFingerprintState extends State<_PulsingFingerprint> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations && _c.isAnimating) _c.stop();
    return SizedBox(
      width: 150,
      height: 150,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Stack(
          alignment: Alignment.center,
          children: [
            for (final phase in [0.0, 0.5])
              Builder(builder: (context) {
                final t = (_c.value + phase) % 1;
                return Container(
                  width: 90 + 60 * t,
                  height: 90 + 60 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.accent.withValues(alpha: 0.45 * (1 - t)), width: 2),
                  ),
                );
              }),
            const LockBadge(icon: Icons.fingerprint_rounded, size: 88),
          ],
        ),
      ),
    );
  }
}

/// Settings → change PIN.
class ChangePinScreen extends StatelessWidget {
  const ChangePinScreen({super.key});

  @override
  Widget build(BuildContext context) {
    void close() => Navigator.of(context).maybePop();
    return PinSetupView(
      requireCurrent: true,
      onCancel: close,
      onDone: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PIN-kod yangilandi')),
        );
        close();
      },
    );
  }
}
