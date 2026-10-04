import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/app_permissions.dart';
import '../../core/theme/app_theme.dart';
import '../attendance/punch_widgets.dart';

/// Blocks the whole app until every permission is granted; the router sends
/// the user back here whenever one is revoked in system settings.
class PermissionsScreen extends ConsumerStatefulWidget {
  const PermissionsScreen({super.key});

  @override
  ConsumerState<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends ConsumerState<PermissionsScreen> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final perms = ref.watch(permissionsProvider);
    final notifier = ref.read(permissionsProvider.notifier);
    final total = AppPermission.values.length;
    final done = perms.grantedCount;
    final anyBlocked = perms.statuses.values.contains(
      GrantStatus.permanentlyDenied,
    );

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  children: [
                    StaggeredEntrance(
                      index: 0,
                      child: _Header(done: done, total: total),
                    ),
                    const SizedBox(height: 14),
                    for (var i = 0; i < AppPermission.values.length; i++)
                      StaggeredEntrance(
                        index: i + 1,
                        child: _PermissionTile(
                          permission: AppPermission.values[i],
                          status:
                              perms.statuses[AppPermission.values[i]] ??
                              GrantStatus.denied,
                          onTap: _busy
                              ? null
                              : () => _run(
                                  () =>
                                      notifier.request(AppPermission.values[i]),
                                ),
                        ),
                      ),
                    if (anyBlocked) ...[
                      const SizedBox(height: 4),
                      _Note(
                        text: context.t(
                            'Ba’zi ruxsatlar rad etilgan. «Sozlamalar» tugmasi orqali '
                            'ilova sozlamalarini ochib, ruxsatni qo‘lda yoqing — so‘ng shu '
                            'ekranga qayting.'),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.ink.withValues(alpha: 0.06),
                      blurRadius: 12,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ShimmerButton(
                      label: _busy
                          ? context.t('Kutilmoqda…')
                          : context.t('Barcha ruxsatlarni berish'),
                      icon: Icons.verified_user_rounded,
                      colors: const [
                        AppColors.headerTop,
                        AppColors.headerBottom,
                      ],
                      onPressed: _busy
                          ? null
                          : () => _run(notifier.requestAllMissing),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      context.t('Barcha ruxsatlar berilmaguncha ilovadan foydalanib bo‘lmaydi'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.inkFaint, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.done, required this.total});

  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.headerTop, AppColors.headerBottom],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.headerBottom.withValues(alpha: 0.3),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          const PulseRings(
            color: Colors.white,
            icon: Icons.shield_rounded,
            iconColor: AppColors.headerBottom,
            size: 92,
            iconSize: 30,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.t('Ruxsatlar kerak'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  context.t('Worklyn ishlashi uchun {0} ta ruxsat zarur', [total]),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(end: total == 0 ? 0 : done / total),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, _) => LinearProgressIndicator(
                      value: v,
                      minHeight: 6,
                      color: Colors.white,
                      backgroundColor: Colors.white.withValues(alpha: 0.3),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  context.t('{0} / {1} berildi', [done, total]),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.permission,
    required this.status,
    this.onTap,
  });

  final AppPermission permission;
  final GrantStatus status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final granted = status == GrantStatus.granted;
    final blocked = status == GrantStatus.permanentlyDenied;
    final color = granted
        ? AppColors.success
        : (blocked ? AppColors.danger : AppColors.warn);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          color: granted ? AppColors.accentTint : AppColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: granted ? AppColors.accentSoft : AppColors.line,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(permission.icon, color: color, size: 23),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.t(permission.title),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    context.t(permission.reason),
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12.5,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              transitionBuilder: (child, anim) =>
                  ScaleTransition(scale: anim, child: child),
              child: granted
                  ? const Icon(
                      Icons.check_circle_rounded,
                      key: ValueKey('ok'),
                      color: AppColors.success,
                      size: 30,
                    )
                  : FilledButton(
                      key: ValueKey(status),
                      style: FilledButton.styleFrom(
                        backgroundColor: color,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        minimumSize: const Size(0, 36),
                      ),
                      onPressed: onTap,
                      child: Text(
                        blocked ? context.t('Sozlamalar') : context.t('Berish'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: AppColors.danger,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12.5, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
