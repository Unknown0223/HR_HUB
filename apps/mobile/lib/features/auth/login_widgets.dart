import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

const _deepGreen = Color(0xFF1F6F3A);

/// Login input: an icon tile that lights up green on focus, a floating label, a glowing border,
/// and a red state for [error] until the user types something.
class AuthField extends StatefulWidget {
  const AuthField({
    super.key,
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
    this.obscure = false,
    this.error = false,
    this.suffix,
    this.keyboardType,
    this.textInputAction,
    this.onSubmitted,
    this.autofillHints,
    this.focusNode,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? hint;
  final bool obscure;
  final bool error;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Iterable<String>? autofillHints;
  final FocusNode? focusNode;

  @override
  State<AuthField> createState() => _AuthFieldState();
}

class _AuthFieldState extends State<AuthField> {
  late final FocusNode _focus = widget.focusNode ?? FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(_refresh);
    widget.controller.addListener(_refresh);
  }

  @override
  void didUpdateWidget(AuthField old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_refresh);
      widget.controller.addListener(_refresh);
    }
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _focus.removeListener(_refresh);
    widget.controller.removeListener(_refresh);
    if (widget.focusNode == null) _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const duration = Duration(milliseconds: 240);
    const curve = Curves.easeOutCubic;
    final focused = _focus.hasFocus;
    final filled = widget.controller.text.isNotEmpty;
    final error = widget.error && !filled;
    final lit = focused || filled;
    final tone = error ? AppColors.danger : AppColors.accent;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _focus.requestFocus,
      child: AnimatedContainer(
        duration: duration,
        curve: curve,
        height: 60,
        padding: const EdgeInsets.fromLTRB(8, 0, 4, 0),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: focused ? 0.92 : 0.55),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: error
                ? AppColors.danger
                : focused
                    ? AppColors.accent
                    : Colors.white.withValues(alpha: 0.9),
            width: focused || error ? 1.8 : 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: tone.withValues(alpha: focused || error ? 0.18 : 0),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            AnimatedScale(
              scale: focused ? 1.06 : 1,
              duration: duration,
              curve: Curves.easeOutBack,
              child: AnimatedContainer(
                duration: duration,
                curve: curve,
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(13),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: error
                        ? [const Color(0xFFFF8A8D), AppColors.danger]
                        : lit
                            ? [AppColors.headerTop, AppColors.headerBottom]
                            : [AppColors.accentTint, AppColors.accentTint],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: tone.withValues(alpha: lit || error ? 0.3 : 0),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  widget.icon,
                  size: 21,
                  color: lit || error ? Colors.white : AppColors.accent,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  AnimatedAlign(
                    duration: duration,
                    curve: curve,
                    alignment: lit ? const Alignment(-1, -0.72) : Alignment.centerLeft,
                    child: AnimatedDefaultTextStyle(
                      duration: duration,
                      curve: curve,
                      style: TextStyle(
                        fontSize: lit ? 11.5 : 15.5,
                        fontWeight: lit ? FontWeight.w700 : FontWeight.w500,
                        letterSpacing: lit ? 0.3 : 0,
                        color: error
                            ? AppColors.danger
                            : focused
                                ? AppColors.accent
                                : lit
                                    ? AppColors.inkMuted
                                    : AppColors.inkFaint,
                      ),
                      child: Text(widget.label),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: TextField(
                      controller: widget.controller,
                      focusNode: _focus,
                      obscureText: widget.obscure,
                      obscuringCharacter: '●',
                      keyboardType: widget.keyboardType,
                      textInputAction: widget.textInputAction,
                      onSubmitted: widget.onSubmitted,
                      autofillHints: widget.autofillHints,
                      autocorrect: false,
                      enableSuggestions: !widget.obscure,
                      cursorColor: AppColors.accent,
                      cursorRadius: const Radius.circular(2),
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: widget.obscure ? 2 : 0.2,
                      ),
                      // Explicit `none` borders: collapsed() alone still inherits the theme's pill borders.
                      decoration: InputDecoration(
                        isCollapsed: true,
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        hintText: focused && !filled ? widget.hint : null,
                        hintStyle: const TextStyle(
                          color: AppColors.inkFaint,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            AnimatedSwitcher(
              duration: duration,
              transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
              child: widget.suffix ??
                  (filled && !widget.obscure
                      ? const Padding(
                          key: ValueKey('ok'),
                          padding: EdgeInsets.only(right: 10),
                          child: Icon(Icons.check_circle_rounded, color: AppColors.accentSoft, size: 20),
                        )
                      : const SizedBox(key: ValueKey('none'), width: 8)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Main login action: green gradient with a light sweep running across it, and a press-in effect.
class GlowButton extends StatefulWidget {
  const GlowButton({super.key, required this.label, required this.onPressed, this.busy = false});

  final String label;
  final VoidCallback onPressed;
  final bool busy;

  @override
  State<GlowButton> createState() => _GlowButtonState();
}

class _GlowButtonState extends State<GlowButton> with SingleTickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  )..repeat();
  bool _pressed = false;

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  void _press(bool down) {
    if (!widget.busy) setState(() => _pressed = down);
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations && _sweep.isAnimating) _sweep.stop();

    return Semantics(
      button: true,
      enabled: !widget.busy,
      label: widget.label,
      child: GestureDetector(
        onTapDown: (_) => _press(true),
        onTapCancel: () => _press(false),
        onTapUp: (_) => _press(false),
        onTap: widget.busy ? null : widget.onPressed,
        child: AnimatedScale(
          scale: _pressed ? 0.97 : 1,
          duration: const Duration(milliseconds: 120),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.accentSoft, AppColors.accent, _deepGreen],
                stops: [0, 0.55, 1],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.accent.withValues(alpha: _pressed ? 0.25 : 0.4),
                  blurRadius: _pressed ? 10 : 20,
                  offset: Offset(0, _pressed ? 4 : 9),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (!widget.busy)
                    AnimatedBuilder(
                      animation: _sweep,
                      builder: (context, _) {
                        // Sweep during the first 45% of the cycle, then rest.
                        final t = (_sweep.value / 0.45).clamp(0.0, 1.0);
                        return FractionalTranslation(
                          translation: Offset(-1.2 + 2.4 * Curves.easeInOut.transform(t), 0),
                          child: Transform.rotate(
                            angle: 0.35,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Colors.white.withValues(alpha: 0),
                                    Colors.white.withValues(alpha: 0.28),
                                    Colors.white.withValues(alpha: 0),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      child: widget.busy
                          ? const Row(
                              key: ValueKey('busy'),
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                                ),
                                SizedBox(width: 12),
                                Text(
                                  'Tekshirilmoqda…',
                                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
                                ),
                              ],
                            )
                          : Row(
                              key: const ValueKey('idle'),
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  widget.label,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.4,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                AnimatedSlide(
                                  offset: Offset(_pressed ? 0.35 : 0, 0),
                                  duration: const Duration(milliseconds: 150),
                                  child: const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 21),
                                ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
