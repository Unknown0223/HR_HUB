import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Xavfsizlik'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text(
                  'Parolni o\'zgartirish',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
                onTap: () => context.push('/security/password'),
              ),
              const Divider(height: 1, color: AppColors.line),
              ListTile(
                title: const Text(
                  'PIN-kodni o\'zgartirish',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
                onTap: () => context.push('/security/pin'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
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
    if (_next.text == _current.text) return 'Yangi parol joriy paroldan farq qilishi kerak';
    return null;
  }

  String _humanize(Object e) {
    if (e is ApiException) {
      if (e.statusCode == 429) return 'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring';
      if (e.message.contains('Текущий пароль')) return 'Joriy parol noto‘g‘ri';
      if (e.message.contains('совпадает')) return 'Yangi parol joriy parol bilan bir xil';
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
        const SnackBar(content: Text('Parol o‘zgartirildi. Keyingi kirishda yangi paroldan foydalaning')),
      );
      context.pop();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Parolni o\'zgartirish'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SoftField(
              controller: _current,
              hint: 'Joriy parol',
              prefixIcon: Icons.lock_outline,
              obscure: _o1,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o1 = !_o1),
                icon: Icon(_o1 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const SizedBox(height: 12),
            SoftField(
              controller: _next,
              hint: 'Yangi parol',
              prefixIcon: Icons.lock_outline,
              obscure: _o2,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o2 = !_o2),
                icon: Icon(_o2 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const SizedBox(height: 12),
            SoftField(
              controller: _again,
              hint: 'Parolni qayta kiriting',
              prefixIcon: Icons.lock_outline,
              obscure: _o3,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o3 = !_o3),
                icon: Icon(_o3 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Parol kamida 8 belgi. Uni hech kim, hatto administrator ham ko‘ra olmaydi.',
              style: TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const Spacer(),
            PrimaryButton(
              label: 'O\'zgartirish',
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Yordam'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SectionCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('Qo\'llab-quvvatlash bilan suhbat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),
            ),
            const SizedBox(height: 10),
            SectionCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.telegram, color: Color(0xFF2AABEE)),
                title: const Text('Telegram orqali chat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ModulesScreen extends ConsumerWidget {
  const ModulesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasTeam = ref.watch(authProvider).user?.hasTeam == true;
    final items = [
      (Icons.login_rounded, 'Kirish', '/punch/in'),
      (Icons.logout_rounded, 'Chiqish', '/punch/out'),
      (Icons.table_chart_outlined, 'Tabel', '/tabel'),
      (Icons.assignment_outlined, 'So\'rovlar', '/requests'),
      if (hasTeam) (Icons.groups_outlined, 'Jamoa', '/team'),
      (Icons.payments_outlined, 'To\'lov', '/payroll'),
      (Icons.note_alt_outlined, 'Qaydlar', '/marks'),
    ];
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Modullar'),
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.35,
        ),
        itemCount: items.length,
        itemBuilder: (context, i) {
          final e = items[i];
          return Material(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push(e.$3),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(e.$1, size: 28),
                  const SizedBox(height: 10),
                  Text(e.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

