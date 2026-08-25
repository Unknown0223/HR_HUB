import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _subordinatesOnly = false;
  String _lang = 'O\'zbekcha';

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final name = (user?.displayName ?? '').toUpperCase();
    final tenant = user?.tenant?['name']?.toString() ?? 'HR HUB';

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            const Text(
              'Profil',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      AvatarCircle(name: user?.displayName, radius: 32),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          name.isEmpty ? '—' : name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: _ActionChipBtn(
                          icon: Icons.badge_outlined,
                          label: 'Ma\'lumotlar',
                          onTap: () => context.push('/profile/details'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _ActionChipBtn(
                          icon: Icons.chevron_right,
                          label: 'O\'zgartirish',
                          highlighted: true,
                          onTap: () => _showAccountsSheet(context),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.apartment_outlined, color: AppColors.ink),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tenant,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const Text(
                          'Joriy filial',
                          style: TextStyle(
                            color: AppColors.inkMuted,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  MenuTile(
                    icon: Icons.settings_outlined,
                    label: 'Sozlamalar',
                    onTap: () => context.push('/settings'),
                  ),
                  const Divider(height: 1, color: AppColors.line),
                  MenuTile(
                    icon: Icons.lock_outline,
                    label: 'Xavfsizlik',
                    onTap: () => context.push('/security'),
                  ),
                  const Divider(height: 1, color: AppColors.line),
                  MenuTile(
                    icon: Icons.timeline,
                    label: 'Mening kuzatuvlarim',
                    onTap: () => context.push('/gps-track'),
                  ),
                  const Divider(height: 1, color: AppColors.line),
                  MenuTile(
                    icon: Icons.groups_outlined,
                    label: 'Faqat bo\'ysunuvchilarni',
                    showChevron: false,
                    trailing: Switch(
                      value: _subordinatesOnly,
                      onChanged: (v) => setState(() => _subordinatesOnly = v),
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.line),
                  MenuTile(
                    icon: Icons.text_fields,
                    label: 'Til',
                    showChevron: false,
                    trailing: Text(
                      _lang,
                      style: const TextStyle(color: AppColors.inkMuted),
                    ),
                    onTap: () => _showLanguageSheet(context),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              padding: EdgeInsets.zero,
              child: MenuTile(
                icon: Icons.headset_mic_outlined,
                label: 'Yordam',
                onTap: () => context.push('/help'),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.logout,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: () async {
                  await ref.read(authProvider.notifier).logout();
                },
                child: const Text('Chiqish'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showLanguageSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final langs = ['Русский', 'English', 'O\'zbekcha'];
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Til',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkMuted,
                  ),
                ),
                const SizedBox(height: 8),
                ...langs.map(
                  (l) => ListTile(
                    title: Text(l),
                    trailing: _lang == l
                        ? const Icon(Icons.check, color: AppColors.ink)
                        : null,
                    onTap: () {
                      setState(() => _lang = l);
                      Navigator.pop(ctx);
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 50,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Yopish'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showAccountsSheet(BuildContext context) {
    final user = ref.read(authProvider).user;
    final tenant = user?.tenant?['name']?.toString() ?? 'HR HUB';
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Текущий профиль',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: AppColors.accent,
                      child: Icon(Icons.person, color: Colors.white),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (user?.displayName ?? '').toUpperCase(),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            tenant,
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () {},
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                PrimaryButton(
                  label: 'QO\'SHISH',
                  onPressed: () {
                    Navigator.pop(ctx);
                    context.push('/login');
                  },
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 50,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('YOPISH'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ActionChipBtn extends StatelessWidget {
  const _ActionChipBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.highlighted = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: highlighted ? const Color(0xFF24304A) : AppColors.bgSoft,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (!highlighted) ...[
                Icon(icon, size: 18, color: AppColors.ink),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
              if (highlighted) ...[
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 18),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
