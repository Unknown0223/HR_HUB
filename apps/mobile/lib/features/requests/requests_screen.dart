import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final myRequestsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).requests();
});

class RequestsScreen extends ConsumerStatefulWidget {
  const RequestsScreen({super.key});

  @override
  ConsumerState<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends ConsumerState<RequestsScreen> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myRequestsProvider);
    final isApprover = ref.watch(authProvider).user?.isApprover == true;
    final monthTitle = DateFormat('MMMM yyyy', 'uz').format(_month);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: const Text('So\'rovlar ro\'yxati'),
        titleSpacing: 0,
        actions: [
          if (isApprover)
            IconButton(
              onPressed: () => context.push('/inbox'),
              icon: const Icon(Icons.inbox_outlined),
            ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.filter_list),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.accent,
        onPressed: () => context.push('/create-absence'),
        icon: const Icon(Icons.add),
        label: const Text('Yaratish'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _navBtn(
                  Icons.chevron_left,
                  () => setState(() {
                    _month = DateTime(_month.year, _month.month - 1);
                  }),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    monthTitle[0].toUpperCase() + monthTitle.substring(1),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                _navBtn(
                  Icons.chevron_right,
                  () => setState(() {
                    _month = DateTime(_month.year, _month.month + 1);
                  }),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.line),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async {
                ref.invalidate(myRequestsProvider);
                await ref.read(myRequestsProvider.future);
              },
              child: async.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => EmptyState(message: '$e'),
                data: (data) {
                  final absences = (data['absences'] as List?) ?? [];
                  final requests = (data['requests'] as List?) ?? [];
                  if (absences.isEmpty && requests.isEmpty) {
                    return ListView(
                      children: const [
                        SizedBox(height: 120),
                        EmptyState(message: 'So\'rovlar yo\'q'),
                      ],
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      ...absences.map((a) {
                        final m = a as Map;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: SectionCard(
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        m['absenceType'] is Map
                                            ? (m['absenceType'] as Map)['name']
                                                    ?.toString() ??
                                                'Yo\'qlik'
                                            : 'Yo\'qlik',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      Text(
                                        '${m['startDate'] ?? ''} – ${m['endDate'] ?? ''}',
                                        style: const TextStyle(
                                          color: AppColors.inkMuted,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                StatusChip(
                                  status: m['status']?.toString() ?? '',
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                      ...requests.map((r) {
                        final m = r as Map;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: SectionCard(
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    m['type']?.toString() ?? 'So\'rov',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                StatusChip(
                                  status: m['status']?.toString() ?? '',
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _navBtn(IconData icon, VoidCallback onTap) {
    return Material(
      color: AppColors.bgSoft,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 20),
        ),
      ),
    );
  }
}
