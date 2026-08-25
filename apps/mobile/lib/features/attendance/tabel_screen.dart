import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final tabelProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, (int, int)>(
  (ref, ym) {
    return ref.read(meRepositoryProvider).tabel(year: ym.$1, month: ym.$2);
  },
);

/// Employee timesheet («Tabel») — kunlar, belgi, oy xulosasi.
class TabelScreen extends ConsumerStatefulWidget {
  const TabelScreen({super.key});

  @override
  ConsumerState<TabelScreen> createState() => _TabelScreenState();
}

class _TabelScreenState extends ConsumerState<TabelScreen> {
  late int _year;
  late int _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
  }

  void _shift(int delta) {
    setState(() {
      final d = DateTime(_year, _month + delta);
      _year = d.year;
      _month = d.month;
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(tabelProvider((_year, _month)));
    final title = DateFormat('MMMM yyyy', 'uz').format(DateTime(_year, _month));

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: const Text('Tabel'),
        titleSpacing: 0,
        actions: [
          IconButton(
            onPressed: () => context.push('/marks'),
            icon: const Icon(Icons.list_alt),
            tooltip: 'Barcha qaydlar',
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(tabelProvider((_year, _month)));
          await ref.read(tabelProvider((_year, _month)).future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => _shift(-1),
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Text(
                      title[0].toUpperCase() + title.substring(1),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => _shift(1),
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            async.when(
              loading: () => const SectionCard(
                child: SizedBox(
                  height: 80,
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (e, _) => SectionCard(
                child: Text('$e', style: const TextStyle(color: AppColors.danger)),
              ),
              data: (data) {
                final summary =
                    (data['summary'] as Map?)?.cast<String, dynamic>() ?? {};
                final days = (data['days'] as List?) ?? [];
                final marks = (data['marks'] as List?) ?? [];
                final linked = data['linked'] == true;

                if (!linked) {
                  return const SectionCard(
                    child: Text(
                      'Xodim profili bog‘lanmagan — tabel bo‘sh. '
                      'Demo uchun employee@demo.local bilan kiring.',
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Oy xulosasi',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: [
                              _StatChip(
                                label: 'Kelgan',
                                value: '${summary['presentDays'] ?? 0}',
                                color: AppColors.accent,
                              ),
                              _StatChip(
                                label: 'Kech',
                                value: '${summary['lateDays'] ?? 0}',
                                color: AppColors.warn,
                              ),
                              _StatChip(
                                label: 'Yo‘q',
                                value: '${summary['absentDays'] ?? 0}',
                                color: AppColors.danger,
                              ),
                              _StatChip(
                                label: 'Kech (daq)',
                                value: '${summary['lateMinutes'] ?? 0}',
                                color: AppColors.inkMuted,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Kunlar',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          if (days.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Text(
                                'Bu oy uchun kunlar hali yo‘q',
                                style: TextStyle(color: AppColors.inkMuted),
                              ),
                            )
                          else
                            ...days.map((raw) {
                              final d = raw as Map;
                              final date = d['date']?.toString() ?? '';
                              final status = d['status']?.toString() ?? '';
                              final first = _fmt(d['firstIn']);
                              final last = _fmt(d['lastOut']);
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(date),
                                subtitle: Text(
                                  '$first – $last',
                                  style: const TextStyle(
                                    color: AppColors.inkMuted,
                                    fontSize: 12,
                                  ),
                                ),
                                trailing: StatusChip(status: status),
                              );
                            }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Belgilar',
                                  style: TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ),
                              LinkText(
                                'Barchasi',
                                onTap: () => context.push('/marks'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          if (marks.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Text(
                                'Belgilar yo‘q',
                                style: TextStyle(color: AppColors.inkMuted),
                              ),
                            )
                          else
                            ...marks.take(12).map((raw) {
                              final m = raw as Map;
                              final dir = m['direction']?.toString() ?? '';
                              final src = m['source']?.toString() ?? '';
                              final at = DateTime.tryParse(
                                    m['occurredAt']?.toString() ?? '',
                                  )?.toLocal();
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(
                                  dir == 'IN' ? Icons.login : Icons.logout,
                                  color: dir == 'IN'
                                      ? AppColors.accent
                                      : AppColors.warn,
                                ),
                                title: Text('$dir · $src'),
                                subtitle: Text(
                                  at == null
                                      ? '—'
                                      : DateFormat('dd.MM HH:mm').format(at),
                                  style: const TextStyle(
                                    color: AppColors.inkMuted,
                                    fontSize: 12,
                                  ),
                                ),
                              );
                            }),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  String _fmt(dynamic v) {
    if (v == null) return '--:--';
    final dt = DateTime.tryParse(v.toString())?.toLocal();
    if (dt == null) return '--:--';
    return DateFormat('HH:mm').format(dt);
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: color,
            ),
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }
}
