import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/location_guard.dart';
import '../../core/theme/app_theme.dart';
import 'punch_widgets.dart';

/// 5–10s punch. Both cameras record together when the phone allows it;
/// otherwise the front clip is taken first and the back clip right after.
class VideoPunchScreen extends ConsumerStatefulWidget {
  const VideoPunchScreen({super.key, required this.direction});
  final String direction;

  @override
  ConsumerState<VideoPunchScreen> createState() => _VideoPunchScreenState();
}

class _VideoPunchScreenState extends ConsumerState<VideoPunchScreen> {
  static const _seconds = 8;
  CameraController? _front;
  CameraController? _back;
  int? _code;
  bool _busy = false;
  String? _status;
  String? _error;

  bool get _in => widget.direction == 'IN';

  @override
  void initState() {
    super.initState();
    unawaited(_prepare());
  }

  @override
  void dispose() {
    _front?.dispose();
    _back?.dispose();
    super.dispose();
  }

  Future<void> _prepare() async {
    setState(() => _status = context.tr('Tayyorlanmoqda…', 'Подготовка…'));
    try {
      final today = await ref.read(meRepositoryProvider).punchVideoToday();
      if (today['enabled'] != true) {
        throw ApiException('Video bilan belgilash o‘chirilgan', code: 'PUNCH_VIDEO_DISABLED');
      }
      final cams = await availableCameras();
      final front = cams.cast<CameraDescription?>().firstWhere(
        (c) => c!.lensDirection == CameraLensDirection.front,
        orElse: () => null,
      );
      final back = cams.cast<CameraDescription?>().firstWhere(
        (c) => c!.lensDirection == CameraLensDirection.back,
        orElse: () => null,
      );
      if (front == null) throw Exception('Old kamera topilmadi');
      final fc = CameraController(front, ResolutionPreset.low, enableAudio: true);
      await fc.initialize();
      CameraController? bc;
      if (back != null) {
        bc = CameraController(back, ResolutionPreset.low, enableAudio: false);
        try {
          await bc.initialize();
        } catch (_) {
          await bc.dispose();
          bc = null;
        }
      }
      if (!mounted) return;
      setState(() {
        _front = fc;
        _back = bc;
        _code = (today['code'] as num?)?.toInt();
        _status = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : e.toString());
    }
  }

  Future<void> _record() async {
    final front = _front;
    if (front == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final fix = await LocationGuard().acquire();
      final back = _back;
      String mode = 'sequential';
      String? backPath;
      await front.startVideoRecording();
      if (back != null) {
        try {
          await back.startVideoRecording();
          mode = 'simultaneous';
        } catch (_) {}
      }
      await Future<void>.delayed(const Duration(seconds: _seconds));
      final frontFile = await front.stopVideoRecording();
      if (mode == 'simultaneous' && back != null) {
        backPath = (await back.stopVideoRecording()).path;
      } else if (back != null) {
        await back.startVideoRecording();
        await Future<void>.delayed(const Duration(seconds: _seconds));
        backPath = (await back.stopVideoRecording()).path;
      }
      final res = await ref.read(meRepositoryProvider).punchVideo(
        direction: widget.direction,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        durationSec: _seconds,
        captureMode: mode,
        frontPath: frontFile.path,
        backPath: backPath,
        spokenCode: _code,
      );
      if (!mounted) return;
      setState(() => _status = context.tr('Qayd etildi', 'Отмечено'));
      await Future<void>.delayed(const Duration(seconds: 1));
      if (mounted) Navigator.of(context).pop(res);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final needCode = ref.watch(authProvider).user?.punchVideoCode == true || _code != null;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(_in ? context.tr('Video kirish', 'Видео приход') : context.tr('Video chiqish', 'Видео уход')),
      ),
      body: _error != null && _front == null
          ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, style: const TextStyle(color: Colors.white))))
          : Column(
              children: [
                Expanded(
                  child: _front == null
                      ? const Center(child: CircularProgressIndicator())
                      : Center(
                          child: ClipOval(
                            child: SizedBox(
                              width: 280,
                              height: 280,
                              child: FittedBox(
                                fit: BoxFit.cover,
                                child: SizedBox(
                                  width: _front!.value.previewSize?.height ?? 280,
                                  height: _front!.value.previewSize?.width ?? 280,
                                  child: CameraPreview(_front!),
                                ),
                              ),
                            ),
                          ),
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      if (needCode && _code != null)
                        Text(
                          context.tr('Kodni ayting: $_code', 'Назовите код: $_code'),
                          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                        ),
                      const SizedBox(height: 6),
                      Text(
                        _back != null
                            ? context.tr('Ikkala kamera birga yoziladi', 'Обе камеры пишут сразу')
                            : context.tr('Faqat old kamera (orqa kamera ochilmadi)', 'Только передняя камера'),
                        style: const TextStyle(color: AppColors.inkMuted),
                      ),
                      if (_status != null) Text(_status!, style: const TextStyle(color: Colors.white)),
                      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                      const SizedBox(height: 12),
                      ShimmerButton(
                        label: _busy ? context.tr('Yozilmoqda…', 'Запись…') : context.tr('$_seconds soniya yozish', 'Записать $_seconds с'),
                        icon: Icons.videocam_rounded,
                        colors: const [Color(0xFF2FA350), Color(0xFF1F6F3A)],
                        onPressed: _busy || _front == null ? null : _record,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
