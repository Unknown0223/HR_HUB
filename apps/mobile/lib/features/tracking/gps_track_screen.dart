import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../core/tracking/tracking_controller.dart';
import '../../shared/widgets.dart';
import '../attendance/punch_widgets.dart';

/// Shows whether this phone is currently streaming GPS and why (working hours,
/// day off, missing permission…).
class GpsTrackScreen extends ConsumerStatefulWidget {
  const GpsTrackScreen({super.key});

  @override
  ConsumerState<GpsTrackScreen> createState() => _GpsTrackScreenState();
}

class _GpsTrackScreenState extends ConsumerState<GpsTrackScreen> {
  TrackingNativeStatus? _native;
  Map<String, dynamic>? _server;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final tracking = ref.read(trackingControllerProvider);
    await tracking.ensureStarted();
    final results = await Future.wait([
      tracking.nativeStatus(),
      tracking.serverStatus(),
    ]);
    if (!mounted) return;
    setState(() {
      _native = results[0] as TrackingNativeStatus;
      _server = results[1] as Map<String, dynamic>?;
    });
  }

  static String _hm(DateTime? d) {
    if (d == null) return '—';
    final l = d.toLocal();
    return '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
  }

  static DateTime? _parse(Object? v) =>
      v == null ? null : DateTime.tryParse(v.toString());

  (String, String, IconData, List<Color>) _headline() {
    final window = _server?['window'] as Map?;
    final reason = window?['reason']?.toString() ?? _native?.windowReason;
    final state = _native?.state;
    if (_server != null && _server!['registered'] != true) {
      return (
        context.t('Kuzatuv ulanmagan'),
        context.t('Hisobingiz xodim kartasiga bog‘lanmagan'),
        Icons.link_off_rounded,
        const [Color(0xFFB0BEC5), Color(0xFF78909C)],
      );
    }
    if (state == 'no_permission') {
      return (
        context.t('Ruxsat yo‘q'),
        context.t('Joylashuv ruxsatini «Doim ruxsat» qiling'),
        Icons.location_disabled_rounded,
        const [Color(0xFFFF8A80), AppColors.danger],
      );
    }
    if (state == 'gps_off') {
      return (
        context.t('GPS o‘chirilgan'),
        context.t('Telefonda joylashuv xizmatini yoqing'),
        Icons.gps_off_rounded,
        const [Color(0xFFFF8A80), AppColors.danger],
      );
    }
    if (window?['active'] == true || reason == 'working') {
      return (
        context.t('Kuzatuv faol'),
        context.t('Ish vaqti: joylashuv avtomatik uzatilmoqda'),
        Icons.share_location_rounded,
        const [AppColors.headerTop, AppColors.headerBottom],
      );
    }
    return switch (reason) {
      'day_off' => (
        context.t('Dam olish kuni'),
        context.t('Bugun joylashuv uzatilmaydi'),
        Icons.weekend_rounded,
        const [Color(0xFF90CAF9), Color(0xFF42A5F5)],
      ),
      'holiday' => (
        context.t('Bayram kuni'),
        context.t('Bugun joylashuv uzatilmaydi'),
        Icons.celebration_rounded,
        const [Color(0xFF90CAF9), Color(0xFF42A5F5)],
      ),
      'absence' => (
        context.t('Ta’til / ruxsat'),
        context.t('Tasdiqlangan ta’tilda kuzatuv o‘chadi'),
        Icons.beach_access_rounded,
        const [Color(0xFF90CAF9), Color(0xFF42A5F5)],
      ),
      'before_start' => (
        context.t('Ish hali boshlanmagan'),
        context.t('Ish vaqti boshlanishi bilan kuzatuv yoqiladi'),
        Icons.schedule_rounded,
        const [Color(0xFFF7C24A), Color(0xFFE08A00)],
      ),
      _ => (
        context.t('Ish vaqtidan tashqari'),
        context.t('Ish vaqti tugadi — joylashuv uzatilmaydi'),
        Icons.bedtime_rounded,
        const [Color(0xFFF7C24A), Color(0xFFE08A00)],
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final loading = _native == null && _server == null;
    final window = _server?['window'] as Map?;
    final (title, subtitle, icon, colors) = _headline();
    final start = _parse(window?['start']);
    final end = _parse(window?['end']);
    final battery = _server?['batteryPct'];

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(title: context.t('GPS kuzatuv'), centerTitle: true),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  StaggeredEntrance(
                    index: 0,
                    child: Container(
                      padding: const EdgeInsets.all(18),
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
                            blurRadius: 18,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          PulseRings(
                            color: Colors.white,
                            icon: icon,
                            iconColor: colors.last,
                            size: 96,
                            iconSize: 30,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  subtitle,
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.92),
                                    fontSize: 13,
                                    height: 1.35,
                                  ),
                                ),
                                if (start != null && end != null) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    context.t('Ish vaqti: {0} – {1}', [
                                      _hm(start),
                                      _hm(end),
                                    ]),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  StaggeredEntrance(
                    index: 1,
                    child: Row(
                      children: [
                        _Stat(
                          icon: Icons.cloud_done_rounded,
                          label: context.t('Oxirgi yuborish'),
                          value: _hm(
                            _native?.lastSentAt ??
                                _parse(_server?['lastSeenAt']),
                          ),
                        ),
                        const SizedBox(width: 10),
                        _Stat(
                          icon: Icons.place_rounded,
                          label: context.t('Bugun nuqtalar'),
                          value: '${_server?['pointsToday'] ?? 0}',
                        ),
                        const SizedBox(width: 10),
                        _Stat(
                          icon: Icons.battery_std_rounded,
                          label: context.t('Batareya'),
                          value: battery == null ? '—' : '$battery%',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  StaggeredEntrance(
                    index: 2,
                    child: _Card(
                      children: [
                        _Row(
                          icon: Icons.memory_rounded,
                          label: context.t('Fon xizmati'),
                          value: _native?.running == true
                              ? context.t('Ishlamoqda')
                              : context.t('To‘xtagan'),
                          ok: _native?.running == true,
                        ),
                        _Row(
                          icon: Icons.battery_saver_rounded,
                          label: context.t('Batareya cheklovi'),
                          value: _native?.batteryOptimizationIgnored == true
                              ? context.t('O‘chirilgan')
                              : context.t('Yoqilgan'),
                          ok: _native?.batteryOptimizationIgnored == true,
                        ),
                        _Row(
                          icon: Icons.gps_fixed_rounded,
                          label: context.t('Oxirgi GPS nuqta'),
                          value: _hm(_native?.lastFixAt),
                          ok: _native?.lastFixAt != null,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  StaggeredEntrance(
                    index: 3,
                    child: _Card(
                      children: [
                        _Info(
                          icon: Icons.verified_user_rounded,
                          text: context.t(
                            'Joylashuv faqat ish jadvalingizdagi vaqtda uzatiladi. Dam olish, '
                            'bayram va tasdiqlangan ta’til kunlarida hamda ish vaqtidan '
                            'tashqarida server ma’lumotni qabul qilmaydi.',
                          ),
                        ),
                        _Info(
                          icon: Icons.battery_charging_full_rounded,
                          text: context.t(
                            'Quvvatlanayotganda nuqtalar tez-tez, batareya kamayganda va '
                            'bir joyda turganingizda kamroq olinadi.',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  StaggeredEntrance(
                    index: 4,
                    child: TextButton.icon(
                      onPressed: () async {
                        final opened = await ref
                            .read(trackingControllerProvider)
                            .openAutostartSettings();
                        if (!opened && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                context.t(
                                  'Bu telefonda alohida avtoishga tushirish sozlamasi yo‘q',
                                ),
                              ),
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.rocket_launch_rounded),
                      label: Text(
                        context.t('Avtoishga tushirish (Xiaomi, Oppo, Vivo…)'),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.accent, size: 20),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
            Text(
              label,
              style: const TextStyle(color: AppColors.inkMuted, fontSize: 11.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(children: children),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.value,
    required this.ok,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, color: AppColors.inkMuted, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(label)),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: ok ? AppColors.success : AppColors.warn,
            ),
          ),
        ],
      ),
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.accent, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: AppColors.inkMuted,
                height: 1.4,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
