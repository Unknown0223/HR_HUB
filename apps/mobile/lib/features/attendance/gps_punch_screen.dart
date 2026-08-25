import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api/api_config.dart';
import '../../core/api/me_repository.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';

class GpsPunchScreen extends ConsumerStatefulWidget {
  const GpsPunchScreen({super.key});

  @override
  ConsumerState<GpsPunchScreen> createState() => _GpsPunchScreenState();
}

class _GpsPunchScreenState extends ConsumerState<GpsPunchScreen> {
  bool _busy = false;
  String? _status;
  String? _error;
  Position? _pos;

  Future<void> _locate() async {
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Ruxsat so‘ralmoqda…';
    });
    try {
      final perm = await Permission.locationWhenInUse.request();
      if (!perm.isGranted) {
        throw Exception('Joylashuv ruxsati berilmadi');
      }
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw Exception('GPS o‘chirilgan — yoqing');
      }
      setState(() => _status = 'Joylashuv olinmoqda…');
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      setState(() {
        _pos = pos;
        _status =
            'Lat ${pos.latitude.toStringAsFixed(5)}, '
            'Lng ${pos.longitude.toStringAsFixed(5)}\n'
            'Aniqlik: ${pos.accuracy.toStringAsFixed(0)} m';
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _punch() async {
    final pos = _pos;
    if (pos == null) {
      await _locate();
      if (_pos == null) return;
    }
    final p = _pos!;
    if (p.accuracy > ApiConfig.maxGpsAccuracyM) {
      setState(() {
        _error =
            'Aniqlik past: ${p.accuracy.toStringAsFixed(0)} m '
            '(max ${ApiConfig.maxGpsAccuracyM.toStringAsFixed(0)} m)';
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _status = 'Biometrik tekshiruv…';
    });
    try {
      final bioOk = await ref.read(biometricServiceProvider).confirmIfEnabled(
            reason: 'GPS belgisini tasdiqlang',
          );
      if (!bioOk) {
        throw Exception('Barmoq izi / biometrik rad etildi');
      }
      setState(() => _status = 'Serverga yuborilmoqda…');
      final res = await ref.read(meRepositoryProvider).punchGps(
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
          );
      ref.invalidate(todayProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Belgi qabul qilindi: ${res['direction'] ?? ''} '
            '${res['occurredAt'] ?? ''}',
          ),
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
      appBar: const AppBackBar(title: 'Qatnashish'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionCard(
              child: Text(
                'Ofis geofence ichida bo‘lishingiz kerak. '
                'Aniqlik ${ApiConfig.maxGpsAccuracyM.toStringAsFixed(0)} m dan yaxshi bo‘lishi shart.',
              ),
            ),
            const SizedBox(height: 16),
            if (_status != null)
              SectionCard(
                child: Text(_status!, style: const TextStyle(height: 1.4)),
              ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const Spacer(),
            OutlinedButton.icon(
              onPressed: _busy ? null : _locate,
              icon: const Icon(Icons.my_location),
              label: const Text('Joylashuvni yangilash'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _busy ? null : _punch,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.check),
              label: const Text('Belgilash'),
            ),
          ],
        ),
      ),
    );
  }
}
