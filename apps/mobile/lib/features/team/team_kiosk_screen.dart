import 'dart:async';
import 'dart:convert';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../core/api/api_config.dart';
import '../../core/api/me_repository.dart';
import '../../core/api/team_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/security/location_guard.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/server_clock.dart';
import '../../shared/widgets.dart';
import '../attendance/liveness.dart';
import '../attendance/liveness_camera.dart';
import '../attendance/photo_report.dart';
import '../attendance/punch_widgets.dart';
import 'team_common.dart';

const _minCommentLength = 3;

/// A fix older than this is taken again before the next mark is sent.
const _fixMaxAge = Duration(minutes: 5);
const _successPause = Duration(seconds: 3);
const _failurePause = Duration(seconds: 5);

enum _Phase { loading, setup, camera, sending, result }

/// «Device mode» of a manager's phone: staff without smartphones stand in front of
/// it one after another; each passes the head-turn check and is identified by face
/// among the manager's own subordinates, then the camera is ready for the next one.
class TeamKioskScreen extends ConsumerStatefulWidget {
  const TeamKioskScreen({super.key});

  @override
  ConsumerState<TeamKioskScreen> createState() => _TeamKioskScreenState();
}

class _TeamKioskScreenState extends ConsumerState<TeamKioskScreen> {
  final _comment = TextEditingController();

  _Phase _phase = _Phase.loading;
  String _status = '';
  String? _error;

  Map<String, dynamic>? _overview;
  PreciseFix? _fix;
  DateTime? _fixAt;
  Map<String, dynamic>? _fence;
  String _direction = 'IN';

  int _attempt = 0;
  int _marked = 0;
  Map<String, dynamic>? _success;
  ({String title, String message, Map<String, dynamic>? employee})? _failure;
  Timer? _next;

  bool get _isIn => _direction == 'IN';
  bool get _outside => _fence != null && _fence!['inside'] != true;
  bool get _commentOk => _comment.text.trim().length >= _minCommentLength;
  List<Color> get _colors => _directionColors(_isIn);

  @override
  void initState() {
    super.initState();
    _comment.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    unawaited(WakelockPlus.enable());
  }

  @override
  void dispose() {
    unawaited(WakelockPlus.disable());
    _next?.cancel();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _phase = _Phase.loading;
      _error = null;
      _status = context.tr('Jamoa va joylashuv aniqlanmoqda…', 'Загружаем команду и местоположение…');
    });
    try {
      final overview = ref.read(teamRepositoryProvider).kiosk();
      await _locate();
      final data = await overview;
      if (!mounted) return;
      setState(() {
        _overview = data;
        _phase = _Phase.setup;
      });
    } on ApiException catch (e) {
      if (e.code == 'TEAM_KIOSK_DISABLED' || e.code == 'TEAM_KIOSK_NO_TEAM') {
        unawaited(ref.read(authProvider.notifier).refreshMe());
      }
      if (mounted) setState(() => _error = e.message);
    } on LocationGuardException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _refreshOverview() async {
    try {
      final data = await ref.read(teamRepositoryProvider).kiosk();
      if (mounted) setState(() => _overview = data);
    } catch (_) {}
  }

  /// Precise system GPS of the phone; throws on a fake location or poor accuracy.
  Future<void> _locate() async {
    final fix = await LocationGuard().acquire(
      onSample: (p, n) {
        if (!mounted) return;
        setState(
          () => _status = context.tr(
            'Aniqlik: ${p.accuracy.toStringAsFixed(0)} m · o‘lchov $n',
            'Точность: ${p.accuracy.toStringAsFixed(0)} м · замер $n',
          ),
        );
      },
    );
    if (fix.integrity.flagged) {
      String? message;
      try {
        final res = await ref.read(meRepositoryProvider).reportMockLocation(
              integrity: fix.integrity.toJson(),
              latitude: fix.latitude,
              longitude: fix.longitude,
            );
        message = res['message']?.toString();
      } catch (_) {}
      throw LocationGuardException(
        message ??
            trText('Telefoningizda soxta lokatsiya aniqlandi — belgi qabul qilinmaydi.'),
      );
    }
    if (fix.accuracy > ApiConfig.maxGpsAccuracyM) {
      throw LocationGuardException(
        trText('GPS aniqligi past ({0} m). Ochiq joyga chiqib qayta urinib ko‘ring.', [
          fix.accuracy.toStringAsFixed(0),
        ]),
      );
    }
    final fence = await ref
        .read(meRepositoryProvider)
        .checkGps(latitude: fix.latitude, longitude: fix.longitude);
    if (!mounted) return;
    setState(() {
      _fix = fix;
      _fixAt = DateTime.now();
      _fence = fence['configured'] == true ? fence : null;
    });
  }

  void _start() {
    setState(() {
      _error = null;
      _attempt++;
      _phase = _Phase.camera;
    });
  }

  void _backToSetup() {
    _next?.cancel();
    setState(() {
      _phase = _Phase.setup;
      _success = null;
      _failure = null;
    });
    unawaited(_refreshOverview());
  }

  void _scheduleNext(Duration pause) {
    _next?.cancel();
    _next = Timer(pause, () {
      if (mounted && _phase == _Phase.result) _start();
    });
  }

  Future<void> _onLivenessPassed(XFile selfie, LivenessChallenge challenge) async {
    final steps = challenge.apiSteps;
    final durationMs = challenge.elapsed(DateTime.now()).inMilliseconds;
    setState(() {
      _phase = _Phase.sending;
      _status = context.tr('Xodim aniqlanmoqda…', 'Определяем сотрудника…');
    });
    try {
      if (_fix == null || DateTime.now().difference(_fixAt!) > _fixMaxAge) {
        setState(() => _status = context.tr('Joylashuv yangilanmoqda…', 'Обновляем местоположение…'));
        await _locate();
        if (_outside && !_commentOk) {
          throw ApiException(
            trText('Hududdan tashqaridasiz. Izoh majburiy.'),
            code: 'GPS_OUTSIDE_COMMENT_REQUIRED',
          );
        }
        if (mounted) setState(() => _status = context.tr('Xodim aniqlanmoqda…', 'Определяем сотрудника…'));
      }
      final fix = _fix!;
      final now = ServerClock.now();
      String two(int v) => v.toString().padLeft(2, '0');
      final manager = _overview?['manager']?.toString() ?? '';
      final stamp =
          'Worklyn | ${_isIn ? 'KIRISH' : 'CHIQISH'} | '
          '${two(now.day)}.${two(now.month)}.${now.year} '
          '${two(now.hour)}:${two(now.minute)}:${two(now.second)}\n'
          'GPS ${fix.latitude.toStringAsFixed(5)}, ${fix.longitude.toStringAsFixed(5)} '
          '+-${fix.accuracy.toStringAsFixed(0)}m | Rahbar: $manager';
      final face = faceMatchSelfie(selfie.path);
      final photo = await stampedFacePhoto(path: selfie.path, stamp: stamp);
      final res = await ref.read(teamRepositoryProvider).kioskPunch(
            direction: _direction,
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            selfieBase64: base64Encode(await face),
            photoBase64: base64Encode(photo),
            livenessSteps: steps,
            livenessDurationMs: durationMs,
            integrity: fix.integrity.toJson(),
            comment: _outside ? _comment.text : null,
          );
      if (!mounted) return;
      setState(() {
        _marked++;
        _success = res;
        _failure = null;
        _phase = _Phase.result;
      });
      unawaited(_refreshOverview());
      _scheduleNext(_successPause);
    } on ApiException catch (e) {
      if (!mounted) return;
      switch (e.code) {
        case 'GPS_OUTSIDE_COMMENT_REQUIRED':
          setState(() {
            _fence = {...?_fence, 'inside': false, 'commentRequired': true};
            _error = e.message;
            _phase = _Phase.setup;
          });
        case 'MOCK_LOCATION_DETECTED':
        case 'TEAM_KIOSK_DISABLED':
        case 'TEAM_KIOSK_NO_TEAM':
          unawaited(ref.read(authProvider.notifier).refreshMe());
          setState(() {
            _error = e.message;
            _overview = null;
            _phase = _Phase.loading;
          });
        default:
          final employee = e.details?['employee'];
          _fail(
            _failureTitle(e.code),
            e.message,
            employee is Map ? Map<String, dynamic>.from(employee) : null,
          );
      }
    } on LocationGuardException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _phase = _Phase.setup;
        });
      }
    } catch (e) {
      if (mounted) _fail(context.tr('Yuborilmadi', 'Не отправлено'), e.toString(), null);
    }
  }

  void _fail(String title, String message, Map<String, dynamic>? employee) {
    setState(() {
      _success = null;
      _failure = (title: title, message: message, employee: employee);
      _phase = _Phase.result;
    });
    _scheduleNext(_failurePause);
  }

  String _failureTitle(String? code) {
    switch (code) {
      case 'KIOSK_FACE_UNKNOWN':
        return context.tr('Xodim topilmadi', 'Сотрудник не найден');
      case 'KIOSK_FACE_AMBIGUOUS':
        return context.tr('Aniq tanib bo‘lmadi', 'Не удалось распознать точно');
      case 'FACE_NOT_FOUND':
        return context.tr('Yuz aniqlanmadi', 'Лицо не найдено');
      case 'LIVENESS_FAILED':
        return context.tr('Jonlilik tekshiruvi o‘tmadi', 'Проверка живости не пройдена');
      case 'KIOSK_ALREADY_IN':
        return context.tr('Kirish allaqachon bor', 'Приход уже отмечен');
      case 'KIOSK_NOT_IN':
        return context.tr('Kirish belgisi yo‘q', 'Нет отметки прихода');
      default:
        return context.tr('Belgi qo‘yilmadi', 'Отметка не поставлена');
    }
  }

  @override
  Widget build(BuildContext context) {
    final running = _phase == _Phase.camera || _phase == _Phase.sending || _phase == _Phase.result;
    return PopScope(
      canPop: !running,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _phase != _Phase.sending) _backToSetup();
      },
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: running ? null : AppBackBar(title: context.tr('Qurilma rejimi', 'Режим устройства')),
        body: SafeArea(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            reverseDuration: Duration.zero,
            child: KeyedSubtree(
              key: ValueKey('$_phase-$_attempt'),
              child: _body(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    switch (_phase) {
      case _Phase.loading:
        return _loadingView();
      case _Phase.setup:
        return _setupView();
      case _Phase.camera:
        return _cameraView();
      case _Phase.sending:
        return _sendingView();
      case _Phase.result:
        return _success != null ? _successView() : _failureView();
    }
  }

  Widget _loadingView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            PulseRings(
              color: _error == null ? AppColors.accent : AppColors.danger,
              icon: _error == null ? Icons.groups_rounded : Icons.error_outline_rounded,
              size: _error == null ? 180 : 140,
            ),
            const SizedBox(height: 18),
            Text(
              _error ?? _status,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                height: 1.4,
                color: _error == null ? AppColors.inkMuted : AppColors.ink,
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 20),
              ShimmerButton(
                label: context.tr('Qayta urinish', 'Повторить'),
                icon: Icons.refresh_rounded,
                colors: _colors,
                onPressed: _load,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _setupView() {
    final items = ((_overview?['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final total = (_overview?['total'] as num?)?.toInt() ?? items.length;
    final ready = (_overview?['faceReady'] as num?)?.toInt() ?? 0;
    final canStart = !_outside || _commentOk;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            children: [
              _DirectionPicker(
                isIn: _isIn,
                onChanged: (v) => setState(() => _direction = v ? 'IN' : 'OUT'),
              ),
              const SizedBox(height: 14),
              _PlaceCard(fix: _fix, fence: _fence, onRefresh: _load),
              if (_outside) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _comment,
                  maxLines: 2,
                  maxLength: 500,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    labelText: context.tr('Izoh (majburiy)', 'Комментарий (обязательно)'),
                    hintText: context.tr('Masalan: obyektda, dala ishlari…', 'Например: на объекте, полевые работы…'),
                    prefixIcon: const Icon(Icons.edit_note_rounded),
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: 14),
              SectionCard(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('Jamoa: $total · yuzi tayyor: $ready', 'Команда: $total · лицо готово: $ready'),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    if (ready < total)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          context.tr(
                            'Profil rasmi yo‘q yoki rasmda yuz ko‘rinmaydigan xodimlarni telefon taniy olmaydi — HR rasmini yangilashi kerak.',
                            'Сотрудников без фото профиля (или без лица на фото) телефон не распознает — HR нужно обновить фото.',
                          ),
                          style: const TextStyle(color: AppColors.warn, fontSize: 12.5, height: 1.35),
                        ),
                      ),
                    const SizedBox(height: 8),
                    for (final m in items) _MemberRow(member: m),
                  ],
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          color: AppColors.bg,
          child: ShimmerButton(
            label: canStart
                ? context.tr('Qurilma rejimini boshlash', 'Запустить режим устройства')
                : context.tr('Avval izoh yozing', 'Сначала напишите комментарий'),
            icon: canStart ? Icons.camera_front_rounded : Icons.edit_note_rounded,
            colors: _colors,
            onPressed: canStart && ready > 0 ? _start : null,
          ),
        ),
      ],
    );
  }

  Widget _cameraView() {
    return Column(
      children: [
        _KioskBanner(
          isIn: _isIn,
          marked: _marked,
          onStop: _backToSetup,
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: LivenessCamera(
              onPassed: _onLivenessPassed,
              directions: (_overview?['livenessDirections'] as num?)?.toInt() == 4 ? 4 : 8,
            ),
          ),
        ),
      ],
    );
  }

  Widget _sendingView() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          PulseRings(color: _colors.last, icon: Icons.face_retouching_natural, size: 180),
          const SizedBox(height: 22),
          SizedBox(
            width: 220,
            child: LinearProgressIndicator(
              minHeight: 6,
              color: _colors.last,
              backgroundColor: AppColors.line,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 14),
          Text(_status, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _successView() {
    final res = _success!;
    final employee = res['employee'] is Map ? Map<String, dynamic>.from(res['employee'] as Map) : const <String, dynamic>{};
    final day = res['day'] is Map ? res['day'] as Map : null;
    final time = formatApiTime(res['occurredAt']);
    final late = _isIn && day?['status'] == 'late';
    final verdict = !_isIn
        ? null
        : late
            ? context.tr('${day?['lateMinutes']} daqiqa kechikish', 'Опоздание ${day?['lateMinutes']} мин')
            : context.tr('O‘z vaqtida', 'Вовремя');
    return _ResultLayout(
      colors: _colors,
      pause: _successPause,
      icon: Icons.check_rounded,
      avatar: MemberAvatar(
        name: employee['fullName']?.toString(),
        photoUrl: ref.read(teamRepositoryProvider).mediaUrl(employee['photoUrl']?.toString()),
        radius: 54,
      ),
      title: employee['fullName']?.toString() ?? '',
      subtitle: employee['position']?.toString(),
      lines: [
        context.tr('${_isIn ? 'Kirish' : 'Chiqish'} qayd etildi · $time', '${_isIn ? 'Приход' : 'Уход'} отмечен · $time'),
        ?verdict,
        if (res['outsideGeofence'] == true) context.tr('hududdan tashqarida', 'вне территории'),
      ],
      highlight: late ? AppColors.warn : null,
      nextLabel: context.tr('Keyingi xodim', 'Следующий сотрудник'),
      onNext: _start,
      onStop: _backToSetup,
    );
  }

  Widget _failureView() {
    final f = _failure!;
    final employee = f.employee;
    return _ResultLayout(
      colors: const [Color(0xFFF87171), AppColors.danger],
      pause: _failurePause,
      icon: Icons.close_rounded,
      avatar: employee == null
          ? null
          : MemberAvatar(
              name: employee['fullName']?.toString(),
              photoUrl: ref.read(teamRepositoryProvider).mediaUrl(employee['photoUrl']?.toString()),
              radius: 44,
            ),
      title: f.title,
      subtitle: null,
      lines: [f.message],
      highlight: null,
      nextLabel: context.tr('Qayta urinish', 'Повторить'),
      onNext: _start,
      onStop: _backToSetup,
    );
  }
}

List<Color> _directionColors(bool isIn) => isIn
    ? const [AppColors.headerTop, AppColors.headerBottom]
    : const [Color(0xFFF7C24A), Color(0xFFE08A00)];

class _DirectionPicker extends StatelessWidget {
  const _DirectionPicker({required this.isIn, required this.onChanged});
  final bool isIn;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget option(bool value, IconData icon, String label) {
      final selected = value == isIn;
      final colors = _directionColors(value);
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(vertical: 18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: selected ? LinearGradient(colors: colors) : null,
              color: selected ? null : AppColors.card,
              border: Border.all(color: selected ? Colors.transparent : AppColors.line, width: 1.5),
            ),
            child: Column(
              children: [
                Icon(icon, size: 30, color: selected ? Colors.white : colors.last),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          context.tr('Bu telefon nimani qayd etadi?', 'Что отмечает этот телефон?'),
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            option(true, Icons.login_rounded, context.tr('Kirish', 'Приход')),
            const SizedBox(width: 12),
            option(false, Icons.logout_rounded, context.tr('Chiqish', 'Уход')),
          ],
        ),
      ],
    );
  }
}

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({required this.fix, required this.fence, required this.onRefresh});
  final PreciseFix? fix;
  final Map<String, dynamic>? fence;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final f = fence;
    final inside = f == null || f['inside'] == true;
    final color = f == null ? AppColors.inkMuted : (inside ? AppColors.success : AppColors.warn);
    final title = f == null
        ? context.tr('Hudud belgilanmagan', 'Территория не задана')
        : inside
            ? context.tr('Hudud ichida', 'На территории')
            : context.tr('Hududdan tashqarida · ${f['distanceM']} m', 'Вне территории · ${f['distanceM']} м');
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      child: Row(
        children: [
          Icon(inside ? Icons.verified_rounded : Icons.wrong_location_rounded, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: color, fontWeight: FontWeight.w800)),
                Text(
                  [
                    if ((f?['locationName']?.toString() ?? '').isNotEmpty) f!['locationName'].toString(),
                    if (fix != null) '±${fix!.accuracy.toStringAsFixed(0)} m',
                  ].join(' · '),
                  style: const TextStyle(color: AppColors.inkMuted, fontSize: 12.5),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: context.tr('Joylashuvni yangilash', 'Обновить местоположение'),
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
    );
  }
}

class _MemberRow extends ConsumerWidget {
  const _MemberRow({required this.member});
  final Map<String, dynamic> member;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ready = member['faceReady'] == true;
    final firstIn = formatApiTime(member['firstIn']);
    final lastOut = formatApiTime(member['lastOut']);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          MemberAvatar(
            name: member['fullName']?.toString(),
            photoUrl: ref.read(teamRepositoryProvider).mediaUrl(member['photoUrl']?.toString()),
            radius: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  member['fullName']?.toString() ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  !ready
                      ? context.tr('Rasm yo‘q — tanib bo‘lmaydi', 'Нет фото — не распознать')
                      : firstIn.isEmpty
                          ? context.tr('Bugun hali kelmagan', 'Сегодня ещё не пришёл')
                          : [
                              context.tr('Kirish $firstIn', 'Приход $firstIn'),
                              if (lastOut.isNotEmpty) context.tr('Chiqish $lastOut', 'Уход $lastOut'),
                            ].join(' · '),
                  style: TextStyle(color: ready ? AppColors.inkMuted : AppColors.warn, fontSize: 12.5),
                ),
              ],
            ),
          ),
          if (firstIn.isNotEmpty)
            Icon(
              lastOut.isEmpty ? Icons.login_rounded : Icons.logout_rounded,
              size: 18,
              color: lastOut.isEmpty ? AppColors.success : const Color(0xFFE08A00),
            ),
        ],
      ),
    );
  }
}

class _KioskBanner extends StatelessWidget {
  const _KioskBanner({required this.isIn, required this.marked, required this.onStop});
  final bool isIn;
  final int marked;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final colors = _directionColors(isIn);
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.fromLTRB(16, 10, 6, 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(colors: colors),
      ),
      child: Row(
        children: [
          Icon(isIn ? Icons.login_rounded : Icons.logout_rounded, color: Colors.white, size: 28),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isIn ? context.tr('KIRISH', 'ПРИХОД') : context.tr('CHIQISH', 'УХОД'),
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
                ),
                Text(
                  context.tr('Navbatdagi xodim kameraga qarasin · belgilandi: $marked',
                      'Следующий сотрудник — смотрите в камеру · отмечено: $marked'),
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 12.5),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onStop,
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: Text(context.tr('To‘xtatish', 'Стоп')),
          ),
        ],
      ),
    );
  }
}

class _ResultLayout extends StatelessWidget {
  const _ResultLayout({
    required this.colors,
    required this.pause,
    required this.icon,
    required this.avatar,
    required this.title,
    required this.subtitle,
    required this.lines,
    required this.highlight,
    required this.nextLabel,
    required this.onNext,
    required this.onStop,
  });

  final List<Color> colors;
  final Duration pause;
  final IconData icon;
  final Widget? avatar;
  final String title;
  final String? subtitle;
  final List<String> lines;
  final Color? highlight;
  final String nextLabel;
  final VoidCallback onNext;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.bottomRight,
              children: [
                avatar ??
                    Container(
                      width: 112,
                      height: 112,
                      decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: colors)),
                      child: Icon(icon, color: Colors.white, size: 64),
                    ),
                if (avatar != null)
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(colors: colors),
                      border: Border.all(color: Colors.white, width: 3),
                    ),
                    child: Icon(icon, color: Colors.white, size: 24),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            if (subtitle != null && subtitle!.isNotEmpty)
              Text(subtitle!, style: const TextStyle(color: AppColors.inkMuted)),
            const SizedBox(height: 10),
            for (var i = 0; i < lines.length; i++)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  lines[i],
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: i == 0 ? 16 : 14,
                    height: 1.35,
                    fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w600,
                    color: i == 1 && highlight != null ? highlight : (i == 0 ? AppColors.ink : AppColors.inkMuted),
                  ),
                ),
              ),
            const SizedBox(height: 22),
            SizedBox(
              width: 200,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: pause,
                builder: (_, v, _) => LinearProgressIndicator(
                  value: v,
                  minHeight: 5,
                  color: colors.last,
                  backgroundColor: AppColors.line,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onNext,
              style: FilledButton.styleFrom(backgroundColor: colors.last),
              icon: const Icon(Icons.camera_front_rounded),
              label: Text(nextLabel),
            ),
            TextButton(
              onPressed: onStop,
              child: Text(context.tr('Rejimni to‘xtatish', 'Остановить режим')),
            ),
          ],
        ),
      ),
    );
  }
}
