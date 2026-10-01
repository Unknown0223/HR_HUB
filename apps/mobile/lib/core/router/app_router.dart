import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/attendance/marks_screen.dart';
import '../../features/attendance/mobile_punch_screen.dart';
import '../../features/attendance/tabel_screen.dart';
import '../../features/auth/force_password_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/permissions_screen.dart';
import '../../features/auth/splash_screen.dart';
import '../../features/calendar/calendar_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/home/shell_screen.dart';
import '../../features/lock/app_lock_screens.dart';
import '../../features/news/news_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/payroll/payroll_summary_screen.dart';
import '../../features/profile/profile_details_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/requests/create_absence_screen.dart';
import '../../features/requests/inbox_screen.dart';
import '../../features/requests/requests_screen.dart';
import '../../features/settings/more_screens.dart';
import '../../features/settings/settings_screens.dart';
import '../../features/team/team_member_screen.dart';
import '../../features/team/team_screen.dart';
import '../../features/tracking/gps_track_screen.dart';
import '../auth/auth_state.dart';
import '../security/app_permissions.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: GoRouterRefreshStream(ref),
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final auth = ref.read(authProvider);
      final perms = ref.read(permissionsProvider);
      if (auth.loading || !perms.checked) {
        return loc == '/splash' ? null : '/splash';
      }
      if (!perms.allGranted) {
        return loc == '/permissions' ? null : '/permissions';
      }
      if (loc == '/permissions') return auth.isAuthenticated ? '/home' : '/login';
      if (!auth.isAuthenticated) {
        return loc == '/login' ? null : '/login';
      }
      if (auth.user?.mustChangePassword == true) {
        return loc == '/force-password' ? null : '/force-password';
      }
      if (loc == '/login' || loc == '/splash' || loc == '/force-password') return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/permissions', builder: (_, _) => const PermissionsScreen()),
      GoRoute(path: '/force-password', builder: (_, _) => const ForcePasswordScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ShellScreen(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/calendar',
                builder: (_, __) => const CalendarScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/news', builder: (_, __) => const NewsScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, __) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/punch/in',
        builder: (_, __) => const MobilePunchScreen(direction: 'IN'),
      ),
      GoRoute(
        path: '/punch/out',
        builder: (_, __) => const MobilePunchScreen(direction: 'OUT'),
      ),
      GoRoute(path: '/tabel', builder: (_, __) => const TabelScreen()),
      GoRoute(path: '/marks', builder: (_, __) => const MarksScreen()),
      GoRoute(
        path: '/create-absence',
        builder: (_, __) => const CreateAbsenceScreen(),
      ),
      GoRoute(path: '/requests', builder: (_, __) => const RequestsScreen()),
      GoRoute(path: '/inbox', builder: (_, __) => const InboxScreen()),
      GoRoute(path: '/team', builder: (_, _) => const TeamScreen()),
      GoRoute(
        path: '/team/:id',
        builder: (_, state) =>
            TeamMemberScreen(employeeId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/payroll',
        builder: (_, __) => const PayrollSummaryScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/profile/details',
        builder: (_, __) => const ProfileDetailsScreen(),
      ),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(
        path: '/settings/theme',
        builder: (_, __) => const ThemeSettingsScreen(),
      ),
      GoRoute(
        path: '/settings/notifications',
        builder: (_, __) => const NotificationSettingsScreen(),
      ),
      GoRoute(
        path: '/settings/notify-records',
        builder: (_, __) => const NotifyRecordsScreen(),
      ),
      GoRoute(path: '/security', builder: (_, __) => const SecurityScreen()),
      GoRoute(
        path: '/security/password',
        builder: (_, __) => const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/security/pin',
        builder: (_, __) => const ChangePinScreen(),
      ),
      GoRoute(path: '/help', builder: (_, __) => const HelpScreen()),
      GoRoute(path: '/modules', builder: (_, __) => const ModulesScreen()),
      GoRoute(path: '/gps-track', builder: (_, _) => const GpsTrackScreen()),
    ],
  );
});

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(this._ref) {
    _ref.listen(authProvider, (_, __) => notifyListeners());
    _ref.listen(permissionsProvider, (_, _) => notifyListeners());
  }

  final Ref _ref;
}
