import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final marksProvider = FutureProvider.autoDispose((ref) {
  final now = DateTime.now();
  final from = DateTime(now.year, now.month, 1).toIso8601String();
  return ref.read(meRepositoryProvider).marks(from: from);
});

class MarksScreen extends ConsumerWidget {
  const MarksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(marksProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: const Text('Barcha qaydlar'),
        titleSpacing: 0,
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.person_search_outlined),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.filter_list),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(marksProvider);
          await ref.read(marksProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyState(message: 'Xato: $e'),
          data: (data) {
            final items = (data['items'] as List?) ?? [];
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 140),
                  EmptyState(message: 'Qaydlar topilmadi'),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final m = items[i] as Map;
                final dir = m['direction']?.toString() ?? '';
                final at = DateTime.tryParse(m['occurredAt']?.toString() ?? '')
                    ?.toLocal();
                final source = m['source']?.toString() ?? '';
                return SectionCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: dir == 'IN'
                            ? AppColors.accent.withValues(alpha: 0.15)
                            : AppColors.warn.withValues(alpha: 0.15),
                        child: Icon(
                          dir == 'IN' ? Icons.login : Icons.logout,
                          color:
                              dir == 'IN' ? AppColors.accent : AppColors.warn,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              dir,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              at == null
                                  ? '—'
                                  : DateFormat('dd.MM.yyyy HH:mm').format(at),
                              style: const TextStyle(color: AppColors.muted),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        source,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
