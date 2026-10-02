import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final myAdvancesProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).advances();
});

const _commentMin = 5;

final _money = NumberFormat.decimalPattern('ru');
String _sum(BuildContext context, num v) =>
    '${_money.format(v)} ${context.t('so‘m')}';

class AdvanceScreen extends ConsumerStatefulWidget {
  const AdvanceScreen({super.key});

  @override
  ConsumerState<AdvanceScreen> createState() => _AdvanceScreenState();
}

class _AdvanceScreenState extends ConsumerState<AdvanceScreen> {
  final _amount = TextEditingController();
  final _comment = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _amount.addListener(() => setState(() {}));
    _comment.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _amount.dispose();
    _comment.dispose();
    super.dispose();
  }

  num? get _value {
    final digits = _amount.text.replaceAll(RegExp(r'\D'), '');
    return digits.isEmpty ? null : num.tryParse(digits);
  }

  Future<void> _submit(num? limit) async {
    final amount = _value;
    if (amount == null || amount <= 0) {
      setState(() => _error = context.t('Summani kiriting'));
      return;
    }
    final over = limit != null && amount > limit;
    if (over && _comment.text.trim().length < _commentMin) {
      setState(
        () => _error = context.t(
          'Summa limitdan oshdi — avans nima uchun kerakligini izohda yozing',
        ),
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(meRepositoryProvider)
          .createAdvance(amount: amount, comment: _comment.text);
      _amount.clear();
      _comment.clear();
      ref.invalidate(myAdvancesProvider);
      if (!mounted) return;
      FocusScope.of(context).unfocus();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.t('So‘rov yuborildi. Javob bildirishnoma orqali keladi'),
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is ApiException ? e.message : '$e');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.t('So‘rovni bekor qilasizmi?')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.t('Yo‘q')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.t('Bekor qilish')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(meRepositoryProvider).cancelAdvance(id);
      ref.invalidate(myAdvancesProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is ApiException ? e.message : '$e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myAdvancesProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.t('Avans so‘rovi'), centerTitle: true),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(myAdvancesProvider);
          await ref.read(myAdvancesProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              EmptyState(message: e is ApiException ? e.message : '$e'),
            ],
          ),
          data: _content,
        ),
      ),
    );
  }

  Widget _content(Map<String, dynamic> data) {
    final limit = data['limit'] as Map?;
    final cap = num.tryParse('${limit?['maxAmount'] ?? ''}');
    final reason = limit?['reason']?.toString().trim() ?? '';
    final requests = ((data['requests'] as List?) ?? []).cast<Map>();
    final hasPending = requests.any((r) => r['status'] == 'pending');
    final amount = _value;
    final over = cap != null && amount != null && amount > cap;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _LimitCard(cap: cap, reason: reason),
        const SizedBox(height: 12),
        if (hasPending)
          SectionCard(
            child: Row(
              children: [
                const Icon(Icons.hourglass_top_rounded, color: AppColors.warn),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.t(
                      'Avvalgi so‘rovingiz ko‘rib chiqilmoqda. Yangi so‘rovni u hal qilingandan keyin yuborishingiz mumkin.',
                    ),
                    style: const TextStyle(height: 1.35),
                  ),
                ),
              ],
            ),
          )
        else
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  context.t('Summa'),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _amount,
                  keyboardType: TextInputType.number,
                  inputFormatters: [_ThousandsFormatter()],
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                  decoration: InputDecoration(
                    hintText: '0',
                    suffixText: context.t('so‘m'),
                    enabledBorder: over
                        ? OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: AppColors.warn,
                              width: 1.5,
                            ),
                          )
                        : null,
                  ),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  child: over
                      ? Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: _OverLimitNote(over: amount - cap),
                        )
                      : const SizedBox(width: double.infinity),
                ),
                const SizedBox(height: 14),
                Text.rich(
                  TextSpan(
                    text: context.t('Izoh'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                    children: [
                      if (over)
                        const TextSpan(
                          text: ' *',
                          style: TextStyle(color: AppColors.danger),
                        )
                      else
                        TextSpan(
                          text: '  ${context.t('(ixtiyoriy)')}',
                          style: const TextStyle(
                            color: AppColors.inkMuted,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _comment,
                  maxLines: 3,
                  maxLength: 1000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: over
                        ? context.t(
                            'Avans nima uchun kerak (masalan: davolanish, o‘qish to‘lovi)',
                          )
                        : context.t('Qo‘shimcha ma’lumot'),
                    counterText: '',
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ],
                const SizedBox(height: 16),
                PrimaryButton(
                  label: context.t('Yuborish'),
                  busy: _busy,
                  onPressed: () => _submit(cap),
                ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        Align(
          alignment: Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              context.t('Mening so‘rovlarim'),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
          ),
        ),
        if (requests.isEmpty)
          EmptyState(
            message: context.t('Hali avans so‘ramagansiz'),
            icon: Icons.payments_outlined,
          )
        else
          for (final r in requests)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RequestTile(
                row: r,
                onCancel: r['status'] == 'pending'
                    ? () => _cancel(r['id'].toString())
                    : null,
              ),
            ),
      ],
    );
  }
}

class _LimitCard extends StatelessWidget {
  const _LimitCard({required this.cap, required this.reason});

  final num? cap;
  final String reason;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      color: const Color(0xFFEFF8F1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.account_balance_wallet_outlined,
              color: AppColors.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cap == null
                      ? context.t('Avans limiti belgilanmagan')
                      : context.t('Izohsiz so‘rash mumkin: {0} gacha', [
                          _sum(context, cap!),
                        ]),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  cap == null
                      ? context.t(
                          'Istalgan summani so‘rashingiz mumkin, izoh ixtiyoriy.',
                        )
                      : reason.isNotEmpty
                      ? reason
                      : context.t(
                          'Bundan katta summa uchun avans nima maqsadda kerakligini yozish majburiy.',
                        ),
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OverLimitNote extends StatelessWidget {
  const _OverLimitNote({required this.over});

  final num over;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warn.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warn.withValues(alpha: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: AppColors.warn, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              context.t(
                'Summa limitdan {0} ga ko‘p. Izoh majburiy: avans nima uchun kerakligini yozing — rahbar shunga qarab qaror qiladi.',
                [_sum(context, over)],
              ),
              style: const TextStyle(fontSize: 13, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.row, this.onCancel});

  final Map row;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final amount = num.tryParse('${row['amount'] ?? 0}') ?? 0;
    final created = DateTime.tryParse('${row['createdAt'] ?? ''}')?.toLocal();
    final reviewed = DateTime.tryParse('${row['reviewedAt'] ?? ''}')?.toLocal();
    final comment = row['comment']?.toString() ?? '';
    final note = row['reviewNote']?.toString() ?? '';
    final status = row['status']?.toString() ?? '';
    final fmt = DateFormat('dd.MM.yyyy HH:mm');

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _sum(context, amount),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
              ),
              StatusChip(status: status),
            ],
          ),
          if (created != null)
            Text(
              fmt.format(created),
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
            ),
          if (row['overLimit'] == true)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                context.t('Limitdan yuqori'),
                style: const TextStyle(
                  color: AppColors.warn,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
          if (comment.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(comment, style: const TextStyle(height: 1.3)),
          ],
          if (status == 'approved' || status == 'rejected') ...[
            const Divider(height: 18, color: AppColors.line),
            Text(
              [
                status == 'approved'
                    ? context.t('Tasdiqlandi')
                    : context.t('Rad etildi'),
                if (reviewed != null) fmt.format(reviewed),
              ].join(' · '),
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
            ),
            if (note.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  note,
                  style: const TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
          ],
          if (onCancel != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onCancel,
                child: Text(
                  context.t('Bekor qilish'),
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ThousandsFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 12) digits = digits.substring(0, 12);
    digits = digits.replaceFirst(RegExp(r'^0+(?=\d)'), '');
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write(' ');
      buf.write(digits[i]);
    }
    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
