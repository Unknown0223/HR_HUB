import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme/season.dart';

/// Seasonal illustration with a light veil behind every page. It sits under the whole app,
/// so it only moves when the route changes: a looping animation here would repaint the full
/// screen every frame and keep the CPU busy on every page.
class SeasonalBackdrop extends StatelessWidget {
  const SeasonalBackdrop({super.key, this.scrim = 0.55});

  /// How solid the page stays: 0 on the login art, about 0.55 behind lists.
  final double scrim;

  @override
  Widget build(BuildContext context) {
    final season = SeasonX.now;
    final router = GoRouter.maybeOf(context);
    if (router == null) return _frame(season, Alignment.centerLeft);

    return ListenableBuilder(
      listenable: router.routeInformationProvider,
      builder: (context, _) {
        final path = router.routeInformationProvider.value.uri.path;
        return _frame(season, sceneAlignment(path));
      },
    );
  }

  Widget _frame(Season season, Alignment target) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: season.veil),
            TweenAnimationBuilder<Alignment>(
              tween: AlignmentTween(end: target),
              duration: const Duration(milliseconds: 650),
              curve: Curves.easeInOutCubic,
              builder: (context, alignment, _) => Transform.scale(
                scale: 1.06,
                alignment: alignment,
                child: Image.asset(
                  season.asset,
                  fit: BoxFit.cover,
                  alignment: alignment,
                  filterQuality: FilterQuality.medium,
                  gaplessPlayback: true,
                  frameBuilder: fadeInFrame,
                ),
              ),
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    season.veil.withValues(alpha: 0.22),
                    season.veil.withValues(alpha: scrim),
                    season.veil.withValues(alpha: (scrim + 0.12).clamp(0, 0.92)),
                  ],
                  stops: const [0, 0.22, 1],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fades the art in once decoded; an image already in the cache shows immediately.
Widget fadeInFrame(BuildContext context, Widget child, int? frame, bool wasSynchronouslyLoaded) {
  if (wasSynchronouslyLoaded) return child;
  return AnimatedOpacity(
    opacity: frame == null ? 0 : 1,
    duration: const Duration(milliseconds: 420),
    curve: Curves.easeOut,
    child: child,
  );
}

/// Decodes the current season's art before the first screen needs it.
void precacheSeasonArt(BuildContext context) {
  precacheImage(AssetImage(SeasonX.now.asset), context);
}

/// Sign-in backdrop. The seasonal art is a wide banner whose scene (building, people, icons)
/// fills its left ~55%; on a portrait phone that part is fitted to the screen width at the top,
/// so the whole scene stays visible above the form and its lower edge melts into the season colour.
class SceneBackdrop extends StatefulWidget {
  const SceneBackdrop({super.key});

  static const sceneAspect = (1280 * 0.55) / 720;

  @override
  State<SceneBackdrop> createState() => _SceneBackdropState();
}

class _SceneBackdropState extends State<SceneBackdrop> with SingleTickerProviderStateMixin {
  late final AnimationController _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations && _drift.isAnimating) _drift.stop();
    final season = SeasonX.now;
    final art = Image.asset(
      season.asset,
      fit: BoxFit.cover,
      alignment: Alignment.centerLeft,
      filterQuality: FilterQuality.medium,
      gaplessPlayback: true,
      frameBuilder: fadeInFrame,
    );
    return ColoredBox(
      color: season.veil,
      child: LayoutBuilder(
        builder: (context, box) {
          final portrait = box.maxWidth / box.maxHeight < SceneBackdrop.sceneAspect;
          final scene = portrait
              ? Align(
                  alignment: Alignment.topCenter,
                  child: ShaderMask(
                    blendMode: BlendMode.dstIn,
                    shaderCallback: (rect) => const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.white, Colors.white, Colors.transparent],
                      stops: [0, 0.74, 1],
                    ).createShader(rect),
                    child: AspectRatio(aspectRatio: SceneBackdrop.sceneAspect, child: art),
                  ),
                )
              : SizedBox.expand(child: art);
          return AnimatedBuilder(
            animation: _drift,
            builder: (context, child) => Transform.scale(
              scale: 1.02 + 0.03 * Curves.easeInOut.transform(_drift.value),
              alignment: Alignment.topCenter,
              child: child,
            ),
            child: scene,
          );
        },
      ),
    );
  }
}

/// Petals, leaves, or snow drifting down. Place it over a seasonal photo.
class SeasonFall extends StatefulWidget {
  const SeasonFall({super.key});

  @override
  State<SeasonFall> createState() => _SeasonFallState();
}

class _SeasonFallState extends State<SeasonFall> with SingleTickerProviderStateMixin {
  late final AnimationController _fall = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  )..repeat();

  @override
  void dispose() {
    _fall.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return const SizedBox.shrink();
    final season = SeasonX.now;
    return AnimatedBuilder(
      animation: _fall,
      builder: (context, _) {
        return LayoutBuilder(
          builder: (context, box) {
            return Stack(
              clipBehavior: Clip.none,
              children: [
                for (var i = 0; i < 6; i++)
                  _bit(box.biggest, i, (_fall.value + i * 0.16) % 1, season),
              ],
            );
          },
        );
      },
    );
  }

  Widget _bit(Size size, int i, double t, Season season) {
    final x = size.width * (0.06 + i * 0.15) + 18 * t;
    final y = -20 + (size.height + 40) * t;
    final winter = season == Season.winter;
    final summer = season == Season.summer;
    return Positioned(
      left: x,
      top: y,
      child: Transform.rotate(
        angle: t * 4 + i,
        child: Container(
          width: winter ? 6 : summer ? 7 : 9,
          height: winter ? 6 : summer ? 7 : 12,
          decoration: BoxDecoration(
            color: season.bit.withValues(alpha: winter ? 0.9 : 0.75),
            borderRadius: BorderRadius.circular(winter || summer ? 20 : 8),
            boxShadow: winter
                ? const [BoxShadow(color: Color(0x66FFFFFF), blurRadius: 3)]
                : null,
          ),
        ),
      ),
    );
  }
}
