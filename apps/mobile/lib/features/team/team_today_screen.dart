import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final teamTodayProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).teamToday();
});

class TeamTodayScreen extends ConsumerWidget {
  const TeamTodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teamTodayProvider);
    final user = ref.watch(authProvider).user;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: const Text('Xodimlar'),
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.filter_list),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(teamTodayProvider);
          await ref.read(teamTodayProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyState(message: '$e'),
          data: (data) {
            final items = (data['items'] as List?) ?? [];
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                SectionCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.bar_chart,
                              color: AppColors.accent, size: 18),
                          const SizedBox(width: 8),
                          const Text(
                            'Davomat',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          SizedBox(
                            width: 90,
                            height: 90,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                CircularProgressIndicator(
                                  value: 1,
                                  strokeWidth: 10,
                                  color: const Color(0xFFA3C4F3),
                                  backgroundColor:
                                      AppColors.accent.withValues(alpha: 0.15),
                                ),
                                Text(
                                  '${items.isEmpty ? 0 : items.length}',
                                  style: const TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.inkMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Text(
                              '${items.isEmpty ? 0 : items.length}  dam olish kuni',
                              style: const TextStyle(color: AppColors.inkMuted),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      PrimaryButton(
                        label: 'Tafsilotlar',
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.checklist_rtl,
                              color: AppColors.accent, size: 18),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'So\'rovlar',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          LinkText(
                            'Barchasi',
                            onTap: () => context.push('/requests'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'So\'rovlar yo\'q',
                        style: TextStyle(color: AppColors.inkMuted),
                      ),
                      const SizedBox(height: 12),
                      PrimaryButton(
                        label: 'So\'rov yaratish',
                        onPressed: () => context.push('/create-absence'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.groups_outlined,
                              color: AppColors.accent, size: 18),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Xodimlar',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          const LinkText('Barchasi'),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (items.isEmpty)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: AvatarCircle(name: user?.displayName),
                          title: Text(
                            (user?.displayName ?? '—').toUpperCase(),
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          subtitle: Text(
                            (user?.role ?? '').toUpperCase(),
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 11,
                            ),
                          ),
                          trailing: const Icon(Icons.chevron_right,
                              color: AppColors.inkMuted),
                        )
                      else
                        ...items.take(6).map((raw) {
                          final m = raw as Map;
                          final emp = m['employee'];
                          final name = emp is Map
                              ? '${emp['lastName'] ?? ''} ${emp['firstName'] ?? ''}'
                                  .trim()
                              : '—';
                          final position = emp is Map && emp['position'] is Map
                              ? (emp['position'] as Map)['name']?.toString() ??
                                  ''
                              : '';
                          return Column(
                            children: [
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: AvatarCircle(name: name),
                                title: Text(
                                  name.toUpperCase(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                                subtitle: Text(
                                  position.toUpperCase(),
                                  style: const TextStyle(
                                    color: AppColors.inkMuted,
                                    fontSize: 11,
                                  ),
                                ),
                                trailing: const Icon(Icons.chevron_right,
                                    color: AppColors.inkMuted),
                              ),
                              const Divider(height: 1, color: AppColors.line),
                            ],
                          );
                        }),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.cake_outlined,
                              color: AppColors.accent, size: 18),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Tug\'ilgan kunlar',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          const LinkText('Barchasi'),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: AvatarCircle(name: user?.displayName),
                        title: Text(
                          (user?.displayName ?? '—').toUpperCase(),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: const Text(
                          '—',
                          style: TextStyle(
                            color: AppColors.inkMuted,
                            fontSize: 11,
                          ),
                        ),
                        trailing: Text(
                          DateFormat('d MMM', 'uz').format(DateTime.now()),
                          style: const TextStyle(color: AppColors.inkMuted),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
