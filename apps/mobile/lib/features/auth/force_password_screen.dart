import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/seasonal_backdrop.dart';
import '../lock/pin_widgets.dart';
import 'login_widgets.dart';

/// Opened by the router right after signing in with a one-time password from HR.
/// There is no way past it except setting a personal password or signing out.
class ForcePasswordScreen extends ConsumerStatefulWidget {
  const ForcePasswordScreen({super.key});

  @override
  ConsumerState<ForcePasswordScreen> createState() => _ForcePasswordScreenState();
}

class _ForcePasswordScreenState extends ConsumerState<ForcePasswordScreen> {
  static const _minLength = 8;

  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  final _nextFocus = FocusNode();
  final _againFocus = FocusNode();
  bool _o1 = true, _o2 = true, _o3 = true;
  bool _busy = false;
  bool _markEmpty = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final c in [_current, _next, _again]) {
      c.addListener(_refresh);
    }
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  bool get _longEnough => _next.text.trim().length >= _minLength;
  bool get _matches => _next.text.isNotEmpty && _next.text == _again.text;
  bool get _differs => _next.text.isNotEmpty && _next.text != _current.text;

  /// 0..3: length, mixing letters with digits, and a symbol or 12+ characters.
  int get _strength {
    final p = _next.text.trim();
    if (p.isEmpty) return 0;
    var s = p.length >= _minLength ? 1 : 0;
    if (s > 0 && RegExp(r'[A-Za-zА-Яа-яЁё]').hasMatch(p) && RegExp(r'\d').hasMatch(p)) s++;
    if (s > 1 && (p.length >= 12 || RegExp(r'[^A-Za-zА-Яа-яЁё\d]').hasMatch(p))) s++;
    return s;
  }

  String? _validate() {
    if (_current.text.isEmpty || _next.text.isEmpty || _again.text.isEmpty) {
      _markEmpty = true;
      return context.t('Barcha maydonlarni to‘ldiring');
    }
    if (!_longEnough) return context.t('Yangi parol kamida {0} belgidan iborat bo‘lsin', [_minLength]);
    if (!_matches) return context.t('Yangi parollar bir xil emas');
    if (!_differs) return context.t('Yangi parol bir martalik paroldan farq qilishi kerak');
    return null;
  }

  String _humanize(Object e) {
    if (e is ApiException) {
      if (e.statusCode == 429) return context.t('Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring');
      if (e.message.contains('Текущий пароль')) return context.t('Bir martalik parol noto‘g‘ri');
      if (e.message.contains('совпадает')) return context.t('Yangi parol bir martalik parol bilan bir xil');
      return e.message;
    }
    return e.toString();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final invalid = _validate();
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/auth/change-password',
            data: {'currentPassword': _current.text, 'newPassword': _next.text.trim()},
          );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.t('Parol saqlandi. Endi shu parol bilan kirasiz'))));
      await ref.read(authProvider.notifier).passwordChanged();
    } catch (e) {
      if (mounted) setState(() => _error = _humanize(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    _nextFocus.dispose();
    _againFocus.dispose();
    super.dispose();
  }

  Widget _eye(bool obscure, VoidCallback toggle) {
    return IconButton(
      tooltip: obscure ? context.t('Parolni ko‘rsatish') : context.t('Parolni yashirish'),
      onPressed: toggle,
      icon: Icon(
        obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded,
        color: obscure ? AppColors.inkFaint : AppColors.accent,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).user?.displayName ?? '';
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            const Positioned.fill(child: SceneBackdrop()),
            const Positioned.fill(child: SeasonFall()),
            SafeArea(
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: box.maxHeight - 32),
                    child: IntrinsicHeight(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(children: [const BrandChip(), const Spacer(), _logoutChip()]),
                          const Spacer(),
                          const SizedBox(height: 120),
                          Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 480),
                              child: _card(name),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _logoutChip() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Material(
          color: Colors.white.withValues(alpha: 0.62),
          child: InkWell(
            onTap: _busy ? null : () => ref.read(authProvider.notifier).logout(),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.8)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.logout_rounded, size: 18, color: AppColors.inkMuted),
                  const SizedBox(width: 6),
                  Text(
                    context.tr('Chiqish', 'Выйти'),
                    style: const TextStyle(color: AppColors.inkMuted, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _card(String name) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 9, sigmaY: 9),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.62),
                const Color(0xFFE8F5EC).withValues(alpha: 0.4),
                Colors.white.withValues(alpha: 0.32),
              ],
              stops: const [0, 0.55, 1],
            ),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: 0.65), width: 1.4),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF1F6F3A).withValues(alpha: 0.08),
                blurRadius: 32,
                offset: const Offset(0, 14),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const LockBadge(icon: Icons.lock_reset_rounded, size: 46),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.t('Parolni almashtiring'),
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink,
                          ),
                        ),
                        if (name.isNotEmpty)
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accent,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                context.t('Siz HR bergan bir martalik parol bilan kirdingiz. O‘zingizning shaxsiy '
                    'parolingizni o‘rnating — shundan keyin ilova ochiladi.'),
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 18),
              AuthField(
                controller: _current,
                label: context.t('Bir martalik parol'),
                hint: context.t('HR bergan 6 xonali kod'),
                icon: Icons.key_rounded,
                obscure: _o1,
                error: _markEmpty,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                onSubmitted: (_) => _nextFocus.requestFocus(),
                suffix: _eye(_o1, () => setState(() => _o1 = !_o1)),
              ),
              const SizedBox(height: 12),
              AuthField(
                controller: _next,
                focusNode: _nextFocus,
                label: context.t('Yangi parol'),
                hint: context.t('kamida {0} belgi', [_minLength]),
                icon: Icons.lock_rounded,
                obscure: _o2,
                error: _markEmpty,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _againFocus.requestFocus(),
                suffix: _eye(_o2, () => setState(() => _o2 = !_o2)),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: _next.text.isEmpty
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: _StrengthBar(level: _strength),
                      ),
              ),
              const SizedBox(height: 12),
              AuthField(
                controller: _again,
                focusNode: _againFocus,
                label: context.t('Yangi parolni qayta kiriting'),
                icon: Icons.verified_user_rounded,
                obscure: _o3,
                error: _markEmpty,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
                suffix: _eye(_o3, () => setState(() => _o3 = !_o3)),
              ),
              const SizedBox(height: 14),
              _Rule(ok: _longEnough, text: context.t('Kamida {0} belgi', [_minLength])),
              _Rule(ok: _matches, text: context.t('Ikkala yangi parol bir xil')),
              _Rule(ok: _differs, text: context.t('Bir martalik paroldan farq qiladi')),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.shield_outlined, size: 14, color: AppColors.inkFaint),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      context.t('Parolingizni hech kim, hatto administrator ham ko‘ra olmaydi.'),
                      style: const TextStyle(color: AppColors.inkFaint, fontSize: 11.5),
                    ),
                  ),
                ],
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: _error == null
                    ? const SizedBox(width: double.infinity)
                    : Container(
                        margin: const EdgeInsets.only(top: 12),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: AppColors.danger, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: const TextStyle(color: AppColors.danger, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
              const SizedBox(height: 18),
              GlowButton(label: context.t('Saqlash va kirish'), busy: _busy, onPressed: _submit),
            ],
          ),
        ),
      ),
    );
  }
}

class _StrengthBar extends StatelessWidget {
  const _StrengthBar({required this.level});

  final int level;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (level) {
      0 => (context.t('Juda qisqa'), AppColors.danger),
      1 => (context.t('O‘rtacha — harf va raqam qo‘shing'), const Color(0xFFE39B0B)),
      2 => (context.t('Yaxshi'), AppColors.accentSoft),
      _ => (context.t('Kuchli'), AppColors.accent),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++) ...[
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 240),
                height: 5,
                decoration: BoxDecoration(
                  color: i < level || (level == 0 && i == 0)
                      ? color
                      : Colors.white.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(width: 5),
          ],
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color),
          ),
        ],
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.ok, required this.text});

  final bool ok;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
            child: Icon(
              ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              key: ValueKey(ok),
              size: 17,
              color: ok ? AppColors.accent : AppColors.inkFaint,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            text,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: ok ? FontWeight.w700 : FontWeight.w500,
              color: ok ? AppColors.ink : AppColors.inkMuted,
            ),
          ),
        ],
      ),
    );
  }
}
