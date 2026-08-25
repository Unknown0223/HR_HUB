import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';

class ShellScreen extends ConsumerWidget {
  const ShellScreen({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: navigationShell,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.line, width: 0.5)),
          color: AppColors.bg,
        ),
        child: SafeArea(
          top: false,
          child: BottomNavigationBar(
            currentIndex: navigationShell.currentIndex,
            onTap: navigationShell.goBranch,
            backgroundColor: AppColors.bg,
            selectedItemColor: AppColors.accent,
            unselectedItemColor: AppColors.inkMuted,
            type: BottomNavigationBarType.fixed,
            elevation: 0,
            items: const [
              BottomNavigationBarItem(
                icon: Icon(Icons.home_outlined),
                activeIcon: Icon(Icons.home),
                label: 'Asosiy',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.calendar_today_outlined),
                activeIcon: Icon(Icons.calendar_month),
                label: 'Kalendar',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.article_outlined),
                activeIcon: Icon(Icons.article),
                label: 'Yangiliklar',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.person_outline),
                activeIcon: Icon(Icons.person),
                label: 'Profil',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
