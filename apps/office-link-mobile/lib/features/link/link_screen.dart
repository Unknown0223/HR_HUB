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
      'Faqat sozlash: pairing token + Ulash / tarmoqni tiklash. Yuz sync — faqat Web; bu ilova qatnashmaydi.';

  List<Map<String, dynamic>> _locations = [];
  String? _locationId;

  Timer? _confirmPoll;
  bool _confirmNotified = false;

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
      _alert = ip.isEmpty
          ? 'Wi‑Fi tarmog‘ida terminal qidirilmoqda…'
          : 'Tekshirilmoqda: $ip';
    });
    try {
      final list = await _session!.scanLan(
        ipHint: ip.isEmpty ? null : ip,
        onProgress: (m) {
          if (mounted) setState(() => _status = m.length > 120 ? m.substring(0, 120) : m);
        },
      );
      if (!mounted) return;
      if (list.isEmpty) {
        final phoneIp = await _session!.discovery.wifiIp();
        final subnetHint = (phoneIp != null &&
                ip.isNotEmpty &&
                validIp(ip) &&
                !sameSubnet(phoneIp, ip))
            ? '\nTelefon Wi‑Fi: $phoneIp — qurilma boshqa tarmoqda.'
            : (phoneIp != null ? '\nTelefon Wi‑Fi: $phoneIp' : '\nTelefon Wi‑Fi IP o‘qilmadi.');
        setState(() {
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
      final state = list.first;
      _ipCtrl.text = state.host;
      setState(() {
        _detectLine =
            'Aniqlangan holat: ${state.label}${list.length > 1 ? ' (+${list.length - 1} ta)' : ''}';
        _deviceLine =
            'Qurilma: ${state.name.isEmpty ? '—' : state.name}  ${state.host}';
        _status = 'Qurilma topildi';
        _setBadge('ONLINE', tone: 'ok');
        _alert = state.state == 'configured'
            ? 'Admin bor — joriy admin parolini kiriting'
            : (state.state == 'new'
                ? 'Yangi qurilma — avval terminalda admin yarating, keyin qayta qidiring'
                : 'Qurilma topildi');
      });
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
      setState(() => _alert = 'Avval IP qidiring');
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
          'Yuz sinxroni uchun ofisda PC HR HUB Link ochiq tursin.',
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
          if (mounted) setState(() => _status = m.length > 120 ? m.substring(0, 120) : m);
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
        _status = 'Qulflangan ${result.remaining > 0 ? '' : _session!.auth.formatRemaining()}';
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
            'Qurilma: ${result.device['name'] ?? ''}  ${result.device['host'] ?? ''}'.trim();
        _alert = needs
            ? 'Parol terminalga o‘rnatildi va serverga yuborildi. Web → bildirishnoma / Устройства → «Подтвердить привязку».'
            : 'Ulanish mustahkamlandi.';
        _note = needs
            ? 'Keyingi qadam: Webda «Подтвердить привязку». Keyin yuzlar: Web sync + PC GW+tunnel.'
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
              'Tenant admin Webda «Подтвердить привязку» ni bosishi kerak.\n'
              'Tasdiqdan keyin shu ekranda «Ulandi» chiqadi.',
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
            'Web tasdiqlandi. Otmetkalar → web. Yuzlar faqat Web «Синхронизировать» (bu ilova kerak emas)${info['deviceName'] != null ? ' (${info['deviceName']})' : ''}.';
        _note =
            'Sozlash tugadi. Ilovani yopishingiz mumkin. Yuz sync — Webda.';
      });
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Tasdiqlandi'),
            content: const Text(
              'Web admin ulanishni tasdiqladi.\n\n'
              'Otmetkalar terminaldan webga. Yuzlar — faqat Web «Синхронизировать». '
              'Bu sozlash ilovasini yopishingiz mumkin.',
            ),
            actions: [
              FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
            ],
          ),
        );
      }
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

  Future<void> _reconnect() async {
    await _ensureSession();
    if (_busy) return;
    setState(() {
      _busy = true;
      _status = 'Tarmoq qayta ulanmoqda…';
      _setBadge('ULANMOQDA', tone: 'warn');
    });
    try {
      final result = await _session!.reconnectNetwork(
        password: _pwdCtrl.text,
        onStatus: (m) {
          if (mounted) setState(() => _status = m);
        },
      );
      if (!mounted) return;
      if (result.kind == 'linked') {
        setState(() {
          _status = 'Tarmoq yangilandi';
          _setBadge('YANGILANDI', tone: 'ok');
          _alert = 'Host yangilandi; otmetkalar → web.';
          _note =
              'Sozlash OK. Yuz sync faqat Webda — bu ilova kerak emas.';
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
                  ],
                ),
              ),
              _card(
                title: 'Ulanish sozlamalari',
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
                    const Text('IP manzil (ixtiyoriy)', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _ipCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              hintText: 'Bo‘sh qoldiring — avto qidiruv',
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
                    const SizedBox(height: 14),
                    const Text(
                      'Hozirgi admin paroli (bir marta)',
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
                    if (_alert.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: LinkColors.warnBg,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFE8D48B)),
                        ),
                        child: Text(_alert),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Text(
                      _note,
                      style: const TextStyle(fontSize: 12, color: LinkColors.muted),
                    ),
                  ],
                ),
              ),
              Row(
                children: [
                  TextButton(
                    onPressed: _busy ? null : _reconnect,
                    child: const Text('Tarmoqni qayta ulash'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _busy ? null : _ulash,
                    child: Text(_busy ? 'Kuting…' : 'Ulash'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
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
