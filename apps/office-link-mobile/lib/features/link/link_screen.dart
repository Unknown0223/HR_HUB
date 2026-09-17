import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/device/hikvision_client.dart';
import '../../core/security/auth_lock.dart';
import '../../core/session/office_link_session.dart';
import '../../core/session/submit_result.dart';
import '../../core/theme/app_theme.dart';

final appConfigProvider = FutureProvider<AppConfig>((ref) async {
  final raw = await rootBundle.loadString('assets/config.json');
  return AppConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
});

final sessionProvider = Provider<OfficeLinkSession?>((ref) {
  final cfg = ref.watch(appConfigProvider).valueOrNull;
  if (cfg == null) return null;
  return OfficeLinkSession(config: cfg);
});

class LinkScreen extends ConsumerStatefulWidget {
  const LinkScreen({super.key});

  @override
  ConsumerState<LinkScreen> createState() => _LinkScreenState();
}

class _LinkScreenState extends ConsumerState<LinkScreen> {
  final _tokenCtrl = TextEditingController();
  final _ipCtrl = TextEditingController();
  final _pwdCtrl = TextEditingController();

  OfficeLinkSession? _session;
  bool _busy = false;
  bool _obscurePwd = true;
  bool _booted = false;

  String _status = 'Kutilmoqda';
  String _badge = 'KUTILMOQDA';
  Color _badgeFg = LinkColors.muted;
  Color _badgeBg = LinkColors.accentSoft;
  String _deviceLine = 'Qurilma tanlanmagan';
  String _detectLine = '';
  String _alert = '';
  String _note =
      'Sozlash asbobi: 1) Ulash  2) Tarmoqni tiklash. '
      'Tunnel / yuz sync — ofis PC (Windows Link). Link ochiq turishi shart emas.';

  int _tab = 0;

  List<Map<String, dynamic>> _locations = [];
  String? _locationId;

  List<DeviceState> _devices = [];
  String? _selectedHost;
  List<PasswordProbeResult> _probeResults = [];

  final Map<String, String> _reconnectSteps = {
    for (final s in reconnectSteps) s: 'pending',
  };
  final Map<String, String> _reconnectDetails = {};

  Timer? _confirmPoll;
  bool _confirmNotified = false;

  static const _stepTitles = {
    'web': 'Web',
    'scan': 'Skaner',
    'match': 'Moslash',
    'auth': 'Parol',
    'link': 'Ulash',
  };

  @override
  void dispose() {
    _confirmPoll?.cancel();
    _tokenCtrl.dispose();
    _ipCtrl.dispose();
    _pwdCtrl.dispose();
    super.dispose();
  }

  Future<void> _ensureSession() async {
    if (_session != null) return;
    final cfg = await ref.read(appConfigProvider.future);
    _session = OfficeLinkSession(config: cfg);
    await _session!.loadPersisted();
    _tokenCtrl.text = _session!.pairingToken ?? '';
    _locationId = _session!.locationId;
    if (_session!.host.isNotEmpty) {
      _ipCtrl.text = _session!.host;
      _selectedHost = _session!.host;
    }
  }

  Future<void> _bootstrap() async {
    if (_booted) return;
    _booted = true;
    await _ensureSession();
    if ((_session!.pairingToken ?? '').isNotEmpty) {
      await _bindAndLoadLocations(showAlert: false);
      await _maybeResumeConfirmPoll();
    }
    if (mounted) setState(() {});
  }

  void _setBadge(String text, {required String tone}) {
    switch (tone) {
      case 'ok':
        _badgeFg = LinkColors.ok;
        _badgeBg = LinkColors.okBg;
      case 'warn':
        _badgeFg = LinkColors.warn;
        _badgeBg = LinkColors.warnBg;
      case 'danger':
        _badgeFg = LinkColors.danger;
        _badgeBg = LinkColors.dangerBg;
      default:
        _badgeFg = LinkColors.muted;
        _badgeBg = LinkColors.accentSoft;
    }
    _badge = text;
  }

  void _applyDeviceSelection(DeviceState state) {
    _selectedHost = state.host;
    _ipCtrl.text = state.host;
    _deviceLine =
        'Qurilma: ${state.name.isEmpty ? '—' : state.name}  ${state.host}';
    _detectLine = 'Aniqlangan holat: ${state.label}';
  }

  Future<void> _onPickDevice(String? host) async {
    if (host == null || _session == null) return;
    final picked = await _session!.selectScannedHost(host);
    if (!mounted) return;
    setState(() {
      _selectedHost = host;
      _ipCtrl.text = host;
      if (picked != null) {
        _applyDeviceSelection(picked);
        _alert = picked.state == 'configured'
            ? 'Admin bor — joriy admin parolini kiriting'
            : (picked.state == 'new'
                ? 'Yangi qurilma — avval terminalda admin yarating'
                : 'Qurilma tanlandi');
      }
    });
  }

  Future<void> _saveToken() async {
    await _ensureSession();
    await _session!.setPairingToken(_tokenCtrl.text);
    setState(() => _alert = 'Token saqlandi. Sessiya bog‘lanmoqda…');
    await _bindAndLoadLocations(showAlert: true);
  }

  Future<void> _bindAndLoadLocations({required bool showAlert}) async {
    await _ensureSession();
    final bind = await _session!.bindPairingSession();
    if (!bind.ok) {
      setState(() {
        _alert = bind.message;
        _setBadge('TOKEN', tone: 'danger');
      });
      return;
    }
    final locs = await _session!.fetchLocations();
    setState(() {
      _locations = locs.locations;
      if (_locationId == null ||
          !_locations.any((l) => '${l['id']}' == _locationId)) {
        _locationId = _locations.isNotEmpty ? '${_locations.first['id']}' : null;
      }
      if (_locationId != null) {
        _session!.setLocationId(_locationId);
      }
      if (showAlert) {
        _alert = locs.ok
            ? 'Pairing sessiya bog‘landi. Lokatsiyalar: ${_locations.length}'
            : locs.message;
      }
      _setBadge('ONLINE', tone: 'ok');
      _status = 'Tayyor';
    });
  }

  Future<void> _scan() async {
    await _ensureSession();
    final ip = _ipCtrl.text.trim();
    setState(() {
      _busy = true;
      _status = 'Qidirilmoqda…';
      _setBadge('QIDIRILMOQDA', tone: 'warn');
      _probeResults = [];
      _alert = ip.isEmpty
          ? 'Wi‑Fi tarmog‘ida terminal qidirilmoqda…'
          : 'Tekshirilmoqda: $ip';
    });
    try {
      final list = await _session!.scanLan(
        ipHint: ip.isEmpty ? null : ip,
        onProgress: (m) {
          if (mounted) {
            setState(() => _status = m.length > 120 ? m.substring(0, 120) : m);
          }
        },
      );
      if (!mounted) return;
      setState(() => _devices = list);
      if (list.isEmpty) {
        final phoneIp = await _session!.discovery.wifiIp();
        final subnetHint = (phoneIp != null &&
                ip.isNotEmpty &&
                validIp(ip) &&
                !sameSubnet(phoneIp, ip))
            ? '\nTelefon Wi‑Fi: $phoneIp — qurilma boshqa tarmoqda.'
            : (phoneIp != null
                ? '\nTelefon Wi‑Fi: $phoneIp'
                : '\nTelefon Wi‑Fi IP o‘qilmadi.');
        setState(() {
          _selectedHost = null;
          _detectLine = 'Aniqlangan holat: —';
          _deviceLine = ip.isEmpty
              ? 'Qurilma: topilmadi — ofis Wi‑Fi ga ulang'
              : 'Qurilma: $ip javob bermadi';
          _status = 'Qurilma topilmadi';
          _setBadge('OFFLINE', tone: 'danger');
          _alert =
              'Terminal topilmadi. PC topadi, telefon topmasa — odatda boshqa Wi‑Fi / mehmon tarmoq / client isolation.$subnetHint';
        });
        return;
      }
      if (list.length == 1) {
        _applyDeviceSelection(list.first);
        setState(() {
          _status = 'Qurilma topildi';
          _setBadge('ONLINE', tone: 'ok');
          _alert = list.first.state == 'configured'
              ? 'Admin bor — joriy admin parolini kiriting'
              : (list.first.state == 'new'
                  ? 'Yangi qurilma — avval terminalda admin yarating, keyin qayta qidiring'
                  : 'Qurilma topildi');
        });
      } else {
        setState(() {
          _selectedHost = null;
          _detectLine = 'Topildi: ${list.length} ta terminal — ro‘yxatdan tanlang';
          _deviceLine = 'Qurilma: tanlanmagan';
          _status = 'Bir nechta qurilma';
          _setBadge('TANLANG', tone: 'warn');
          _alert =
              '${list.length} ta terminal topildi. Ro‘yxatdan keraklisini tanlang '
              'yoki parol + «Hammada tekshir».';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _probePasswordOnLan() async {
    await _ensureSession();
    final pwd = _pwdCtrl.text.trim();
    if (pwd.isEmpty) {
      setState(() {
        _alert = 'Avval admin parolini kiriting';
        _setBadge('PAROL', tone: 'warn');
      });
      return;
    }
    if (_session!.scannedDevices.isEmpty && _devices.isEmpty) {
      setState(() => _alert = 'Avval Qidirishni bosing');
      return;
    }
    setState(() {
      _busy = true;
      _status = 'Parol tekshirilmoqda…';
      _setBadge('TEKSHIRUV', tone: 'warn');
    });
    try {
      final picked = await _session!.pickPasswordMatch(
        pwd,
        hostHint: _ipCtrl.text.trim().isEmpty ? null : _ipCtrl.text.trim(),
        devices: _devices.isNotEmpty ? _devices : null,
        onStatus: (m) {
          if (mounted) setState(() => _status = m);
        },
      );
      if (!mounted) return;
      setState(() {
        _probeResults = picked.results;
        _devices = _session!.scannedDevices.isNotEmpty
            ? _session!.scannedDevices
            : _devices;
      });
      switch (picked.reason) {
        case 'ok':
          final m = picked.match!;
          setState(() {
            _selectedHost = m.host;
            _ipCtrl.text = m.host;
            _deviceLine =
                'Qurilma: ${m.name.isEmpty ? '—' : m.name}  ${m.host}';
            _status = 'Parol mos keldi';
            _setBadge('ONLINE', tone: 'ok');
            _alert = 'Bitta terminalda parol OK — tanlandi: ${m.host}';
          });
        case 'need_pick':
          setState(() {
            _selectedHost = null;
            _status = 'Bir nechta mos keldi';
            _setBadge('TANLANG', tone: 'warn');
            _alert =
                'Parol ${picked.results.where((r) => r.ok).length} ta terminalda OK. '
                'Ro‘yxatdan keraklisini tanlang.';
          });
        case 'none':
          setState(() {
            _status = 'Parol mos kelmadi';
            _setBadge('PAROL', tone: 'danger');
            _alert = 'Hech bir topilgan terminalda parol noto‘g‘ri.';
          });
        case 'empty':
          setState(() => _alert = 'Parol bo‘sh');
        case 'no_devices':
          setState(() => _alert = 'Avval Qidirishni bosing');
        default:
          setState(() => _alert = 'Tekshiruv yakunlanmadi');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ulash() async {
    await _ensureSession();
    if (_busy) return;
    final loc = _locationId ?? '';
    if (loc.isEmpty) {
      setState(() {
        _alert = 'Lokatsiya tanlanmagan';
        _setBadge('LOKATSIYA', tone: 'warn');
      });
      return;
    }
    if (_session!.host.isEmpty) {
      setState(() => _alert = 'Avval IP qidiring yoki ro‘yxatdan tanlang');
      return;
    }
    final pwd = _pwdCtrl.text.trim();
    if (pwd.isEmpty) {
      setState(() {
        _alert = 'Hozirgi admin parolini kiriting';
        _setBadge('PAROL', tone: 'warn');
      });
      return;
    }
    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ulashni tasdiqlaysizmi?'),
        content: Text(
          'IP: ${_session!.host}\n'
          'Lokatsiya: ${_locationLabel()}\n'
          'Tiklanish: ${_session!.config.recoveryEmail}\n\n'
          'Parol terminalda almashtiriladi va Webga yuboriladi.\n'
          'Yuz sinxroni uchun ofisda PC HR HUB Link (tunnel) ishlashi kerak.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Bekor')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Ulash')),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;

    setState(() {
      _busy = true;
      _status = 'Ulanmoqda…';
      _setBadge('ULANMOQDA', tone: 'warn');
      _alert = '';
    });

    try {
      final result = await _session!.ulash(
        currentPassword: pwd,
        onStatus: (m) {
          if (mounted) {
            setState(() => _status = m.length > 120 ? m.substring(0, 120) : m);
          }
        },
      );
      if (!mounted) return;
      _handleUlashResult(result);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _locationLabel() {
    for (final l in _locations) {
      if ('${l['id']}' == _locationId) {
        final name = '${l['name'] ?? ''}';
        final idFull = '${l['id']}';
        final id = idFull.length <= 8 ? idFull : idFull.substring(0, 8);
        return '$name ($id…)';
      }
    }
    return _locationId ?? '—';
  }

  void _handleUlashResult(SubmitResult result) {
    if (result.kind == AuthLock.confirm) {
      setState(() {
        _status = 'Parol noto‘g‘ri';
        _setBadge('PAROL', tone: 'danger');
        _alert = 'Parol noto‘g‘ri. Qayta kiriting (avtomatik qayta urinish yo‘q).';
        _pwdCtrl.clear();
      });
      return;
    }
    if (result.kind == AuthLock.locked) {
      setState(() {
        _status = 'Qulflangan';
        _setBadge('QULFLANGAN', tone: 'danger');
        _alert = '2 marta xato — ${_session!.auth.formatRemaining()} kutilsin';
      });
      return;
    }
    if (result.kind == 'linked') {
      final needs = result.device['needsAdminConfirm'] == true;
      setState(() {
        _pwdCtrl.clear();
        _status = needs ? 'Web tasdiq kutilmoqda' : 'Ulandi';
        _setBadge(needs ? 'TASDIQ' : 'ULANDI', tone: needs ? 'warn' : 'ok');
        _deviceLine =
            'Qurilma: ${result.device['name'] ?? ''}  ${result.device['host'] ?? ''}'
                .trim();
        _alert = needs
            ? 'Parol terminalga o‘rnatildi va serverga yuborildi. Web → «Подтвердить привязку».'
            : 'Ulanish mustahkamlandi.';
        _note = needs
            ? 'Keyingi qadam: Webda «Подтвердить привязку». Yuzlar: Web sync + PC tunnel.'
            : 'Ulandi. Yangi parolni Web → Устройства sahifasida ko‘ring.';
      });
      if (needs) {
        _startConfirmPoll();
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Tasdiq kutilmoqda'),
            content: const Text(
              'Parol qurilmaga o‘rnatildi va Webga yuborildi.\n\n'
              'Tenant admin Webda «Подтвердить привязку» ni bosishi kerak.',
            ),
            actions: [
              FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
            ],
          ),
        );
      }
      return;
    }
    setState(() {
      _status = result.message.isEmpty ? 'Xato' : result.message;
      _setBadge('XATO', tone: 'danger');
      _alert = result.message;
    });
  }

  void _startConfirmPoll() {
    _confirmPoll?.cancel();
    _confirmNotified = false;
    _confirmPoll = Timer(const Duration(milliseconds: 1500), _pollConfirmOnce);
  }

  Future<void> _pollConfirmOnce() async {
    if (!mounted || _session == null) return;
    final res = await _session!.fetchProvisionStatus();
    if (!mounted) return;
    if (_confirmNotified) return;
    final info = res.info;
    final sealed = res.ok && info['sealed'] == true;
    final pending = res.ok && info['pendingAdminConfirm'] == true;
    if (sealed || (res.ok && !pending && info['status'] == 'linked')) {
      _confirmNotified = true;
      _confirmPoll?.cancel();
      setState(() {
        _status = 'Ulanish mustahkamlandi';
        _setBadge('ULANDI', tone: 'ok');
        _alert =
            'Web tasdiqlandi. Otmetkalar → web. Yuzlar — Web «Синхронизировать» + ofis PC tunnel.';
        _note = 'Sozlash tugadi. Ilovani yopishingiz mumkin.';
      });
      return;
    }
    _confirmPoll = Timer(const Duration(seconds: 3), _pollConfirmOnce);
  }

  Future<void> _maybeResumeConfirmPoll() async {
    if (_session == null) return;
    final res = await _session!.fetchProvisionStatus();
    if (!res.ok) return;
    final info = res.info;
    if (info['sealed'] == true ||
        (info['status'] == 'linked' && info['pendingAdminConfirm'] != true)) {
      setState(() {
        _status = 'Ulanish mustahkamlandi';
        _setBadge('ULANDI', tone: 'ok');
      });
      return;
    }
    if (info['pendingAdminConfirm'] == true ||
        info['step'] == 'awaiting_admin_confirm') {
      setState(() {
        _status = 'Web tasdiq kutilmoqda';
        _setBadge('TASDIQ', tone: 'warn');
        _alert = 'Web → Устройства → «Подтвердить привязку». Ilova kuzatmoqda…';
      });
      _startConfirmPoll();
    }
  }

  void _onReconnectStep(String id, String state, [String detail = '']) {
    if (!mounted) return;
    setState(() {
      _reconnectSteps[id] = state;
      if (detail.isNotEmpty) _reconnectDetails[id] = detail;
      if (detail.isNotEmpty) {
        _status = detail.length > 120 ? detail.substring(0, 120) : detail;
      }
    });
  }

  Future<void> _reconnect() async {
    await _ensureSession();
    if (_busy) return;
    setState(() {
      _busy = true;
      _status = 'Tarmoq qayta ulanmoqda…';
      _setBadge('ULANMOQDA', tone: 'warn');
      for (final s in reconnectSteps) {
        _reconnectSteps[s] = 'pending';
        _reconnectDetails.remove(s);
      }
    });
    try {
      final result = await _session!.reconnectNetwork(
        password: _pwdCtrl.text,
        ipHint: _ipCtrl.text.trim().isEmpty ? null : _ipCtrl.text.trim(),
        onStatus: (m) {
          if (mounted) setState(() => _status = m);
        },
        onStep: _onReconnectStep,
      );
      if (!mounted) return;
      if (result.kind == 'need_pick') {
        final matches = (result.device['matches'] as List?) ?? [];
        final asDevices = <DeviceState>[];
        for (final raw in matches) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          asDevices.add(
            DeviceState(
              state: 'configured',
              label: 'Admin bor',
              host: '${m['host'] ?? ''}',
              port: int.tryParse('${m['port'] ?? 80}') ?? 80,
              name: '${m['name'] ?? ''}',
              serialNumber: '${m['serialNumber'] ?? ''}',
            ),
          );
        }
        setState(() {
          _devices = asDevices;
          _selectedHost = null;
          _status = 'Tanlash kerak';
          _setBadge('TANLANG', tone: 'warn');
          _alert = result.message;
          _tab = 1;
        });
        return;
      }
      if (result.kind == 'linked') {
        final host = '${result.device['host'] ?? _session!.host}';
        setState(() {
          if (host.isNotEmpty) {
            _ipCtrl.text = host;
            _selectedHost = host;
            _deviceLine = 'Qurilma: ${result.device['name'] ?? ''}  $host'.trim();
          }
          _status = 'Tarmoq yangilandi';
          _setBadge('YANGILANDI', tone: 'ok');
          _alert =
              'Host yangilandi; otmetkalar → web. Tunnel/yuz sync — ofis PC Windows Link.';
          _note = 'Sozlash OK. Yuz sync faqat Web + ofis PC.';
        });
      } else {
        setState(() {
          _status = result.message;
          _setBadge('XATO', tone: 'danger');
          _alert = result.message;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showSavedCredential() async {
    await _ensureSession();
    final data = await _session!.store.readDeviceCredential();
    final text = await _session!.store.formatCredentialForDisplay(data);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Saqlangan terminal paroli'),
        content: SelectableText(text),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  Widget _devicePicker() {
    if (_devices.length < 2) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 14),
        const Text('Topilgan terminallar', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          key: ValueKey('dev-${_devices.length}-$_selectedHost'),
          initialValue: _devices.any((d) => d.host == _selectedHost) ? _selectedHost : null,
          items: _devices
              .map(
                (d) => DropdownMenuItem(
                  value: d.host,
                  child: Text(
                    '${d.name.isEmpty ? d.host : d.name} · ${d.host}'
                    '${d.serialNumber.isNotEmpty ? ' · ${d.serialNumber}' : ''}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: _busy ? null : _onPickDevice,
          decoration: const InputDecoration(hintText: 'Tanlang…'),
        ),
        if (_probeResults.isNotEmpty) ...[
          const SizedBox(height: 8),
          ..._probeResults.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                r.label(),
                style: TextStyle(
                  fontSize: 12,
                  color: r.ok ? LinkColors.ok : LinkColors.danger,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _reconnectStepStrip() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: reconnectSteps.map((id) {
        final state = _reconnectSteps[id] ?? 'pending';
        Color bg;
        Color fg;
        switch (state) {
          case 'done':
            bg = LinkColors.okBg;
            fg = LinkColors.ok;
          case 'active':
            bg = LinkColors.accentSoft;
            fg = LinkColors.accent;
          case 'fail':
            bg = LinkColors.dangerBg;
            fg = LinkColors.danger;
          default:
            bg = const Color(0xFFF3F4F6);
            fg = LinkColors.muted;
        }
        final detail = _reconnectDetails[id] ?? '';
        return Tooltip(
          message: detail.isEmpty ? _stepTitles[id]! : detail,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              _stepTitles[id]!,
              style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _ipPasswordBlock({required bool showProbe}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('IP manzil (ixtiyoriy)', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _ipCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  hintText: 'Bo‘sh — avto qidiruv',
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: _busy ? null : _scan,
              child: const Text('Qidirish'),
            ),
          ],
        ),
        _devicePicker(),
        const SizedBox(height: 14),
        const Text(
          'Admin paroli',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _pwdCtrl,
                obscureText: _obscurePwd,
                decoration: const InputDecoration(hintText: '8–16 belgi'),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () => setState(() => _obscurePwd = !_obscurePwd),
              child: Text(_obscurePwd ? 'Ko‘rsat' : 'Yashir'),
            ),
          ],
        ),
        if (showProbe) ...[
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _busy ? null : _probePasswordOnLan,
            child: const Text('Hammada tekshir'),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final cfgAsync = ref.watch(appConfigProvider);
    return cfgAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Config xato: $e'))),
      data: (cfg) {
        if (!_booted) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
        }
        return Scaffold(
          appBar: AppBar(
            title: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('HR HUB Link', style: TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  'Ofis Face ID terminalini platformaga ulash',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
                ),
              ],
            ),
            actions: [
              PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'cred') _showSavedCredential();
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'cred',
                    child: Text('Saqlangan terminal parolini ko‘rsat'),
                  ),
                ],
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Center(child: Text('Admin')),
                ),
              ),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.link), label: '1. Ulash'),
              NavigationDestination(
                icon: Icon(Icons.wifi_protected_setup),
                label: '2. Tiklash',
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              _card(
                title: 'Holat',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(_status, style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _badgeBg,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _badge,
                            style: TextStyle(
                              color: _badgeFg,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(_deviceLine, style: const TextStyle(color: LinkColors.muted)),
                    if (_detectLine.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(_detectLine, style: const TextStyle(color: LinkColors.muted)),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      'Tenant: ${cfg.tenantCode} · API: ${cfg.apiUrl.replaceFirst('https://', '')}',
                      style: const TextStyle(fontSize: 11, color: LinkColors.muted),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _note,
                      style: const TextStyle(fontSize: 12, color: LinkColors.muted),
                    ),
                  ],
                ),
              ),
              if (_tab == 0) ...[
                _card(
                  title: '1. Qurilmani serverga ulash',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Pairing token', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _tokenCtrl,
                              obscureText: true,
                              decoration: const InputDecoration(hintText: 'Webdan token'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _busy
                                ? null
                                : () async {
                                    final data = await Clipboard.getData('text/plain');
                                    if (data?.text != null) {
                                      _tokenCtrl.text = data!.text!.trim();
                                      setState(() {});
                                    }
                                  },
                            child: const Text('Joylashtir'),
                          ),
                          const SizedBox(width: 6),
                          FilledButton(
                            onPressed: _busy ? null : _saveToken,
                            child: const Text('Saqlash'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      _ipPasswordBlock(showProbe: true),
                      const SizedBox(height: 14),
                      const Text('Lokatsiya', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              key: ValueKey('loc-${_locations.length}-$_locationId'),
                              initialValue: _locations.any((l) => '${l['id']}' == _locationId)
                                  ? _locationId
                                  : null,
                              items: _locations
                                  .map(
                                    (l) => DropdownMenuItem(
                                      value: '${l['id']}',
                                      child: Text(
                                        '${l['name'] ?? l['id']}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(),
                              onChanged: _busy
                                  ? null
                                  : (v) async {
                                      setState(() => _locationId = v);
                                      await _session?.setLocationId(v);
                                    },
                              decoration: const InputDecoration(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _busy
                                ? null
                                : () => _bindAndLoadLocations(showAlert: true),
                            child: const Text('Yangilash'),
                          ),
                        ],
                      ),
                      if (_alert.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _alertBox(_alert),
                      ],
                    ],
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: FilledButton(
                    onPressed: _busy ? null : _ulash,
                    child: Text(_busy ? 'Kuting…' : 'Ulash'),
                  ),
                ),
              ],
              if (_tab == 1) ...[
                _card(
                  title: 'A) Tarmoq / IP',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Wi‑Fi yoki IP o‘zgarganda qurilmani serverga qayta bog‘laydi. '
                        'Parol aylantirilmaydi.',
                        style: TextStyle(fontSize: 13, color: LinkColors.muted),
                      ),
                      const SizedBox(height: 12),
                      _ipPasswordBlock(showProbe: true),
                      const SizedBox(height: 12),
                      _reconnectStepStrip(),
                      if (_alert.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _alertBox(_alert),
                      ],
                      const SizedBox(height: 14),
                      FilledButton(
                        onPressed: _busy ? null : _reconnect,
                        child: Text(_busy ? 'Kuting…' : 'Tarmoqni qayta ulash'),
                      ),
                    ],
                  ),
                ),
                _card(
                  title: 'B) Tunnel',
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Android telefon lokal shlyuz (:8800) va Cloudflare tunnel ochmaydi.',
                        style: TextStyle(fontSize: 13, color: LinkColors.muted),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Tunnel tiklash — ofis PCdagi Windows HR HUB Link → '
                        '«2. Восстановление» → «Восстановить туннель».',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Yuz sync: Web «Синхронизировать» → ofis PC tunnel → terminal.',
                        style: TextStyle(fontSize: 12, color: LinkColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _alertBox(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: LinkColors.warnBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE8D48B)),
      ),
      child: Text(text),
    );
  }

  Widget _card({required String title, required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: LinkColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: LinkColors.border),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: LinkColors.text,
            ),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
