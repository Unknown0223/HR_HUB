import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final inboxProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).inbox();
});

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(inboxProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Tasdiq navbati'),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(inboxProvider);
          await ref.read(inboxProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => EmptyState(message: '$e'),
          data: (data) {
            final absences = (data['absences'] as List?) ?? [];
            final requests = (data['requests'] as List?) ?? [];
            if (absences.isEmpty && requests.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(message: 'Kutilayotgan so‘rov yo‘q'),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ...absences.map((a) {
                  final m = a as Map;
                  final emp = m['employee'];
                  final name = emp is Map
                      ? '${emp['lastName'] ?? ''} ${emp['firstName'] ?? ''}'
                          .trim()
                      : '';
                  final type = m['absenceType'];
                  final typeName =
                      type is Map ? type['name']?.toString() ?? '' : '';
                  return _ReviewCard(
                    title: name.isEmpty ? 'Yo‘qlik' : name,
                    subtitle:
                        '$typeName · ${_d(m['startDate'])} → ${_d(m['endDate'])}',
                    onApprove: () => _reviewAbsence(ref, context, m['id'], true),
                    onReject: () => _reviewAbsence(ref, context, m['id'], false),
                  );
                }),
                ...requests.map((r) {
                  final m = r as Map;
                  final emp = m['employee'];
                  final name = emp is Map
                      ? '${emp['lastName'] ?? ''} ${emp['firstName'] ?? ''}'
                          .trim()
                      : '';
                  return _ReviewCard(
                    title: m['title']?.toString() ?? 'So‘rov',
                    subtitle: '$name · ${m['type'] ?? ''}',
                    onApprove: () =>
                        _reviewRequest(ref, context, m['id'], true),
                    onReject: () =>
                        _reviewRequest(ref, context, m['id'], false),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _reviewAbsence(
    WidgetRef ref,
    BuildContext context,
    dynamic id,
    bool approve,
  ) async {
    try {
      await ref.read(meRepositoryProvider).reviewAbsence(
            id.toString(),
            approve ? 'approved' : 'rejected',
          );
      ref.invalidate(inboxProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(approve ? 'Tasdiqlandi' : 'Rad etildi')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _reviewRequest(
    WidgetRef ref,
    BuildContext context,
    dynamic id,
    bool approve,
  ) async {
    try {
      await ref.read(meRepositoryProvider).reviewRequest(
            id.toString(),
            approve ? 'approved' : 'rejected',
          );
      ref.invalidate(inboxProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(approve ? 'Tasdiqlandi' : 'Rad etildi')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  String _d(dynamic v) {
    final dt = DateTime.tryParse(v?.toString() ?? '');
    if (dt == null) return '—';
    return DateFormat('dd.MM').format(dt.toLocal());
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({
    required this.title,
    required this.subtitle,
    required this.onApprove,
    required this.onReject,
  });

  final String title;
  final String subtitle;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onReject,
                    child: const Text('Rad'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: onApprove,
                    child: const Text('Tasdiq'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
