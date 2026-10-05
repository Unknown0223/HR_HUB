import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

String _recoveryError(BuildContext context, Object e) {
  if (e is ApiException) {
    if (e.statusCode == 429) {
      return context.tr(
        'Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring',
        'Слишком много попыток. Попробуйте через 15 минут',
      );
    }
    if (e.statusCode == 400 && (e.serverMessage ?? '').toLowerCase().contains('kod')) {
      return context.tr('Kod noto‘g‘ri yoki muddati o‘tgan', 'Неверный или просроченный код');
    }
  }
  return e.toString();
}

Future<T?> _sheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.cardAlt,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: child,
      ),
    );

/// «Sign in with Telegram»: the bot shows three numbers in the linked chat; the user taps the one
/// shown here. [ensureServer] points the API client at the typed server first.
Future<void> showTelegramLoginSheet(
  BuildContext context, {
  required String initialLogin,
  required Future<bool> Function() ensureServer,
}) =>
    _sheet<void>(context, _TelegramLoginSheet(initialLogin: initialLogin, ensureServer: ensureServer));

/// Forgot password: a 6-digit code goes to the linked Telegram chat and/or e-mail.
Future<String?> showForgotPasswordSheet(
  BuildContext context, {
  required String initialLogin,
  required Future<bool> Function() ensureServer,
}) =>
    _sheet<String>(context, _ForgotPasswordSheet(initialLogin: initialLogin, ensureServer: ensureServer));

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.icon, required this.children});

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Icon(icon, color: AppColors.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine(this.text);
  final String? text;

  @override
  Widget build(BuildContext context) {
    final t = text;
    if (t == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(t, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
    );
  }
}

class _TelegramLoginSheet extends ConsumerStatefulWidget {
  const _TelegramLoginSheet({required this.initialLogin, required this.ensureServer});

  final String initialLogin;
  final Future<bool> Function() ensureServer;

  @override
  ConsumerState<_TelegramLoginSheet> createState() => _TelegramLoginSheetState();
}

class _TelegramLoginSheetState extends ConsumerState<_TelegramLoginSheet> {
  late final _login = TextEditingController(text: widget.initialLogin);
  String? _requestId;
  int? _code;
  DateTime? _expiresAt;
  String? _outcome;
  String? _error;
  bool _busy = false;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _login.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    if (_busy || _login.text.trim().length < 3) return;
    setState(() {
      _busy = true;
      _error = null;
      _outcome = null;
    });
    try {
      if (!await widget.ensureServer()) return;
      final res = await ref.read(apiClientProvider).post('/auth/telegram/start', data: {'login': _login.text.trim()});
      setState(() {
        _requestId = res['requestId']?.toString();
        _code = (res['code'] as num?)?.toInt();
        _expiresAt = DateTime.tryParse(res['expiresAt']?.toString() ?? '');
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 2), (_) => _poll());
    } catch (e) {
      if (mounted) setState(() => _error = _recoveryError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _polling = false;

  Future<void> _poll() async {
    final id = _requestId;
    if (id == null || _polling || !mounted) return;
    final exp = _expiresAt;
    if (exp != null && DateTime.now().isAfter(exp.add(const Duration(seconds: 2)))) {
      _timer?.cancel();
      setState(() => _outcome = 'expired');
      return;
    }
    _polling = true;
    try {
      final res = await ref.read(apiClientProvider).post('/auth/telegram/poll', data: {'requestId': id});
      if (!mounted) return;
      final status = res['status']?.toString();
      if (status == 'approved') {
        _timer?.cancel();
        // Close the sheet before the router reacts to the new session.
        final auth = ref.read(authProvider.notifier);
        Navigator.of(context).pop();
        await auth.signInWithSession(res);
        return;
      }
      if (status == 'denied' || status == 'expired') {
        _timer?.cancel();
        setState(() => _outcome = status);
      } else {
        setState(() {});
      }
    } catch (_) {
      /* transient — keep polling until the request expires */
    } finally {
      _polling = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final waiting = _requestId != null && _outcome == null;
    final left = _expiresAt == null ? 0 : _expiresAt!.difference(DateTime.now()).inSeconds.clamp(0, 999);
    return _SheetFrame(
      title: context.tr('Telegram orqali kirish', 'Вход через Telegram'),
      icon: Icons.send_rounded,
      children: [
        if (_requestId == null) ...[
          Text(
            context.tr(
              'Loginni kiriting — Worklyn boti ulangan Telegram’ingizga kirish so‘rovini yuboradi. Parol kerak emas.',
              'Введите логин — бот Worklyn пришлёт в привязанный Telegram запрос на вход. Пароль не нужен.',
            ),
            style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
          ),
          const SizedBox(height: 14),
          SoftField(controller: _login, hint: 'ali.valiyev', label: context.tr('Login', 'Логин'), prefixIcon: Icons.person_rounded),
          _ErrorLine(_error),
          const SizedBox(height: 16),
          PrimaryButton(label: context.tr('So‘rov yuborish', 'Отправить запрос'), busy: _busy, onPressed: _start),
        ] else if (waiting) ...[
          Text(
            context.tr('Worklyn Telegram botini oching va shu raqamni bosing:', 'Откройте Telegram-бот Worklyn и нажмите это число:'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.ink, height: 1.4),
          ),
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                '${_code ?? ''}',
                style: const TextStyle(fontSize: 46, fontWeight: FontWeight.w900, color: AppColors.accent, letterSpacing: 4),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
              const SizedBox(width: 8),
              Text(
                context.tr('Tasdiq kutilmoqda · $left s', 'Ожидаем подтверждения · $left с'),
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            context.tr(
              'Xabar kelmasa, akkaunt hali botga ulanmagan. Parol bilan kiring — ilova Telegram’ni ulashni taklif qiladi.',
              'Если сообщение не пришло, аккаунт ещё не привязан к боту. Войдите по паролю — приложение предложит подключить Telegram.',
            ),
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkFaint, fontSize: 12, height: 1.35),
          ),
        ] else ...[
          Text(
            _outcome == 'denied'
                ? context.tr(
                    'Kirish Telegram’da rad etildi. Agar bu siz bo‘lsangiz — qayta yuboring va to‘g‘ri raqamni tanlang.',
                    'Вход отклонён в Telegram. Если это были вы — отправьте снова и выберите правильное число.',
                  )
                : context.tr('So‘rov muddati tugadi. Qayta yuboring.', 'Время запроса истекло. Отправьте снова.'),
            style: const TextStyle(color: AppColors.ink, height: 1.4),
          ),
          _ErrorLine(_error),
          const SizedBox(height: 16),
          PrimaryButton(label: context.tr('Qayta yuborish', 'Отправить снова'), busy: _busy, onPressed: _start),
        ],
      ],
    );
  }
}

class _ForgotPasswordSheet extends ConsumerStatefulWidget {
  const _ForgotPasswordSheet({required this.initialLogin, required this.ensureServer});

  final String initialLogin;
  final Future<bool> Function() ensureServer;

  @override
  ConsumerState<_ForgotPasswordSheet> createState() => _ForgotPasswordSheetState();
}

class _ForgotPasswordSheetState extends ConsumerState<_ForgotPasswordSheet> {
  late final _login = TextEditingController(text: widget.initialLogin);
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  int _step = 0;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _login.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (_busy || _login.text.trim().length < 3) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await widget.ensureServer()) return;
      await ref.read(apiClientProvider).post('/auth/password/forgot', data: {'login': _login.text.trim()});
      if (mounted) setState(() => _step = 1);
    } catch (e) {
      if (mounted) setState(() => _error = _recoveryError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (_busy) return;
    String? invalid;
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text.trim())) {
      invalid = context.tr('6 xonali kodni kiriting', 'Введите 6-значный код');
    } else if (_password.text.length < 8) {
      invalid = context.tr('Parol kamida 8 belgi', 'Пароль: минимум 8 символов');
    } else if (_password.text != _confirm.text) {
      invalid = context.tr('Parollar mos kelmadi', 'Пароли не совпадают');
    }
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).post('/auth/password/reset', data: {
        'login': _login.text.trim(),
        'code': _code.text.trim(),
        'newPassword': _password.text,
      });
      if (mounted) setState(() => _step = 2);
    } catch (e) {
      if (mounted) setState(() => _error = _recoveryError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetFrame(
      title: context.tr('Parolni tiklash', 'Восстановление пароля'),
      icon: Icons.lock_reset_rounded,
      children: switch (_step) {
        0 => [
            Text(
              context.tr(
                'Kod Worklyn Telegram botiga (akkaunt ulangan bo‘lsa) va kartochkangizdagi pochtaga keladi.',
                'Код придёт в Telegram-бот Worklyn (если аккаунт привязан) и на почту из вашей карточки.',
              ),
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
            const SizedBox(height: 14),
            SoftField(controller: _login, hint: 'ali.valiyev', label: context.tr('Login', 'Логин'), prefixIcon: Icons.person_rounded),
            _ErrorLine(_error),
            const SizedBox(height: 16),
            PrimaryButton(label: context.tr('Kod olish', 'Получить код'), busy: _busy, onPressed: _requestCode),
          ],
        1 => [
            Text(
              context.tr(
                'Akkaunt topilsa va unga Telegram yoki pochta ulangan bo‘lsa, 6 xonali kod yuborildi. U 10 daqiqa amal qiladi — hech kimga aytmang.',
                'Если аккаунт найден и к нему привязан Telegram или почта, мы отправили 6-значный код. Он действует 10 минут — никому не сообщайте.',
              ),
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w800),
              decoration: InputDecoration(labelText: context.tr('Kod', 'Код'), counterText: ''),
            ),
            const SizedBox(height: 10),
            SoftField(
              controller: _password,
              hint: '',
              label: context.tr('Yangi parol', 'Новый пароль'),
              prefixIcon: Icons.lock_rounded,
              obscure: _obscure,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(_obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded),
              ),
            ),
            const SizedBox(height: 10),
            SoftField(
              controller: _confirm,
              hint: '',
              label: context.tr('Parolni takrorlang', 'Повторите пароль'),
              prefixIcon: Icons.lock_outline_rounded,
              obscure: _obscure,
            ),
            _ErrorLine(_error),
            const SizedBox(height: 16),
            PrimaryButton(label: context.tr('Parolni almashtirish', 'Сменить пароль'), busy: _busy, onPressed: _reset),
            TextButton(
              onPressed: _busy ? null : _requestCode,
              child: Text(context.tr('Kodni qayta yuborish', 'Отправить код снова')),
            ),
          ],
        _ => [
            const Icon(Icons.check_circle_rounded, color: AppColors.accent, size: 56),
            const SizedBox(height: 10),
            Text(
              context.tr(
                'Parol o‘zgartirildi. Barcha oldingi seanslar yopildi — yangi parol bilan kiring.',
                'Пароль изменён. Все прежние сеансы завершены — войдите с новым паролем.',
              ),
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.ink, height: 1.4),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: context.tr('Kirish', 'Войти'),
              onPressed: () => Navigator.of(context).pop(_login.text.trim()),
            ),
          ],
      },
    );
  }
}
