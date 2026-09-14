import 'package:flutter/material.dart';

class LinkColors {
  static const bg = Color(0xFFF3F3F3);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE5E5E5);
  static const text = Color(0xFF1A1A1A);
  static const muted = Color(0xFF605E5C);
  static const accent = Color(0xFF7C3AED);
  static const accentHover = Color(0xFF6D28D9);
  static const accentSoft = Color(0xFFF5F3FF);
  static const ok = Color(0xFF0F7B3A);
  static const okBg = Color(0xFFDFF6DD);
  static const warn = Color(0xFF9A6700);
  static const warnBg = Color(0xFFFFF4CE);
  static const danger = Color(0xFFC42B1C);
  static const dangerBg = Color(0xFFFDE7E9);
  static const header = Color(0xFF5B21B6);
  static const header2 = Color(0xFF7C3AED);
}

ThemeData buildLinkTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: LinkColors.accent,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: LinkColors.bg,
    fontFamily: 'Roboto',
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: LinkColors.header,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: LinkColors.accent,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: LinkColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: LinkColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: LinkColors.border),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    ),
  );
}
