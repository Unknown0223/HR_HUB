import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class NewsScreen extends StatelessWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Yangiliklar lentasi',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              Expanded(
                child: Center(
                  child: Text(
                    'Yangiliklar yo\'q',
                    style: TextStyle(color: AppColors.inkMuted),
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
