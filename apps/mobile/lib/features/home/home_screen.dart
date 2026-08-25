import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final todayProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).today();
});

final homeRequestsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).requests();
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todayAsync = ref.watch(todayProvider);
    final reqAsync = ref.watch(homeRequestsProvider);
    final now = DateTime.now();
    final dayLabel = DateFormat('d MMMM yyyy (E)', 'uz').format(now);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () async {
            ref.invalidate(todayProvider);
            ref.invalidate(homeRequestsProvider);
            await Future.wait([
              ref.read(todayProvider.future),
              ref.read(homeRequestsProvider.future),
            ]);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Asosiy',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        todayAsync.when(
                          data: (d) {
                            final status = d['status']?.toString() ?? '';
                            final isOff =
                                status == 'day_off' || status == 'leave';
                            return Text(
                              isOff
                                  ? 'Dam olish kuni - $dayLabel'
                                  : 'Ish kuni - $dayLabel',
                              style: const TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 13,
                              ),
                            );
                          },
                          loading: () => Text(
                            dayLabel,
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 13,
                            ),
                          ),
                          error: (_, __) => Text(
                            dayLabel,
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => context.push('/notifications'),
                    icon: const Icon(
                      Icons.notifications_none_rounded,
                      color: AppColors.ink,
                      size: 26,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              todayAsync.when(
                loading: () => const SectionCard(
                  child: SizedBox(
                    height: 72,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
                error: (e, _) => SectionCard(
                  child: Text('$e', style: const TextStyle(color: AppColors.danger)),
                ),
                data: (data) => _ScheduleCard(data: data),
              ),
              const SizedBox(height: 12),
              SectionCard(
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.gps_fixed,
                            color: AppColors.accent, size: 18),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Qaydnoma',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        LinkText(
                          'Tabel',
                          onTap: () => context.push('/tabel'),
                        ),
                        const SizedBox(width: 10),
                        LinkText(
                          'Barchasi',
                          onTap: () => context.push('/marks'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    todayAsync.when(
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ),
                      error: (_, __) => const Text(
                        'Ro\'yxat bo\'sh',
                        style: TextStyle(color: AppColors.inkMuted),
                      ),
                      data: (data) {
                        final marks = (data['marks'] as List?) ?? [];
                        if (marks.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Text(
                              'Ro\'yxat bo\'sh',
                              style: TextStyle(color: AppColors.inkMuted),
                            ),
                          );
                        }
                        return Column(
                          children: marks.take(5).map((raw) {
                            final m = raw as Map;
                            final dir = m['direction']?.toString() ?? '';
                            final src = m['source']?.toString() ?? '';
                            final at = DateTime.tryParse(
                                  m['occurredAt']?.toString() ?? '',
                                )?.toLocal();
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              leading: Icon(
                                dir == 'IN' ? Icons.login : Icons.logout,
                                color: dir == 'IN'
                                    ? AppColors.accent
                                    : AppColors.warn,
                              ),
                              title: Text('$dir · $src'),
                              trailing: Text(
                                at == null
                                    ? '—'
                                    : DateFormat('HH:mm').format(at),
                                style: const TextStyle(
                                  color: AppColors.inkMuted,
                                  fontSize: 13,
                                ),
                              ),
                            );
                          }).toList(),
                        );
                      },
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => context.push('/face-punch'),
                            icon: const Icon(Icons.face_outlined, size: 18),
                            label: const Text('Face ID'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => context.push('/gps-punch'),
                            icon: const Icon(Icons.my_location, size: 18),
                            label: const Text('GPS'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => context.push('/qr-punch'),
                            icon: const Icon(Icons.qr_code_scanner, size: 18),
                            label: const Text('QR'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Modullar',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  LinkText(
                    'Hammasi >',
                    onTap: () => context.push('/modules'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _ModuleTile(
                    icon: Icons.directions_run,
                    label: 'Qatnashish',
                    onTap: () => context.push('/face-punch'),
                  ),
                  const SizedBox(width: 10),
                  _ModuleTile(
                    icon: Icons.table_chart_outlined,
                    label: 'Tabel',
                    onTap: () => context.push('/tabel'),
                  ),
                  const SizedBox(width: 10),
                  _ModuleTile(
                    icon: Icons.assignment_outlined,
                    label: 'So\'rovlar',
                    onTap: () => context.push('/requests'),
                  ),
                  const SizedBox(width: 10),
                  _ModuleTile(
                    icon: Icons.payments_outlined,
                    label: 'To\'lov',
                    onTap: () => context.push('/payroll'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
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
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        LinkText(
                          'Barchasi',
                          onTap: () => context.push('/requests'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    reqAsync.when(
                      loading: () => const Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ),
                      error: (_, __) => const Text(
                        'So\'rovlar yo\'q',
                        style: TextStyle(color: AppColors.inkMuted),
                      ),
                      data: (data) {
                        final absences = (data['absences'] as List?) ?? [];
                        final requests = (data['requests'] as List?) ?? [];
                        if (absences.isEmpty && requests.isEmpty) {
                          return Column(
                            children: [
                              const Text(
                                'So\'rovlar yo\'q',
                                style: TextStyle(color: AppColors.inkMuted),
                              ),
                              const SizedBox(height: 16),
                              PrimaryButton(
                                label: 'So\'rov yaratish',
                                onPressed: () =>
                                    _showRequestTypes(context),
                              ),
                            ],
                          );
                        }
                        return Column(
                          children: [
                            ...absences.take(3).map((a) {
                              final m = a as Map;
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  m['absenceType'] is Map
                                      ? (m['absenceType'] as Map)['name']
                                              ?.toString() ??
                                          'Yo\'qlik'
                                      : 'Yo\'qlik',
                                ),
                                subtitle: Text(
                                  '${m['startDate'] ?? ''} – ${m['endDate'] ?? ''}',
                                  style: const TextStyle(
                                    color: AppColors.inkMuted,
                                    fontSize: 12,
                                  ),
                                ),
                                trailing: StatusChip(
                                  status: m['status']?.toString() ?? '',
                                ),
                              );
                            }),
                            const SizedBox(height: 8),
                            PrimaryButton(
                              label: 'So\'rov yaratish',
                              onPressed: () => _showRequestTypes(context),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRequestTypes(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final items = <(IconData, String, String)>[
          (Icons.directions_run, 'Ish joy. yo\'q.', '/create-absence'),
          (Icons.swap_horiz, 'Kun almash.', '/create-absence'),
          (Icons.edit_calendar_outlined, 'Jadval o\'zg.', '/create-absence'),
          (Icons.person_search_outlined, 'Belgilash', '/gps-punch'),
          (Icons.location_on_outlined, 'Joylashuv so\'rovi', '/gps-punch'),
          (Icons.work_history_outlined, 'Qo\'shimcha ish vaqti', '/create-absence'),
          (Icons.person_off_outlined, 'Ishdan bo\'shatish', '/create-absence'),
          (Icons.beach_access_outlined, 'Ta\'til', '/create-absence'),
        ];
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'So\'rov turini tanlang',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                ...items.map(
                  (e) => ListTile(
                    leading: Icon(e.$1, color: AppColors.inkMuted),
                    title: Text(e.$2),
                    onTap: () {
                      Navigator.pop(ctx);
                      context.push(e.$3);
                    },
                  ),
                ),
                PrimaryButton(
                  label: 'Yopish',
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final status = data['status']?.toString() ?? 'not_started';
    final firstIn = data['firstIn'];
    final lastOut = data['lastOut'];
    final isOff = status == 'day_off' || status == 'leave';

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppColors.accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'Jadval',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  isOff
                      ? 'O\'zingizga g\'amxo\'rlik qiling va dam oling'
                      : 'Ish jadvali',
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    const Icon(Icons.arrow_drop_down,
                        color: AppColors.accent, size: 28),
                    Text(
                      _fmt(firstIn),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Container(width: 1, height: 28, color: AppColors.line),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.arrow_drop_up,
                        color: AppColors.danger, size: 28),
                    Text(
                      _fmt(lastOut),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
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

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 88,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: AppColors.ink, size: 26),
                const SizedBox(height: 8),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
