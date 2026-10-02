import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/team_repository.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../../shared/yandex_map_view.dart';
import 'team_common.dart';

class TeamMemberScreen extends ConsumerStatefulWidget {
  const TeamMemberScreen({super.key, required this.employeeId});

  final String employeeId;

  @override
  ConsumerState<TeamMemberScreen> createState() => _TeamMemberScreenState();
}

class _TeamMemberScreenState extends ConsumerState<TeamMemberScreen> {
  late DateTime _month;
  Map<String, dynamic>? _sheet;
  Map<String, dynamic>? _live;
  Object? _error;
  bool _sheetLoading = false;
  Timer? _poll;

  TeamRepository get _repo => ref.read(teamRepositoryProvider);

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _loadSheet();
    _loadLive();
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _loadLive());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _loadSheet() async {
    setState(() => _sheetLoading = true);
    try {
      final d = await _repo.timesheet(
        widget.employeeId,
        year: _month.year,
        month: _month.month,
      );
      if (!mounted) return;
      setState(() {
        _sheet = d;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _sheetLoading = false);
    }
  }

  Future<void> _loadLive() async {
    try {
      final d = await _repo.live(widget.employeeId);
      if (mounted) setState(() => _live = d);
    } catch (_) {}
  }

  void _shiftMonth(int delta) {
    final next = DateTime(_month.year, _month.month + delta);
    final now = DateTime.now();
    if (next.isAfter(DateTime(now.year, now.month))) return;
    setState(() => _month = next);
    _loadSheet();
  }

  Map get _employee =>
      (_live?['employee'] ?? _sheet?['employee'] ?? const {}) as Map;

  @override
  Widget build(BuildContext context) {
    final name = _employee['fullName']?.toString();
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        titleSpacing: 0,
        title: Text(name == null ? context.t('Xodim') : shortName(name)),
      ),
      body: _sheet == null && _live == null
          ? (_error != null
                ? EmptyState(message: '$_error')
                : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () => Future.wait([_loadSheet(), _loadLive()]),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                children: [
                  _ProfileHeader(
                    employee: _employee,
                    photoUrl: _repo.mediaUrl(_employee['photoUrl']?.toString()),
                    online: (_live?['device'] as Map?)?['online'] == true,
                  ),
                  const SizedBox(height: 14),
                  _LiveCard(
                    live: _live,
                    photoUrl: photoDataUrl(
                      ref,
                      _repo.mediaUrl(_employee['photoUrl']?.toString()),
                    ),
                  ),
                  const SizedBox(height: 18),
                  _MonthBar(
                    month: _month,
                    loading: _sheetLoading,
                    onPrev: () => _shiftMonth(-1),
                    onNext: () => _shiftMonth(1),
                  ),
                  const SizedBox(height: 12),
                  if (_sheet != null) ...[
                    _StatsGrid(
                      summary: (_sheet!['summary'] as Map?) ?? const {},
                    ),
                    const SizedBox(height: 14),
                    _CalendarCard(
                      month: _month,
                      days: ((_sheet!['days'] as List?) ?? const [])
                          .cast<Map>(),
                      onDayTap: _showDay,
                    ),
                    const SizedBox(height: 14),
                    _DayList(
                      days: ((_sheet!['days'] as List?) ?? const [])
                          .cast<Map>(),
                      onDayTap: _showDay,
                    ),
                  ],
                ],
              ),
            ),
    );
  }

  void _showDay(Map day) {
    final d = DateTime.parse(day['date'].toString());
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      DateFormat('d MMMM, EEEE', ctx.dateLocale).format(d),
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  StatusPill(status: day['status'].toString()),
                ],
              ),
              const SizedBox(height: 16),
              _kv(
                ctx.t('Kelgan vaqti'),
                formatApiTime(day['firstIn']).ifEmpty('—'),
              ),
              _kv(
                ctx.t('Ketgan vaqti'),
                formatApiTime(day['lastOut']).ifEmpty('—'),
              ),
              _kv(
                ctx.t('Ishlagan vaqti'),
                (day['workedMinutes'] as num? ?? 0) > 0
                    ? hoursLabel(day['workedMinutes'] as num)
                    : '—',
              ),
              _kv(
                ctx.t('Kechikish'),
                (day['lateMinutes'] as num? ?? 0) > 0
                    ? hoursLabel(day['lateMinutes'] as num)
                    : '—',
              ),
              _kv(
                ctx.t('Erta ketish'),
                (day['earlyLeaveMinutes'] as num? ?? 0) > 0
                    ? hoursLabel(day['earlyLeaveMinutes'] as num)
                    : '—',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      children: [
        Expanded(
          child: Text(
            k,
            style: const TextStyle(color: AppColors.inkMuted, fontSize: 15),
          ),
        ),
        Text(
          v,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ],
    ),
  );
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({
    required this.employee,
    this.photoUrl,
    this.online = false,
  });

  final Map employee;
  final String? photoUrl;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final schedule = employee['schedule'] as Map?;
    final hours = schedule == null
        ? null
        : '${schedule['startTime'] ?? '09:00'} – ${schedule['endTime'] ?? '18:00'}';
    return SectionCard(
      child: Row(
        children: [
          MemberAvatar(
            name: employee['fullName']?.toString(),
            photoUrl: photoUrl,
            online: online,
            radius: 32,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  employee['fullName']?.toString() ?? '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                if (employee['position'] != null)
                  Text(
                    employee['position'].toString(),
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 14,
                    ),
                  ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    if (employee['division'] != null)
                      _Tag(
                        icon: Icons.apartment_rounded,
                        text: employee['division'].toString(),
                      ),
                    if (hours != null)
                      _Tag(icon: Icons.schedule_rounded, text: hours),
                    if (employee['tabNumber'] != null)
                      _Tag(
                        icon: Icons.badge_outlined,
                        text: '№ ${employee['tabNumber']}',
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

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.bgSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: AppColors.accent),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _LiveCard extends StatelessWidget {
  const _LiveCard({required this.live, this.photoUrl});

  final Map<String, dynamic>? live;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final window = (live?['window'] as Map?) ?? const {};
    final loc = live?['location'] as Map?;
    final device = live?['device'] as Map?;
    final track = liveRoute(live);
    final fixes = liveFixes(live).length;
    final working = window['active'] == true;

    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: (loc != null ? AppColors.accent : AppColors.inkFaint)
                        .withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    loc != null
                        ? Icons.my_location_rounded
                        : Icons.location_disabled_rounded,
                    color: loc != null ? AppColors.accent : AppColors.inkMuted,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        context.t('Hozirgi joylashuv'),
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      Text(
                        live == null
                            ? context.t('Yuklanmoqda…')
                            : loc != null
                            ? context.t('Jonli · {0} da yangilangan', [
                                formatApiTime(loc['at']),
                              ])
                            : working
                            ? context.t('Telefon hali joylashuv yubormagan')
                            : context.t('{0} — joylashuv ko‘rsatilmaydi', [
                                windowReasonText(window['reason']?.toString()),
                              ]),
                        style: TextStyle(
                          color: loc != null
                              ? AppColors.accent
                              : AppColors.inkMuted,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                if (loc != null)
                  IconButton(
                    tooltip: context.t('To‘liq ekran'),
                    icon: const Icon(Icons.open_in_full_rounded),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            _FullMapScreen(live: live!, photoUrl: photoUrl),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (loc != null) ...[
            SizedBox(
              height: 230,
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(0),
                ),
                child: YandexMapView(
                  fitKey: live?['employee']?['employeeId'],
                  pins: [_pin(live!, photoUrl)],
                  track: track,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              child: Wrap(
                spacing: 16,
                runSpacing: 6,
                children: [
                  if (loc['accuracy'] != null)
                    _Meta(
                      icon: Icons.gps_fixed_rounded,
                      text: context.t('±{0} m', [
                        (loc['accuracy'] as num).round(),
                      ]),
                    ),
                  if (device?['batteryPct'] != null)
                    _Meta(
                      icon: device?['charging'] == true
                          ? Icons.battery_charging_full_rounded
                          : Icons.battery_5_bar_rounded,
                      text: '${device!['batteryPct']}%',
                    ),
                  _Meta(
                    icon: Icons.route_rounded,
                    text: (live?['distanceM'] as num? ?? 0) > 0
                        ? context.t('{0} km · {1} nuqta', [
                            ((live!['distanceM'] as num) / 1000)
                                .toStringAsFixed(1),
                            fixes,
                          ])
                        : context.t('{0} nuqta', [fixes]),
                  ),
                ],
              ),
            ),
          ] else
            Container(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.bgSoft,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                context.t(
                  'Xodimning joylashuvi faqat uning ish jadvali bo‘yicha ish vaqti ichida ko‘rinadi. '
                  'Dam olish kunlari va ishdan keyin ma’lumot yig‘ilmaydi.',
                ),
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

MapPin _pin(Map live, String? photoUrl) {
  final loc = live['location'] as Map;
  final e = live['employee'] as Map;
  return MapPin(
    id: e['employeeId'].toString(),
    lat: (loc['lat'] as num).toDouble(),
    lng: (loc['lng'] as num).toDouble(),
    initials: initialsOf(e['fullName']?.toString()),
    label: shortName(e['fullName']?.toString()),
    photoUrl: photoUrl,
    pulse: (live['device'] as Map?)?['online'] == true,
    accuracy: (loc['accuracy'] as num?)?.toDouble(),
  );
}

class _FullMapScreen extends StatelessWidget {
  const _FullMapScreen({required this.live, this.photoUrl});

  final Map<String, dynamic> live;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final track = liveRoute(live);
    return Scaffold(
      appBar: AppBackBar(
        title: shortName((live['employee'] as Map?)?['fullName']?.toString()),
      ),
      body: YandexMapView(
        fitKey: 1,
        pins: [_pin(live, photoUrl)],
        track: track,
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: AppColors.inkMuted),
        const SizedBox(width: 4),
        Text(
          text,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ],
    );
  }
}

class _MonthBar extends StatelessWidget {
  const _MonthBar({
    required this.month,
    required this.onPrev,
    required this.onNext,
    this.loading = false,
  });

  final DateTime month;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final isCurrent = month.year == now.year && month.month == now.month;
    final label = DateFormat(
      context.monthYearPattern,
      context.dateLocale,
    ).format(month);
    return Row(
      children: [
        Expanded(
          child: Text(
            context.t('Tabel'),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
        ),
        _RoundBtn(icon: Icons.chevron_left_rounded, onTap: onPrev),
        SizedBox(
          width: 140,
          child: Center(
            child: loading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    label[0].toUpperCase() + label.substring(1),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
          ),
        ),
        _RoundBtn(
          icon: Icons.chevron_right_rounded,
          onTap: isCurrent ? null : onNext,
        ),
      ],
    );
  }
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onTap == null ? AppColors.bgSoft : AppColors.card,
      shape: const CircleBorder(side: BorderSide(color: AppColors.line)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(
            icon,
            color: onTap == null ? AppColors.inkFaint : AppColors.ink,
          ),
        ),
      ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.summary});

  final Map summary;

  @override
  Widget build(BuildContext context) {
    int n(String k) => (summary[k] as num?)?.toInt() ?? 0;
    final rate = (summary['attendanceRate'] as num?)?.toInt();
    return Column(
      children: [
        SectionCard(
          child: Row(
            children: [
              SizedBox(
                width: 84,
                height: 84,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox.expand(
                      child: CircularProgressIndicator(
                        value: (rate ?? 0) / 100,
                        strokeWidth: 9,
                        strokeCap: StrokeCap.round,
                        color: (rate ?? 0) >= 80
                            ? AppColors.success
                            : (rate ?? 0) >= 50
                            ? AppColors.warn
                            : AppColors.danger,
                        backgroundColor: AppColors.bgSoft,
                      ),
                    ),
                    Text(
                      rate == null ? '—' : '$rate%',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.t('Davomat'),
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.t('{0} / {1} ish kuni kelgan', [
                        n('present'),
                        n('plannedToDate'),
                      ]),
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      context.t('Oy rejasi: {0} ish kuni', [n('planDays')]),
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.95,
          children: [
            _StatTile(
              icon: Icons.check_circle_rounded,
              color: AppColors.success,
              value: '${n('onTime')}',
              label: context.t('Vaqtida'),
            ),
            _StatTile(
              icon: Icons.schedule_rounded,
              color: AppColors.warn,
              value: '${n('late')}',
              label: context.t('Kechikkan'),
            ),
            _StatTile(
              icon: Icons.cancel_rounded,
              color: AppColors.danger,
              value: '${n('absent')}',
              label: context.t('Kelmagan'),
            ),
            _StatTile(
              icon: Icons.timer_outlined,
              color: AppColors.accent,
              value: (n('workedMinutes') / 60).toStringAsFixed(
                n('workedMinutes') < 600 ? 1 : 0,
              ),
              label: context.t('Ishlagan soat'),
            ),
            _StatTile(
              icon: Icons.hourglass_bottom_rounded,
              color: AppColors.warn,
              value: '${n('lateMinutes')}',
              label: context.t('Kechikish, daq'),
            ),
            _StatTile(
              icon: Icons.beach_access_rounded,
              color: const Color(0xFF8E6BD8),
              value: '${n('leave') + n('dayOff')}',
              label: context.t('Dam / ta’til'),
            ),
          ],
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.color,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final Color color;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.inkMuted,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _CalendarCard extends StatelessWidget {
  const _CalendarCard({
    required this.month,
    required this.days,
    required this.onDayTap,
  });

  final DateTime month;
  final List<Map> days;
  final ValueChanged<Map> onDayTap;

  @override
  Widget build(BuildContext context) {
    final weekdays = context.dateLocale == 'ru'
        ? const ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        : const ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
    final lead = DateTime(month.year, month.month, 1).weekday - 1;
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    return SectionCard(
      child: Column(
        children: [
          Row(
            children: [
              for (final w in weekdays)
                Expanded(
                  child: Center(
                    child: Text(
                      w,
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            children: [
              for (var i = 0; i < lead; i++) const SizedBox.shrink(),
              for (final d in days)
                _DayCell(
                  day: d,
                  isToday: d['date'] == today,
                  onTap: () => onDayTap(d),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _Legend(status: 'on_time'),
              _Legend(status: 'late'),
              _Legend(status: 'absent'),
              _Legend(status: 'day_off'),
              _Legend(status: 'leave'),
            ],
          ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.onTap,
    this.isToday = false,
  });

  final Map day;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = day['status'].toString();
    final color = statusStyle(status).$2;
    final strong =
        status == 'on_time' || status == 'late' || status == 'absent';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: status == 'planned'
              ? Colors.transparent
              : color.withValues(alpha: strong ? 0.9 : 0.16),
          borderRadius: BorderRadius.circular(10),
          border: isToday
              ? Border.all(color: AppColors.ink, width: 2)
              : Border.all(
                  color: AppColors.line.withValues(
                    alpha: status == 'planned' ? 1 : 0,
                  ),
                ),
        ),
        alignment: Alignment.center,
        child: Text(
          '${int.parse(day['date'].toString().substring(8))}',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
            color: strong
                ? Colors.white
                : (status == 'planned' ? AppColors.inkFaint : AppColors.ink),
          ),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = statusStyle(status);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.inkMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _DayList extends StatelessWidget {
  const _DayList({required this.days, required this.onDayTap});

  final List<Map> days;
  final ValueChanged<Map> onDayTap;

  @override
  Widget build(BuildContext context) {
    final shown = days
        .where((d) => d['status'] != 'planned')
        .toList()
        .reversed
        .toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Text(
              context.t('Kunlar bo‘yicha'),
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
          for (var i = 0; i < shown.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
            _DayRow(day: shown[i], onTap: () => onDayTap(shown[i])),
          ],
        ],
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({required this.day, required this.onTap});

  final Map day;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final d = DateTime.parse(day['date'].toString());
    final firstIn = formatApiTime(day['firstIn']);
    final lastOut = formatApiTime(day['lastOut']);
    final worked = (day['workedMinutes'] as num?) ?? 0;
    final late = (day['lateMinutes'] as num?) ?? 0;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 46,
              child: Column(
                children: [
                  Text(
                    '${d.day}',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    DateFormat('EEE', context.dateLocale).format(d),
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  StatusPill(status: day['status'].toString()),
                  if (firstIn.isNotEmpty || lastOut.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(
                      '${firstIn.ifEmpty('—')}  →  ${lastOut.ifEmpty('—')}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (worked > 0)
                  Text(
                    hoursLabel(worked),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                if (late > 0)
                  Text(
                    context.t('+{0} kech', [hoursLabel(late)]),
                    style: const TextStyle(
                      color: AppColors.warn,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
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
