import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/team_repository.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../attendance/tabel_screen.dart';
import '../home/home_screen.dart';

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime? _local(dynamic v) =>
    DateTime.tryParse(v?.toString() ?? '')?.toLocal();

String _hm(dynamic v) {
  final dt = _local(v);
  return dt == null ? '--:--' : DateFormat('HH:mm').format(dt);
}

List<Map> _marksOn(List<Map> marks, DateTime date) =>
    marks.where((m) {
        final at = _local(m['occurredAt']);
        return at != null &&
            at.year == date.year &&
            at.month == date.month &&
            at.day == date.day;
      }).toList()
      ..sort((a, b) => '${a['occurredAt']}'.compareTo('${b['occurredAt']}'));

const _toneOnTime = Color(0xFF34A853);
const _toneLate = Color(0xFFF4C430);
const _toneMissed = Color(0xFFE5484D);
const _toneOff = Color(0xFFD9DEE3);

/// Cell colours: on time green, late yellow, absent or not counted as a full day red,
/// days off grey. A late day beyond the company's excused allowance has `fullDay: false`.
(Color, Color)? _dayTone(Map? day) {
  final status = day?['status']?.toString();
  switch (status) {
    case 'on_time':
      return (_toneOnTime, Colors.white);
    case 'late':
      return day?['fullDay'] == false
          ? (_toneMissed, Colors.white)
          : (_toneLate, AppColors.ink);
    case 'absent':
      return (_toneMissed, Colors.white);
    case 'day_off':
    case 'holiday':
      return (_toneOff, AppColors.inkMuted);
    case 'leave':
      return (AppColors.accentSoft.withValues(alpha: 0.35), AppColors.ink);
  }
  return null;
}

String _duration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes % 60;
  if (h == 0) return trText('{0} min', [m]);
  return m == 0 ? trText('{0} soat', [h]) : trText('{0} soat {1} min', [h, m]);
}

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _month;
  late DateTime _selected;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _selected = DateTime(now.year, now.month, now.day);
  }

  void _shiftMonth(int delta) {
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      final now = DateTime.now();
      _selected = _month.year == now.year && _month.month == now.month
          ? DateTime(now.year, now.month, now.day)
          : _month;
    });
  }

  @override
  Widget build(BuildContext context) {
    final key = (_month.year, _month.month);
    final tabelAsync = ref.watch(tabelProvider(key));
    final reqAsync = ref.watch(homeRequestsProvider);
    final monthTitle = DateFormat(
      context.monthYearPattern,
      context.dateLocale,
    ).format(_month);
    final tabel = tabelAsync.valueOrNull;
    final days = <String, Map>{
      for (final d in ((tabel?['days'] as List?) ?? []).cast<Map>())
        d['date'].toString(): d,
    };
    final marks = ((tabel?['marks'] as List?) ?? []).cast<Map>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () async {
            ref.invalidate(tabelProvider(key));
            ref.invalidate(homeRequestsProvider);
            ref.invalidate(todayProvider);
            await ref.read(tabelProvider(key).future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              SceneHeading(context.t('Taqvim')),
              SectionCard(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            monthTitle[0].toUpperCase() +
                                monthTitle.substring(1),
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        if (tabelAsync.isLoading)
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        IconButton(
                          onPressed: () => _shiftMonth(-1),
                          icon: const Icon(Icons.chevron_left),
                        ),
                        IconButton(
                          onPressed: () => _shiftMonth(1),
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _CalendarGrid(
                      month: _month,
                      selected: _selected,
                      days: days,
                      onSelect: (d) {
                        setState(() => _selected = d);
                        final dayMarks = _marksOn(marks, d);
                        if (dayMarks.isNotEmpty) {
                          _DaySheet.show(context, d, days[_ymd(d)], dayMarks);
                        }
                      },
                    ),
                    const SizedBox(height: 6),
                    const _GridLegend(),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _SelectedDay(date: _selected, day: days[_ymd(_selected)]),
              const SizedBox(height: 12),
              _DayMarks(
                date: _selected,
                marks: marks,
                loading: tabelAsync.isLoading,
              ),
              const SizedBox(height: 12),
              _MonthRequests(month: _month, async: reqAsync),
              const SizedBox(height: 12),
              _MonthStats(
                month: _month,
                tabel: tabel,
                error: tabelAsync.hasError ? '${tabelAsync.error}' : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SelectedDay extends ConsumerWidget {
  const _SelectedDay({required this.date, required this.day});

  final DateTime date;
  final Map? day;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final isToday =
        date.year == now.year && date.month == now.month && date.day == now.day;
    Map? source = day;
    if (isToday) {
      final today = ref.watch(todayProvider).valueOrNull;
      if (today != null && (today['firstIn'] != null || source == null)) {
        source = {...?source, ...today};
      }
    }
    final status = source?['status']?.toString();
    final late = (source?['lateMinutes'] as num?)?.toInt() ?? 0;
    final title = DateFormat('d MMMM, EEEE', context.dateLocale).format(date);

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title[0].toUpperCase() + title.substring(1),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              if (status != null && status.isNotEmpty)
                StatusChip(status: status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _timeCell(_hm(source?['firstIn']), context.t('kirish')),
              ),
              Container(width: 1, height: 36, color: AppColors.line),
              Expanded(
                child: _timeCell(_hm(source?['lastOut']), context.t('chiqish')),
              ),
            ],
          ),
          if (late > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                context.t('Kechikish: {0}', [
                  _duration(Duration(minutes: late)),
                ]),
                style: const TextStyle(color: AppColors.warn, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Widget _timeCell(String value, String label) => Column(
    children: [
      Text(
        value,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      ),
      Text(
        label,
        style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
      ),
    ],
  );
}

class _DayMarks extends StatelessWidget {
  const _DayMarks({
    required this.date,
    required this.marks,
    required this.loading,
  });

  final DateTime date;
  final List<Map> marks;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final dayMarks = _marksOn(marks, date);

    return SectionCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.gps_fixed, color: AppColors.accent, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.t('Qaydnoma · {0}', [
                    DateFormat('dd.MM').format(date),
                  ]),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              LinkText(
                context.t('Barchasi'),
                onTap: () => context.push('/marks'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (loading && marks.isEmpty)
            const Padding(
              padding: EdgeInsets.all(8),
              child: CircularProgressIndicator(),
            )
          else if (dayMarks.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(
                context.t('Bu kunda qayd yo‘q'),
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            )
          else
            for (final m in dayMarks.take(6)) _MarkRow(mark: m),
        ],
      ),
    );
  }
}

/// One punch: direction, time, source (phone / terminal) and the capture photo if there is one.
class _MarkRow extends StatelessWidget {
  const _MarkRow({required this.mark});

  final Map mark;

  @override
  Widget build(BuildContext context) {
    final entry = markIsEntry(mark);
    final photo = mark['photoUrl']?.toString();
    final hasPhoto = photo != null && photo.isNotEmpty;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: hasPhoto ? () => _PhotoViewer.open(context, mark) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            if (hasPhoto)
              _MarkThumb(url: photo, size: 44)
            else
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: (entry ? AppColors.accent : AppColors.warn).withValues(
                    alpha: 0.12,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  entry ? Icons.login : Icons.logout,
                  size: 20,
                  color: entry ? AppColors.accent : AppColors.warn,
                ),
              ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    markKindLabel(mark),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    _markSourceText(mark),
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              _hm(mark['occurredAt']),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

String _markSourceText(Map m) {
  final source = punchSourceLabel(m['source']);
  final device = (m['device'] is Map ? (m['device'] as Map)['name'] : null)
      ?.toString();
  final place = m['locationName']?.toString();
  return [
    source,
    if (device != null && device.isNotEmpty) device,
    if ((device == null || device.isEmpty) && place != null && place.isNotEmpty)
      place,
  ].where((s) => s.isNotEmpty).join(' · ');
}

class _MarkThumb extends ConsumerWidget {
  const _MarkThumb({required this.url, required this.size});

  final String url;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resolved = ref.read(teamRepositoryProvider).mediaUrl(url) ?? url;
    final bytes = ref.watch(teamPhotoProvider(resolved));
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: size,
        height: size,
        child: bytes.when(
          data: (b) => b == null
              ? const ColoredBox(
                  color: AppColors.bgSoft,
                  child: Icon(Icons.image_not_supported_outlined, size: 18),
                )
              : Image.memory(
                  b,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  cacheWidth: (size * MediaQuery.devicePixelRatioOf(context)).round(),
                ),
          loading: () => const ColoredBox(color: AppColors.bgSoft),
          error: (_, _) => const ColoredBox(color: AppColors.bgSoft),
        ),
      ),
    );
  }
}

/// Full-screen capture photo of a punch.
class _PhotoViewer extends ConsumerWidget {
  const _PhotoViewer({required this.mark});

  final Map mark;

  static void open(BuildContext context, Map mark) {
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _PhotoViewer(mark: mark),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = mark['photoUrl'].toString();
    final resolved = ref.read(teamRepositoryProvider).mediaUrl(url) ?? url;
    final bytes = ref.watch(teamPhotoProvider(resolved)).valueOrNull;
    final at = _local(mark['occurredAt']);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          '${markKindLabel(mark)} · ${at == null ? '' : DateFormat('dd.MM HH:mm').format(at)}',
          style: const TextStyle(color: Colors.white, fontSize: 17),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: bytes == null
                ? const Center(child: CircularProgressIndicator())
                : InteractiveViewer(
                    maxScale: 4,
                    child: Center(child: Image.memory(bytes)),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              _markSourceText(mark),
              style: const TextStyle(color: Colors.white70),
            ),
          ),
        ],
      ),
    );
  }
}

/// Opens when a day with punches is tapped: status, times and every capture photo.
class _DaySheet extends StatelessWidget {
  const _DaySheet({required this.date, required this.day, required this.marks});

  final DateTime date;
  final Map? day;
  final List<Map> marks;

  static void show(
    BuildContext context,
    DateTime date,
    Map? day,
    List<Map> marks,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _DaySheet(date: date, day: day, marks: marks),
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = DateFormat('d MMMM, EEEE', context.dateLocale).format(date);
    final status = day?['status']?.toString();
    final late = (day?['lateMinutes'] as num?)?.toInt() ?? 0;
    final tone = _dayTone(day);
    final photos = marks
        .where((m) => (m['photoUrl']?.toString() ?? '').isNotEmpty)
        .toList();
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title[0].toUpperCase() + title.substring(1),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                    ),
                  ),
                ),
                if (status != null && tone != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: tone.$1,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _dayLabel(day!),
                      style: TextStyle(
                        color: tone.$2,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
            if (late > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  context.t('Kechikish: {0}', [
                        _duration(Duration(minutes: late)),
                      ]) +
                      (day?['lateExcused'] == true
                          ? ' · ${context.t('sababli deb hisoblandi')}'
                          : ''),
                  style: const TextStyle(color: AppColors.warn, fontSize: 13),
                ),
              ),
            if (photos.isNotEmpty) ...[
              const SizedBox(height: 14),
              SizedBox(
                height: 132,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: photos.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final m = photos[i];
                    return GestureDetector(
                      onTap: () => _PhotoViewer.open(context, m),
                      child: Column(
                        children: [
                          _MarkThumb(url: m['photoUrl'].toString(), size: 104),
                          const SizedBox(height: 4),
                          Text(
                            '${_hm(m['occurredAt'])} · ${punchSourceLabel(m['source'])}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
            const SizedBox(height: 10),
            for (final m in marks) _MarkRow(mark: m),
          ],
        ),
      ),
    );
  }
}

String _dayLabel(Map day) {
  final status = day['status']?.toString() ?? '';
  if (status == 'late' && day['fullDay'] == false) {
    return trText('Kech · to‘liq emas');
  }
  if (status == 'late' && day['lateExcused'] == true) {
    return trText('Kech · sababli');
  }
  return statusStyle(status).$1;
}

class _MonthRequests extends StatelessWidget {
  const _MonthRequests({required this.month, required this.async});

  final DateTime month;
  final AsyncValue<Map<String, dynamic>> async;

  bool _inMonth(Map m) {
    final start = _local(m['startDate']);
    final end = _local(m['endDate']) ?? start;
    if (start == null || end == null) return false;
    final next = DateTime(month.year, month.month + 1);
    return start.isBefore(next) && !end.isBefore(month);
  }

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.checklist_rtl,
                color: AppColors.accent,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.t('So\'rovlar'),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              LinkText(
                context.t('Barchasi'),
                onTap: () => context.push('/requests'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(8),
              child: CircularProgressIndicator(),
            ),
            error: (e, _) =>
                Text('$e', style: const TextStyle(color: AppColors.danger)),
            data: (data) {
              final absences = ((data['absences'] as List?) ?? [])
                  .cast<Map>()
                  .where(_inMonth)
                  .toList();
              if (absences.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text(
                    context.t('Bu oyda yo‘qlik so‘rovlari yo‘q'),
                    style: const TextStyle(color: AppColors.inkMuted),
                  ),
                );
              }
              return Column(
                children: [
                  for (final a in absences.take(4))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (a['absenceType'] is Map
                                              ? (a['absenceType']
                                                    as Map)['name']
                                              : null)
                                          ?.toString() ??
                                      context.t('Yo\'qlik'),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  formatApiDateRange(
                                    a['startDate'],
                                    a['endDate'],
                                  ),
                                  style: const TextStyle(
                                    color: AppColors.inkMuted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          StatusChip(status: a['status']?.toString() ?? ''),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MonthStats extends StatelessWidget {
  const _MonthStats({
    required this.month,
    required this.tabel,
    required this.error,
  });

  final DateTime month;
  final Map<String, dynamic>? tabel;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final totals = (tabel?['totals'] as Map?) ?? const {};
    final days = ((tabel?['days'] as List?) ?? []).cast<Map>();
    int n(String k) => (totals[k] as num?)?.toInt() ?? 0;
    final segments = [
      (n('onTime'), statusStyle('on_time')),
      (n('late'), statusStyle('late')),
      (n('absent'), statusStyle('absent')),
      (n('leave'), statusStyle('leave')),
    ];
    final counted = segments.fold<int>(0, (s, e) => s + e.$1);
    var worked = Duration.zero;
    for (final d in days) {
      final a = _local(d['firstIn']);
      final b = _local(d['lastOut']);
      if (a != null && b != null && b.isAfter(a)) worked += b.difference(a);
    }
    final lateMinutes = n('lateMinutes');

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.work_outline, color: AppColors.accent, size: 18),
              const SizedBox(width: 8),
              Text(
                context.t('Oylik statistika · {0}', [
                  DateFormat(
                    context.monthYearPattern,
                    context.dateLocale,
                  ).format(month),
                ]),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (error != null)
            Text(error!, style: const TextStyle(color: AppColors.danger))
          else if (tabel == null)
            const Center(child: CircularProgressIndicator())
          else if (counted == 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                context.t(
                  'Bu oy uchun davomat hali hisoblanmagan. Ish jadvali biriktirilgach '
                  'va qaydlar tushgach, statistika shu yerda chiqadi.',
                ),
                style: const TextStyle(color: AppColors.inkMuted, height: 1.35),
              ),
            )
          else ...[
            Row(
              children: [
                SizedBox(
                  width: 96,
                  height: 96,
                  child: CustomPaint(
                    painter: _DonutPainter(
                      segments: [
                        for (final s in segments)
                          if (s.$1 > 0) (s.$1 / counted, s.$2.$2),
                      ],
                      centerLabel: '$counted',
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final s in segments)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: _Legend(
                            color: s.$2.$2,
                            text: context.t('{0}: {1} kun ({2}%)', [
                              s.$2.$1,
                              s.$1,
                              (s.$1 * 100 / counted).toStringAsFixed(0),
                            ]),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _figure(
                    _duration(worked),
                    context.t('ishlangan vaqt'),
                  ),
                ),
                Expanded(
                  child: _figure(
                    lateMinutes == 0
                        ? '—'
                        : _duration(Duration(minutes: lateMinutes)),
                    context.t('jami kechikish'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _figure(String value, String label) => Column(
    children: [
      Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      Text(
        label,
        style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
      ),
    ],
  );
}

class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.month,
    required this.selected,
    required this.days,
    required this.onSelect,
  });

  final DateTime month;
  final DateTime selected;
  final Map<String, Map> days;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    final names = context.dateLocale == 'ru'
        ? const ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        : const ['du', 'se', 'chor', 'pay', 'ju', 'sha', 'ya'];
    final first = DateTime(month.year, month.month, 1);
    final startOffset = (first.weekday + 6) % 7;
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final rows = (startOffset + daysInMonth + 6) ~/ 7;
    final now = DateTime.now();

    return Column(
      children: [
        Row(
          children: [
            for (final d in names)
              Expanded(
                child: Center(
                  child: Text(
                    d,
                    style: const TextStyle(
                      color: AppColors.inkFaint,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        for (var r = 0; r < rows; r++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: List.generate(7, (c) {
                final dayNum = r * 7 + c - startOffset + 1;
                if (dayNum < 1 || dayNum > daysInMonth) {
                  return const Expanded(child: SizedBox(height: 36));
                }
                final date = DateTime(month.year, month.month, dayNum);
                final isSelected = selected == date;
                final isToday =
                    date.year == now.year &&
                    date.month == now.month &&
                    date.day == now.day;
                final tone = _dayTone(days[_ymd(date)]);
                final past = date.isBefore(DateTime(now.year, now.month, now.day));
                Color bg;
                Color fg = AppColors.ink;
                Border? idle;
                if (tone != null) {
                  (bg, fg) = tone;
                } else if (c >= 5) {
                  bg = _toneOff.withValues(alpha: 0.6);
                  fg = AppColors.inkMuted;
                } else if (past) {
                  bg = Colors.white;
                  fg = AppColors.inkMuted;
                  idle = Border.all(color: AppColors.line);
                } else {
                  bg = AppColors.calendarWork;
                }
                return Expanded(
                  child: GestureDetector(
                    onTap: () => onSelect(date),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      height: 36,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(
                        color: bg,
                        shape: BoxShape.circle,
                        border: isSelected
                            ? Border.all(color: AppColors.ink, width: 2.4)
                            : isToday
                            ? Border.all(color: AppColors.accent, width: 2)
                            : idle,
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: bg.withValues(alpha: 0.45),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        '$dayNum',
                        style: TextStyle(
                          color: fg,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
      ],
    );
  }
}

class _GridLegend extends StatelessWidget {
  const _GridLegend();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 4,
      children: [
        for (final (label, color) in const [
          ('Vaqtida', _toneOnTime),
          ('Kech qolgan', _toneLate),
          ('Kelmagan / hisoblanmagan', _toneMissed),
          ('Dam olish', _toneOff),
        ])
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 4),
              Text(
                context.t(label),
                style: const TextStyle(fontSize: 11, color: AppColors.inkMuted),
              ),
            ],
          ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.text});
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 12, color: AppColors.inkMuted),
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({required this.segments, required this.centerLabel});

  final List<(double, Color)> segments;
  final String centerLabel;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final rect = Rect.fromCircle(center: center, radius: size.width / 2);
    var start = -math.pi / 2;
    for (final s in segments) {
      final sweep = s.$1 * 2 * math.pi;
      canvas.drawArc(
        rect.deflate(7),
        start,
        sweep,
        false,
        Paint()
          ..color = s.$2
          ..style = PaintingStyle.stroke
          ..strokeWidth = 14,
      );
      start += sweep;
    }
    final tp = TextPainter(
      text: TextSpan(
        text: centerLabel,
        style: const TextStyle(
          color: AppColors.inkMuted,
          fontSize: 22,
          fontWeight: FontWeight.w700,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    tp.paint(
      canvas,
      Offset(center.dx - tp.width / 2, center.dy - tp.height / 2),
    );
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) =>
      old.centerLabel != centerLabel || old.segments != segments;
}
