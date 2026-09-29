import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Light green employee app tokens.
class AppColors {
  static const bg = Color(0xFFF1F8F1);
  static const bgElevated = Color(0xFFFFFFFF);
  static const bgSoft = Color(0xFFE5F3E6);
  static const card = Color(0xFFFFFFFF);
  static const cardAlt = Color(0xFFFFFFFF);
  static const line = Color(0xFFDCEBDC);
  static const ink = Color(0xFF1E2B22);
  static const inkMuted = Color(0xFF5E6F62);
  static const inkFaint = Color(0xFF98A89B);
  static const accent = Color(0xFF2FA350);
  static const accentSoft = Color(0xFF6CCB86);
  static const accentTint = Color(0xFFE3F5E7);
  static const headerTop = Color(0xFF7ED695);
  static const headerBottom = Color(0xFF34A853);
  static const success = Color(0xFF2FA350);
  static const warn = Color(0xFFE39B0B);
  static const danger = Color(0xFFE5484D);
  static const logout = Color(0xFFE5484D);
  static const toggleOn = Color(0xFF6CCB86);
  static const confirmGreen = Color(0xFF2FA350);
  static const callGreen = Color(0xFF2FA350);
  static const calendarWork = Color(0xFFE5F3E6);
  static const calendarWeekend = Color(0xFFEEF1F4);
  static const calendarEvent = Color(0xFFFFE08A);

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

  static ThemeData get light {
    final scheme = const ColorScheme.light(
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
      brightness: Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: _textTheme(Brightness.light),
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
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        iconTheme: const IconThemeData(color: AppColors.ink),
      ),
      dividerColor: AppColors.line,
      dividerTheme: const DividerThemeData(
        color: AppColors.line,
        thickness: 1,
        space: 1,
      ),
      cardTheme: CardThemeData(
        color: AppColors.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.card,
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
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.toggleOn;
          }
          return AppColors.inkFaint.withValues(alpha: 0.45);
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
        backgroundColor: AppColors.ink,
        contentTextStyle: GoogleFonts.nunito(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
      ),
    );
  }

  /// Kept for compatibility; app uses light.
  static ThemeData get dark => light;
}
