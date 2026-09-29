import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../../core/theme/app_theme.dart';

enum _Phase { preview, back, front }

/// One shutter press captures the back camera and, right after it, the front
/// camera. The front shot is only used when it contains exactly one face;
/// otherwise the caller falls back to the liveness selfie.
class DualCapture extends StatefulWidget {
  const DualCapture({
    super.key,
    required this.livenessSelfie,
    required this.accent,
    required this.onCaptured,
  });

  final XFile livenessSelfie;
  final Color accent;
  final void Function(XFile back, XFile? front) onCaptured;

  @override
  State<DualCapture> createState() => _DualCaptureState();
}

class _DualCaptureState extends State<DualCapture> {
  CameraDescription? _backCam;
  CameraDescription? _frontCam;
  CameraController? _back;
  CameraController? _front;
  XFile? _backShot;
  _Phase _phase = _Phase.preview;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _back?.dispose();
    _front?.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final cams = await availableCameras();
      _backCam = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => throw Exception('Orqa kamera topilmadi'),
      );
      _frontCam = cams.where((c) => c.lensDirection == CameraLensDirection.front).firstOrNull;
      final c = CameraController(_backCam!, ResolutionPreset.high, enableAudio: false);
      await c.initialize();
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() => _back = c);
    } catch (e) {
      if (mounted) setState(() => _error = _clean(e));
    }
  }

  Future<void> _capture() async {
    final back = _back;
    if (back == null || _phase != _Phase.preview) return;
    setState(() => _phase = _Phase.back);
    try {
      final backShot = await back.takePicture();
      _back = null;
      await back.dispose();
      if (!mounted) return;
      setState(() {
        _backShot = backShot;
        _phase = _Phase.front;
      });
      final front = await _captureFront();
      if (mounted) widget.onCaptured(backShot, front);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Surat olinmadi: ${_clean(e)}';
        _phase = _Phase.preview;
        _backShot = null;
      });
      _start();
    }
  }

  Future<XFile?> _captureFront() async {
    final cam = _frontCam;
    if (cam == null) return null;
    final c = CameraController(cam, ResolutionPreset.medium, enableAudio: false);
    try {
      await c.initialize();
      if (!mounted) return null;
      setState(() => _front = c);
      await Future<void>.delayed(const Duration(milliseconds: 700));
      final shot = await c.takePicture();
      return await _hasSingleFace(shot) ? shot : null;
    } catch (_) {
      return null;
    } finally {
      _front = null;
      await c.dispose();
    }
  }

  Future<bool> _hasSingleFace(XFile file) async {
    final detector = FaceDetector(options: FaceDetectorOptions(minFaceSize: 0.2));
    try {
      final faces = await detector.processImage(InputImage.fromFilePath(file.path));
      return faces.length == 1;
    } catch (_) {
      return false;
    } finally {
      await detector.close();
    }
  }

  String _clean(Object e) => e.toString().replaceFirst('Exception: ', '');

  Widget _cover(CameraController c) => FittedBox(
        fit: BoxFit.cover,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(
          width: c.value.previewSize?.height ?? 720,
          height: c.value.previewSize?.width ?? 1280,
          child: CameraPreview(c),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final back = _back;
    final front = _front;
    final busy = _phase != _Phase.preview;

    Widget base;
    if (_backShot != null) {
      base = Image.file(File(_backShot!.path), fit: BoxFit.cover);
    } else if (back != null && back.value.isInitialized) {
      base = _cover(back);
    } else {
      base = ColoredBox(
        color: AppColors.bgSoft,
        child: Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(_error!, textAlign: TextAlign.center),
                ),
        ),
      );
    }

    final inset = front != null && front.value.isInitialized
        ? _cover(front)
        : Image.file(File(widget.livenessSelfie.path), fit: BoxFit.cover);

    final hint = switch (_phase) {
      _Phase.preview => 'Ish joyingizni kadrga oling va tugmani bosing',
      _Phase.back => 'Orqa kamera suratga olmoqda…',
      _Phase.front => 'Old kamera: kameraga qarang…',
    };

    return Column(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: Stack(
              fit: StackFit.expand,
              children: [
                base,
                Positioned(
                  left: 14,
                  top: 14,
                  width: 112,
                  height: 150,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _phase == _Phase.front ? widget.accent : Colors.white,
                        width: _phase == _Phase.front ? 4 : 3,
                      ),
                      boxShadow: const [
                        BoxShadow(color: Color(0x55000000), blurRadius: 10),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(11),
                      child: inset,
                    ),
                  ),
                ),
                if (_phase == _Phase.back)
                  const ColoredBox(color: Color(0x88FFFFFF)),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x00000000), Color(0x99000000)],
                      ),
                    ),
                    child: Row(
                      children: [
                        if (busy) ...[
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: Text(
                            hint,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
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
        if (_error != null && back != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        const SizedBox(height: 16),
        GestureDetector(
          onTap: back == null || busy ? null : _capture,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 80,
            height: 80,
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: widget.accent, width: 4),
            ),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: back == null || busy
                    ? widget.accent.withValues(alpha: 0.4)
                    : widget.accent,
              ),
              child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 30),
            ),
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Bitta bosishda ikkala kamera suratga oladi',
          style: TextStyle(color: AppColors.inkMuted, fontSize: 12),
        ),
      ],
    );
  }
}
