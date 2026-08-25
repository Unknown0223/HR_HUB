import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _month;
  DateTime? _selected;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _selected = DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final todayAsync = ref.watch(todayProvider);
    final reqAsync = ref.watch(homeRequestsProvider);
    final monthTitle = DateFormat('MMMM yyyy', 'uz').format(_month);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            const Text(
              'Taqvim',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          monthTitle[0].toUpperCase() + monthTitle.substring(1),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => setState(() {
                          _month = DateTime(_month.year, _month.month - 1);
                        }),
                        icon: const Icon(Icons.chevron_left),
                      ),
                      IconButton(
                        onPressed: () => setState(() {
                          _month = DateTime(_month.year, _month.month + 1);
                        }),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _CalendarGrid(
                    month: _month,
                    selected: _selected,
                    onSelect: (d) => setState(() => _selected = d),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionCard(
              child: todayAsync.when(
                loading: () => const SizedBox(
                  height: 48,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, __) => const SizedBox.shrink(),
                data: (data) {
                  return Row(
                    children: [
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              _fmt(data['firstIn']),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Text(
                              'kirish',
                              style: TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 36, color: AppColors.line),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              _fmt(data['lastOut']),
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Text(
                              'chiqish',
                              style: TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
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
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      LinkText('Barchasi', onTap: () => context.push('/marks')),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Ro\'yxat bo\'sh',
                    style: TextStyle(color: AppColors.inkMuted),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            const SizedBox(height: 12),
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
                          style: TextStyle(fontWeight: FontWeight.w700),
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
                    loading: () => const CircularProgressIndicator(),
                    error: (_, __) => const Text(
                      'So\'rovlar yo\'q',
                      style: TextStyle(color: AppColors.inkMuted),
                    ),
                    data: (data) {
                      final absences = (data['absences'] as List?) ?? [];
                      final requests = (data['requests'] as List?) ?? [];
                      if (absences.isEmpty && requests.isEmpty) {
                        return const Text(
                          'So\'rovlar yo\'q',
                          style: TextStyle(color: AppColors.inkMuted),
                        );
                      }
                      return const SizedBox.shrink();
                    },
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
                      const Icon(Icons.work_outline,
                          color: AppColors.accent, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'Oylik statistika ${DateFormat('MMMM yyyy', 'uz').format(_month)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      SizedBox(
                        width: 96,
                        height: 96,
                        child: CustomPaint(
                          painter: _DonutPainter(
                            segments: const [
                              (0.565, Color(0xFFFF5C8D)),
                              (0.217, Color(0xFFFFCC5C)),
                              (0.218, Color(0xFF7886A0)),
                            ],
                            centerLabel: '23',
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _Legend(
                              color: Color(0xFFFFCC5C),
                              text: '5 (21.7%) kechikish',
                            ),
                            SizedBox(height: 6),
                            _Legend(
                              color: Color(0xFFFF5C8D),
                              text: '13 (56.5%) kelinmadi',
                            ),
                            SizedBox(height: 6),
                            _Legend(
                              color: Color(0xFF7886A0),
                              text: '5 (21.7%) qoldi',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Row(
                    children: [
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              '184 soat',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              'rejaga muvofiq',
                              style: TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              '1 soat 16 min',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              'ishlab chiqilgan',
                              style: TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
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

class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.month,
    required this.selected,
    required this.onSelect,
  });

  final DateTime month;
  final DateTime? selected;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    const days = ['du', 'se', 'chor', 'pay', 'ju', 'sha', 'ya'];
    final first = DateTime(month.year, month.month, 1);
    final startOffset = (first.weekday + 6) % 7; // Monday=0
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final total = startOffset + daysInMonth;
    final rows = ((total + 6) ~/ 7);

    return Column(
      children: [
        Row(
          children: days
              .map(
                (d) => Expanded(
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
              )
              .toList(),
        ),
        const SizedBox(height: 8),
        for (var r = 0; r < rows; r++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: List.generate(7, (c) {
                final idx = r * 7 + c;
                final dayNum = idx - startOffset + 1;
                if (dayNum < 1 || dayNum > daysInMonth) {
                  return const Expanded(child: SizedBox(height: 36));
                }
                final date = DateTime(month.year, month.month, dayNum);
                final isWeekend = c >= 5;
                final isSelected = selected != null &&
                    selected!.year == date.year &&
                    selected!.month == date.month &&
                    selected!.day == date.day;
                final isEvent = dayNum == 14 || dayNum == 16;
                Color bg;
                Color fg = AppColors.ink;
                if (isSelected) {
                  bg = AppColors.accent;
                } else if (isEvent) {
                  bg = AppColors.calendarEvent;
                  fg = Colors.black;
                } else if (isWeekend) {
                  bg = AppColors.calendarWeekend;
                  fg = const Color(0xFF9BB4E0);
                } else {
                  bg = AppColors.calendarWork;
                }
                return Expanded(
                  child: GestureDetector(
                    onTap: () => onSelect(date),
                    child: Container(
                      height: 36,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(
                        color: bg,
                        shape: BoxShape.circle,
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
    final radius = size.width / 2;
    var start = -90.0;
    final rect = Rect.fromCircle(center: center, radius: radius);
    for (final s in segments) {
      final sweep = s.$1 * 360;
      final paint = Paint()
        ..color = s.$2
        ..style = PaintingStyle.stroke
        ..strokeWidth = 14
        ..strokeCap = StrokeCap.butt;
      canvas.drawArc(
        rect.deflate(7),
        start * 3.1415926535 / 180,
        sweep * 3.1415926535 / 180,
        false,
        paint,
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
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
