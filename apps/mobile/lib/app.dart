import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/auth/auth_state.dart';
import 'core/i18n/app_lang.dart';
import 'core/router/app_router.dart';
import 'core/security/app_permissions.dart';
import 'core/theme/app_theme.dart';
import 'shared/seasonal_backdrop.dart';
import 'core/tracking/tracking_controller.dart';
import 'features/lock/app_lock_screens.dart';

class HrHubApp extends ConsumerStatefulWidget {
  const HrHubApp({super.key});

  @override
  ConsumerState<HrHubApp> createState() => _HrHubAppState();
}

class _HrHubAppState extends ConsumerState<HrHubApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  bool _artCached = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_artCached) return;
    _artCached = true;
    precacheSeasonArt(context);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Permissions can be revoked from system settings while the app is in the background.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref
          .read(permissionsProvider.notifier)
          .refresh()
          .then((_) => _syncTracking());
    }
  }

  void _syncTracking() {
    final auth = ref.read(authProvider);
    if (auth.user?.employee == null) return;
    if (!ref.read(permissionsProvider).allGranted) return;
    ref.read(trackingControllerProvider).ensureStarted();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authProvider, (_, _) => _syncTracking());
    ref.listen(permissionsProvider, (_, _) => _syncTracking());
    final router = ref.watch(appRouterProvider);
    final lang = ref.watch(appLangProvider);
    return MaterialApp.router(
      title: 'HR HUB',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      themeMode: ThemeMode.light,
      routerConfig: router,
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        return LangScope(
          lang: lang,
          child: MediaQuery(
            data: mq.copyWith(textScaler: ReadableTextScaler(mq.textScaler)),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const SeasonalBackdrop(),
                AppLockGate(child: child ?? const SizedBox.shrink()),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Lifts small captions the most (11 → ~13) and body/headline text a little,
/// on top of the user's system text size.
class ReadableTextScaler extends TextScaler {
  const ReadableTextScaler(this.system);

  final TextScaler system;

  static double boost(double fontSize) =>
      fontSize * 1.08 +
      (fontSize < 15 ? (15 - fontSize).clamp(0, 3) * 0.35 : 0);

  @override
  double scale(double fontSize) => system.scale(boost(fontSize));

  @override
  // ignore: deprecated_member_use
  double get textScaleFactor => system.textScaleFactor * 1.08;

  @override
  bool operator ==(Object other) =>
      other is ReadableTextScaler && other.system == system;

  @override
  int get hashCode => Object.hash(ReadableTextScaler, system);
}
