import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final marksProvider = FutureProvider.autoDispose((ref) {
  final now = DateTime.now();
  final from = DateTime(now.year, now.month, 1).toIso8601String();
  return ref.read(meRepositoryProvider).marks(from: from);
});

enum _MarkFilter { all, entry, exit }

class MarksScreen extends ConsumerStatefulWidget {
  const MarksScreen({super.key});

  @override
  ConsumerState<MarksScreen> createState() => _MarksScreenState();
}

class _MarksScreenState extends ConsumerState<MarksScreen> {
  _MarkFilter _filter = _MarkFilter.all;

  static const _filterLabels = {
    _MarkFilter.all: 'Barchasi',
    _MarkFilter.entry: 'Faqat kirish',
    _MarkFilter.exit: 'Faqat chiqish',
  };

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(marksProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: Text(context.t('Barcha qaydlar')),
        titleSpacing: 0,
        actions: [
          PopupMenuButton<_MarkFilter>(
            tooltip: context.t('Saralash'),
            initialValue: _filter,
            onSelected: (f) => setState(() => _filter = f),
            icon: Badge(
              isLabelVisible: _filter != _MarkFilter.all,
              smallSize: 8,
              backgroundColor: AppColors.accent,
              child: const Icon(Icons.filter_list),
            ),
            itemBuilder: (_) => [
              for (final f in _MarkFilter.values)
                CheckedPopupMenuItem(
                  value: f,
                  checked: f == _filter,
                  child: Text(context.t(_filterLabels[f]!)),
                ),
            ],
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
          error: (e, _) => EmptyState(message: context.t('Xato: {0}', [e])),
          data: (data) {
            final items = ((data['items'] as List?) ?? [])
                .where(
                  (m) => switch (_filter) {
                    _MarkFilter.all => true,
                    _MarkFilter.entry => markIsEntry(m as Map),
                    _MarkFilter.exit => !markIsEntry(m as Map),
                  },
                )
                .toList();
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 140),
                  EmptyState(
                    message: _filter == _MarkFilter.all
                        ? context.t('Bu oyda qaydlar yo‘q')
                        : context.t('«{0}» bo‘yicha qayd topilmadi', [
                            context.t(_filterLabels[_filter]!),
                          ]),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final m = items[i] as Map;
                final entry = markIsEntry(m);
                final at = DateTime.tryParse(
                  m['occurredAt']?.toString() ?? '',
                )?.toLocal();
                final source = punchSourceLabel(m['source']);
                final outside = markOutsideGeofence(m);
                final comment = markField(m, 'geofenceComment')?.toString();
                final invalid = markField(m, 'isValid') == false;
                return SectionCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: entry
                            ? AppColors.accent.withValues(alpha: 0.15)
                            : AppColors.warn.withValues(alpha: 0.15),
                        child: Icon(
                          entry ? Icons.login : Icons.logout,
                          color: entry ? AppColors.accent : AppColors.warn,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              markKindLabel(m),
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              at == null
                                  ? '—'
                                  : DateFormat('dd.MM.yyyy HH:mm').format(at),
                              style: const TextStyle(color: AppColors.muted),
                            ),
                            if (outside)
                              Text(
                                comment == null || comment.isEmpty
                                    ? context.t('Hududdan tashqarida')
                                    : context.t('Hududdan tashqarida · {0}', [
                                        comment,
                                      ]),
                                style: const TextStyle(
                                  color: AppColors.warn,
                                  fontSize: 12,
                                ),
                              ),
                            if (invalid)
                              Text(
                                context.t('Yaroqsiz belgi'),
                                style: const TextStyle(
                                  color: AppColors.danger,
                                  fontSize: 12,
                                ),
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
