import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.bg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'HR HUB',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 36,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Mobil',
              style: TextStyle(color: AppColors.accentSoft, fontSize: 16),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(color: AppColors.accent),
          ],
        ),
      ),
    );
  }
}
