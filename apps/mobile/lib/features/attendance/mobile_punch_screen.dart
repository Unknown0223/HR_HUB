import 'dart:convert';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_config.dart';
import '../../core/api/me_repository.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/location_guard.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/server_clock.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';
import 'liveness.dart';
import 'liveness_camera.dart';
import 'dual_capture.dart';
import 'face_verifier.dart';
import 'photo_report.dart';
import 'punch_widgets.dart';

const _minCommentLength = 3;

const _mockWarningFallback =
    'Telefoningizda soxta lokatsiya (Fake GPS) aniqlandi. Siz ruxsatsiz uchinchi '
    'tomon tizimidan foydalanib, davomat qoidalarini aylanib o‘tishga urindingiz. '
    'Belgi qabul qilinmadi va bu holat HR bo‘limiga yuborildi. Takrorlansa, '
    'akkauntingiz qora ro‘yxatga tushirilishi va bloklanishi mumkin.';

enum _Step {
  locating,
  located,
  liveness,
  verifying,
  photoReport,
  sending,
  done,
  failed,
}

/// Phone attendance: precise GPS → head-movement liveness → one-tap back +
/// front photo report → automatic submit → 2 s confirmation → home.
class MobilePunchScreen extends ConsumerStatefulWidget {
  const MobilePunchScreen({super.key, required this.direction});

  /// `IN` or `OUT`.
  final String direction;

  @override
  ConsumerState<MobilePunchScreen> createState() => _MobilePunchScreenState();
}

class _MobilePunchScreenState extends ConsumerState<MobilePunchScreen> {
  static const _confirmDuration = Duration(seconds: 2);

  final _comment = TextEditingController();
  _Step _step = _Step.locating;
  String _status = trText('Joylashuv aniqlanmoqda…');
  String? _error;

  PreciseFix? _fix;
  Map<String, dynamic>? _fence;
  XFile? _selfie;
  List<String> _livenessSteps = const [];
  int _livenessDirections = 8;
  int _livenessMs = 0;
  Uint8List? _photo;
  Uint8List? _faceSelfie;
  Map<String, dynamic>? _result;
  bool _clockWrong = false;
  bool _autoTimeOff = false;

  bool get _isIn => widget.direction == 'IN';
  String get _title => context.t(_isIn ? 'Kirish' : 'Chiqish');
  bool get _outside => _fence != null && _fence!['inside'] != true;
  bool get _commentOk => _comment.text.trim().length >= _minCommentLength;
  bool get _canStart => !_outside || _commentOk;

  @override
  void initState() {
    super.initState();
    _comment.addListener(() => setState(() {}));
    FaceVerifier.instance.warmUp();
    WidgetsBinding.instance.addPostFrameCallback((_) => _locate());
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() {
      _step = _Step.locating;
      _error = null;
      _status = context.t('GPS sun’iy yo‘ldosh signali kutilmoqda…');
    });
    try {
      final fix = await LocationGuard().acquire(
        onSample: (p, n) {
          if (!mounted) return;
          setState(
            () => _status = context.t('Aniqlik: {0} m · o‘lchov {1}', [
              p.accuracy.toStringAsFixed(0),
              n,
            ]),
          );
        },
      );
      if (!mounted) return;
      if (fix.integrity.flagged) {
        await _blockMockLocation(fix);
        return;
      }
      if (fix.accuracy > ApiConfig.maxGpsAccuracyM) {
        setState(
          () => _error = context.t(
            'GPS aniqligi past ({0} m). '
            'Ochiq joyga chiqib qayta urinib ko‘ring.',
            [fix.accuracy.toStringAsFixed(0)],
          ),
        );
        return;
      }
      final fence = await ref
          .read(meRepositoryProvider)
          .checkGps(latitude: fix.latitude, longitude: fix.longitude);
      final autoTime = await ServerClock.autoTimeEnabled();
      if (!mounted) return;
      setState(() {
        _clockWrong = ServerClock.deviceClockWrong;
        _autoTimeOff = !autoTime;
        _fix = fix;
        _fence = fence['configured'] == true ? fence : null;
        _livenessDirections = fence['livenessDirections'] == 4 ? 4 : 8;
        _step = _Step.located;
      });
    } on LocationGuardException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _blockMockLocation(PreciseFix fix) async {
    var message = context.t(_mockWarningFallback);
    try {
      final res = await ref
          .read(meRepositoryProvider)
          .reportMockLocation(
            integrity: fix.integrity.toJson(),
            latitude: fix.latitude,
            longitude: fix.longitude,
          );
      message = res['message']?.toString() ?? message;
    } catch (_) {}
    await _showMockWarning(message);
  }

  Future<void> _showMockWarning(String message) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        icon: const Icon(
          Icons.gpp_bad_rounded,
          color: AppColors.danger,
          size: 48,
        ),
        title: Text(
          ctx.t('Soxta lokatsiya aniqlandi'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.danger,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(message, style: const TextStyle(height: 1.45)),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(ctx.t('Tushundim')),
          ),
        ],
      ),
    );
    if (mounted) Navigator.of(context).pop();
  }

  /// The server refused the selfie, so the photos are useless: the employee
  /// starts again from the liveness check.
  Future<void> _showFaceRejected(String title, String message, IconData icon) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        icon: Icon(icon, color: AppColors.danger, size: 48),
        title: Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.danger,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(message, style: const TextStyle(height: 1.45)),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
            },
            child: Text(ctx.t('Bosh sahifaga qaytish')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(ctx.t('Qayta urinish')),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() {
      _photo = null;
      _faceSelfie = null;
      _selfie = null;
      _error = null;
      _step = _Step.liveness;
    });
  }

  void _onLivenessPassed(XFile selfie, LivenessChallenge challenge) {
    setState(() {
      _selfie = selfie;
      _faceSelfie = null;
      _livenessSteps = challenge.apiSteps;
      _livenessMs = challenge.elapsed(DateTime.now()).inMilliseconds;
      _step = _Step.verifying;
      _status = context.t('Yuz tekshirilmoqda…');
    });
    _precheckFace(selfie);
  }

  /// Compares the selfie with the profile photo on the phone before the photo
  /// report. Only a mismatch goes to the server, which confirms it (and alerts
  /// HR) or overrides it; every accepted punch is verified on the server anyway.
  Future<void> _precheckFace(XFile selfie) async {
    final shrunk = await faceMatchSelfie(
      selfie.path,
    ).then<Uint8List?>((b) => b).catchError((_) => null);
    _faceSelfie = shrunk;
    var verdict = FacePrecheck.skipped;
    if (shrunk != null) {
      final reference = await ref
          .read(faceReferenceProvider.future)
          .timeout(const Duration(seconds: 4), onTimeout: () => null);
      verdict = await FaceVerifier.instance.precheck(shrunk, reference);
    }
    if (verdict == FacePrecheck.mismatch && shrunk != null) {
      await _confirmMismatch(shrunk);
      return;
    }
    if (mounted && _selfie == selfie) {
      setState(() => _step = _Step.photoReport);
    }
  }

  Future<void> _confirmMismatch(Uint8List selfie) async {
    Map<String, dynamic>? res;
    try {
      res = await ref
          .read(meRepositoryProvider)
          .verifyFace(
            direction: widget.direction,
            selfieBase64: base64Encode(selfie),
          );
    } catch (_) {}
    if (!mounted) return;
    switch (res?['status']) {
      case 'mismatch':
        await _showFaceRejected(
          context.t('Yuz mos kelmadi'),
          res?['message']?.toString() ?? '',
          Icons.no_accounts_rounded,
        );
      case 'no_face_selfie':
        await _showFaceRejected(
          context.t('Yuz aniqlanmadi'),
          res?['message']?.toString() ?? '',
          Icons.face_retouching_off_rounded,
        );
      default:
        setState(() => _step = _Step.photoReport);
    }
  }

  Future<void> _onPhotosCaptured(XFile back, XFile? front) async {
    final fix = _fix!;
    setState(() {
      _step = _Step.sending;
      _error = null;
      _status = context.t('Foto-hisobot tayyorlanmoqda…');
    });
    try {
      final now = ServerClock.now();
      String two(int v) => v.toString().padLeft(2, '0');
      final stamp =
          'HR HUB | ${_isIn ? 'KIRISH' : 'CHIQISH'} | '
          '${two(now.day)}.${two(now.month)}.${now.year} '
          '${two(now.hour)}:${two(now.minute)}:${two(now.second)}\n'
          'GPS ${fix.latitude.toStringAsFixed(5)}, ${fix.longitude.toStringAsFixed(5)} '
          '+-${fix.accuracy.toStringAsFixed(0)}m';
      final faceSelfie = _faceSelfie != null
          ? Future<Uint8List?>.value(_faceSelfie)
          : faceMatchSelfie(
              _selfie!.path,
            ).then<Uint8List?>((b) => b).catchError((_) => null);
      _photo = await composePhotoReport(
        backPath: back.path,
        selfiePath: (front ?? _selfie!).path,
        stamp: stamp,
      );
      _faceSelfie = await faceSelfie;
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = context.t('Foto-hisobot tayyorlanmadi: {0}', [e]);
          _step = _Step.photoReport;
        });
      }
      return;
    }
    await _send();
  }

  Future<void> _send() async {
    final fix = _fix!;
    setState(() {
      _step = _Step.sending;
      _error = null;
      _status = context.t('Serverga yuborilmoqda…');
    });
    try {
      final res = await ref
          .read(meRepositoryProvider)
          .punchMobile(
            direction: widget.direction,
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            photoBase64: base64Encode(_photo!),
            selfieBase64: _faceSelfie == null
                ? null
                : base64Encode(_faceSelfie!),
            livenessSteps: _livenessSteps,
            livenessDurationMs: _livenessMs,
            integrity: fix.integrity.toJson(),
            comment: _outside ? _comment.text : null,
          );
      ref.invalidate(todayProvider);
      ref.invalidate(homeMonthProvider);
      if (!mounted) return;
      setState(() {
        _result = res;
        _step = _Step.done;
      });
      await Future<void>.delayed(_confirmDuration);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      switch (e.code) {
        case 'MOCK_LOCATION_DETECTED':
          await _showMockWarning(e.message);
        case 'GPS_OUTSIDE_COMMENT_REQUIRED':
          setState(() {
            _fence = {...?_fence, 'inside': false, 'commentRequired': true};
            _error = e.message;
            _step = _Step.located;
          });
        case 'LIVENESS_FAILED':
          setState(() {
            _error = e.message;
            _step = _Step.liveness;
          });
        case 'FACE_MISMATCH':
          await _showFaceRejected(
            context.t('Yuz mos kelmadi'),
            e.message,
            Icons.no_accounts_rounded,
          );
        case 'FACE_NOT_FOUND':
          await _showFaceRejected(
            context.t('Yuz aniqlanmadi'),
            e.message,
            Icons.face_retouching_off_rounded,
          );
        default:
          setState(() {
            _error = e.message;
            _step = _Step.failed;
          });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _step = _Step.failed;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked =
        _step == _Step.verifying ||
        _step == _Step.sending ||
        _step == _Step.done;
    return PopScope(
      canPop: !locked,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: locked
            ? null
            : AppBackBar(title: context.t('{0} — telefon orqali', [_title])),
        body: SafeArea(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 350),
            reverseDuration: Duration.zero,
            switchInCurve: Curves.easeOutCubic,
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween(
                  begin: const Offset(0.06, 0),
                  end: Offset.zero,
                ).animate(anim),
                child: child,
              ),
            ),
            child: KeyedSubtree(key: ValueKey(_step), child: _body()),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    switch (_step) {
      case _Step.locating:
        return _locatingView();
      case _Step.located:
        return _locatedView();
      case _Step.liveness:
        return Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
          child: LivenessCamera(
            onPassed: _onLivenessPassed,
            directions: _livenessDirections,
          ),
        );
      case _Step.verifying:
        return _sendingView(icon: Icons.face_retouching_natural);
      case _Step.photoReport:
        return Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: DualCapture(
            livenessSelfie: _selfie!,
            accent: _directionColors(_isIn).last,
            onCaptured: _onPhotosCaptured,
          ),
        );
      case _Step.sending:
        return _sendingView();
      case _Step.done:
        return _doneView();
      case _Step.failed:
        return _failedView();
    }
  }

  Widget _locatingView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error == null) ...[
              PulseRings(
                color: _directionColors(_isIn).last,
                icon: Icons.satellite_alt_rounded,
                size: 200,
              ),
              const SizedBox(height: 20),
              Text(
                context.t('Aniq joylashuv olinmoqda'),
                style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: Text(
                  _status,
                  key: ValueKey(_status),
                  style: const TextStyle(color: AppColors.inkMuted),
                ),
              ),
              const SizedBox(height: 18),
              _InfoChip(
                icon: Icons.shield_rounded,
                text: context.t('Faqat tizim GPS · soxta lokatsiya tekshiriladi'),
                color: AppColors.success,
              ),
            ] else ...[
              const PulseRings(
                color: AppColors.danger,
                icon: Icons.location_off_rounded,
                size: 150,
              ),
              const SizedBox(height: 16),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, height: 1.4),
              ),
              const SizedBox(height: 20),
              ShimmerButton(
                label: context.t('Qayta urinish'),
                icon: Icons.my_location_rounded,
                colors: _directionColors(_isIn),
                onPressed: _locate,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _locatedView() {
    final fix = _fix!;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              StaggeredEntrance(index: 0, child: _HeroCard(isIn: _isIn)),
              if (_clockWrong || _autoTimeOff) ...[
                const SizedBox(height: 12),
                _ClockWarning(clockWrong: _clockWrong),
              ],
              const SizedBox(height: 14),
              StaggeredEntrance(
                index: 1,
                child: _GeoCard(fix: fix, fence: _fence),
              ),
              if (_outside) ...[
                const SizedBox(height: 12),
                StaggeredEntrance(
                  index: 2,
                  child: TextField(
                    controller: _comment,
                    maxLines: 3,
                    minLines: 2,
                    maxLength: 500,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      labelText: context.t('Izoh (majburiy)'),
                      hintText: context.t(
                        'Masalan: mijoz oldida, xizmat safari…',
                      ),
                      prefixIcon: const Icon(Icons.edit_note_rounded),
                      errorText: _comment.text.isNotEmpty && !_commentOk
                          ? context.t('Kamida {0} ta belgi', [
                              _minCommentLength,
                            ])
                          : null,
                    ),
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: 14),
              const StaggeredEntrance(index: 3, child: _StepsCard()),
              const SizedBox(height: 4),
              StaggeredEntrance(
                index: 8,
                child: TextButton.icon(
                  onPressed: _locate,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: Text(context.t('Joylashuvni yangilash')),
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          decoration: BoxDecoration(
            color: AppColors.bg,
            boxShadow: [
              BoxShadow(
                color: AppColors.ink.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: StaggeredEntrance(
            index: 4,
            child: ShimmerButton(
              label: _canStart
                  ? context.t('Yuzni tekshirishni boshlash')
                  : context.t('Avval izoh yozing'),
              icon: _canStart
                  ? Icons.face_retouching_natural
                  : Icons.edit_note_rounded,
              colors: _directionColors(_isIn),
              onPressed: _canStart
                  ? () => setState(() {
                      _error = null;
                      _step = _Step.liveness;
                    })
                  : null,
            ),
          ),
        ),
      ],
    );
  }

  Widget _sendingView({IconData icon = Icons.collections_rounded}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_photo != null && _step == _Step.sending)
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Image.memory(
                  _photo!,
                  height: 260,
                  cacheHeight: 780,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                ),
              )
            else
              PulseRings(
                color: _directionColors(_isIn).last,
                icon: icon,
                size: 180,
              ),
            const SizedBox(height: 24),
            SizedBox(
              width: 220,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  minHeight: 6,
                  color: _directionColors(_isIn).last,
                  backgroundColor: AppColors.line,
                ),
              ),
            ),
            const SizedBox(height: 14),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: Text(
                _status,
                key: ValueKey(_status),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _doneView() {
    final colors = _directionColors(_isIn);
    final time = formatApiTime(_result?['occurredAt']);
    final outside = _result?['outsideGeofence'] == true;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 650),
              curve: Curves.elasticOut,
              builder: (_, v, child) => Transform.scale(scale: v, child: child),
              child: Container(
                width: 130,
                height: 130,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: colors,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: colors.last.withValues(alpha: 0.45),
                      blurRadius: 30,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 76,
                ),
              ),
            ),
            const SizedBox(height: 26),
            StaggeredEntrance(
              index: 2,
              child: Text(
                context.t('{0} qayd etildi', [_title]),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(height: 6),
            StaggeredEntrance(
              index: 3,
              child: Text(
                [
                  if (time.isNotEmpty) time,
                  context.t('foto-hisobot yuborildi'),
                  if (outside) context.t('hududdan tashqarida'),
                ].join(' · '),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 14),
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: 200,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: _confirmDuration,
                builder: (_, v, _) => ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: v,
                    minHeight: 5,
                    color: colors.last,
                    backgroundColor: AppColors.line,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              context.t('Bosh sahifaga qaytilmoqda…'),
              style: const TextStyle(color: AppColors.inkFaint, fontSize: 12.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _failedView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const PulseRings(
              color: AppColors.danger,
              icon: Icons.cloud_off_rounded,
              size: 150,
            ),
            const SizedBox(height: 16),
            Text(
              context.t('Yuborilmadi'),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              _error ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.inkMuted, height: 1.4),
            ),
            const SizedBox(height: 20),
            ShimmerButton(
              label: context.t('Qayta yuborish'),
              icon: Icons.refresh_rounded,
              colors: _directionColors(_isIn),
              onPressed: _photo == null ? null : _send,
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(context.t('Bosh sahifaga qaytish')),
            ),
          ],
        ),
      ),
    );
  }
}

class _GeoCard extends StatelessWidget {
  const _GeoCard({required this.fix, required this.fence});
  final PreciseFix fix;
  final Map<String, dynamic>? fence;

  @override
  Widget build(BuildContext context) {
    final f = fence;
    final inside = f == null || f['inside'] == true;
    final color = f == null
        ? AppColors.inkMuted
        : inside
        ? AppColors.success
        : AppColors.warn;
    final title = f == null
        ? context.t('Hudud belgilanmagan')
        : inside
        ? context.t('Hudud ichidasiz')
        : context.t('Hududdan tashqaridasiz');
    final distance = (f?['distanceM'] as num?)?.toDouble();
    final radius = (f?['radiusM'] as num?)?.toDouble();
    final place = f?['locationName']?.toString() ?? '';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  f == null
                      ? Icons.location_on_rounded
                      : inside
                      ? Icons.verified_rounded
                      : Icons.wrong_location_rounded,
                  color: color,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    if (place.isNotEmpty)
                      Text(
                        place,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.inkMuted,
                          fontSize: 13,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (distance != null && radius != null) ...[
            const SizedBox(height: 14),
            FenceMeter(distanceM: distance, radiusM: radius, color: color),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(
                  context.t('Ruxsat: {0} m', [radius.toStringAsFixed(0)]),
                  style: const TextStyle(
                    color: AppColors.inkFaint,
                    fontSize: 12,
                  ),
                ),
                const Spacer(),
                Text(
                  context.t('Siz: {0} m', [distance.toStringAsFixed(0)]),
                  style: TextStyle(
                    color: color,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _InfoChip(
                icon: Icons.gps_fixed_rounded,
                text: context.t('±{0} m aniqlik', [
                  fix.accuracy.toStringAsFixed(0),
                ]),
              ),
              _InfoChip(
                icon: Icons.stacked_line_chart_rounded,
                text: context.t('{0} ta o‘lchov', [fix.samples]),
              ),
              _InfoChip(
                icon: Icons.shield_rounded,
                text: context.t('Tizim GPS · himoyalangan'),
                color: AppColors.success,
              ),
            ],
          ),
          if (f == null || !inside) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded, size: 16, color: color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      f == null
                          ? context.t(
                              'Hudud belgilanmagan — izoh talab qilinmaydi.',
                            )
                          : context.t(
                              'Belgi qabul qilinadi, lekin izoh majburiy va u '
                              '«hududdan tashqarida» deb belgilanadi.',
                            ),
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.text, this.color});
  final IconData icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.inkMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color == null ? AppColors.bgSoft : c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: c),
          const SizedBox(width: 5),
          Text(
            text,
            style: TextStyle(
              color: c,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// The punch is stamped with server time anyway; this tells the employee why the
/// phone clock and the recorded time may differ.
class _ClockWarning extends StatelessWidget {
  const _ClockWarning({required this.clockWrong});

  final bool clockWrong;

  @override
  Widget build(BuildContext context) {
    final offset = ServerClock.offset;
    final minutes = offset == null ? 0 : offset.inMinutes.abs();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warn.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.warn.withValues(alpha: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.schedule_rounded, color: AppColors.warn),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              clockWrong
                  ? context.tr(
                      'Telefon soati internet vaqtidan $minutes daqiqa farq qiladi. '
                          'Belgi telefon soati bilan emas, server (internet) vaqti bilan '
                          'qo‘yiladi. Sozlamalarda «Avtomatik vaqt»ni yoqing.',
                      'Часы телефона отличаются от интернет-времени на $minutes мин. '
                          'Отметка ставится не по часам телефона, а по времени сервера. '
                          'Включите «Автоматическое время» в настройках.',
                    )
                  : context.tr(
                      'Telefonda «Avtomatik vaqt» o‘chirilgan. Belgi baribir server '
                          '(internet) vaqti bilan qo‘yiladi.',
                      'На телефоне выключено «Автоматическое время». Отметка всё равно '
                          'ставится по времени сервера.',
                    ),
              style: const TextStyle(height: 1.35, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.isIn});
  final bool isIn;

  @override
  Widget build(BuildContext context) {
    final colors = _directionColors(isIn);
    final now = ServerClock.now();
    final months = context.dateLocale == 'ru'
        ? const [
            'января',
            'февраля',
            'марта',
            'апреля',
            'мая',
            'июня',
            'июля',
            'августа',
            'сентября',
            'октября',
            'ноября',
            'декабря',
          ]
        : const [
            'yanvar',
            'fevral',
            'mart',
            'aprel',
            'may',
            'iyun',
            'iyul',
            'avgust',
            'sentabr',
            'oktabr',
            'noyabr',
            'dekabr',
          ];
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 12, 18, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.last.withValues(alpha: 0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          PulseRings(
            color: Colors.white,
            iconColor: colors.last,
            icon: isIn ? Icons.login_rounded : Icons.logout_rounded,
            size: 104,
            iconSize: 24,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.t(isIn ? 'Ishga kelish' : 'Ishdan ketish'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                LiveClock(
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  context.t('{0} {1} · telefon orqali', [
                    now.day,
                    months[now.month - 1],
                  ]),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

List<Color> _directionColors(bool isIn) => isIn
    ? const [AppColors.headerTop, AppColors.headerBottom]
    : const [Color(0xFFF7C24A), Color(0xFFE08A00)];

class _StepsCard extends StatelessWidget {
  const _StepsCard();

  static const _steps = [
    (
      Icons.face_retouching_natural,
      'Insonlik tekshiruvi',
      'Boshingizni ekrandagi yo‘nalishlarga buring (3–8 ta, tasodifiy)',
    ),
    (
      Icons.camera_rounded,
      'Foto-hisobot',
      'Bitta bosishda orqa va old kamera suratga oladi',
    ),
    (
      Icons.cloud_upload_rounded,
      'Yuborish',
      'Suratlar birlashtirilib avtomatik yuboriladi',
    ),
    (
      Icons.check_circle_rounded,
      'Tasdiq',
      '2 soniyalik bildirishnoma, so‘ng bosh sahifa',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('Qanday o‘tadi'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < _steps.length; i++)
            StaggeredEntrance(
              index: i + 3,
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: const BoxDecoration(
                            color: AppColors.accentTint,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _steps[i].$1,
                            size: 18,
                            color: AppColors.accent,
                          ),
                        ),
                        if (i < _steps.length - 1)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(vertical: 3),
                              color: AppColors.accentTint,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 2, bottom: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.t(_steps[i].$2),
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              context.t(_steps[i].$3),
                              style: const TextStyle(
                                color: AppColors.inkMuted,
                                fontSize: 12.5,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
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
