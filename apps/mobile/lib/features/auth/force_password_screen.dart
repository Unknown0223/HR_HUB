import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

/// Opened by the router right after signing in with a one-time password from HR.
/// There is no way past it except setting a personal password or signing out.
class ForcePasswordScreen extends ConsumerStatefulWidget {
  const ForcePasswordScreen({super.key});

  @override
  ConsumerState<ForcePasswordScreen> createState() => _ForcePasswordScreenState();
}

class _ForcePasswordScreenState extends ConsumerState<ForcePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _o1 = true, _o2 = true, _o3 = true;
  bool _busy = false;
  String? _error;

  String? _validate() {
    if (_current.text.isEmpty || _next.text.isEmpty || _again.text.isEmpty) {
      return 'Barcha maydonlarni to‘ldiring';
    }
    if (_next.text.trim().length < 8) return 'Yangi parol kamida 8 belgidan iborat bo‘lsin';
    if (_next.text != _again.text) return 'Yangi parollar bir xil emas';
    if (_next.text == _current.text) {
      return 'Yangi parol bir martalik paroldan farq qilishi kerak';
    }
    return null;
  }

  String _humanize(Object e) {
    if (e is ApiException) {
      if (e.statusCode == 429) return 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring';
      if (e.message.contains('Текущий пароль')) return 'Bir martalik parol noto‘g‘ri';
      if (e.message.contains('совпадает')) return 'Yangi parol bir martalik parol bilan bir xil';
      return e.message;
    }
    return e.toString();
  }

  Future<void> _submit() async {
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
      await ref.read(apiClientProvider).post(
        '/auth/change-password',
        data: {'currentPassword': _current.text, 'newPassword': _next.text.trim()},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Parol saqlandi. Endi shu parol bilan kirasiz')),
      );
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
    super.dispose();
  }

  Widget _field(
    TextEditingController c,
    String hint,
    bool obscure,
    VoidCallback toggle, {
    TextInputType? keyboardType,
  }) {
    return SoftField(
      controller: c,
      hint: hint,
      prefixIcon: Icons.lock_outline,
      obscure: obscure,
      keyboardType: keyboardType,
      suffixIcon: IconButton(
        onPressed: toggle,
        icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).user?.displayName ?? '';
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
            children: [
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.line),
                  ),
                  child: const Icon(Icons.lock_reset_rounded, size: 36, color: AppColors.accent),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Parolni almashtiring',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${name.isEmpty ? 'Siz' : '$name, siz'} HR bergan bir martalik parol bilan '
                'kirdingiz. Xavfsizlik uchun o‘zingizning shaxsiy parolingizni o‘rnating — '
                'shundan keyin ilova ochiladi.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 14, height: 1.4),
              ),
              const SizedBox(height: 22),
              _field(
                _current,
                'Bir martalik parol',
                _o1,
                () => setState(() => _o1 = !_o1),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 12),
              _field(_next, 'Yangi parol', _o2, () => setState(() => _o2 = !_o2)),
              const SizedBox(height: 12),
              _field(_again, 'Yangi parolni qayta kiriting', _o3, () => setState(() => _o3 = !_o3)),
              const SizedBox(height: 10),
              const Text(
                'Yangi parol kamida 8 belgi. Uni hech kim, hatto administrator ham ko‘ra olmaydi.',
                style: TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: 24),
              PrimaryButton(
                label: 'Saqlash va davom etish',
                busy: _busy,
                onPressed: _submit,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _busy ? null : () => ref.read(authProvider.notifier).logout(),
                child: const Text('Chiqish', style: TextStyle(color: AppColors.inkMuted)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
