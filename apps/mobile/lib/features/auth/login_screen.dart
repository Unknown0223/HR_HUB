import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_config.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/season.dart';
import '../../shared/ambient_motion.dart';
import '../../shared/seasonal_backdrop.dart';
import '../lock/pin_widgets.dart';
import 'account_recovery_sheets.dart';
import 'login_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with TickerProviderStateMixin, AmbientMotionState {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..forward();
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  );
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  );
  late final Animation<double> _brandIn = _interval(0, 0.45);
  late final Animation<double> _cardIn = _interval(0.15, 0.6);
  /// Title, server, login, password, button — revealed one after another.
  late final List<Animation<double>> _items = [
    for (var i = 0; i < 5; i++) _interval(0.3 + i * 0.1, 0.65 + i * 0.07),
  ];

  Animation<double> _interval(double begin, double end) => CurvedAnimation(
        parent: _intro,
        curve: Interval(begin, end.clamp(0, 1), curve: Curves.easeOutCubic),
      );

  final _email = TextEditingController();
  final _password = TextEditingController();
  /// Server link, pre-filled with the default server.
  final _server = TextEditingController(text: ApiConfig.displayServer(ApiConfig.defaultBaseUrl));
  bool _obscure = true;
  bool _busy = false;
  /// Set after a submit with empty fields: those fields turn red until filled.
  bool _markEmpty = false;
  final _loginFocus = FocusNode();
  final _passwordFocus = FocusNode();
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadServer();
  }

  Future<void> _loadServer() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('apiBaseUrl');
    if (url != null && url.isNotEmpty) _server.text = ApiConfig.displayServer(url);
  }

  /// Points the API client at the typed server; false (with an error shown) if it is not valid.
  Future<bool> _applyServer() async {
    final url = ApiConfig.resolveServer(_server.text);
    if (url == null) {
      _fail(context.t('Server silkasi noto‘g‘ri. Masalan: {0}', [ApiConfig.displayServer(ApiConfig.defaultBaseUrl)]));
      return false;
    }
    await ref.read(apiClientProvider).setBaseUrl(url);
    return true;
  }

  /// Line under the «Server» field: the host the app will connect to, or why the link is invalid.
  (IconData, String, Color) _serverHint(String input) {
    if (input.trim().isEmpty) {
      return (Icons.info_outline_rounded, context.t('Server silkasi (HR beradi)'), AppColors.inkFaint);
    }
    final url = ApiConfig.resolveServer(input);
    if (url == null) {
      return (Icons.error_outline, context.t('Silka noto‘g‘ri — masalan: hr-akfa.up.railway.app'), AppColors.danger);
    }
    return (Icons.link_rounded, ApiConfig.hostOf(url), AppColors.inkFaint);
  }

  String? _credentialsError() {
    if (_server.text.trim().isEmpty || _email.text.trim().isEmpty || _password.text.isEmpty) {
      _markEmpty = true;
      return context.t('Server, login va parolni kiriting');
    }
    return null;
  }

  String _humanize(Object e) {
    if (e is ApiException) {
      if (e.statusCode == 401) return context.t('Login yoki parol noto‘g‘ri');
      if (e.statusCode == 429) return context.t('Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring');
    }
    return e.toString();
  }

  void _fail(String message) {
    setState(() => _error = message);
    _shake.forward(from: 0);
  }

  @override
  void dispose() {
    _intro.dispose();
    _ambient.dispose();
    _shake.dispose();
    _email.dispose();
    _password.dispose();
    _loginFocus.dispose();
    _passwordFocus.dispose();
    _server.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final invalid = _credentialsError();
    if (invalid != null) {
      _fail(invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await _applyServer()) return;
      await ref.read(authProvider.notifier).login(_email.text.trim(), _password.text);
    } catch (e) {
      if (mounted) _fail(_humanize(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgotPassword() async {
    final login = await showForgotPasswordSheet(
      context,
      initialLogin: _email.text.trim(),
      ensureServer: _applyServer,
    );
    if (login == null || !mounted) return;
    setState(() {
      _email.text = login;
      _password.clear();
      _error = null;
    });
    _passwordFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    syncAmbient(_ambient, reverse: true);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          const Positioned.fill(child: SceneBackdrop()),
          const Positioned.fill(child: SeasonFall()),
          Positioned.fill(child: IgnorePointer(child: _glowOrbs())),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 110,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withValues(alpha: 0.6),
                      Colors.white.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
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
                        _Reveal(
                          animation: _brandIn,
                          offset: const Offset(0, -0.4),
                          child: const Align(alignment: Alignment.centerLeft, child: BrandChip()),
                        ),
                        const Spacer(),
                        const SizedBox(height: 180),
                        Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 480),
                            child: _Reveal(
                              animation: _cardIn,
                              offset: const Offset(0, 0.25),
                              child: AnimatedBuilder(
                                animation: _shake,
                                builder: (context, child) {
                                  final t = _shake.value;
                                  return Transform.translate(
                                    offset: Offset(math.sin(t * math.pi * 6) * 10 * (1 - t), 0),
                                    child: child,
                                  );
                                },
                                child: _formCard(),
                              ),
                            ),
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
    );
  }

  /// Soft drifting green lights in the lower half, so the translucent card has colour behind it.
  Widget _glowOrbs() {
    final season = SeasonX.now;
    Widget orb(double size, Color color, double alpha) => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [color.withValues(alpha: alpha), color.withValues(alpha: 0)],
            ),
          ),
        );

    return AnimatedBuilder(
      animation: _ambient,
      builder: (context, _) {
        final t = _ambient.value * math.pi * 2;
        return LayoutBuilder(
          builder: (context, box) {
            final w = box.maxWidth;
            final h = box.maxHeight;
            return Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: -w * 0.25 + math.sin(t) * 30,
                  top: h * 0.55 + math.cos(t) * 24,
                  child: orb(w * 0.85, season.orb, 0.45),
                ),
                Positioned(
                  right: -w * 0.3 + math.cos(t) * 28,
                  top: h * 0.68 + math.sin(t) * 30,
                  child: orb(w * 0.9, season.orbSoft, 0.40),
                ),
                Positioned(
                  left: w * 0.2 + math.cos(t + 1) * 36,
                  bottom: -w * 0.35 + math.sin(t + 1) * 20,
                  child: orb(w * 0.8, season.bit, 0.38),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _formCard() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 9, sigmaY: 9),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 10),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.5),
                const Color(0xFFE8F5EC).withValues(alpha: 0.28),
                Colors.white.withValues(alpha: 0.22),
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
              _Reveal(
                animation: _items[0],
                child: Text(
                  context.t('Xush kelibsiz!'),
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
              ),
              const SizedBox(height: 4),
              _Reveal(
                animation: _items[0],
                child: Text(
                  context.t('Login va parolni HR bo\'limidan oling'),
                  style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                ),
              ),
              const SizedBox(height: 20),
              _Reveal(
                animation: _items[1],
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AuthField(
                      controller: _server,
                      label: context.t('Server'),
                      hint: 'hr-akfa.up.railway.app',
                      icon: Icons.apartment_rounded,
                      error: _markEmpty,
                      keyboardType: TextInputType.url,
                      textInputAction: TextInputAction.next,
                      onSubmitted: (_) => _loginFocus.requestFocus(),
                    ),
                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _server,
                      builder: (context, value, _) {
                        final (icon, text, color) = _serverHint(value.text);
                        return Padding(
                          padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
                          child: Row(
                            children: [
                              Icon(icon, size: 14, color: color),
                              const SizedBox(width: 5),
                              Expanded(
                                child: Text(
                                  text,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 11.5, color: color),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _Reveal(
                animation: _items[2],
                child: AuthField(
                  controller: _email,
                  focusNode: _loginFocus,
                  label: context.t('Login'),
                  hint: context.t('masalan: ali.valiyev'),
                  icon: Icons.person_rounded,
                  error: _markEmpty,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.username],
                  onSubmitted: (_) => _passwordFocus.requestFocus(),
                ),
              ),
              const SizedBox(height: 14),
              _Reveal(
                animation: _items[3],
                child: AuthField(
                  controller: _password,
                  focusNode: _passwordFocus,
                  label: context.t('Parol'),
                  hint: '••••••••',
                  icon: Icons.lock_rounded,
                  obscure: _obscure,
                  error: _markEmpty,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                  suffix: IconButton(
                    tooltip: _obscure ? context.t('Parolni ko‘rsatish') : context.t('Parolni yashirish'),
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      transitionBuilder: (child, a) => RotationTransition(
                        turns: Tween(begin: 0.75, end: 1.0).animate(a),
                        child: ScaleTransition(scale: a, child: child),
                      ),
                      child: Icon(
                        _obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded,
                        key: ValueKey(_obscure),
                        color: _obscure ? AppColors.inkFaint : AppColors.accent,
                      ),
                    ),
                  ),
                ),
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
              const SizedBox(height: 20),
              _Reveal(
                animation: _items[4],
                child: GlowButton(label: context.tr('Kirish', 'Войти'), busy: _busy, onPressed: _submit),
              ),
              const SizedBox(height: 10),
              _Reveal(
                animation: _items[4],
                child: OutlinedButton.icon(
                  onPressed: _busy
                      ? null
                      : () => showTelegramLoginSheet(
                            context,
                            initialLogin: _email.text.trim(),
                            ensureServer: _applyServer,
                          ),
                  icon: const Icon(Icons.send_rounded, size: 18),
                  label: Text(context.tr('Telegram orqali kirish', 'Войти через Telegram')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF1E96C8),
                    side: BorderSide(color: const Color(0xFF1E96C8).withValues(alpha: 0.4), width: 1.4),
                    backgroundColor: Colors.white.withValues(alpha: 0.6),
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                ),
              ),
              Center(
                child: TextButton(
                  onPressed: _busy ? null : _forgotPassword,
                  child: Text(
                    context.tr('Parolni unutdingizmi?', 'Забыли пароль?'),
                    style: const TextStyle(color: Color(0xFF1F6F3A), fontWeight: FontWeight.w700),
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

/// Fades a child in while sliding it from [offset] (fractions of its own size).
class _Reveal extends StatelessWidget {
  const _Reveal({
    required this.animation,
    required this.child,
    this.offset = const Offset(0, 0.3),
  });

  final Animation<double> animation;
  final Offset offset;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: animation,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, child) => FractionalTranslation(
          translation: Offset.lerp(offset, Offset.zero, animation.value)!,
          child: child,
        ),
        child: child,
      ),
    );
  }
}
