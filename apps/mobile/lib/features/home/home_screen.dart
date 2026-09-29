import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

final todayProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).today();
});

final homeRequestsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).requests();
});

final homeMonthProvider = FutureProvider.autoDispose((ref) {
  final now = DateTime.now();
  return ref.read(meRepositoryProvider).tabel(year: now.year, month: now.month);
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final todayAsync = ref.watch(todayProvider);
    final monthAsync = ref.watch(homeMonthProvider);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        bottom: false,
        child: _buildList(context, ref, user, todayAsync, monthAsync),
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    WidgetRef ref,
    AuthUser? user,
    AsyncValue<Map<String, dynamic>> todayAsync,
    AsyncValue<Map<String, dynamic>> monthAsync,
  ) {
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: () async {
        ref.invalidate(todayProvider);
        ref.invalidate(homeMonthProvider);
        await ref.read(authProvider.notifier).refreshMe();
        await Future.wait([
          ref.read(todayProvider.future),
          ref.read(homeMonthProvider.future),
        ]);
      },
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Header(user: user, todayAsync: todayAsync),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                todayAsync.when(
                  loading: () => const SectionCard(
                    child: SizedBox(
                      height: 120,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                  error: (e, _) => SectionCard(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline_rounded,
                          color: e is ApiException && e.isEmployeeNotLinked
                              ? AppColors.accent
                              : AppColors.danger,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '$e',
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 13,
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  data: (data) => _TodayCard(data: data),
                ),
                const SizedBox(height: 16),
                _MyInfoCard(user: user, monthAsync: monthAsync),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _QuickTile(
                      icon: Icons.table_chart_outlined,
                      label: 'Tabel',
                      onTap: () => context.push('/tabel'),
                    ),
                    const SizedBox(width: 10),
                    _QuickTile(
                      icon: Icons.assignment_outlined,
                      label: 'So\'rovlar',
                      onTap: () => context.push('/requests'),
                    ),
                    const SizedBox(width: 10),
                    _QuickTile(
                      icon: Icons.payments_outlined,
                      label: 'To\'lov',
                      onTap: () => context.push('/payroll'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.user, required this.todayAsync});

  final AuthUser? user;
  final AsyncValue<Map<String, dynamic>> todayAsync;

  @override
  Widget build(BuildContext context) {
    final emp = user?.employee;
    final firstName = emp?['firstName']?.toString() ?? '';
    final name = user?.displayName ?? '';
    final position = _nameOf(emp?['position']);
    final division = _nameOf(emp?['division']);
    final subtitle = [
      position,
      division,
    ].where((s) => s.isNotEmpty).join(' · ');
    final status = todayAsync.valueOrNull?['status']?.toString() ?? '';
    final isOff = status == 'day_off' || status == 'leave';
    final dayLabel = DateFormat('EEEE, d MMMM', 'uz').format(DateTime.now());

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.headerTop, AppColors.headerBottom],
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.headerBottom.withValues(alpha: 0.25),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 12, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white.withValues(alpha: 0.25),
                    child: Text(
                      _initials(name),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          firstName.isNotEmpty
                              ? 'Salom, $firstName!'
                              : 'Salom!',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.9),
                              fontSize: 13,
                            ),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => context.push('/notifications'),
                    icon: const Icon(
                      Icons.notifications_none_rounded,
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_capitalize(dayLabel)} · ${isOff ? 'Dam olish kuni' : 'Ish kuni'}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final status = data['status']?.toString() ?? 'not_started';
    final lateMinutes = (data['lateMinutes'] as num?)?.toInt() ?? 0;
    final lastOut = data['lastOut'];
    final marks = ((data['marks'] as List?) ?? const [])
        .whereType<Map>()
        .where((m) => markField(m, 'isValid') != false)
        .toList();
    final estimatedOut = lastOut == null && marks.length > 1
        ? marks.last['occurredAt']
        : null;
    final schedule = data['schedule'] is Map ? data['schedule'] as Map : null;
    final (statusLabel, statusColor) = _statusOf(status, lateMinutes);

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text(
                'Bugun',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          if (schedule != null) ...[
            const SizedBox(height: 4),
            Text(
              'Ish vaqti: ${schedule['startTime'] ?? '--:--'} – ${schedule['endTime'] ?? '--:--'}',
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              _TimeBox(
                label: 'Kelgan',
                icon: Icons.login_rounded,
                value: _fmt(data['firstIn']),
              ),
              const SizedBox(width: 10),
              _TimeBox(
                label: estimatedOut != null ? 'Ketgan (taxminiy)' : 'Ketgan',
                icon: Icons.logout_rounded,
                value: estimatedOut != null
                    ? '~${_fmt(estimatedOut)}'
                    : _fmt(lastOut),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Telefon orqali belgi',
            style: TextStyle(
              color: AppColors.inkMuted,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _PunchButton(
                icon: Icons.login_rounded,
                label: 'Kirish',
                hint: marks.isEmpty ? 'Ishga keldim' : 'Qayd etilgan',
                color: AppColors.accent,
                onTap: marks.isEmpty ? () => context.push('/punch/in') : null,
              ),
              const SizedBox(width: 10),
              _PunchButton(
                icon: Icons.logout_rounded,
                label: 'Chiqish',
                hint: marks.isEmpty ? 'Avval kirish' : 'Ishdan ketdim',
                color: AppColors.warn,
                onTap: marks.isEmpty ? null : () => context.push('/punch/out'),
              ),
            ],
          ),
          if (marks.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Divider(height: 1),
            const SizedBox(height: 6),
            ...marks.reversed.take(3).map((m) => _MarkRow(mark: m)),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => context.push('/marks'),
                child: const Text('Barcha qaydlar'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  (String, Color) _statusOf(String status, int lateMinutes) {
    switch (status) {
      case 'on_time':
        return ('O\'z vaqtida', AppColors.success);
      case 'late':
        return (
          lateMinutes > 0
              ? 'Kechikdi · ${_formatMinutes(lateMinutes)}'
              : 'Kechikdi',
          AppColors.warn,
        );
      case 'absent':
        return ('Kelmagan', AppColors.danger);
      case 'leave':
        return ('Ta\'til', AppColors.accent);
      case 'day_off':
        return ('Dam olish', AppColors.inkMuted);
      default:
        return ('Hali kelmagan', AppColors.inkMuted);
    }
  }
}

class _TimeBox extends StatelessWidget {
  const _TimeBox({
    required this.label,
    required this.icon,
    required this.value,
  });

  final String label;
  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.bg,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 16, color: AppColors.accent),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PunchButton extends StatelessWidget {
  const _PunchButton({
    required this.icon,
    required this.label,
    required this.hint,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String hint;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final fg = enabled ? Colors.white : AppColors.inkFaint;
    return Expanded(
      child: Material(
        color: enabled ? color : AppColors.bgSoft,
        borderRadius: BorderRadius.circular(16),
        elevation: enabled ? 2 : 0,
        shadowColor: color.withValues(alpha: 0.4),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: 92,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: fg, size: 30),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: fg,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hint,
                  style: TextStyle(
                    color: fg.withValues(alpha: 0.85),
                    fontSize: 11,
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

class _MarkRow extends StatelessWidget {
  const _MarkRow({required this.mark});

  final Map mark;

  @override
  Widget build(BuildContext context) {
    final entry = markIsEntry(mark);
    final src = punchSourceLabel(mark['source']);
    final outside = markOutsideGeofence(mark);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            entry ? Icons.login_rounded : Icons.logout_rounded,
            size: 18,
            color: entry ? AppColors.accent : AppColors.warn,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  src.isEmpty
                      ? markKindLabel(mark)
                      : '${markKindLabel(mark)} · $src',
                  style: const TextStyle(fontSize: 14),
                ),
                if (outside)
                  const Text(
                    'Hududdan tashqarida',
                    style: TextStyle(color: AppColors.warn, fontSize: 12),
                  ),
              ],
            ),
          ),
          Text(
            formatApiTime(mark['occurredAt']),
            style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _MyInfoCard extends StatelessWidget {
  const _MyInfoCard({required this.user, required this.monthAsync});

  final AuthUser? user;
  final AsyncValue<Map<String, dynamic>> monthAsync;

  @override
  Widget build(BuildContext context) {
    final emp = user?.employee;
    final schedule = emp?['schedule'] is Map ? emp!['schedule'] as Map : null;
    final summary = monthAsync.valueOrNull?['summary'] is Map
        ? monthAsync.valueOrNull!['summary'] as Map
        : null;
    final monthLabel = _capitalize(
      DateFormat('LLLL', 'uz').format(DateTime.now()),
    );

    String stat(String key) {
      if (monthAsync.isLoading) return '…';
      final v = summary?[key];
      return v == null ? '0' : '$v';
    }

    final rows = <(IconData, String, String)>[
      (
        Icons.badge_outlined,
        'Tabel raqami',
        emp?['tabNumber']?.toString() ?? '',
      ),
      (Icons.work_outline_rounded, 'Lavozim', _nameOf(emp?['position'])),
      (Icons.apartment_rounded, 'Bo\'lim', _nameOf(emp?['division'])),
      (Icons.schedule_rounded, 'Ish jadvali', _nameOf(schedule)),
      (Icons.phone_outlined, 'Telefon', emp?['phone']?.toString() ?? ''),
    ].where((r) => r.$3.isNotEmpty).toList();

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text(
                'Mening ma\'lumotlarim',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
              ),
              const Spacer(),
              Text(
                monthLabel,
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _StatBox(
                value: stat('presentDays'),
                label: 'Ishlagan kun',
                color: AppColors.success,
              ),
              const SizedBox(width: 8),
              _StatBox(
                value: stat('lateDays'),
                label: 'Kechikish',
                color: AppColors.warn,
              ),
              const SizedBox(width: 8),
              _StatBox(
                value: stat('absentDays'),
                label: 'Kelmagan',
                color: AppColors.danger,
              ),
            ],
          ),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: [
                    Icon(rows[i].$1, size: 18, color: AppColors.accent),
                    const SizedBox(width: 10),
                    Text(
                      rows[i].$2,
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        rows[i].$3,
                        textAlign: TextAlign.right,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({
    required this.value,
    required this.label,
    required this.color,
  });

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                color: color,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({
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
          child: Container(
            height: 78,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: AppColors.accent, size: 24),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
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

String _nameOf(dynamic v) => v is Map ? v['name']?.toString() ?? '' : '';

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  final letters = parts.take(2).map((p) => p[0].toUpperCase()).join();
  return letters.isEmpty ? '?' : letters;
}

String _capitalize(String s) =>
    s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

String _formatMinutes(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m daq';
  return m == 0 ? '$h soat' : '$h soat $m daq';
}

String _fmt(dynamic v) {
  final t = formatApiTime(v);
  return t.isEmpty ? '--:--' : t;
}
