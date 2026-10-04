import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../lock/pin_widgets.dart';

const _deepGreen = Color(0xFF1F6F3A);
const _title = 'Worklyn';

/// Startup screen while the session and permissions are checked: the logo pops in with
/// pulsing rings, the name rises letter by letter, and a dot loader runs underneath.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..forward();
  late final AnimationController _loop = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat();

  late final Animation<double> _logo = _interval(0, 0.55, Curves.elasticOut);
  late final Animation<double> _subtitle = _interval(0.55, 0.85, Curves.easeOut);
  late final Animation<double> _loader = _interval(0.7, 1, Curves.easeOut);
  late final List<Animation<double>> _letters = [
    for (var i = 0; i < _title.length; i++)
      _interval(0.25 + i * 0.06, 0.55 + i * 0.06, Curves.easeOutBack),
  ];

  Animation<double> _interval(double begin, double end, Curve curve) => CurvedAnimation(
        parent: _intro,
        curve: Interval(begin, math.min(end, 1), curve: curve),
      );

  @override
  void dispose() {
    _intro.dispose();
    _loop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) {
      _intro.value = 1;
      if (_loop.isAnimating) _loop.stop();
    }

    return Scaffold(
      body: BrandBackdrop(
        child: Column(
          children: [
            const Spacer(flex: 17),
            _logoMark(),
            const SizedBox(height: 14),
            _titleText(),
            const SizedBox(height: 12),
            FadeTransition(
              opacity: _subtitle,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.6), end: Offset.zero).animate(_subtitle),
                child: Text(
                  context.t('Davomat · GPS · Kadrlar'),
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                    color: AppColors.inkMuted,
                  ),
                ),
              ),
            ),
            const Spacer(flex: 2),
            FadeTransition(opacity: _loader, child: _dotsLoader()),
            const SizedBox(height: 14),
            FadeTransition(
              opacity: _loader,
              child: Text(
                context.t('Yuklanmoqda…'),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.inkMuted),
              ),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }

  Widget _logoMark() {
    const size = 108.0;
    return SizedBox(
      width: 170,
      height: 170,
      child: AnimatedBuilder(
        animation: Listenable.merge([_intro, _loop]),
        builder: (context, _) {
          final pop = _logo.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              for (final phase in [0.0, 0.5])
                Builder(builder: (context) {
                  final t = (_loop.value + phase) % 1;
                  final d = size + 62 * t;
                  return Container(
                    width: d,
                    height: d,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(d * 0.34),
                      border: Border.all(
                        color: AppColors.accent.withValues(alpha: 0.4 * (1 - t) * _intro.value),
                        width: 2,
                      ),
                    ),
                  );
                }),
              Transform.scale(
                scale: pop,
                child: Transform.rotate(
                  angle: (1 - pop) * -0.5,
                  child: Container(
                    width: size,
                    height: size,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(size * 0.3),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [AppColors.headerTop, AppColors.headerBottom, _deepGreen],
                        stops: [0, 0.6, 1],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.4),
                          blurRadius: 28,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Transform.translate(
                      offset: Offset(0, math.sin(_loop.value * math.pi * 2) * 3),
                      child: const Icon(Icons.how_to_reg_rounded, color: Colors.white, size: 60),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _titleText() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _title.length; i++)
          AnimatedBuilder(
            animation: _letters[i],
            builder: (context, child) {
              final t = _letters[i].value;
              return Opacity(
                opacity: t.clamp(0.0, 1.0),
                child: Transform.translate(offset: Offset(0, 26 * (1 - t)), child: child),
              );
            },
            child: Text(
              _title[i],
              style: const TextStyle(
                fontSize: 48,
                fontWeight: FontWeight.w900,
                letterSpacing: 3,
                height: 1.1,
                color: _deepGreen,
              ),
            ),
          ),
      ],
    );
  }

  Widget _dotsLoader() {
    return AnimatedBuilder(
      animation: _loop,
      builder: (context, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (i) {
          final t = (_loop.value * 1.6 - i * 0.18) % 1;
          final bounce = t < 0.5 ? math.sin(t * 2 * math.pi) : 0.0;
          return Transform.translate(
            offset: Offset(0, -12 * bounce.clamp(0.0, 1.0)),
            child: Container(
              width: 14,
              height: 14,
              margin: const EdgeInsets.symmetric(horizontal: 6),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(colors: [AppColors.headerTop, AppColors.headerBottom]),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(alpha: 0.25 + 0.25 * bounce.clamp(0.0, 1.0)),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}
