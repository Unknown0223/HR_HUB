import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/season.dart';
import '../../shared/ambient_motion.dart';
import '../../shared/seasonal_backdrop.dart';

const kPinLength = 4;
const _deepGreen = Color(0xFF1F6F3A);

/// The login illustration drifting slowly (Ken Burns), fading to white towards the bottom,
/// with soft green lights moving underneath. Shared by the splash and lock screens.
class BrandBackdrop extends StatefulWidget {
  const BrandBackdrop({super.key, required this.child});

  final Widget child;

  @override
  State<BrandBackdrop> createState() => _BrandBackdropState();
}

class _BrandBackdropState extends State<BrandBackdrop>
    with SingleTickerProviderStateMixin, AmbientMotionState {
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 16),
  );

  @override
  void dispose() {
    _ambient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    syncAmbient(_ambient, reverse: true);

    Widget orb(double size, Color color, double alpha) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            color.withValues(alpha: alpha),
            color.withValues(alpha: 0),
          ],
        ),
      ),
    );

    return Material(
      color: Colors.white,
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth;
          final h = box.maxHeight;
          return Stack(
            children: [
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _ambient,
                  builder: (context, child) {
                    final t = Curves.easeInOut.transform(_ambient.value);
                    return Transform.translate(
                      offset: Offset(-10 + 20 * t, -20),
                      child: Transform.scale(
                        scale: 1.05 + 0.07 * t,
                        alignment: Alignment.topCenter,
                        child: child,
                      ),
                    );
                  },
                  child: Image.asset(
                    SeasonX.now.asset,
                    fit: BoxFit.cover,
                    alignment: Alignment.centerLeft,
                    filterQuality: FilterQuality.medium,
                    frameBuilder: (context, child, frame, syncLoaded) =>
                        syncLoaded
                        ? child
                        : AnimatedOpacity(
                            opacity: frame == null ? 0 : 1,
                            duration: const Duration(milliseconds: 600),
                            curve: Curves.easeOut,
                            child: child,
                          ),
                  ),
                ),
              ),
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0xCCFFFFFF),
                        Color(0x00FFFFFF),
                        Color(0x14FFFFFF),
                        Color(0xF2FFFFFF),
                        Colors.white,
                      ],
                      stops: [0, 0.14, 0.4, 0.66, 1],
                    ),
                  ),
                ),
              ),
              const Positioned.fill(child: SeasonFall()),
              AnimatedBuilder(
                animation: _ambient,
                builder: (context, _) {
                  final t = _ambient.value * math.pi * 2;
                  return Stack(
                    children: [
                      Positioned(
                        left: -w * 0.3 + math.sin(t) * 30,
                        top: h * 0.58 + math.cos(t) * 24,
                        child: orb(w * 0.9, SeasonX.now.orb, 0.28),
                      ),
                      Positioned(
                        right: -w * 0.35 + math.cos(t) * 28,
                        top: h * 0.72 + math.sin(t) * 26,
                        child: orb(w * 0.95, SeasonX.now.orbSoft, 0.24),
                      ),
                      Positioned(
                        left: w * 0.15 + math.cos(t + 1) * 34,
                        bottom: -w * 0.45 + math.sin(t + 1) * 20,
                        child: orb(w * 0.9, SeasonX.now.bit, 0.26),
                      ),
                    ],
                  );
                },
              ),
              Positioned.fill(child: SafeArea(child: widget.child)),
            ],
          );
        },
      ),
    );
  }
}

/// "HR HUB" mark in a frosted pill, readable on top of the illustration.
class BrandChip extends StatelessWidget {
  const BrandChip({super.key});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.62),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: 0.8)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const LockBadge(icon: Icons.how_to_reg_rounded, size: 40),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'HR HUB',
                    style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                      color: _deepGreen,
                    ),
                  ),
                  Text(
                    context.t('Davomat · GPS · Kadrlar'),
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Frosted card that slides up on first appearance; the illustration shows through it.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 8),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: MediaQuery.of(context).disableAnimations
          ? Duration.zero
          : const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, 60 * (1 - t)),
          child: child,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(32),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            width: double.infinity,
            padding: padding,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withValues(alpha: 0.72),
                  const Color(0xFFEFF8F1).withValues(alpha: 0.55),
                  Colors.white.withValues(alpha: 0.5),
                ],
              ),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.75),
                width: 1.4,
              ),
              boxShadow: [
                BoxShadow(
                  color: _deepGreen.withValues(alpha: 0.1),
                  blurRadius: 30,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// One PIN entry step: title, animated dots, keypad. Calls [onComplete] with the full code;
/// if it resolves to false the dots flash red and shake, then clear.
class PinStage extends StatefulWidget {
  const PinStage({
    super.key,
    required this.title,
    required this.onComplete,
    this.subtitle,
    this.header,
    this.message,
    this.messageIsError = false,
    this.leadingKey,
    this.footer,
    this.onRejected,
  });

  final String title;
  final String? subtitle;
  final Widget? header;
  final String? message;
  final bool messageIsError;

  /// Bottom-left keypad slot (fingerprint button).
  final Widget? leadingKey;
  final Widget? footer;
  final Future<bool> Function(String code) onComplete;

  /// Runs after the reject animation finished.
  final VoidCallback? onRejected;

  @override
  State<PinStage> createState() => _PinStageState();
}

class _PinStageState extends State<PinStage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );
  String _code = '';
  bool _error = false;
  bool _busy = false;

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  Future<void> _digit(String d) async {
    if (_busy || _code.length >= kPinLength) return;
    HapticFeedback.selectionClick();
    setState(() => _code += d);
    if (_code.length < kPinLength) return;

    _busy = true;
    await Future<void>.delayed(const Duration(milliseconds: 140));
    final ok = await widget.onComplete(_code);
    if (!mounted) return;
    if (!ok) {
      HapticFeedback.heavyImpact();
      setState(() => _error = true);
      await _shake.forward(from: 0);
      if (!mounted) return;
      setState(() {
        _error = false;
        _code = '';
      });
      widget.onRejected?.call();
    }
    _busy = false;
  }

  void _backspace() {
    if (_busy || _code.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _code = _code.substring(0, _code.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    final header = widget.header;
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 23,
            fontWeight: FontWeight.w900,
            color: AppColors.ink,
          ),
        ),
        if (widget.subtitle != null) ...[
          const SizedBox(height: 5),
          Text(
            widget.subtitle!,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.inkMuted,
            ),
          ),
        ],
        const SizedBox(height: 20),
        AnimatedBuilder(
          animation: _shake,
          builder: (context, child) {
            final t = _shake.value;
            return Transform.translate(
              offset: Offset(math.sin(t * math.pi * 6) * 12 * (1 - t), 0),
              child: child,
            );
          },
          child: PinDots(length: _code.length, error: _error),
        ),
        SizedBox(
          height: 36,
          child: Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: message == null
                  ? const SizedBox.shrink()
                  : Text(
                      message,
                      key: ValueKey(message),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: widget.messageIsError
                            ? AppColors.danger
                            : AppColors.inkMuted,
                      ),
                    ),
            ),
          ),
        ),
        PinPad(
          onDigit: _digit,
          onBackspace: _backspace,
          leading: widget.leadingKey,
        ),
        SizedBox(height: 44, child: widget.footer),
      ],
    );

    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Align(alignment: Alignment.centerLeft, child: BrandChip()),
        ),
        const Spacer(),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              Padding(
                padding: EdgeInsets.only(top: header == null ? 0 : 32),
                child: GlassPanel(
                  padding: EdgeInsets.fromLTRB(
                    18,
                    header == null ? 22 : 44,
                    18,
                    4,
                  ),
                  child: content,
                ),
              ),
              if (header != null)
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: MediaQuery.of(context).disableAnimations
                      ? Duration.zero
                      : const Duration(milliseconds: 800),
                  curve: const Interval(0.3, 1, curve: Curves.elasticOut),
                  builder: (context, t, child) =>
                      Transform.scale(scale: t, child: child),
                  child: header,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class PinDots extends StatelessWidget {
  const PinDots({super.key, required this.length, this.error = false});

  final int length;
  final bool error;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(kPinLength, (i) {
        final filled = i < length;
        final colors = error
            ? [const Color(0xFFFF8A8D), AppColors.danger]
            : [AppColors.headerTop, AppColors.headerBottom];
        return AnimatedScale(
          scale: filled ? 1 : 0.82,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutBack,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 20,
            height: 20,
            margin: const EdgeInsets.symmetric(horizontal: 11),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: filled || error ? LinearGradient(colors: colors) : null,
              color: filled || error
                  ? null
                  : Colors.white.withValues(alpha: 0.7),
              border: Border.all(
                color: filled || error
                    ? Colors.transparent
                    : AppColors.accentSoft,
                width: 1.6,
              ),
              boxShadow: [
                BoxShadow(
                  color: (error ? AppColors.danger : AppColors.accent)
                      .withValues(alpha: filled ? 0.35 : 0),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class PinPad extends StatelessWidget {
  const PinPad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.leading,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    Widget row(List<Widget> keys) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: keys,
      ),
    );
    Widget digit(String d) => PadKey(
      onTap: () => onDigit(d),
      label: d,
      child: Text(d, style: _digitStyle),
    );

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 330),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          row([digit('1'), digit('2'), digit('3')]),
          row([digit('4'), digit('5'), digit('6')]),
          row([digit('7'), digit('8'), digit('9')]),
          row([
            leading ?? const SizedBox(width: PadKey.size, height: PadKey.size),
            digit('0'),
            PadKey(
              onTap: onBackspace,
              label: context.t('O‘chirish'),
              plain: true,
              child: const Icon(
                Icons.backspace_rounded,
                color: AppColors.inkMuted,
                size: 26,
              ),
            ),
          ]),
        ],
      ),
    );
  }

  static const _digitStyle = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    color: AppColors.ink,
  );
}

/// Round keypad button with a press-in scale and a green flash.
class PadKey extends StatefulWidget {
  const PadKey({
    super.key,
    required this.onTap,
    required this.child,
    required this.label,
    this.plain = false,
  });

  static const size = 68.0;

  final VoidCallback onTap;
  final Widget child;
  final String label;

  /// No filled circle (backspace / fingerprint).
  final bool plain;

  @override
  State<PadKey> createState() => _PadKeyState();
}

class _PadKeyState extends State<PadKey> {
  bool _down = false;

  void _set(bool v) {
    if (v) AmbientMotion.poke();
    setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _set(true),
        onTapUp: (_) => _set(false),
        onTapCancel: () => _set(false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _down ? 0.9 : 1,
          duration: const Duration(milliseconds: 110),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: PadKey.size,
            height: PadKey.size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: widget.plain
                  ? (_down ? AppColors.accentTint : Colors.transparent)
                  : _down
                  ? AppColors.accentTint
                  : Colors.white.withValues(alpha: 0.88),
              border: widget.plain
                  ? null
                  : Border.all(
                      color: _down ? AppColors.accentSoft : Colors.white,
                      width: 1.4,
                    ),
              boxShadow: widget.plain
                  ? null
                  : [
                      BoxShadow(
                        color: _deepGreen.withValues(
                          alpha: _down ? 0.04 : 0.08,
                        ),
                        blurRadius: _down ? 6 : 14,
                        offset: Offset(0, _down ? 2 : 5),
                      ),
                    ],
            ),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// Gradient tile with an icon, like the login brand mark.
class LockBadge extends StatelessWidget {
  const LockBadge({super.key, required this.icon, this.size = 64});

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.32),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.headerTop, AppColors.headerBottom],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.35),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: size * 0.48),
    );
  }
}
