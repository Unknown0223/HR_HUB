import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/app_lock.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/season.dart';
import '../../shared/widgets.dart';

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

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _bioAvailable = false;

  @override
  void initState() {
    super.initState();
    _loadBio();
  }

  Future<void> _loadBio() async {
    final types = await ref.read(biometricServiceProvider).availableTypes();
    if (mounted) setState(() => _bioAvailable = types.isNotEmpty);
  }

  Future<void> _toggleBio(bool v) async {
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
                        'Qurilmada barmoq izi qo\'shilmagan',
                        'На устройстве нет отпечатков',
                      ),
                showChevron: false,
                trailing: Switch(
                  value: ref.watch(appLockProvider).biometric,
                  activeTrackColor: AppColors.accent,
                  onChanged: _bioAvailable ? _toggleBio : null,
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
                subtitle: context.tr(
                  'Ilova ichidagi xabarlar',
                  'Сообщения внутри приложения',
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
                  context.t('HR HUB mobile · Face ID + barmoq izi'),
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

/// Notifications are stored server-side and shown in the in-app list; the app has no push channel yet.
class NotificationSettingsScreen extends StatelessWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const kinds = [
      (
        Icons.how_to_reg_outlined,
        'Yo‘qlik yoki boshqa so‘rovingiz tasdiqlanganda, rad etilganda yoki bekor qilinganda',
      ),
      (Icons.campaign_outlined, 'HR barcha xodimlarga e’lon yuborganda'),
      (Icons.gpp_maybe_outlined, 'Telefoningizda soxta lokatsiya aniqlanganda'),
    ];
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.t('Bildirishnomalar')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.t('Qachon xabar keladi'),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                const SizedBox(height: 8),
                for (final k in kinds)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Icon(k.$1, color: AppColors.accent, size: 20),
                        const SizedBox(width: 10),
                        Expanded(child: Text(context.t(k.$2))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Text(
              context.t(
                'Xabarlar ilova ichidagi «Bildirishnomalar» ro‘yxatida saqlanadi. '
                'Telefonga push-xabar yuborish hozircha ulanmagan, shuning uchun '
                'ularni ilovani ochganda ko‘rasiz.',
              ),
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: context.t('Bildirishnomalarni ochish'),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
    );
  }
}

/// Former start/end-of-day reminder screen; reminders need a push channel, so it shares the info screen.
class NotifyRecordsScreen extends StatelessWidget {
  const NotifyRecordsScreen({super.key});

  @override
  Widget build(BuildContext context) => const NotificationSettingsScreen();
}
