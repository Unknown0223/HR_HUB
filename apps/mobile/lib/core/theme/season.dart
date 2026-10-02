import 'package:flutter/material.dart';

/// Local calendar season. Mar–May spring, Jun–Aug summer, Sep–Nov autumn, Dec–Feb winter.
enum Season { spring, summer, autumn, winter }

extension SeasonX on Season {
  static Season get now {
    final month = DateTime.now().month;
    if (month >= 3 && month <= 5) return Season.spring;
    if (month >= 6 && month <= 8) return Season.summer;
    if (month >= 9 && month <= 11) return Season.autumn;
    return Season.winter;
  }

  String get asset => switch (this) {
    Season.spring => 'assets/images/season_spring.jpg',
    Season.summer => 'assets/images/season_summer.jpg',
    Season.autumn => 'assets/images/season_autumn.jpg',
    Season.winter => 'assets/images/season_winter.jpg',
  };

  Color get veil => switch (this) {
    Season.spring => const Color(0xFFFFF6FA),
    Season.summer => const Color(0xFFF1F8F1),
    Season.autumn => const Color(0xFFFFF7ED),
    Season.winter => const Color(0xFFF4F8FC),
  };

  Color get orb => switch (this) {
    Season.spring => const Color(0xFFF4A7C1),
    Season.summer => const Color(0xFF2FA350),
    Season.autumn => const Color(0xFFE39B0B),
    Season.winter => const Color(0xFFA0C4DC),
  };

  Color get orbSoft => switch (this) {
    Season.spring => const Color(0xFFFFC2D4),
    Season.summer => const Color(0xFF2BB673),
    Season.autumn => const Color(0xFFE8A04A),
    Season.winter => const Color(0xFFD5E6F2),
  };

  Color get bit => switch (this) {
    Season.spring => const Color(0xFFF4A7C1),
    Season.summer => const Color(0xFF7ED695),
    Season.autumn => const Color(0xFFE39B0B),
    Season.winter => const Color(0xFFF7FBFF),
  };
}

/// Which part of the seasonal illustration sits behind each screen.
Alignment sceneAlignment(String? path) {
  final p = path ?? '';
  if (p.startsWith('/calendar')) return const Alignment(-1, -0.45);
  if (p.startsWith('/news')) return const Alignment(0.15, -0.25);
  if (p.startsWith('/profile') ||
      p.startsWith('/team') ||
      p.startsWith('/settings') ||
      p.startsWith('/security')) {
    return const Alignment(-1, 0.1);
  }
  if (p.startsWith('/payroll')) return const Alignment(0.4, -0.2);
  if (p.startsWith('/tabel') ||
      p.startsWith('/marks') ||
      p.startsWith('/punch')) {
    return const Alignment(-0.85, -0.35);
  }
  if (p.startsWith('/requests') ||
      p.startsWith('/inbox') ||
      p.startsWith('/create-absence')) {
    return const Alignment(-0.4, -0.15);
  }
  return const Alignment(-0.72, -0.2);
}
