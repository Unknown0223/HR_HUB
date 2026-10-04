import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/app_lock.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/season.dart';
import '../../shared/widgets.dart';
import '../notifications/inbox_watcher.dart';

String seasonLabel(Season s) => switch (s) {
  Season.spring => 'Bahor',
  Season.summer => 'Yoz',
  Season.autumn => 'Kuz',
  Season.winter => 'Qish',
};

String seasonLabelRu(Season s) => switch (s) {
  Season.spring => 'Весна',
  Season.summer => 'Лето',
  Season.autumn => 'Осень',
  Season.winter => 'Зима',
};

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen>
    with WidgetsBindingObserver {
  bool _bioAvailable = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadBio();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _loadBio();
  }

  Future<void> _loadBio() async {
    final types = await ref.read(biometricServiceProvider).availableTypes();
    if (mounted) setState(() => _bioAvailable = types.isNotEmpty);
  }

  Future<void> _offerEnroll() async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('Barmoq izi qo‘shilmagan', 'Отпечаток не добавлен')),
        content: Text(
          ctx.tr(
            'Barmoq izi bilan kirish uchun avval telefon sozlamalarida barmoq izini '
                'qo‘shing. Qaytib kelganingizda bu yerda yoqishingiz mumkin.',
            'Чтобы входить по отпечатку, сначала добавьте отпечаток в настройках '
                'телефона. После возврата его можно будет включить здесь.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.tr('Bekor qilish', 'Отмена')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.tr('Sozlamalarni ochish', 'Открыть настройки')),
          ),
        ],
      ),
    );
    if (go == true) await openBiometricEnrollSettings();
  }

  Future<void> _toggleBio(bool v) async {
    if (!_bioAvailable) {
      await _loadBio();
      if (!_bioAvailable) return _offerEnroll();
    }
    if (!mounted) return;
    if (v) {
      final ok = await ref
          .read(biometricServiceProvider)
          .authenticate(
            reason: context.t('Barmoq izi bilan ochishni tasdiqlang'),
            allowSkipIfUnavailable: false,
          );
      if (!ok) return;
    }
    await ref.read(appLockProvider.notifier).setBiometric(v);
  }

  Future<void> _pickLang() async {
    final current = ref.read(appLangProvider);
    final picked = await showModalBottomSheet<AppLang>(
      context: context,
      backgroundColor: AppColors.cardAlt,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                ctx.tr('Ilova tili', 'Язык приложения'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
            for (final lang in AppLang.values)
              ListTile(
                title: Text(lang.label),
                trailing: lang == current
                    ? const Icon(Icons.check, color: AppColors.accent)
                    : null,
                onTap: () => Navigator.pop(ctx, lang),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked != null) await ref.read(appLangProvider.notifier).set(picked);
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(appLangProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.tr('Sozlamalar', 'Настройки')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _group(
            children: [
              MenuTile(
                icon: Icons.brightness_6_outlined,
                label: context.tr(
                  'Fasl bo‘yicha · ${seasonLabel(SeasonX.now)}',
                  'По сезону · ${seasonLabelRu(SeasonX.now)}',
                ),
                subtitle: context.tr('Mavzu', 'Тема'),
                onTap: () => context.push('/settings/theme'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.language,
                label: lang.label,
                subtitle: context.tr('Ilova tili', 'Язык приложения'),
                onTap: _pickLang,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: [
              MenuTile(
                icon: Icons.lock_outline,
                label: context.tr('Parolni o\'zgartirish', 'Сменить пароль'),
                onTap: () => context.push('/security/password'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.pin_outlined,
                label: context.tr('PIN-kodni o\'zgartirish', 'Сменить PIN-код'),
                onTap: () => context.push('/security/pin'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.fingerprint,
                label: context.tr('Barmoq izi bilan ochish', 'Вход по отпечатку'),
                subtitle: _bioAvailable
                    ? context.tr(
                        'PIN-kod o\'rniga tezkor kirish',
                        'Быстрый вход вместо PIN-кода',
                      )
                    : context.tr(
                        'Barmoq izi qo‘shilmagan — qo‘shish uchun bosing',
                        'Отпечаток не добавлен — нажмите, чтобы добавить',
                      ),
                showChevron: false,
                onTap: () =>
                    _toggleBio(!ref.read(appLockProvider).biometric),
                trailing: Switch(
                  value: _bioAvailable && ref.watch(appLockProvider).biometric,
                  activeTrackColor: AppColors.accent,
                  onChanged: _toggleBio,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: [
              MenuTile(
                icon: Icons.notifications_outlined,
                label: context.tr('Bildirishnomalar', 'Уведомления'),
                subtitle: ref.watch(notifyPrefsProvider).enabled
                    ? context.tr(
                        'Telefonga xabar chiqariladi',
                        'Уведомления на телефоне включены',
                      )
                    : context.tr(
                        'Faqat ilova ichida',
                        'Только внутри приложения',
                      ),
                onTap: () => context.push('/settings/notifications'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  context.t('Worklyn mobile · Face ID + barmoq izi'),
                  style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _group({required List<Widget> children}) {
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(children: children),
    );
  }
}

/// The app has a single light theme whose illustration follows the calendar season.
class ThemeSettingsScreen extends StatelessWidget {
  const ThemeSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final current = SeasonX.now;
    const months = {
      Season.spring: 'Mart – May',
      Season.summer: 'Iyun – Avgust',
      Season.autumn: 'Sentyabr – Noyabr',
      Season.winter: 'Dekabr – Fevral',
    };
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.t('Mavzu')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Text(
              context.t(
                'Ilova ko‘rinishi yil fasliga qarab o‘zi almashadi: fon rasmi va ranglar '
                'har faslda yangilanadi. Qo‘lda tanlash shart emas.',
              ),
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final s in Season.values) ...[
                  if (s != Season.values.first)
                    const Divider(height: 1, color: AppColors.line),
                  ListTile(
                    leading: CircleAvatar(radius: 14, backgroundColor: s.orb),
                    title: Text(
                      context.t(seasonLabel(s)),
                      style: TextStyle(
                        fontWeight: s == current
                            ? FontWeight.w800
                            : FontWeight.w500,
                      ),
                    ),
                    subtitle: Text(context.t(months[s]!)),
                    trailing: s == current
                        ? const Icon(
                            Icons.check_circle,
                            color: AppColors.accent,
                          )
                        : null,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Choose which server inbox items are mirrored as phone notifications.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen>
    with WidgetsBindingObserver {
  bool? _systemOn;

  static const _icons = {
    NotifyCategory.requests: Icons.how_to_reg_outlined,
    NotifyCategory.advance: Icons.payments_outlined,
    NotifyCategory.attendance: Icons.fingerprint,
    NotifyCategory.news: Icons.campaign_outlined,
    NotifyCategory.other: Icons.notifications_none,
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshSystem();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshSystem();
  }

  Future<void> _refreshSystem() async {
    final on = await systemNotificationsEnabled();
    if (mounted) setState(() => _systemOn = on);
  }

  /// Android 13+ asks at runtime; once permanently denied only the system page can re-enable it.
  Future<void> _ensureSystemPermission() async {
    if (await systemNotificationsEnabled()) return _refreshSystem();
    final status = await Permission.notification.request();
    if (!status.isGranted) await openSystemNotificationSettings();
    await _refreshSystem();
  }

  Future<void> _setEnabled(bool v) async {
    await ref.read(notifyPrefsProvider.notifier).setEnabled(v);
    if (v) await _ensureSystemPermission();
  }

  Future<void> _sendTest() async {
    await _ensureSystemPermission();
    if (!mounted) return;
    await showSystemNotification(
      id: 1,
      title: context.tr('Worklyn — sinov xabari', 'Worklyn — тестовое уведомление'),
      body: context.tr(
        'Bildirishnomalar ishlayapti. Yangi xabarlar shu tarzda chiqadi.',
        'Уведомления работают. Новые сообщения будут приходить так же.',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(notifyPrefsProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.tr('Bildirishnomalar', 'Уведомления')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            padding: EdgeInsets.zero,
            child: SwitchListTile(
              value: prefs.enabled,
              activeTrackColor: AppColors.accent,
              onChanged: _setEnabled,
              title: Text(
                context.tr('Telefonga xabar chiqarish', 'Показывать на телефоне'),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                context.tr(
                  'Yangi xabarlar telefonning bildirishnomalar panelida ko‘rinadi',
                  'Новые сообщения появятся в шторке уведомлений',
                ),
              ),
            ),
          ),
          if (prefs.enabled && _systemOn == false) ...[
            const SizedBox(height: 12),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.notifications_off_outlined,
                          color: AppColors.danger),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          context.tr(
                            'Telefon sozlamalarida Worklyn bildirishnomalari o‘chirilgan',
                            'В настройках телефона уведомления Worklyn отключены',
                          ),
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: openSystemNotificationSettings,
                    child: Text(context.tr('Ruxsat berish', 'Разрешить')),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          SectionCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      context.tr('Qaysi xabarlar chiqsin', 'Какие уведомления показывать'),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
                for (final c in NotifyCategory.values)
                  SwitchListTile(
                    value: prefs.enabled && !prefs.off.contains(c),
                    activeTrackColor: AppColors.accent,
                    onChanged: prefs.enabled
                        ? (v) => ref
                              .read(notifyPrefsProvider.notifier)
                              .setCategory(c, v)
                        : null,
                    secondary: Icon(_icons[c], color: AppColors.accent),
                    title: Text(context.tr(c.uz, c.ru)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Text(
              context.tr(
                'Ilova ochiq yoki fonda ishlayotganda yangi xabarlar har daqiqada '
                    'tekshiriladi. Barcha xabarlar ilova ichidagi ro‘yxatda ham saqlanadi.',
                'Пока приложение открыто или работает в фоне, новые сообщения '
                    'проверяются каждую минуту. Все сообщения также хранятся в списке '
                    'внутри приложения.',
              ),
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: prefs.enabled ? _sendTest : null,
            icon: const Icon(Icons.notifications_active_outlined),
            label: Text(context.tr('Sinov xabarini yuborish', 'Отправить тестовое')),
          ),
          const SizedBox(height: 8),
          PrimaryButton(
            label: context.tr('Bildirishnomalarni ochish', 'Открыть уведомления'),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
    );
  }
}

/// Former start/end-of-day reminder screen; it now opens the notification settings.
class NotifyRecordsScreen extends StatelessWidget {
  const NotifyRecordsScreen({super.key});

  @override
  Widget build(BuildContext context) => const NotificationSettingsScreen();
}
