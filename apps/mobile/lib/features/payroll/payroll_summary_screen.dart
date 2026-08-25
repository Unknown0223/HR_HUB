import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final payrollProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).payrollSummary();
});

class PayrollSummaryScreen extends ConsumerStatefulWidget {
  const PayrollSummaryScreen({super.key});

  @override
  ConsumerState<PayrollSummaryScreen> createState() =>
      _PayrollSummaryScreenState();
}

class _PayrollSummaryScreenState extends ConsumerState<PayrollSummaryScreen> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(payrollProvider);
    final user = ref.watch(authProvider).user;
    final money = NumberFormat.decimalPattern();
    final monthTitle = DateFormat('MMMM yyyy', 'uz').format(_month);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Ish haqi', centerTitle: true),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(payrollProvider);
          await ref.read(payrollProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                AvatarCircle(name: user?.displayName, radius: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (user?.displayName ?? '').toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        (user?.role ?? '—').toUpperCase(),
                        style: const TextStyle(
                          color: AppColors.inkMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: () => setState(() {
                    _month = DateTime(_month.year, _month.month - 1);
                  }),
                  icon: const Icon(Icons.chevron_left),
                ),
                Text(
                  monthTitle[0].toUpperCase() + monthTitle.substring(1),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                IconButton(
                  onPressed: () => setState(() {
                    _month = DateTime(_month.year, _month.month + 1);
                  }),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 4, bottom: 16),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.warn,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Taxminiy hisob',
                  style: TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
            async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(message: '$e'),
              data: (data) {
                final base = data['baseSalary'];
                final amount = base == null
                    ? 0
                    : (num.tryParse(base.toString()) ?? 0);
                final amountStr = '${money.format(amount)} сум';
                return Column(
                  children: [
                    SectionCard(
                      child: Column(
                        children: [
                          _row('To\'lanishi kerak', amountStr),
                          const Divider(color: AppColors.line),
                          _row('Tolov miqdori', amountStr),
                          const Divider(color: AppColors.line),
                          _row('To\'landi', '0 сум'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SectionCard(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.bar_chart,
                                  color: AppColors.accent, size: 18),
                              const SizedBox(width: 8),
                              const Expanded(child: Text('Tolov miqdori')),
                              Text(
                                amountStr,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const Icon(Icons.chevron_right,
                                  color: AppColors.inkMuted),
                            ],
                          ),
                          const SizedBox(height: 12),
                          _rowColored('Hisoblandi', amountStr, AppColors.success),
                          _rowColored('Ushlab qolindi', '0 сум', AppColors.danger),
                          const Padding(
                            padding: EdgeInsets.only(left: 8, top: 4),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                '- Штрафы за нарушение дисциплины  0 сум',
                                style: TextStyle(
                                  color: AppColors.inkMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ),
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
                              const Icon(Icons.payments_outlined,
                                  color: AppColors.accent, size: 18),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Maosh',
                                  style: TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ),
                              Text(
                                '01.${_month.month.toString().padLeft(2, '0')}.${_month.year} dan',
                                style: const TextStyle(
                                  color: AppColors.inkMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Штрафы за нарушение дисциплины',
                            style: TextStyle(color: AppColors.inkMuted),
                          ),
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

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.bar_chart, color: AppColors.accent, size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text(k)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _rowColored(String k, String v, Color c) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(k)),
          Text(v, style: TextStyle(color: c, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
