import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_state.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';

const _telegramBlue = Color(0xFF1E96C8);

class TelegramStatus {
  TelegramStatus.fromJson(Map<String, dynamic> j)
      : configured = j['configured'] == true,
        linked = j['linked'] == true,
        promptDue = j['promptDue'] == true,
        username = j['username']?.toString(),
        botUsername = j['botUsername']?.toString();

  final bool configured;
  final bool linked;
  final bool promptDue;
  final String? username;
  final String? botUsername;
}

/// Opens the connect / manage dialog. In [prompt] mode the secondary button snoozes the
/// invitation for 3 days; otherwise a linked account can be disconnected.
Future<void> showTelegramConnectDialog(BuildContext context, {bool prompt = false, TelegramStatus? initial}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !prompt,
    builder: (_) => _TelegramConnectDialog(prompt: prompt, initial: initial),
  );
}

/// Shows the centered invitation once per app run while the account has no bot link.
class TelegramPromptGate extends ConsumerStatefulWidget {
  const TelegramPromptGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<TelegramPromptGate> createState() => _TelegramPromptGateState();
}

class _TelegramPromptGateState extends ConsumerState<TelegramPromptGate> {
  /// User the prompt was last checked for, so signing in as someone else checks again.
  static String? _checkedFor;

  @override
  void initState() {
    super.initState();
    final userId = ref.read(authProvider).user?.id;
    if (userId != null && userId != _checkedFor) {
      _checkedFor = userId;
      Future.delayed(const Duration(seconds: 2), _check);
    }
  }

  Future<void> _check() async {
    try {
      final s = TelegramStatus.fromJson(await ref.read(apiClientProvider).get('/telegram/me'));
      if (!s.promptDue || !mounted) return;
      await showTelegramConnectDialog(context, prompt: true, initial: s);
    } catch (_) {
      /* offline or older server — try again next run */
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _TelegramConnectDialog extends ConsumerStatefulWidget {
  const _TelegramConnectDialog({required this.prompt, this.initial});

  final bool prompt;
  final TelegramStatus? initial;

  @override
  ConsumerState<_TelegramConnectDialog> createState() => _TelegramConnectDialogState();
}

class _TelegramConnectDialogState extends ConsumerState<_TelegramConnectDialog> with WidgetsBindingObserver {
  late TelegramStatus? _status = widget.initial;
  bool _waiting = false;
  bool _busy = false;
  bool _justLinked = false;
  String? _error;
  Timer? _poll;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (_status == null) _reload();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _waiting) _checkLinked();
  }

  Future<void> _reload() async {
    try {
      final s = TelegramStatus.fromJson(await _api.get('/telegram/me'));
      if (mounted) setState(() => _status = s);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _checkLinked() async {
    try {
      final s = TelegramStatus.fromJson(await _api.get('/telegram/me'));
      if (!mounted || !s.linked) return;
      _poll?.cancel();
      setState(() {
        _status = s;
        _waiting = false;
        _justLinked = true;
      });
    } catch (_) {
      /* keep waiting */
    }
  }

  /// A fresh one-time link each time: it is single-use and expires in 10 minutes.
  Future<void> _openBot() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await _api.post('/telegram/me/link');
      final url = Uri.tryParse(res['url']?.toString() ?? '');
      if (url == null) throw Exception('link');
      final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        setState(() => _error = context.tr('Telegram ochilmadi — ilova o‘rnatilganini tekshiring', 'Не удалось открыть Telegram — проверьте, что приложение установлено'));
        return;
      }
      setState(() => _waiting = true);
      _poll?.cancel();
      _poll = Timer.periodic(const Duration(seconds: 3), (_) => _checkLinked());
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _snooze() async {
    setState(() => _busy = true);
    try {
      await _api.post('/telegram/me/snooze');
    } catch (_) {
      /* the prompt simply returns next run */
    }
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _unlink() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.delete('/telegram/me');
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final linked = s?.linked == true;
    return AlertDialog(
      backgroundColor: AppColors.cardAlt,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      contentPadding: const EdgeInsets.fromLTRB(22, 22, 22, 8),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: linked ? AppColors.accent : _telegramBlue,
            ),
            child: Icon(linked ? Icons.check_rounded : Icons.send_rounded, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 14),
          if (s == null)
            const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator())
          else if (linked) ...[
            Text(context.tr('Telegram ulangan', 'Telegram подключён'), style: _title),
            const SizedBox(height: 8),
            Text(
              '${s.username != null ? '@${s.username} · ' : ''}${context.tr(
                'bildirishnomalar, kelish-ketish belgilari va xavfsizlik xabarlari botga keladi',
                'уведомления, отметки прихода и ухода и сообщения безопасности приходят в бот',
              )}',
              textAlign: TextAlign.center,
              style: _body,
            ),
          ] else if (!s.configured) ...[
            Text(context.tr('Bot hali sozlanmagan', 'Бот ещё не настроен'), style: _title),
            const SizedBox(height: 8),
            Text(
              context.tr('Administrator bot tokenini kiritishi kerak.', 'Администратор должен указать токен бота.'),
              textAlign: TextAlign.center,
              style: _body,
            ),
          ] else ...[
            Text(context.tr('Telegram’ni ulang', 'Подключите Telegram'), style: _title),
            const SizedBox(height: 12),
            _point(context.tr('Har bir kelish va ketish belgisi — darhol Telegram’ga', 'Каждая отметка прихода и ухода — сразу в Telegram')),
            _point(context.tr('Barcha bildirishnomalar va xavfsizlik xabarlari', 'Все уведомления и сообщения безопасности')),
            _point(context.tr('Bot orqali parolsiz kirish va parolni tiklash', 'Вход без пароля и восстановление пароля через бот')),
            const SizedBox(height: 10),
            Text(
              _waiting
                  ? context.tr('Botda «Start» ni bosing — oyna o‘zi yangilanadi', 'Нажмите «Start» в боте — окно обновится само')
                  : context.tr('Havola bir martalik. Botda parol kiritish shart emas.', 'Ссылка одноразовая. Пароль в боте вводить не нужно.'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: _waiting ? _telegramBlue : AppColors.inkFaint,
                fontWeight: _waiting ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
          ],
        ],
      ),
      actionsAlignment: MainAxisAlignment.center,
      actionsPadding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      actions: _actions(context, s, linked),
    );
  }

  List<Widget> _actions(BuildContext context, TelegramStatus? s, bool linked) {
    if (s == null) return const [];
    if (linked) {
      return [
        if (!widget.prompt && !_justLinked)
          TextButton(
            onPressed: _busy ? null : _unlink,
            child: Text(context.tr('Uzish', 'Отключить'), style: const TextStyle(color: AppColors.danger)),
          ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          style: FilledButton.styleFrom(backgroundColor: AppColors.accent),
          child: Text(context.tr('Tayyor', 'Готово')),
        ),
      ];
    }
    if (!s.configured) {
      return [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(context.tr('Yopish', 'Закрыть'))),
      ];
    }
    return [
      TextButton(
        onPressed: _busy ? null : (widget.prompt ? _snooze : () => Navigator.of(context).pop()),
        child: Text(widget.prompt ? context.tr('Keyinroq eslatish', 'Напомнить позже') : context.tr('Yopish', 'Закрыть')),
      ),
      FilledButton.icon(
        onPressed: _busy ? null : _openBot,
        style: FilledButton.styleFrom(backgroundColor: _telegramBlue),
        icon: _busy
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : const Icon(Icons.send_rounded, size: 18),
        label: Text(context.tr('Telegram botga o‘tish', 'Перейти в Telegram-бот')),
      ),
    ];
  }

  static const _title = TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink);
  static const _body = TextStyle(fontSize: 13.5, height: 1.4, color: AppColors.inkMuted);

  Widget _point(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.check_rounded, size: 18, color: AppColors.accent),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.35, color: AppColors.ink))),
          ],
        ),
      );
}
