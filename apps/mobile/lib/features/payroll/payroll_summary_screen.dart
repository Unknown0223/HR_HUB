import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/api/screen_cache.dart';
import '../../core/auth/auth_state.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/my_avatar.dart';
import '../../shared/widgets.dart';

final payrollProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, (int, int)>((ref, ym) {
      ref.cacheFor(screenCacheTtl);
      return ref
          .read(meRepositoryProvider)
          .payrollSummary(year: ym.$1, month: ym.$2);
    });

class PayrollSummaryScreen extends ConsumerStatefulWidget {
  const PayrollSummaryScreen({super.key});

  @override
  ConsumerState<PayrollSummaryScreen> createState() =>
      _PayrollSummaryScreenState();
}

class _PayrollSummaryScreenState extends ConsumerState<PayrollSummaryScreen> {
  late DateTime _month;
  final _money = NumberFormat.decimalPattern('ru');

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  String _sum(num v) => '${_money.format(v)} ${context.t('so‘m')}';

  (int, int) get _key => (_month.year, _month.month);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(payrollProvider(_key));
    final user = ref.watch(authProvider).user;
    final position = (user?.employee?['position'] as Map?)?['name']?.toString();
    final monthTitle = DateFormat(
      context.monthYearPattern,
      context.dateLocale,
    ).format(_month);
    final isCurrent =
        _month.year == DateTime.now().year &&
        _month.month == DateTime.now().month;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(
        title: context.t('Ish haqi'),
        centerTitle: true,
        actions: [
          TextButton.icon(
            onPressed: () => context.push('/advance'),
            icon: const Icon(Icons.account_balance_wallet_outlined, size: 18),
            label: Text(context.t('Avans')),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(payrollProvider(_key));
          await ref.read(payrollProvider(_key).future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      const MyAvatar(radius: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName ?? '—',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 16,
                              ),
                            ),
                            if (position != null && position.isNotEmpty)
                              Text(
                                position,
                                style: const TextStyle(
                                  color: AppColors.inkMuted,
                                  fontSize: 13,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 20, color: AppColors.line),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        onPressed: () => setState(
                          () =>
                              _month = DateTime(_month.year, _month.month - 1),
                        ),
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text(
                        monthTitle[0].toUpperCase() + monthTitle.substring(1),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                      IconButton(
                        onPressed: isCurrent
                            ? null
                            : () => setState(
                                () => _month = DateTime(
                                  _month.year,
                                  _month.month + 1,
                                ),
                              ),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.only(top: 60),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => EmptyState(message: '$e'),
              data: _content,
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(Map<String, dynamic> data) {
    final period = data['period'] as Map?;
    final base = num.tryParse('${data['baseSalary'] ?? ''}');
    if (period == null) {
      return Column(
        children: [
          const SizedBox(height: 8),
          EmptyState(
            message: context.t('Bu oy uchun ish haqi hali hisoblanmagan'),
            icon: Icons.payments_outlined,
          ),
          if (base != null && base > 0) ...[
            const SizedBox(height: 16),
            SectionCard(
              child: _row(
                context.t('Oklad (oylik stavka)'),
                _sum(base),
                bold: true,
              ),
            ),
          ],
        ],
      );
    }

    final totals = Map<String, dynamic>.from(data['totals'] as Map? ?? {});
    num t(String k) => num.tryParse('${totals[k] ?? 0}') ?? 0;
    final accruals = (data['accruals'] as List?) ?? [];
    final withholdings = (data['withholdings'] as List?) ?? [];
    final advances = (data['periodAdvances'] as List?) ?? [];
    final (statusText, statusColor) = switch (period['status']) {
      'closed' => (context.t('Yopilgan'), AppColors.inkMuted),
      'calculated' => (context.t('Hisoblangan'), AppColors.accent),
      _ => (context.t('Hisoblanmoqda'), AppColors.warn),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              statusText,
              style: TextStyle(
                color: statusColor,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ),
        SectionCard(
          child: Column(
            children: [
              _row(
                context.t('Hisoblandi'),
                _sum(t('accrued')),
                color: AppColors.success,
              ),
              const Divider(color: AppColors.line),
              _row(
                context.t('Ushlab qolindi'),
                _sum(t('withheld')),
                color: AppColors.danger,
              ),
              const Divider(color: AppColors.line),
              _row(context.t('Avans to‘landi'), _sum(t('advances'))),
              const Divider(color: AppColors.line),
              _row(context.t('To‘lanishi kerak'), _sum(t('due')), bold: true),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _listCard(
          context.t('Hisoblashlar'),
          Icons.trending_up_rounded,
          AppColors.success,
          accruals,
        ),
        const SizedBox(height: 12),
        _listCard(
          context.t('Ushlab qolishlar'),
          Icons.trending_down_rounded,
          AppColors.danger,
          withholdings,
        ),
        if (advances.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title(
                  context.t('Avanslar'),
                  Icons.payments_outlined,
                  AppColors.accent,
                ),
                for (final a in advances)
                  _row(
                    _date(a['paidAt']) ??
                        (a['note']?.toString() ?? context.t('Avans')),
                    _sum(num.tryParse('${a['amount']}') ?? 0),
                  ),
              ],
            ),
          ),
        ],
        if (base != null && base > 0) ...[
          const SizedBox(height: 12),
          SectionCard(
            child: _row(context.t('Oklad (oylik stavka)'), _sum(base)),
          ),
        ],
      ],
    );
  }

  String? _date(dynamic v) {
    final d = v == null ? null : DateTime.tryParse(v.toString());
    return d == null ? null : DateFormat('dd.MM.yyyy').format(d.toLocal());
  }

  Widget _title(String text, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _listCard(String title, IconData icon, Color color, List items) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(title, icon, color),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                context.t('Yo‘q'),
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else
            for (final i in items)
              _row(
                i['label']?.toString() ?? '—',
                _sum(num.tryParse('${i['amount']}') ?? 0),
              ),
        ],
      ),
    );
  }

  Widget _row(String k, String v, {Color? color, bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: TextStyle(
                fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                fontSize: bold ? 16 : 14,
              ),
            ),
          ),
          Text(
            v,
            style: TextStyle(
              color: color ?? AppColors.ink,
              fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
              fontSize: bold ? 17 : 14,
            ),
          ),
        ],
      ),
    );
  }
}
