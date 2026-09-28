import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api/api_config.dart';
import '../../core/api/me_repository.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/errors/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';

const _minCommentLength = 3;

class GpsPunchScreen extends ConsumerStatefulWidget {
  const GpsPunchScreen({super.key});

  @override
  ConsumerState<GpsPunchScreen> createState() => _GpsPunchScreenState();
}

class _GpsPunchScreenState extends ConsumerState<GpsPunchScreen> {
  final _comment = TextEditingController();
  bool _busy = false;
  String? _status;
  String? _error;
  Position? _pos;
  Map<String, dynamic>? _fence;

  bool get _outside => _fence != null && _fence!['inside'] != true;
  bool get _commentOk => _comment.text.trim().length >= _minCommentLength;

  @override
  void initState() {
    super.initState();
    _comment.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _locate());
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

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
      setState(() => _status = 'Hudud tekshirilmoqda…');
      final fence = await ref.read(meRepositoryProvider).checkGps(
            latitude: pos.latitude,
            longitude: pos.longitude,
          );
      setState(() {
        _pos = pos;
        _fence = fence['configured'] == true ? fence : null;
        _status =
            'Lat ${pos.latitude.toStringAsFixed(5)}, '
            'Lng ${pos.longitude.toStringAsFixed(5)} · '
            'aniqlik ${pos.accuracy.toStringAsFixed(0)} m';
        if (fence['configured'] != true) {
          _error = 'Kompaniyada GPS hududi sozlanmagan — HR bilan bog‘laning';
        }
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _punch() async {
    if (_pos == null) {
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
    if (_outside && !_commentOk) {
      setState(() => _error = 'Hududdan tashqarida belgi uchun izoh yozing');
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
            comment: _outside ? _comment.text : null,
          );
      ref.invalidate(todayProvider);
      if (!mounted) return;
      final suffix = _outside ? ' (hududdan tashqarida)' : '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('GPS: ${punchAcceptedText(res)}$suffix')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      // Moved out of the fence between check and punch — ask for a comment.
      if (e.code == 'GPS_OUTSIDE_COMMENT_REQUIRED') {
        setState(() {
          _fence = {...?_fence, 'inside': false, 'commentRequired': true};
          _error = e.message;
        });
      } else {
        setState(() => _error = e.message);
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _fenceCard() {
    final f = _fence!;
    final inside = f['inside'] == true;
    final color = inside ? AppColors.success : AppColors.warn;
    final name = f['locationName']?.toString() ?? '';
    final dist = f['distanceM'];
    final radius = f['radiusM'];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            inside ? Icons.verified_rounded : Icons.wrong_location_rounded,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  inside ? 'Hudud ichidasiz' : 'Hududdan tashqaridasiz',
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$name · $dist m (ruxsat $radius m)',
                  style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                ),
                if (!inside) ...[
                  const SizedBox(height: 4),
                  const Text(
                    'Belgi qabul qilinadi, lekin izoh majburiy va u '
                    '«hududdan tashqarida» deb belgilanadi.',
                    style: TextStyle(color: AppColors.inkMuted, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canPunch = !_busy && _fence != null && (!_outside || _commentOk);
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'GPS belgi'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_fence != null) ...[
              _fenceCard(),
              const SizedBox(height: 12),
            ],
            if (_status != null)
              SectionCard(
                child: Row(
                  children: [
                    if (_busy) ...[
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: Text(
                        _status!,
                        style: const TextStyle(
                          height: 1.4,
                          color: AppColors.inkMuted,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (_outside) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _comment,
                maxLines: 3,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: 'Izoh (majburiy)',
                  hintText: 'Masalan: mijoz oldida, xizmat safari…',
                  errorText: _comment.text.isNotEmpty && !_commentOk
                      ? 'Kamida $_minCommentLength ta belgi'
                      : null,
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: _busy ? null : _locate,
              icon: const Icon(Icons.my_location),
              label: const Text('Joylashuvni yangilash'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: canPunch ? _punch : null,
              style: _outside
                  ? FilledButton.styleFrom(backgroundColor: AppColors.warn)
                  : null,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(_outside ? Icons.edit_location_alt : Icons.check),
              label: Text(
                _outside ? 'Izoh bilan belgilash' : 'Belgilash',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
