import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/api/me_repository.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/theme/app_theme.dart';
import '../home/home_screen.dart';

class QrPunchScreen extends ConsumerStatefulWidget {
  const QrPunchScreen({super.key});

  @override
  ConsumerState<QrPunchScreen> createState() => _QrPunchScreenState();
}

class _QrPunchScreenState extends ConsumerState<QrPunchScreen> {
  bool _handled = false;
  bool _busy = false;
  String? _error;
  final _controller = MobileScannerController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled || _busy) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null || raw.isEmpty) return;
    setState(() {
      _handled = true;
      _busy = true;
      _error = null;
    });
    try {
      await _controller.stop();
      final bioOk = await ref.read(biometricServiceProvider).confirmIfEnabled(
            reason: 'QR belgisini tasdiqlang',
          );
      if (!bioOk) {
        throw Exception('Barmoq izi / biometrik rad etildi');
      }
      final res = await ref.read(meRepositoryProvider).punchQr(qrCode: raw);
      ref.invalidate(todayProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('QR belgi: ${res['direction'] ?? 'OK'}')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _handled = false;
        _busy = false;
      });
      await _controller.start();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: const Text('QR belgi')),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                MobileScanner(controller: _controller, onDetect: _onDetect),
                if (_busy)
                  const ColoredBox(
                    color: Colors.black45,
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Ofisdagi QR kodni skanerlang. Yo‘nalish avtomatik (IN/OUT).',
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
