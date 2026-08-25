import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class ProfileDetailsScreen extends ConsumerWidget {
  const ProfileDetailsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final emp = user?.employee;
    final division = emp?['division'];
    final position = emp?['position'];
    final name = (user?.displayName ?? '').toUpperCase();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: const Text('Profil'),
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: () => context.push('/team-today'),
            icon: const Icon(Icons.groups_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(child: AvatarCircle(name: user?.displayName, radius: 48)),
          const SizedBox(height: 12),
          Text(
            name.isEmpty ? '—' : name,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 16),
          SectionCard(
            child: Column(
              children: [
                _kv('17.10.1987', 'Tug\'ilgan kun'),
                _kv('Erkak', 'Jins'),
                _kv('Ko\'rsatilmagan', 'Rahbar'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.contacts_outlined,
                        color: AppColors.accent, size: 18),
                    SizedBox(width: 8),
                    Text(
                      'Kontaktlar',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _contactRow(
                  value: '998975077077',
                  label: 'Telefon',
                  showCall: true,
                ),
                _contactRow(
                  value: user?.email ?? 'Ko\'rsatilmagan',
                  label: 'E-mail',
                  showCall: false,
                ),
                _kv('Город Ташкент', 'Mintaqa'),
                _kv('Ташкент', 'Yashash manzili'),
                _kv('Ko\'rsatilmagan', 'Doimiy ro\'yxatdan o\'tgan manzili'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.list_alt, color: AppColors.accent, size: 18),
                    SizedBox(width: 8),
                    Text(
                      'Ish haqida ma\'lumotlar',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _kv(
                  division is Map
                      ? division['name']?.toString() ?? 'ADMIN'
                      : 'ADMIN',
                  'Bo\'lim',
                ),
                _kv('ADMIN', 'Jamoa'),
                _kv(
                  position is Map
                      ? position['name']?.toString() ??
                          (user?.role.toUpperCase() ?? '—')
                      : (user?.role.toUpperCase() ?? '—'),
                  'Lavozim',
                ),
                _kv(
                  emp?['hiredAt']?.toString().split('T').first ?? '15.08.2022',
                  'Qabul qilingan sana',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.account_balance_outlined,
                        color: AppColors.accent, size: 18),
                    SizedBox(width: 8),
                    Text(
                      'Hisob raqamlari',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _kv('Ko\'rsatilmagan', 'STIR'),
                _kv('Ko\'rsatilmagan', 'ShJBPH'),
                _kv('Ko\'rsatilmagan', 'JShShIR'),
                Row(
                  children: [
                    Expanded(
                      child: _kv(
                        emp?['tabNumber']?.toString() ?? '0000000074',
                        'Xodim raqami',
                      ),
                    ),
                    IconButton(
                      onPressed: () async {
                        final v =
                            emp?['tabNumber']?.toString() ?? '0000000074';
                        await Clipboard.setData(ClipboardData(text: v));
                      },
                      icon: const Icon(Icons.copy, color: AppColors.accent),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Row(
              children: [
                const Icon(Icons.description_outlined,
                    color: AppColors.accent, size: 18),
                const SizedBox(width: 8),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hujjatlar',
                        style: TextStyle(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text('Паспорт (по умолчанию)'),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.open_in_new,
                      color: AppColors.accent, size: 18),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String value, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            Text(
              label,
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _contactRow({
    required String value,
    required String label,
    required bool showCall,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(child: _kv(value, label)),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.copy, size: 18, color: AppColors.inkMuted),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.share_outlined,
                size: 18, color: AppColors.inkMuted),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: showCall ? AppColors.callGreen : AppColors.bgSoft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              showCall ? Icons.phone : Icons.mail_outline,
              color: showCall ? Colors.white : AppColors.inkFaint,
              size: 18,
            ),
          ),
        ],
      ),
    );
  }
}
