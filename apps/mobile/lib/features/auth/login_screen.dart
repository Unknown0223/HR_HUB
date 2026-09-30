import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_config.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import 'login_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with TickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..forward();
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  )..repeat(reverse: true);
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  );
  late final Animation<double> _brandIn = _interval(0, 0.45);
  late final Animation<double> _cardIn = _interval(0.15, 0.6);
  /// Title, login, password, buttons, server link — revealed one after another.
  late final List<Animation<double>> _items = [
    for (var i = 0; i < 5; i++) _interval(0.3 + i * 0.1, 0.65 + i * 0.07),
  ];

  Animation<double> _interval(double begin, double end) => CurvedAnimation(
        parent: _intro,
        curve: Interval(begin, end.clamp(0, 1), curve: Curves.easeOutCubic),
      );

  final _email = TextEditingController();
  final _password = TextEditingController();
  /// Short company name (`akfa`) or, for self-hosted/dev servers, a full URL.
  final _server = TextEditingController(text: ApiConfig.displayServer(ApiConfig.defaultBaseUrl));
  bool _obscure = true;
  bool _busy = false;
  bool _showServer = false;
  /// Set after a submit with empty fields: those fields turn red until filled.
  bool _markEmpty = false;
  final _passwordFocus = FocusNode();
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBaseUrl();
  }

  Future<void> _loadBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('apiBaseUrl');
    if (url != null && url.isNotEmpty) {
      _server.text = ApiConfig.displayServer(url);
      if (url != ApiConfig.defaultBaseUrl && mounted) {
        setState(() => _showServer = true);
      }
    }
  }

  /// Points the API client at the typed server; false (with an error shown) if it is not valid.
  Future<bool> _applyServer() async {
    final url = ApiConfig.resolveServer(_server.text);
    if (url == null) {
      setState(() => _showServer = true);
      _fail('Server nomi noto‘g‘ri. Masalan: akfa');
      return false;
    }
    await ref.read(apiClientProvider).setBaseUrl(url);
    return true;
  }

  String? _credentialsError() {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      _markEmpty = true;
      return 'Login va parolni kiriting';
    }
    return null;
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
      if (mounted) _fail(e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    if (reduceMotion && _ambient.isAnimating) _ambient.stop();

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(
        children: [
          Positioned.fill(child: _background()),
          Positioned.fill(child: IgnorePointer(child: _glowOrbs())),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 140,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withValues(alpha: 0.85),
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
                          child: _brand(),
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

  /// Slow drift over the illustration so the screen feels alive without distracting.
  Widget _background() {
    return AnimatedBuilder(
      animation: _ambient,
      builder: (context, child) {
        final t = Curves.easeInOut.transform(_ambient.value);
        return Transform.translate(
          offset: Offset(-8 + 16 * t, -36),
          child: Transform.scale(
            scale: 1.04 + 0.05 * t,
            alignment: Alignment.topCenter,
            child: child,
          ),
        );
      },
      child: Image.asset(
        'assets/images/login_bg.jpg',
        fit: BoxFit.cover,
        alignment: Alignment.topCenter,
        filterQuality: FilterQuality.medium,
      ),
    );
  }

  /// Soft drifting green lights in the lower half, so the translucent card has colour behind it.
  Widget _glowOrbs() {
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
                  child: orb(w * 0.85, AppColors.accent, 0.45),
                ),
                Positioned(
                  right: -w * 0.3 + math.cos(t) * 28,
                  top: h * 0.68 + math.sin(t) * 30,
                  child: orb(w * 0.9, const Color(0xFF2BB673), 0.40),
                ),
                Positioned(
                  left: w * 0.2 + math.cos(t + 1) * 36,
                  bottom: -w * 0.35 + math.sin(t + 1) * 20,
                  child: orb(w * 0.8, const Color(0xFF9BE15D), 0.38),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _brand() {
    return Row(
      children: [
        AnimatedBuilder(
          animation: _ambient,
          builder: (context, child) => Transform.translate(
            offset: Offset(0, math.sin(_ambient.value * math.pi * 2) * 2.5),
            child: child,
          ),
          child: Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.headerTop, AppColors.headerBottom],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.accent.withValues(alpha: 0.35),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(Icons.how_to_reg_rounded, color: Colors.white, size: 26),
          ),
        ),
        const SizedBox(width: 12),
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'HR HUB',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
                color: Color(0xFF1F6F3A),
              ),
            ),
            Text(
              'Davomat · GPS · Kadrlar',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.inkMuted),
            ),
          ],
        ),
      ],
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
                child: const Text(
                  'Xush kelibsiz!',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.ink),
                ),
              ),
              const SizedBox(height: 4),
              _Reveal(
                animation: _items[0],
                child: const Text(
                  'Login va parolni HR bo\'limidan oling',
                  style: TextStyle(color: AppColors.inkMuted, fontSize: 13),
                ),
              ),
              const SizedBox(height: 20),
              _Reveal(
                animation: _items[1],
                child: AuthField(
                  controller: _email,
                  label: 'Login',
                  hint: 'login@kompaniya',
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
                animation: _items[2],
                child: AuthField(
                  controller: _password,
                  focusNode: _passwordFocus,
                  label: 'Parol',
                  hint: '••••••••',
                  icon: Icons.lock_rounded,
                  obscure: _obscure,
                  error: _markEmpty,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                  suffix: IconButton(
                    tooltip: _obscure ? 'Parolni ko‘rsatish' : 'Parolni yashirish',
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
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                child: _showServer
                    ? Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AuthField(
                              controller: _server,
                              label: 'Kompaniya (server)',
                              hint: 'masalan: akfa',
                              icon: Icons.apartment_rounded,
                              keyboardType: TextInputType.url,
                              textInputAction: TextInputAction.done,
                              onSubmitted: (_) => _submit(),
                              suffix: IconButton(
                                tooltip: 'Standart server',
                                onPressed: () => setState(
                                  () => _server.text = ApiConfig.displayServer(ApiConfig.defaultBaseUrl),
                                ),
                                icon: const Icon(Icons.restart_alt_rounded, color: AppColors.inkFaint),
                              ),
                            ),
                            ValueListenableBuilder<TextEditingValue>(
                              valueListenable: _server,
                              builder: (context, value, _) {
                                final url = ApiConfig.resolveServer(value.text);
                                return Padding(
                                  padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
                                  child: Row(
                                    children: [
                                      Icon(
                                        url == null ? Icons.error_outline : Icons.link_rounded,
                                        size: 14,
                                        color: url == null ? AppColors.danger : AppColors.inkFaint,
                                      ),
                                      const SizedBox(width: 5),
                                      Expanded(
                                        child: Text(
                                          url == null
                                              ? 'Kompaniya nomini yozing, masalan: akfa'
                                              : ApiConfig.hostOf(url),
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            color: url == null ? AppColors.danger : AppColors.inkFaint,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      )
                    : const SizedBox(width: double.infinity),
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
                animation: _items[3],
                child: GlowButton(label: 'Kirish', busy: _busy, onPressed: _submit),
              ),
              const SizedBox(height: 6),
              _Reveal(
                animation: _items[4],
                child: Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _showServer = !_showServer),
                    icon: AnimatedRotation(
                      turns: _showServer ? 0.5 : 0,
                      duration: const Duration(milliseconds: 250),
                      child: Icon(
                        _showServer ? Icons.expand_less : Icons.settings_outlined,
                        size: 18,
                        color: AppColors.inkFaint,
                      ),
                    ),
                    label: const Text(
                      'Server sozlamalari',
                      style: TextStyle(color: AppColors.inkFaint, fontSize: 12),
                    ),
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
