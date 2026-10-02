import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/i18n/app_lang.dart';
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

const _requestTypeLabels = {
  'absence': 'Yo‘qlik',
  'schedule_change': 'Jadvalni o‘zgartirish',
  'roster_change': 'Smena almashinuvi',
  'overtime': 'Qo‘shimcha ish vaqti',
  'location': 'Ish joyi',
  'hr_change': 'HR murojaati',
};

const _statusFilters = {
  null: 'Barchasi',
  'pending': 'Kutilmoqda',
  'approved': 'Tasdiqlangan',
  'rejected': 'Rad etilgan',
  'cancelled': 'Bekor qilingan',
};

class _RequestsScreenState extends ConsumerState<RequestsScreen> {
  late DateTime _month;
  String? _status;

  DateTime? _date(Object? v) =>
      DateTime.tryParse(v?.toString() ?? '')?.toLocal();

  bool _absenceInMonth(Map m) {
    final start = _date(m['startDate']);
    final end = _date(m['endDate']) ?? start;
    if (start == null || end == null) return true;
    final monthEnd = DateTime(_month.year, _month.month + 1);
    return start.isBefore(monthEnd) && !end.isBefore(_month);
  }

  bool _createdInMonth(Map m) {
    final at = _date(m['createdAt']);
    return at == null || (at.year == _month.year && at.month == _month.month);
  }

  bool _statusMatches(Map m) => _status == null || m['status'] == _status;

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
    final monthTitle = DateFormat(
      context.monthYearPattern,
      context.dateLocale,
    ).format(_month);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: Text(context.t('So\'rovlar ro\'yxati')),
        titleSpacing: 0,
        actions: [
          if (isApprover)
            IconButton(
              onPressed: () => context.push('/inbox'),
              icon: const Icon(Icons.inbox_outlined),
            ),
          PopupMenuButton<String?>(
            tooltip: context.t('Holat bo‘yicha'),
            onSelected: (s) => setState(() => _status = s),
            icon: Badge(
              isLabelVisible: _status != null,
              smallSize: 8,
              backgroundColor: AppColors.accent,
              child: const Icon(Icons.filter_list),
            ),
            itemBuilder: (_) => [
              for (final e in _statusFilters.entries)
                CheckedPopupMenuItem<String?>(
                  value: e.key,
                  checked: e.key == _status,
                  child: Text(context.t(e.value)),
                ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.accent,
        onPressed: _pickKind,
        icon: const Icon(Icons.add),
        label: Text(context.t('Yaratish')),
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
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => EmptyState(message: '$e'),
                data: (data) {
                  final absences = ((data['absences'] as List?) ?? [])
                      .cast<Map>()
                      .where((m) => _absenceInMonth(m) && _statusMatches(m))
                      .toList();
                  final requests = ((data['requests'] as List?) ?? [])
                      .cast<Map>()
                      .where((m) => _createdInMonth(m) && _statusMatches(m))
                      .toList();
                  if (absences.isEmpty && requests.isEmpty) {
                    return ListView(
                      children: [
                        const SizedBox(height: 120),
                        EmptyState(
                          message: _status == null
                              ? context.t('Bu oyda so‘rovlar yo‘q')
                              : context.t('Bu oyda «{0}» so‘rovlar yo‘q', [
                                  context.t(_statusFilters[_status]!),
                                ]),
                        ),
                      ],
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      ...absences.map((m) {
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
                                                  context.t('Yo\'qlik')
                                            : context.t('Yo\'qlik'),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      Text(
                                        [
                                          formatApiDateRange(
                                            m['startDate'],
                                            m['endDate'],
                                          ),
                                          if (m['startTime'] != null &&
                                              m['endTime'] != null)
                                            '${m['startTime']}–${m['endTime']}',
                                        ].join(' · '),
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
                      ...requests.map((m) {
                        final type = m['type']?.toString();
                        final label = _requestTypeLabels[type];
                        final title = m['title']?.toString() ?? '';
                        final created = _date(m['createdAt']);
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
                                        (label == null
                                                ? null
                                                : context.t(label)) ??
                                            type ??
                                            context.t('So‘rov'),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      if (title.isNotEmpty)
                                        Text(
                                          title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      if (created != null)
                                        Text(
                                          DateFormat(
                                            'dd.MM.yyyy HH:mm',
                                          ).format(created),
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

  Future<void> _pickKind() async {
    final route = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.cardAlt,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.event_busy_outlined,
                  color: AppColors.accent),
              title: Text(context.t('Ish joyida yo‘qlik')),
              subtitle: Text(context.t('Ta’til, kasallik, shaxsiy ish')),
              onTap: () => Navigator.pop(ctx, '/create-absence'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined,
                  color: AppColors.accent),
              title: Text(context.t('Avans')),
              subtitle: Text(context.t('Ish haqi hisobidan avans so‘rash')),
              onTap: () => Navigator.pop(ctx, '/advance'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (route != null && mounted) context.push(route);
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
