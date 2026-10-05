import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_version.dart';
import '../../core/auth/auth_state.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/my_avatar.dart';
import '../../shared/widgets.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    // Team membership changes on the server (org chart); refresh on open.
    Future.microtask(
      () => ref.read(authProvider.notifier).refreshMe().catchError((_) {}),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () => ref.read(authProvider.notifier).refreshMe(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
            children: [
              SceneHeading(context.t('Profil')),
              _HeaderCard(user: user),
              if (user?.hasTeam == true) ...[
                const SizedBox(height: 14),
                _TeamCard(
                  size: user!.teamSize,
                  onTap: () => context.push('/team'),
                ),
              ],
              if (user?.teamKiosk == true) ...[
                const SizedBox(height: 14),
                _KioskCard(onTap: () => context.push('/team/kiosk')),
              ],
              const SizedBox(height: 14),
              SectionCard(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  children: [
                    _MenuRow(
                      icon: Icons.person_outline_rounded,
                      color: const Color(0xFF3B82F6),
                      label: context.t('Shaxsiy ma’lumotlar'),
                      onTap: () => context.push('/profile/details'),
                    ),
                    _MenuRow(
                      icon: Icons.my_location_rounded,
                      color: AppColors.accent,
                      label: context.t('GPS kuzatuv'),
                      subtitle: context.t('Fon xizmati holati'),
                      onTap: () => context.push('/gps-track'),
                    ),
                    _MenuRow(
                      icon: Icons.settings_outlined,
                      color: const Color(0xFF6B7280),
                      label: context.t('Sozlamalar'),
                      onTap: () => context.push('/settings'),
                    ),
                    _MenuRow(
                      icon: Icons.lock_outline_rounded,
                      color: const Color(0xFFE39B0B),
                      label: context.t('Xavfsizlik'),
                      subtitle: context.t('Parol, PIN-kod'),
                      onTap: () => context.push('/security'),
                    ),
                    _MenuRow(
                      icon: Icons.support_agent_rounded,
                      color: const Color(0xFF8E6BD8),
                      label: context.t('Yordam'),
                      onTap: () => context.push('/help'),
                      last: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 54,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.logout,
                    backgroundColor: AppColors.logout.withValues(alpha: 0.06),
                    side: BorderSide(
                      color: AppColors.logout.withValues(alpha: 0.4),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    textStyle: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  icon: const Icon(Icons.logout_rounded),
                  label: Text(context.t('Hisobdan chiqish')),
                  onPressed: () => _confirmLogout(context),
                ),
              ),
              const SizedBox(height: 14),
              const Center(
                child: Text(
                  'Worklyn · v$appVersion',
                  style: TextStyle(
                    color: AppColors.inkFaint,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.t('Hisobdan chiqish')),
        content: Text(
          ctx.t('Chiqqaningizdan so‘ng GPS kuzatuv to‘xtaydi. Davom etasizmi?'),
          style: const TextStyle(fontSize: 15),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.t('Bekor qilish')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.logout),
            child: Text(ctx.tr('Chiqish', 'Выйти')),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout();
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.user});

  final AuthUser? user;

  @override
  Widget build(BuildContext context) {
    final emp = user?.employee;
    final position = (emp?['position'] as Map?)?['name']?.toString();
    final division = (emp?['division'] as Map?)?['name']?.toString();
    final schedule = emp?['schedule'] as Map?;
    final tab = emp?['tabNumber']?.toString();
    final tenant = user?.tenant?['name']?.toString();

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.headerTop, AppColors.headerBottom],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const MyAvatar(radius: 34),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.displayName ?? '—',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (position != null && position.isNotEmpty)
                      Text(
                        position,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.92),
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (tenant != null)
                _Chip(icon: Icons.business_rounded, text: tenant),
              if (division != null)
                _Chip(icon: Icons.apartment_rounded, text: division),
              if (schedule != null)
                _Chip(
                  icon: Icons.schedule_rounded,
                  text:
                      '${schedule['startTime'] ?? '09:00'} – ${schedule['endTime'] ?? '18:00'}',
                ),
              if (tab != null && tab.isNotEmpty)
                _Chip(icon: Icons.badge_outlined, text: '№ $tab'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.white),
          const SizedBox(width: 5),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamCard extends StatelessWidget {
  const _TeamCard({required this.size, required this.onTap});

  final int size;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppColors.accent.withValues(alpha: 0.45),
              width: 1.5,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.accentTint,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.groups_rounded,
                  color: AppColors.accent,
                  size: 30,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          context.t('Mening jamoam'),
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.accent,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$size',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      context.t('Tabel, statistika va jonli joylashuv'),
                      style: const TextStyle(color: AppColors.inkMuted, fontSize: 14),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.accent,
                size: 28,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _KioskCard extends StatelessWidget {
  const _KioskCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppColors.accent.withValues(alpha: 0.45),
              width: 1.5,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.accentTint,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.camera_front_rounded,
                  color: AppColors.accent,
                  size: 30,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('Qurilma rejimi', 'Режим устройства'),
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      context.tr(
                        'Jamoangizni yuz orqali shu telefondan belgilang',
                        'Отмечайте свою команду по лицу с этого телефона',
                      ),
                      style: const TextStyle(color: AppColors.inkMuted, fontSize: 14),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.accent,
                size: 28,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.last = false,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(icon, color: color, size: 23),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          style: const TextStyle(
                            color: AppColors.inkMuted,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.inkFaint,
                ),
              ],
            ),
          ),
        ),
        if (!last) const Divider(height: 1, indent: 72, endIndent: 16),
      ],
    );
  }
}
