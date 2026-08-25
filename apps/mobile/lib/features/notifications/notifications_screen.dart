import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final notificationsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).notifications();
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Bildirishnomalar'),
        titleSpacing: 0,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              style: IconButton.styleFrom(
                backgroundColor: AppColors.bgSoft,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: () async {
                await ref.read(meRepositoryProvider).markAllNotificationsRead();
                ref.invalidate(notificationsProvider);
              },
              icon: const Icon(Icons.done_all, size: 20),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(notificationsProvider);
          await ref.read(notificationsProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyState(message: '$e'),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 160),
                  EmptyState(message: ''),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final m = items[i] as Map;
                final unread = m['readAt'] == null;
                final at = DateTime.tryParse(m['createdAt']?.toString() ?? '')
                    ?.toLocal();
                return SectionCard(
                  child: InkWell(
                    onTap: () async {
                      if (unread) {
                        await ref
                            .read(meRepositoryProvider)
                            .markNotificationRead(m['id'].toString());
                        ref.invalidate(notificationsProvider);
                      }
                    },
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          unread
                              ? Icons.notifications_active
                              : Icons.notifications_none,
                          color: unread ? AppColors.accent : AppColors.muted,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                m['title']?.toString() ?? '',
                                style: TextStyle(
                                  fontWeight: unread
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                              if (m['body'] != null)
                                Text(
                                  m['body'].toString(),
                                  style:
                                      const TextStyle(color: AppColors.muted),
                                ),
                              if (at != null)
                                Text(
                                  DateFormat('dd.MM.yyyy HH:mm').format(at),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.muted,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
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
