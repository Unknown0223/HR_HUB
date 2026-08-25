import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api/me_repository.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';

/// In-app Face ID attendance punch via front camera selfie → API.
class FacePunchScreen extends ConsumerStatefulWidget {
  const FacePunchScreen({super.key});

  @override
  ConsumerState<FacePunchScreen> createState() => _FacePunchScreenState();
}

class _FacePunchScreenState extends ConsumerState<FacePunchScreen> {
  final _picker = ImagePicker();
  bool _busy = false;
  String? _status;
  String? _error;
  String? _previewPath;
  String? _base64;

  Future<void> _capture() async {
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Kamera ruxsati…';
    });
    try {
      final cam = await Permission.camera.request();
      if (!cam.isGranted) {
        throw Exception('Kamera ruxsati berilmadi');
      }
      setState(() => _status = 'Selfie olinmoqda…');
      // Preserve the camera's original resolution and JPEG quality.
      final file = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        imageQuality: 100,
      );
      if (file == null) {
        setState(() => _status = 'Bekor qilindi');
        return;
      }
      final bytes = await File(file.path).readAsBytes();
      setState(() {
        _previewPath = file.path;
        _base64 = base64Encode(bytes);
        _status =
            'Selfie tayyor (${(bytes.length / 1024).toStringAsFixed(0)} KB). '
            'Belgilashni bosing.';
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _punch({required bool mock}) async {
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Biometrik tekshiruv…';
    });
    try {
      final bio = ref.read(biometricServiceProvider);
      final ok = await bio.confirmIfEnabled(
        reason: 'Face ID belgisini tasdiqlang',
      );
      if (!ok) {
        throw Exception('Barmoq izi / biometrik rad etildi');
      }
      setState(() => _status = 'Serverga yuborilmoqda…');
      final res = await ref.read(meRepositoryProvider).punchFace(
            faceImageBase64: mock ? null : _base64,
            mock: mock,
          );
      ref.invalidate(todayProvider);
      if (!mounted) return;
      final dir = res['direction']?.toString() ?? '';
      final mode = res['mode']?.toString() ?? '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Face ID OK: $dir ($mode)'),
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Face ID belgi'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionCard(
              child: Text(
                'HR HUB — yuzni kamera orqali tekshirib belgi qo‘yadi. '
                'Haqiqiy terminal (Hikvision/ZK) bo‘lmasa ham demo/mock ishlaydi.',
                style: TextStyle(height: 1.4),
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: SectionCard(
                child: Center(
                  child: _previewPath == null
                      ? Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.face_retouching_natural,
                              size: 72,
                              color: AppColors.accent.withValues(alpha: 0.8),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Old kamera selfiesi',
                              style: TextStyle(color: AppColors.inkMuted),
                            ),
                          ],
                        )
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.file(
                            File(_previewPath!),
                            fit: BoxFit.cover,
                          ),
                        ),
                ),
              ),
            ),
            if (_status != null) ...[
              const SizedBox(height: 12),
              Text(_status!, style: const TextStyle(height: 1.35)),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _capture,
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Kameradan olish'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _busy || _base64 == null
                  ? null
                  : () => _punch(mock: false),
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.verified_user_outlined),
              label: const Text('Face ID bilan belgilash'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : () => _punch(mock: true),
              child: const Text('Demo: mock Face ID (kamera siz)'),
            ),
          ],
        ),
      ),
    );
  }
}
