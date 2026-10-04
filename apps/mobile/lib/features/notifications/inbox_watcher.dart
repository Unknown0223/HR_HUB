import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/me_repository.dart';
import 'notifications_screen.dart';

const systemChannel = MethodChannel('hrhub/system');

enum NotifyCategory {
  requests('So‘rovlar va hujjatlar', 'Заявки и документы'),
  advance('Avans', 'Аванс'),
  attendance('Davomat belgilari', 'Отметки посещаемости'),
  news('Yangiliklar va e’lonlar', 'Новости и объявления'),
  other('Boshqa xabarlar', 'Прочие сообщения');

  const NotifyCategory(this.uz, this.ru);
  final String uz;
  final String ru;

  static NotifyCategory of(String? entity) => switch (entity) {
    'absence' ||
    'hr-request' ||
    'hr-document' ||
    'name-change' ||
    'wage-change' ||
    'employee_join_request' => NotifyCategory.requests,
    'advance_request' => NotifyCategory.advance,
    'attendance_arrival' || 'attendance_mark' => NotifyCategory.attendance,
    'news' => NotifyCategory.news,
    _ => NotifyCategory.other,
  };
}

const _enabledKey = 'notify.enabled';
const _seenKey = 'notify.seen';
const _primedKey = 'notify.primed';
String _catKey(NotifyCategory c) => 'notify.cat.${c.name}';

class NotifyPrefs {
  const NotifyPrefs({this.enabled = true, this.off = const {}});

  final bool enabled;
  final Set<NotifyCategory> off;

  bool allows(NotifyCategory c) => enabled && !off.contains(c);

  static NotifyPrefs read(SharedPreferences p) => NotifyPrefs(
    enabled: p.getBool(_enabledKey) ?? true,
    off: {
      for (final c in NotifyCategory.values)
        if (p.getBool(_catKey(c)) == false) c,
    },
  );
}

class NotifyPrefsNotifier extends StateNotifier<NotifyPrefs> {
  NotifyPrefsNotifier() : super(const NotifyPrefs()) {
    _load();
  }

  Future<void> _load() async {
    state = NotifyPrefs.read(await SharedPreferences.getInstance());
  }

  Future<void> setEnabled(bool v) async {
    state = NotifyPrefs(enabled: v, off: state.off);
    await (await SharedPreferences.getInstance()).setBool(_enabledKey, v);
  }

  Future<void> setCategory(NotifyCategory c, bool on) async {
    final off = {...state.off};
    on ? off.remove(c) : off.add(c);
    state = NotifyPrefs(enabled: state.enabled, off: off);
    await (await SharedPreferences.getInstance()).setBool(_catKey(c), on);
  }
}

final notifyPrefsProvider =
    StateNotifierProvider<NotifyPrefsNotifier, NotifyPrefs>(
      (_) => NotifyPrefsNotifier(),
    );

Future<void> showSystemNotification({
  required int id,
  required String title,
  String? body,
}) async {
  try {
    await systemChannel.invokeMethod('notify', {
      'id': id,
      'title': title,
      'body': body,
    });
  } on PlatformException catch (_) {
  } on MissingPluginException catch (_) {}
}

Future<bool> systemNotificationsEnabled() async {
  try {
    return await systemChannel.invokeMethod<bool>('notificationsEnabled') ??
        false;
  } catch (_) {
    return false;
  }
}

Future<void> openSystemNotificationSettings() async {
  try {
    await systemChannel.invokeMethod('openNotificationSettings');
  } catch (_) {}
}

Future<void> openBiometricEnrollSettings() async {
  try {
    await systemChannel.invokeMethod('openBiometricEnroll');
  } catch (_) {}
}

/// Polls the server inbox while the signed-in shell is alive and mirrors new
/// unread items as Android notifications. Without a push service nothing
/// arrives once the app process is killed.
class InboxWatcher extends ConsumerStatefulWidget {
  const InboxWatcher({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<InboxWatcher> createState() => _InboxWatcherState();
}

class _InboxWatcherState extends ConsumerState<InboxWatcher>
    with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 60);
  static const _seenLimit = 300;
  static const _maxPerCheck = 5;

  Timer? _timer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(_interval, (_) => _check());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _openLaunchRoute();
      _check();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _openLaunchRoute();
      _check();
    }
  }

  Future<void> _openLaunchRoute() async {
    String? route;
    try {
      route = await systemChannel.invokeMethod<String>('takeLaunchRoute');
    } catch (_) {
      return;
    }
    if (route == null || !mounted) return;
    ref.invalidate(notificationsProvider);
    GoRouter.of(context).push(route);
  }

  Future<void> _check() async {
    if (_busy) return;
    _busy = true;
    try {
      final items = await ref
          .read(meRepositoryProvider)
          .notifications(unreadOnly: true);
      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getStringList(_seenKey) ?? <String>[];
      final seenSet = seen.toSet();
      final primed = prefs.getBool(_primedKey) ?? false;
      final settings = NotifyPrefs.read(prefs);

      final fresh = [
        for (final raw in items)
          if (raw is Map && !seenSet.contains(raw['id']?.toString())) raw,
      ];
      if (fresh.isEmpty && primed) return;

      // The feed is newest-first; announce the latest few, oldest of them first.
      if (primed && settings.enabled) {
        final shown = fresh
            .where(
              (m) => settings.allows(
                NotifyCategory.of(m['entity']?.toString()),
              ),
            )
            .take(_maxPerCheck)
            .toList()
            .reversed;
        for (final m in shown) {
          await showSystemNotification(
            id: m['id'].toString().hashCode & 0x7fffffff,
            title: m['title']?.toString() ?? 'Worklyn',
            body: m['body']?.toString(),
          );
        }
      }

      final next = [...seen, for (final m in fresh) m['id'].toString()];
      await prefs.setStringList(
        _seenKey,
        next.length > _seenLimit ? next.sublist(next.length - _seenLimit) : next,
      );
      await prefs.setBool(_primedKey, true);
      if (fresh.isNotEmpty) ref.invalidate(notificationsProvider);
    } catch (_) {
      // Offline or signed out: try again on the next tick.
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
