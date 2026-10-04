import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import 'liveness.dart';

/// Front-camera liveness check. Calls [onPassed] with the final selfie.
class LivenessCamera extends StatefulWidget {
  const LivenessCamera({super.key, required this.onPassed, this.directions = 8});

  final void Function(XFile selfie, LivenessChallenge challenge) onPassed;

  /// 4 = only left/right/up/down, 8 = also the diagonals (company setting).
  final int directions;

  @override
  State<LivenessCamera> createState() => _LivenessCameraState();
}

class _LivenessCameraState extends State<LivenessCamera>
    with SingleTickerProviderStateMixin {
  CameraController? _controller;
  CameraDescription? _camera;
  final _detector = FaceDetector(
    options: FaceDetectorOptions(
      performanceMode: FaceDetectorMode.fast,
      enableTracking: true,
      minFaceSize: 0.2,
    ),
  );

  /// Some phones report the wrong front-sensor orientation, which makes ML Kit see a sideways
  /// face and never detect it. Until a face is found we cycle through the rotations.
  List<InputImageRotation> _rotations = const [];
  int _rotationIndex = 0;
  bool _rotationLocked = false;
  int _emptyFrames = 0;
  int _failedFrames = 0;
  DateTime _lastFrameAt = DateTime.now();
  Timer? _watchdog;
  static const _framesPerRotation = 8;
  static const _diag = bool.fromEnvironment('LIVENESS_DIAG');
  final _diagWatch = Stopwatch();
  int _diagFrames = 0;
  int _diagDetectMs = 0;
  static const _maxFailedFrames = 20;
  static const _detectTimeout = Duration(seconds: 3);
  static const _stallTimeout = Duration(seconds: 5);
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();
  late LivenessChallenge _challenge = LivenessChallenge.random(directions: widget.directions);
  bool _processing = false;
  bool _capturing = false;
  int _faces = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    _releaseCamera();
    _detector.close();
    _anim.dispose();
    super.dispose();
  }

  void _releaseCamera() {
    final c = _controller;
    _controller = null;
    if (c != null) {
      if (c.value.isStreamingImages) c.stopImageStream().catchError((_) {});
      c.dispose();
    }
  }

  Future<void> _restartCamera() async {
    _watchdog?.cancel();
    _releaseCamera();
    _processing = false;
    _capturing = false;
    _failedFrames = 0;
    if (!mounted) return;
    setState(() {
      _error = null;
      _faces = 0;
    });
    await _start();
  }

  /// Restarts the camera when the image stream silently stops delivering frames.
  void _startWatchdog() {
    _watchdog?.cancel();
    _watchdog = Timer.periodic(const Duration(seconds: 2), (_) {
      final c = _controller;
      if (c == null || _capturing || !c.value.isStreamingImages) return;
      if (DateTime.now().difference(_lastFrameAt) > _stallTimeout) {
        debugPrint('liveness: image stream stalled, restarting camera');
        _restartCamera();
      }
    });
  }

  static List<InputImageRotation> _rotationOrder(int sensor) {
    final order = <int>[sensor, (360 - sensor) % 360, 0, 90, 180, 270];
    final seen = <int>{};
    return [
      for (final deg in order)
        if (seen.add(deg)) ?InputImageRotationValue.fromRawValue(deg),
    ];
  }

  Future<void> _start() async {
    try {
      final cams = await availableCameras();
      _camera = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => throw Exception(trText('Old kamera topilmadi')),
      );
      _rotations = _rotationOrder(_camera!.sensorOrientation);
      _rotationIndex = 0;
      _rotationLocked = false;
      _emptyFrames = 0;
      final controller = CameraController(
        _camera!,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup:
            Platform.isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      _controller = controller;
      _lastFrameAt = DateTime.now();
      await controller.startImageStream(_onFrame);
      _startWatchdog();
      setState(() {});
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = trText('Kamera ishga tushmadi: {0}', [
            e.toString().replaceFirst('Exception: ', ''),
          ]));
    }
  }

  InputImage? _toInputImage(CameraImage image) {
    if (_camera == null || image.planes.isEmpty || _rotations.isEmpty) return null;
    final rotation = _rotations[_rotationIndex % _rotations.length];
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;
    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  /// Once a face is seen the rotation stays fixed for this camera session: a wrong
  /// (e.g. upside-down) rotation would invert the head angles.
  void _trackRotation(int faceCount) {
    if (_rotationLocked) return;
    if (faceCount > 0) {
      _rotationLocked = true;
      return;
    }
    if (++_emptyFrames >= _framesPerRotation) {
      _rotationIndex = (_rotationIndex + 1) % _rotations.length;
      _emptyFrames = 0;
    }
  }

  void _logDiag(DateTime detectStart, CameraImage image, int faceCount, Face? face) {
    if (!_diagWatch.isRunning) _diagWatch.start();
    _diagFrames++;
    _diagDetectMs += DateTime.now().difference(detectStart).inMilliseconds;
    if (_diagWatch.elapsedMilliseconds < 1000) return;
    final rotation = _rotations[_rotationIndex % _rotations.length];
    debugPrint(
      'liveness diag: fps=${(_diagFrames * 1000 / _diagWatch.elapsedMilliseconds).toStringAsFixed(1)} '
      'detectMs=${(_diagDetectMs / _diagFrames).round()} '
      'img=${image.width}x${image.height} fmt=${image.format.raw} rot=${rotation.rawValue} '
      'locked=$_rotationLocked faces=$faceCount '
      'yaw=${face?.headEulerAngleY?.toStringAsFixed(1)} '
      'pitch=${face?.headEulerAngleX?.toStringAsFixed(1)} '
      'roll=${face?.headEulerAngleZ?.toStringAsFixed(1)} '
      'phase=${_challenge.phase.name} step=${_challenge.current?.name}',
    );
    _diagFrames = 0;
    _diagDetectMs = 0;
    _diagWatch.reset();
  }

  Future<void> _onFrame(CameraImage image) async {
    _lastFrameAt = DateTime.now();
    if (_processing || _capturing) return;
    _processing = true;
    try {
      final input = _toInputImage(image);
      if (input == null) {
        throw StateError('unsupported frame format ${image.format.raw}');
      }
      final detectStart = _diag ? DateTime.now() : null;
      final faces = await _detector.processImage(input).timeout(_detectTimeout);
      if (!mounted) return;
      _failedFrames = 0;
      _trackRotation(faces.length);
      final face = faces.length == 1 ? faces.first : null;
      if (detectStart != null) _logDiag(detectStart, image, faces.length, face);
      _challenge.feed(
        face == null
            ? null
            : HeadPose(face.headEulerAngleY ?? 0, face.headEulerAngleX ?? 0),
        faces: faces.length,
        trackingId: face?.trackingId,
      );
      setState(() => _faces = faces.length);
      if (_challenge.phase == LivenessPhase.done) {
        await _captureSelfie();
      }
    } catch (e) {
      debugPrint('liveness frame failed: $e');
      if (++_failedFrames >= _maxFailedFrames && mounted && _error == null) {
        _watchdog?.cancel();
        _releaseCamera();
        setState(() => _error = context.t('Yuzni aniqlash ishlamadi: {0}', [e]));
      }
    } finally {
      _processing = false;
    }
  }

  Future<void> _captureSelfie() async {
    final c = _controller;
    if (c == null || _capturing) return;
    _capturing = true;
    setState(() {});
    try {
      if (c.value.isStreamingImages) await c.stopImageStream();
      final file = await c.takePicture();
      if (mounted) widget.onPassed(file, _challenge);
    } catch (e) {
      _capturing = false;
      if (mounted) {
        setState(() => _error = context.t('Selfie olinmadi: {0}', [e]));
      }
    }
  }

  void _restart() {
    setState(() {
      _challenge = LivenessChallenge.random(directions: widget.directions);
      _error = null;
    });
  }

  (String, String, IconData) _instruction() {
    if (_faces == 0) {
      return (context.t('Yuzingizni ramka ichiga joylang'), context.t('Telefonni yuz balandligida ushlang'), Icons.face_rounded);
    }
    if (_faces > 1) {
      return (context.t('Kadrda faqat o‘zingiz bo‘ling'), context.t('Boshqa odamlar kadrdan chiqsin'), Icons.group_off_rounded);
    }
    switch (_challenge.phase) {
      case LivenessPhase.center:
        return (context.t('To‘g‘ri kameraga qarang'), context.t('Tekshiruv boshlanmoqda'), Icons.center_focus_strong_rounded);
      case LivenessPhase.turn:
        final d = _challenge.current!;
        return (
          context.t('Boshingizni {0} buring', [context.t(d.label).toLowerCase()]),
          !d.isDiagonal
              ? context.t('Strelka yo‘nalishida sekin buriling')
              : d.isUp
                  ? context.t('Yonga burilib, iyagingizni biroz ko‘taring')
                  : context.t('Yonga burilib, iyagingizni biroz tushiring'),
          d.icon,
        );
      case LivenessPhase.back:
        return (context.t('Yana to‘g‘ri qarang'), context.t('Boshingizni markazga qaytaring'), Icons.center_focus_strong_rounded);
      case LivenessPhase.finalCenter:
        return (context.t('To‘g‘ri qarang'), context.t('Surat avtomatik olinadi'), Icons.photo_camera_front_rounded);
      case LivenessPhase.done:
        return (context.tr('Tasdiqlandi', 'Подтверждено'), context.t('Surat saqlanmoqda…'), Icons.verified_rounded);
      case LivenessPhase.failed:
        return (
          context.t(_challenge.failReason ?? 'Tekshiruv muvaffaqiyatsiz'),
          context.t('Qaytadan boshlab, ko‘rsatmalarni bajaring'),
          Icons.error_outline_rounded,
        );
    }
  }

  /// Share of the per-step time budget still left (1 → 0), or null when untimed.
  double? _timeLeft() {
    if (_challenge.phase != LivenessPhase.turn && _challenge.phase != LivenessPhase.back) return null;
    final started = _challenge.phaseStartedAt;
    if (started == null) return 1;
    final used = DateTime.now().difference(started).inMilliseconds /
        LivenessChallenge.stepTimeout.inMilliseconds;
    return (1 - used).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    if (_error != null) {
      return _Message(text: _error!, onRetry: _restartCamera);
    }
    if (c == null || !c.value.isInitialized) {
      return const Center(child: CircularProgressIndicator());
    }
    final phase = _challenge.phase;
    final failed = phase == LivenessPhase.failed;
    final passed = phase == LivenessPhase.done;
    final (title, hint, icon) = _instruction();
    final tone = failed
        ? AppColors.danger
        : _faces == 1
            ? AppColors.accent
            : AppColors.warn;
    final turning = phase == LivenessPhase.turn && _faces == 1 ? _challenge.current : null;

    return Column(
      children: [
        _StepRail(challenge: _challenge, pulse: _anim),
        const SizedBox(height: 12),
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: tone.withValues(alpha: 0.25),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: c.value.previewSize?.height ?? 480,
                      height: c.value.previewSize?.width ?? 640,
                      child: CameraPreview(c),
                    ),
                  ),
                  IgnorePointer(
                    child: AnimatedBuilder(
                      animation: _anim,
                      builder: (_, _) => CustomPaint(
                        painter: _FaceGuidePainter(
                          color: tone,
                          t: _anim.value,
                          scanning: _faces == 1 && !failed,
                        ),
                      ),
                    ),
                  ),
                  if (turning != null)
                    _DirectionArrow(
                      direction: turning,
                      anim: _anim,
                      progress: _challenge.turnProgress,
                    ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: _GlassChip(
                      icon: _faces == 1
                          ? Icons.face_retouching_natural
                          : _faces > 1
                              ? Icons.group_rounded
                              : Icons.face_outlined,
                      text: _faces == 1
                          ? context.t('Yuz aniqlandi')
                          : _faces > 1
                              ? context.t('{0} ta yuz', [_faces])
                              : context.t('Yuz qidirilmoqda'),
                      color: _faces == 1 ? AppColors.accentSoft : Colors.white,
                    ),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: _GlassChip(
                      icon: Icons.lock_rounded,
                      text: context.t('Jonli tekshiruv'),
                      color: Colors.white,
                    ),
                  ),
                  if (_capturing || passed)
                    const _CaptureFlash(),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _InstructionCard(
          title: title,
          hint: hint,
          icon: icon,
          color: tone,
          timeLeft: _timeLeft(),
        ),
        if (failed) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.accent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: _restart,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(
                context.t('Qaytadan boshlash'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Screen-space unit vector for a head direction. The front preview is
/// mirrored, so the user's left is on the left of the screen.
Offset _vectorOf(HeadDirection d) {
  const k = 0.7071;
  return switch (d) {
    HeadDirection.left => const Offset(-1, 0),
    HeadDirection.right => const Offset(1, 0),
    HeadDirection.up => const Offset(0, -1),
    HeadDirection.down => const Offset(0, 1),
    HeadDirection.upLeft => const Offset(-k, -k),
    HeadDirection.upRight => const Offset(k, -k),
    HeadDirection.downLeft => const Offset(-k, k),
    HeadDirection.downRight => const Offset(k, k),
  };
}

class _StepRail extends StatelessWidget {
  const _StepRail({required this.challenge, required this.pulse});

  final LivenessChallenge challenge;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    final total = challenge.steps.length;
    final done = challenge.phase == LivenessPhase.done
        ? total
        : challenge.index.clamp(0, total);
    final activeIndex = challenge.phase == LivenessPhase.turn ||
            challenge.phase == LivenessPhase.back
        ? challenge.index
        : -1;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                context.t('Harakatlar'),
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 11.5),
              ),
              Text(
                '$done / $total',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: LayoutBuilder(
              builder: (context, box) {
                final size = total == 0
                    ? 32.0
                    : ((box.maxWidth - total * 4) / total).clamp(20.0, 32.0);
                return Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    for (var i = 0; i < total; i++)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: _StepDot(
                          icon: challenge.steps[i].icon,
                          done: i < done,
                          active: i == activeIndex,
                          pulse: pulse,
                          size: size,
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.icon,
    required this.done,
    required this.active,
    required this.pulse,
    this.size = 32,
  });

  final IconData icon;
  final bool done;
  final bool active;
  final Animation<double> pulse;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dot = AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done
            ? AppColors.accent
            : active
                ? AppColors.accentTint
                : AppColors.bg,
        border: Border.all(
          color: done || active ? AppColors.accent : AppColors.line,
          width: active ? 2 : 1,
        ),
      ),
      child: Icon(
        done ? Icons.check_rounded : icon,
        size: size * 0.53,
        color: done
            ? Colors.white
            : active
                ? AppColors.accent
                : AppColors.inkFaint,
      ),
    );
    if (!active) return dot;
    return AnimatedBuilder(
      animation: pulse,
      builder: (_, child) {
        final s = 1 + 0.12 * math.sin(pulse.value * 2 * math.pi);
        return Transform.scale(scale: s, child: child);
      },
      child: dot,
    );
  }
}

class _FaceGuidePainter extends CustomPainter {
  _FaceGuidePainter({required this.color, required this.t, required this.scanning});

  final Color color;
  final double t;
  final bool scanning;

  @override
  void paint(Canvas canvas, Size size) {
    final oval = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.46),
      width: size.width * 0.64,
      height: size.height * 0.6,
    );
    final shade = Path()
      ..addRect(Offset.zero & size)
      ..addOval(oval)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(shade, Paint()..color = const Color(0x8C0B1A10));

    canvas.drawOval(
      oval.inflate(6),
      Paint()
        ..color = color.withValues(alpha: 0.35 + 0.25 * math.sin(t * 2 * math.pi).abs())
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawOval(
      oval,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    if (scanning) {
      final sweep = Paint()
        ..shader = SweepGradient(
          colors: [color.withValues(alpha: 0), color, color.withValues(alpha: 0)],
          stops: const [0.0, 0.5, 1.0],
          transform: GradientRotation(t * 2 * math.pi),
        ).createShader(oval)
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 5;
      canvas.drawArc(oval, t * 2 * math.pi, math.pi * 0.9, false, sweep);

      canvas.save();
      canvas.clipPath(Path()..addOval(oval));
      final y = oval.top + oval.height * (0.5 + 0.5 * math.sin(t * 2 * math.pi));
      canvas.drawRect(
        Rect.fromLTWH(oval.left, y - 18, oval.width, 36),
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0), color.withValues(alpha: 0.28), color.withValues(alpha: 0)],
          ).createShader(Rect.fromLTWH(oval.left, y - 18, oval.width, 36)),
      );
      canvas.restore();
    } else {
      canvas.drawOval(
        oval,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4,
      );
    }
  }

  @override
  bool shouldRepaint(_FaceGuidePainter old) =>
      old.t != t || old.color != color || old.scanning != scanning;
}

class _DirectionArrow extends StatelessWidget {
  const _DirectionArrow({
    required this.direction,
    required this.anim,
    required this.progress,
  });

  final HeadDirection direction;
  final Animation<double> anim;

  /// 0–1: how far the head already moved toward [direction].
  final double progress;

  @override
  Widget build(BuildContext context) {
    final v = _vectorOf(direction);
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: anim,
        builder: (_, _) {
          final bounce = 10 * math.sin(anim.value * 2 * math.pi).abs();
          return Align(
            alignment: Alignment(v.dx * 0.82, -0.08 + v.dy * 0.78),
            child: Transform.translate(
              offset: v * bounce,
              child: SizedBox(
                width: 78,
                height: 78,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox.expand(
                      child: TweenAnimationBuilder<double>(
                        tween: Tween(end: progress),
                        duration: const Duration(milliseconds: 180),
                        builder: (_, value, _) => CircularProgressIndicator(
                          value: value,
                          strokeWidth: 5,
                          color: Colors.white,
                          backgroundColor: Colors.white.withValues(alpha: 0.25),
                        ),
                      ),
                    ),
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.accent,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.accent.withValues(alpha: 0.6),
                            blurRadius: 18,
                          ),
                        ],
                      ),
                      child: Icon(direction.icon, color: Colors.white, size: 36),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _GlassChip extends StatelessWidget {
  const _GlassChip({required this.icon, required this.text, required this.color});

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.38),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _CaptureFlash extends StatelessWidget {
  const _CaptureFlash();

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.9, end: 0.35),
      duration: const Duration(milliseconds: 500),
      builder: (_, v, child) => ColoredBox(
        color: Colors.white.withValues(alpha: v),
        child: child,
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified_rounded, color: AppColors.accent, size: 72),
            const SizedBox(height: 8),
            Text(
              context.tr('Tasdiqlandi', 'Подтверждено'),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
          ],
        ),
      ),
    );
  }
}

class _InstructionCard extends StatelessWidget {
  const _InstructionCard({
    required this.title,
    required this.hint,
    required this.icon,
    required this.color,
    this.timeLeft,
  });

  final String title;
  final String hint;
  final IconData icon;
  final Color color;
  final double? timeLeft;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        boxShadow: [
          BoxShadow(
            color: AppColors.ink.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          SizedBox(
            width: 52,
            height: 52,
            child: Stack(
              alignment: Alignment.center,
              children: [
                if (timeLeft != null)
                  SizedBox.expand(
                    child: CircularProgressIndicator(
                      value: timeLeft,
                      strokeWidth: 4,
                      color: timeLeft! < 0.3 ? AppColors.danger : color,
                      backgroundColor: AppColors.line,
                    ),
                  ),
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
                    child: Icon(icon, key: ValueKey(icon), color: color, size: 24),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              layoutBuilder: (current, previous) => Stack(
                alignment: Alignment.centerLeft,
                children: [...previous, ?current],
              ),
              child: Column(
                key: ValueKey(title),
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: color == AppColors.danger ? AppColors.danger : AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hint,
                    style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.onRetry});
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_outlined, size: 48, color: AppColors.danger),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: Text(context.t('Qayta urinish'))),
          ],
        ),
      ),
    );
  }
}
