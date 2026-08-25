import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Dark Verifix-style employee app tokens (from screenshots).
class AppColors {
  static const bg = Color(0xFF12141C);
  static const bgElevated = Color(0xFF1C202B);
  static const bgSoft = Color(0xFF242830);
  static const card = Color(0xFF1C202B);
  static const cardAlt = Color(0xFF1E2230);
  static const line = Color(0xFF2A2F3C);
  static const ink = Color(0xFFFFFFFF);
  static const inkMuted = Color(0xFFA0A8B8);
  static const inkFaint = Color(0xFF6B7385);
  static const accent = Color(0xFF2E6FEA);
  static const accentSoft = Color(0xFF3B82F6);
  static const success = Color(0xFF1BC5BD);
  static const warn = Color(0xFFFFD740);
  static const danger = Color(0xFFEF476F);
  static const logout = Color(0xFF4A2830);
  static const toggleOn = Color(0xFF98D08C);
  static const confirmGreen = Color(0xFF4B5E12);
  static const callGreen = Color(0xFF7CB342);
  static const calendarWork = Color(0xFF6B2B3A);
  static const calendarWeekend = Color(0xFF2A3A55);
  static const calendarEvent = Color(0xFFFFD740);

  // Legacy aliases used by older screens
  static const sidebar = bg;
  static const surface = bg;
  static const muted = inkMuted;
  static const accentSoftLegacy = accentSoft;
}

class AppTheme {
  static TextTheme _textTheme(Brightness brightness) {
    final base = GoogleFonts.nunitoTextTheme(
      brightness == Brightness.dark
          ? ThemeData.dark().textTheme
          : ThemeData.light().textTheme,
    );
    return base.apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    );
  }

  static ThemeData get dark {
    final scheme = const ColorScheme.dark(
      primary: AppColors.accent,
      secondary: AppColors.accentSoft,
      surface: AppColors.bg,
      error: AppColors.danger,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: AppColors.ink,
      onError: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: _textTheme(Brightness.dark),
      fontFamily: GoogleFonts.nunito().fontFamily,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.nunito(
          color: AppColors.ink,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.light,
        iconTheme: const IconThemeData(color: AppColors.ink),
      ),
      dividerColor: AppColors.line,
      cardTheme: CardThemeData(
        color: AppColors.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.bg,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: AppColors.inkMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        selectedLabelStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontSize: 11),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.bgElevated,
        hintStyle: const TextStyle(color: AppColors.inkFaint),
        labelStyle: const TextStyle(color: AppColors.inkMuted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.4),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(50),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: GoogleFonts.nunito(
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: AppColors.line),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.all(Colors.white),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.toggleOn;
          }
          return AppColors.bgSoft;
        }),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.cardAlt,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.cardAlt,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.bgSoft,
        contentTextStyle: GoogleFonts.nunito(color: AppColors.ink),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
      ),
    );
  }

  /// Kept for compatibility; app uses dark.
  static ThemeData get light => dark;
}
