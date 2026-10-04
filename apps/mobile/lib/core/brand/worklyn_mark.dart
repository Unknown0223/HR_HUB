import 'package:flutter/material.dart';

/// Mark colours per calendar season (Mar–May spring, Jun–Aug summer, Sep–Nov autumn,
/// Dec–Feb winter) — same as scripts/brand/build-brand-icons.js.
class WorklynPalette {
  const WorklynPalette(this.from, this.to, this.accent);

  final Color from;
  final Color to;
  final Color accent;

  static const spring = WorklynPalette(Color(0xFF15803D), Color(0xFF4ADE80), Color(0xFFF472B6));
  static const summer = WorklynPalette(Color(0xFF0F766E), Color(0xFF22C55E), Color(0xFFFACC15));
  static const autumn = WorklynPalette(Color(0xFF9A3412), Color(0xFFF59E0B), Color(0xFFFDE047));
  static const winter = WorklynPalette(Color(0xFF1E3A8A), Color(0xFF38BDF8), Color(0xFFE0F2FE));

  static WorklynPalette forMonth(int month) {
    if (month >= 3 && month <= 5) return spring;
    if (month >= 6 && month <= 8) return summer;
    if (month >= 9 && month <= 11) return autumn;
    return winter;
  }

  static WorklynPalette get current => forMonth(DateTime.now().month);
}

/// Worklyn mark — the same drawing as assets/brand/worklyn-mark.svg (64×64 grid),
/// coloured for the current season unless [palette] is given.
class WorklynMark extends StatelessWidget {
  const WorklynMark({super.key, this.size = 48, this.palette});

  final double size;
  final WorklynPalette? palette;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: _WorklynMarkPainter(palette ?? WorklynPalette.current)),
    );
  }
}

class _WorklynMarkPainter extends CustomPainter {
  const _WorklynMarkPainter(this.palette);

  final WorklynPalette palette;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 64);
    const tile = Rect.fromLTWH(0, 0, 64, 64);
    final rrect = RRect.fromRectAndRadius(tile, const Radius.circular(18));

    canvas.drawRRect(
      rrect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [palette.from, palette.to],
        ).createShader(tile),
    );

    canvas.save();
    canvas.clipRRect(rrect);
    final highlight = Path()
      ..moveTo(0, 0)
      ..lineTo(64, 0)
      ..lineTo(64, 14)
      ..cubicTo(34, 14, 14, 34, 14, 64)
      ..lineTo(0, 64)
      ..close();
    canvas.drawPath(highlight, Paint()..color = Colors.white.withValues(alpha: 0.10));
    canvas.restore();

    final w = Path()
      ..moveTo(13, 20.5)
      ..lineTo(24.5, 45)
      ..lineTo(32, 31)
      ..lineTo(39.5, 45)
      ..lineTo(51, 20.5);
    canvas.drawPath(
      w,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5.6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(const Offset(51, 20.5), 5.2, Paint()..color = palette.accent);
  }

  @override
  bool shouldRepaint(covariant _WorklynMarkPainter oldDelegate) => oldDelegate.palette != palette;
}
