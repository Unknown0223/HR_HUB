import '../api/office_link_api.dart';
import '../config/app_config.dart';
import '../device/device_harden.dart';
import '../device/hikvision_client.dart';
import '../device/lan_discovery.dart';
import '../provision/provision_engine.dart';
import '../security/auth_lock.dart';
import '../storage/credential_store.dart';
import '../tunnel/cloudflared_tunnel.dart';
import 'submit_result.dart';

typedef StatusFn = void Function(String message);
typedef StepFn = void Function(String stepId, String state, [String detail]);

const reconnectSteps = ['web', 'scan', 'match', 'auth', 'link'];

class PasswordProbeResult {
  const PasswordProbeResult({
    required this.host,
    this.port = 80,
    required this.ok,
    this.kind = '',
    this.serialNumber = '',
    this.name = '',
    this.model = '',
    this.detail = '',
  });

  final String host;
  final int port;
  final bool ok;
  final String kind;
  final String serialNumber;
  final String name;
  final String model;
  final String detail;

  String label() {
    final mark = ok ? '✓' : '✗';
    final title = name.isNotEmpty ? name : host;
    final sn = serialNumber.isNotEmpty ? ' · $serialNumber' : '';
    return '$mark $title ($host)$sn';
  }
}

class ReconnectMatch {
  const ReconnectMatch({
    required this.lan,
    required this.web,
    required this.password,
    required this.username,
    required this.serial,
    required this.passwordSource,
    required this.hostChanged,
  });

  final DeviceState lan;
  final Map<String, dynamic> web;
  final String password;
  final String username;
  final String serial;
  final String passwordSource;
  final bool hostChanged;
}

class OfficeLinkSession {
  OfficeLinkSession({
    required this.config,
    CredentialStore? store,
    HikvisionClient? device,
    OfficeLinkApi? api,
    AuthLock? auth,
    LanDiscovery? discovery,
    CloudflaredTunnel? tunnel,
  })  : store = store ?? CredentialStore(),
        device = device ?? HikvisionClient(),
        api = api ?? OfficeLinkApi(apiUrl: config.apiUrl),
        auth = auth ?? AuthLock(),
        tunnel = tunnel ?? CloudflaredTunnel() {
    harden = DeviceHarden(this.device);
    this.discovery = discovery ?? LanDiscovery(client: this.device);
    engine = ProvisionEngine(
      config: config,
      api: this.api,
      store: this.store,
      device: this.device,
      harden: harden,
      auth: this.auth,
    );
  }

  AppConfig config;
  final CredentialStore store;
  final HikvisionClient device;
  final OfficeLinkApi api;
  final AuthLock auth;
  final CloudflaredTunnel tunnel;
  late final DeviceHarden harden;
  late final LanDiscovery discovery;
  late final ProvisionEngine engine;

  String? pairingToken;
  String? linkKey;
  String? sessionId;
  String? locationId;

  String host = '';
  int port = 80;
  String username = 'admin';
  DeviceState? detected;
  List<DeviceState> scannedDevices = [];

  Future<void> loadPersisted() async {
    pairingToken = await store.pairingToken();
    linkKey = await store.linkKey();
    sessionId = await store.sessionId();
    locationId = await store.locationId();
    await tunnel.loadPersisted();
    final cred = await store.readDeviceCredential();
    if (cred != null) {
      final h = '${cred['host'] ?? ''}'.trim();
      if (h.isNotEmpty && host.isEmpty) {
        host = h;
        port = int.tryParse('${cred['port'] ?? 80}') ?? 80;
        username = '${cred['username'] ?? 'admin'}'.trim().isEmpty
            ? 'admin'
            : '${cred['username'] ?? 'admin'}'.trim();
      }
    }
  }

  Future<void> setPairingToken(String token) async {
    pairingToken = token.trim();
    await store.setPairingToken(pairingToken);
  }

  Future<void> setLocationId(String? id) async {
    locationId = (id ?? '').trim();
    await store.setLocationId(locationId);
  }

  bool get hasCredentials =>
      (pairingToken ?? '').trim().isNotEmpty || (linkKey ?? '').trim().isNotEmpty;

  Future<({bool ok, String message})> bindPairingSession() async {
    final token = (pairingToken ?? '').trim();
    if (token.isEmpty) return (ok: false, message: 'Pairing token yo‘q.');
    final res = await api.createSession(
      tenant: config.tenantCode,
      pairingToken: token,
      linkKey: linkKey,
      host: host.isEmpty ? null : host,
      serial: detected?.serialNumber,
    );
    if (!api.isSuccess(res.status) || res.data is! Map) {
      final msg = res.data is Map
          ? '${(res.data as Map)['message'] ?? (res.data as Map)['error'] ?? ''}'
          : '';
      return (ok: false, message: msg.isEmpty ? 'Pairing sessiya xato (HTTP ${res.status})' : msg);
    }
    final data = Map<String, dynamic>.from(res.data as Map);
    final sid = '${data['sessionId'] ?? ''}'.trim();
    if (sid.isNotEmpty) {
      sessionId = sid;
      await store.setSessionId(sid);
    }
    final key = '${data['linkKey'] ?? ''}'.trim();
    if (key.isNotEmpty) {
      linkKey = key;
      await store.setLinkKey(key);
    }
    return (ok: true, message: 'OK');
  }

  Future<({bool ok, List<Map<String, dynamic>> locations, String message})>
      fetchLocations() async {
    if (!hasCredentials) {
      return (ok: false, locations: <Map<String, dynamic>>[], message: 'Token yoki kalit kerak');
    }
    final res = await api.listLocations(
      tenant: config.tenantCode,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
    if (!api.isSuccess(res.status)) {
      return (
        ok: false,
        locations: <Map<String, dynamic>>[],
        message: 'Lokatsiyalar xato (HTTP ${res.status})',
      );
    }
    return (
      ok: true,
      locations: OfficeLinkApi.parseLocations(res.data),
      message: 'OK',
    );
  }

  Future<DeviceState> scanHost(String ip, {int port = 80}) async {
    host = ip.trim();
    this.port = port;
    detected = await device.detectState(host, port: port);
    scannedDevices = [detected!];
    return detected!;
  }

  /// Auto LAN scan (Windows «Qidirish» parity).
  /// Exactly one device → auto-select; many → leave host empty until pick.
  Future<List<DeviceState>> scanLan({
    String? ipHint,
    int port = 80,
    void Function(String message)? onProgress,
  }) async {
    final list = await discovery.scan(
      ipHint: ipHint,
      port: port,
      onProgress: onProgress,
    );
    scannedDevices = List<DeviceState>.from(list);
    if (list.length == 1) {
      detected = list.first;
      host = detected!.host;
      this.port = detected!.port;
    } else if (list.isEmpty) {
      detected = null;
      // keep previous host if operator typed one
    } else {
      detected = null;
      host = '';
    }
    return list;
  }

  Future<DeviceState?> selectScannedHost(String ip, {int port = 80}) async {
    final hostN = ip.trim();
    final portN = port;
    for (final d in scannedDevices) {
      if (d.host == hostN && d.port == portN) {
        detected = d;
        host = d.host;
        this.port = d.port;
        return d;
      }
    }
    if (hostN.isNotEmpty && validIp(hostN)) {
      return scanHost(hostN, port: portN);
    }
    return null;
  }

  Future<List<PasswordProbeResult>> matchPasswordOnLan(
    String password, {
    List<DeviceState>? devices,
    String? username,
    StatusFn? onStatus,
  }) async {
    final pwd = password.trim();
    final user = (username ?? this.username).trim().isEmpty
        ? 'admin'
        : (username ?? this.username).trim();
    var targets = List<DeviceState>.from(devices ?? scannedDevices);
    if (targets.isEmpty && detected != null) {
      targets = [detected!];
    }
    final out = <PasswordProbeResult>[];
    if (pwd.isEmpty) {
      for (final d in targets) {
        out.add(
          PasswordProbeResult(
            host: d.host,
            port: d.port,
            ok: false,
            kind: 'empty',
            detail: 'no password',
            name: d.name,
          ),
        );
      }
      return out;
    }
    for (final d in targets) {
      onStatus?.call('Parol tekshiruvi: ${d.host}…');
      final result = await device.verifyPassword(
        host: d.host,
        port: d.port,
        username: user,
        password: pwd,
      );
      out.add(
        PasswordProbeResult(
          host: d.host,
          port: d.port,
          ok: result.kind == kOk,
          kind: result.kind,
          serialNumber: result.serialNumber,
          name: result.name.isNotEmpty ? result.name : d.name,
          model: result.model,
          detail: result.message,
        ),
      );
    }
    return out;
  }

  /// Probe all LAN devices; auto-pick when exactly one password matches.
  /// Returns (results, match, reason) where reason is ok|need_pick|none|empty|no_devices.
  Future<({List<PasswordProbeResult> results, PasswordProbeResult? match, String reason})>
      pickPasswordMatch(
    String password, {
    String? hostHint,
    List<DeviceState>? devices,
    StatusFn? onStatus,
  }) async {
    final hint = (hostHint ?? '').trim();
    var targets = List<DeviceState>.from(devices ?? scannedDevices);
    if (hint.isNotEmpty && validIp(hint)) {
      if (!targets.any((d) => d.host == hint)) {
        final state = await device.detectState(hint, port: 80);
        if (state.state == 'configured' || state.state == 'new') {
          targets = [state, ...targets];
        }
      }
      final narrowed = targets.where((d) => d.host == hint).toList();
      if (narrowed.isNotEmpty) targets = narrowed;
    }
    if (targets.isEmpty) {
      return (results: <PasswordProbeResult>[], match: null, reason: 'no_devices');
    }
    if (password.trim().isEmpty) {
      return (results: <PasswordProbeResult>[], match: null, reason: 'empty');
    }
    final results = await matchPasswordOnLan(
      password,
      devices: targets,
      onStatus: onStatus,
    );
    final matched = results.where((r) => r.ok).toList();
    if (matched.isEmpty) {
      return (results: results, match: null, reason: 'none');
    }
    if (matched.length == 1) {
      final m = matched.first;
      await selectScannedHost(m.host, port: m.port);
      return (results: results, match: m, reason: 'ok');
    }
    return (results: results, match: null, reason: 'need_pick');
  }

  Future<SubmitResult> ulash({
    required String currentPassword,
    StatusFn? onStatus,
  }) {
    return engine.provisionConfigured(
      host: host,
      port: port,
      username: username,
      currentPassword: currentPassword,
      locationId: locationId ?? '',
      sessionId: sessionId,
      pairingToken: pairingToken,
      linkKey: linkKey,
      detected: detected,
      onStatus: onStatus,
      rotatePassword: true,
    );
  }

  Future<({bool ok, Map<String, dynamic> info, String message})>
      fetchProvisionStatus() async {
    final sid = (sessionId ?? '').trim();
    final token = (pairingToken ?? '').trim();
    if (sid.isEmpty) return (ok: false, info: <String, dynamic>{}, message: 'Session yo‘q');
    if (token.isEmpty) {
      return (ok: false, info: <String, dynamic>{}, message: 'Pairing token kerak');
    }
    final res = await api.getSession(
      sessionId: sid,
      pairingToken: token,
      linkKey: linkKey,
    );
    if (!api.isSuccess(res.status) || res.data is! Map) {
      return (
        ok: false,
        info: <String, dynamic>{},
        message: 'Session holati xato (HTTP ${res.status})',
      );
    }
    return (
      ok: true,
      info: Map<String, dynamic>.from(res.data as Map),
      message: 'OK',
    );
  }

  Future<({bool ok, List<Map<String, dynamic>> devices, String message})>
      fetchWebDevices() async {
    if (!hasCredentials) {
      return (ok: false, devices: <Map<String, dynamic>>[], message: 'Token/kalit kerak');
    }
    final res = await api.listDevices(
      tenant: config.tenantCode,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
    if (!api.isSuccess(res.status)) {
      return (
        ok: false,
        devices: <Map<String, dynamic>>[],
        message: 'Qurilmalar xato (HTTP ${res.status})',
      );
    }
    return (
      ok: true,
      devices: OfficeLinkApi.parseDevices(res.data),
      message: 'OK',
    );
  }

  Map<String, dynamic>? matchWebDevice(
    List<Map<String, dynamic>> devices, {
    String serial = '',
    String host = '',
    String deviceId = '',
  }) {
    final serialN = serial.trim().toLowerCase();
    final hostN = host.trim().toLowerCase();
    final idN = deviceId.trim().toLowerCase();
    if (idN.isNotEmpty) {
      for (final d in devices) {
        if ('${d['id'] ?? ''}'.toLowerCase() == idN) return d;
      }
    }
    if (serialN.isNotEmpty) {
      for (final d in devices) {
        if ('${d['serialNumber'] ?? ''}'.toLowerCase() == serialN) return d;
      }
    }
    if (hostN.isNotEmpty) {
      for (final d in devices) {
        if ('${d['host'] ?? ''}'.toLowerCase() == hostN) return d;
      }
    }
    return null;
  }

  List<String> _priorityHosts({
    String ipHint = '',
    List<Map<String, dynamic>> webDevices = const [],
  }) {
    final out = <String>[];
    void add(String? h) {
      final v = (h ?? '').trim();
      if (v.isNotEmpty && validIp(v) && !out.contains(v)) out.add(v);
    }

    add(ipHint);
    add(host);
    for (final d in webDevices) {
      add('${d['host'] ?? ''}');
    }
    return out;
  }

  Future<List<DeviceState>> scanForReconnect({
    String? ipHint,
    List<String> knownHosts = const [],
    StatusFn? onStatus,
  }) async {
    final found = <String, DeviceState>{};
    for (final h in knownHosts) {
      onStatus?.call('Tekshiruv: $h…');
      final state = await device.detectState(h, port: 80);
      if (state.state == 'configured' || state.state == 'new') {
        found[state.host] = state;
      }
    }
    final hint = (ipHint ?? '').trim();
    onStatus?.call(hint.isEmpty ? 'LAN skan…' : 'LAN skan ($hint)…');
    final scanned = await discovery.scan(
      ipHint: hint.isEmpty ? null : hint,
      onProgress: onStatus,
    );
    for (final s in scanned) {
      found[s.host] = s;
    }
    final list = found.values.toList();
    scannedDevices = list;
    if (list.length == 1) {
      detected = list.first;
      host = detected!.host;
      port = detected!.port;
    }
    return list;
  }

  List<({String password, String username, String source, Map<String, dynamic>? boundWeb})>
      _passwordCandidates(
    String manual,
    List<Map<String, dynamic>> webDevices, {
    Map<String, dynamic>? preferWeb,
  }) {
    final out =
        <({String password, String username, String source, Map<String, dynamic>? boundWeb})>[];
    final seen = <String>{};

    void add(String pwd, String user, String source, Map<String, dynamic>? web) {
      final p = pwd.trim();
      if (p.isEmpty) return;
      final key = '$user|$p';
      if (seen.contains(key)) return;
      seen.add(key);
      out.add((password: p, username: user, source: source, boundWeb: web));
    }

    add(manual, username, 'manual', null);
    if (preferWeb != null) {
      add(
        '${preferWeb['password'] ?? ''}',
        '${preferWeb['username'] ?? username}',
        'web',
        preferWeb,
      );
    }
    for (final d in webDevices) {
      add('${d['password'] ?? ''}', '${d['username'] ?? username}', 'web', d);
    }
    return out;
  }

  Future<Object> resolveReconnectMatch(
    List<DeviceState> lanDevices,
    List<Map<String, dynamic>> webDevices,
    String manualPassword, {
    StatusFn? onStatus,
  }) async {
    if (lanDevices.isEmpty) {
      return const SubmitResult(
        kind: kOffline,
        message: 'LAN da Hikvision topilmadi — IP kiriting yoki tarmoqni tekshiring.',
      );
    }
    if (webDevices.isEmpty) {
      return const SubmitResult(
        kind: 'api',
        message: 'Webda faol qurilma yo‘q. Avval to‘liq Ulash qiling.',
      );
    }

    final local = await store.readDeviceCredential() ?? {};
    final localSerial = '${local['serialNumber'] ?? ''}'.trim();
    final localDeviceId = '${local['deviceId'] ?? ''}'.trim();
    final preferWeb = matchWebDevice(
      webDevices,
      serial: localSerial,
      deviceId: localDeviceId,
    );
    final candidates = _passwordCandidates(
      manualPassword,
      webDevices,
      preferWeb: preferWeb,
    );
    if (candidates.isEmpty) {
      return const SubmitResult(
        kind: 'empty',
        message: 'Parol topilmadi — qo‘lda kiriting yoki Ulashni qayta bajaring.',
      );
    }

    final matches = <ReconnectMatch>[];
    var timeouts = 0;
    for (final lan in lanDevices) {
      onStatus?.call('Solishtirish: ${lan.host}…');
      for (final c in candidates) {
        final result = await device.verifyPassword(
          host: lan.host,
          port: lan.port,
          username: c.username.trim().isEmpty ? 'admin' : c.username.trim(),
          password: c.password,
        );
        if (result.kind == kTimeout) {
          timeouts++;
          break;
        }
        if (result.kind == kUnauthorized) continue;
        if (result.kind != kOk) continue;

        final serial = result.serialNumber.trim();
        Map<String, dynamic>? web;
        final bound = c.boundWeb;
        if (bound != null && c.source == 'web') {
          final webSn = '${bound['serialNumber'] ?? ''}'.trim().toLowerCase();
          if (serial.isEmpty || webSn.isEmpty || webSn == serial.toLowerCase()) {
            web = bound;
          }
        }
        web ??= matchWebDevice(
          webDevices,
          serial: serial,
          host: lan.host,
          deviceId: localDeviceId,
        );
        if (web == null && webDevices.length == 1) {
          web = webDevices.first;
        }
        if (web == null || '${web['id'] ?? ''}'.trim().isEmpty) continue;

        if (bound != null &&
            c.source == 'web' &&
            '${bound['id']}' != '${web['id']}' &&
            serial.isNotEmpty) {
          final webSn = '${web['serialNumber'] ?? ''}'.trim().toLowerCase();
          if (webSn.isNotEmpty && webSn != serial.toLowerCase()) continue;
        }

        final prevHost = '${web['host'] ?? ''}'.trim();
        matches.add(
          ReconnectMatch(
            lan: lan,
            web: web,
            password: c.password,
            username: c.username.trim().isEmpty ? 'admin' : c.username.trim(),
            serial: serial.isNotEmpty ? serial : '${web['serialNumber'] ?? ''}',
            passwordSource: c.source,
            hostChanged: prevHost.isNotEmpty && prevHost != lan.host,
          ),
        );
        break;
      }
    }

    if (matches.isEmpty) {
      if (timeouts > 0 && timeouts >= lanDevices.length) {
        return const SubmitResult(
          kind: kTimeout,
          message: 'Tarmoq timeout. Parol urinishi hisobga olinmadi.',
        );
      }
      return const SubmitResult(
        kind: kUnauthorized,
        message:
            'LAN da qurilma bor, lekin parol/serial Web bilan mos kelmadi. '
            'Parolni qo‘lda kiriting yoki Ulashni qayta bajaring.',
      );
    }

    (int, int, int) score(ReconnectMatch m) {
      final sameId = localDeviceId.isNotEmpty &&
              '${m.web['id'] ?? ''}'.trim() == localDeviceId
          ? 1
          : 0;
      final sameSerial = localSerial.isNotEmpty &&
              m.serial.isNotEmpty &&
              localSerial.toLowerCase() == m.serial.toLowerCase()
          ? 1
          : 0;
      return (sameId, sameSerial, m.hostChanged ? 1 : 0);
    }

    matches.sort((a, b) {
      final sa = score(a);
      final sb = score(b);
      final c0 = sb.$1.compareTo(sa.$1);
      if (c0 != 0) return c0;
      final c1 = sb.$2.compareTo(sa.$2);
      if (c1 != 0) return c1;
      return sb.$3.compareTo(sa.$3);
    });

    final best = matches.first;
    final top = score(best);
    final rivals = matches
        .where(
          (m) =>
              score(m) == top && '${m.web['id']}' != '${best.web['id']}',
        )
        .toList();
    if (rivals.isNotEmpty) {
      final options = [best, ...rivals];
      return SubmitResult(
        kind: 'need_pick',
        message:
            'Mos keladigan ${options.length} ta qurilma topildi. Ro‘yxatdan tanlang.',
        device: {
          'matches': [
            for (final m in options)
              {
                'host': m.lan.host,
                'port': m.lan.port,
                'name': '${m.web['name'] ?? m.lan.name}'.trim().isEmpty
                    ? m.lan.host
                    : '${m.web['name'] ?? m.lan.name}',
                'serialNumber': m.serial,
                'webId': '${m.web['id'] ?? ''}',
                'passwordOk': true,
              },
          ],
        },
      );
    }
    return best;
  }

  /// Full Wi‑Fi reconnect (Windows parity). Tunnel — alohida [restoreTunnel].
  Future<SubmitResult> autoReconnectNetwork({
    String password = '',
    StatusFn? onStatus,
    StepFn? onStep,
    String? ipHint,
  }) async {
    void step(String sid, String state, [String detail = '']) {
      onStep?.call(sid, state, detail);
      if (detail.isNotEmpty) onStatus?.call(detail);
    }

    if (!hasCredentials) {
      return const SubmitResult(
        kind: 'no_key',
        message: 'Pairing token yoki admin kalit kerak.',
      );
    }

    for (final sid in reconnectSteps) {
      step(sid, 'pending');
    }

    step('web', 'active', 'Webdan qurilmalar…');
    final listed = await fetchWebDevices();
    if (!listed.ok) {
      step('web', 'fail', listed.message);
      return SubmitResult(kind: 'api', message: listed.message);
    }
    step('web', 'done', 'Web: ${listed.devices.length} ta');

    step('scan', 'active', 'Tarmoq skaneri…');
    final known = _priorityHosts(
      ipHint: (ipHint ?? '').trim(),
      webDevices: listed.devices,
    );
    final lan = await scanForReconnect(
      ipHint: ipHint,
      knownHosts: known,
      onStatus: onStatus,
    );
    if (lan.isEmpty) {
      step('scan', 'fail', 'LAN da topilmadi');
      return const SubmitResult(
        kind: kOffline,
        message: 'Qurilma topilmadi. IP kiriting yoki Qidirishni bosing.',
      );
    }
    step('scan', 'done', 'LAN: ${lan.length} Hikvision');

    step('match', 'active', 'Web bilan solishtirish…');
    final resolved = await resolveReconnectMatch(
      lan,
      listed.devices,
      password,
      onStatus: onStatus,
    );
    if (resolved is SubmitResult) {
      if (resolved.kind == kUnauthorized ||
          resolved.kind == 'empty' ||
          resolved.kind == kTimeout) {
        step('match', 'done', 'Solishtirish tugadi');
        step('auth', 'fail', resolved.message);
      } else {
        step('match', 'fail', resolved.message);
      }
      return resolved;
    }

    final match = resolved as ReconnectMatch;
    detected = match.lan;
    host = match.lan.host;
    port = match.lan.port;
    username = match.username;
    final changeNote = match.hostChanged
        ? 'IP o‘zgardi: ${match.web['host']} → ${match.lan.host}'
        : 'IP bir xil (${match.lan.host}) — host yangilanadi';
    step(
      'match',
      'done',
      'Mos: ${match.web['name'] ?? match.web['id']} · $changeNote',
    );

    step(
      'auth',
      'active',
      'Parol OK (${match.passwordSource}) · serial=${match.serial.isEmpty ? '—' : match.serial}',
    );
    auth.recordSuccess();
    step('auth', 'done', 'Parol manbai: ${match.passwordSource}');

    step('link', 'active', 'Web host + hikPush yangilanmoqda…');
    final result = await engine.reconnect(
      host: match.lan.host,
      port: match.lan.port,
      username: match.username,
      password: match.password,
      deviceId: '${match.web['id']}',
      serial: match.serial,
      pairingToken: pairingToken,
      linkKey: linkKey,
      onStatus: (m) {
        onStatus?.call(m);
        onStep?.call('link', 'active', m);
      },
    );
    if (result.kind == 'linked') {
      step('link', 'done', 'Tarmoq Web bilan sinxronlandi');
      return SubmitResult(
        kind: 'linked',
        message: result.message,
        device: {
          ...result.device,
          'passwordSource': match.passwordSource,
          'hostChanged': match.hostChanged,
          'serialNumber': match.serial,
        },
      );
    }
    step('link', 'fail', result.message.isEmpty ? 'Xato' : result.message);
    return result;
  }

  Future<SubmitResult> reconnectNetwork({
    required String password,
    StatusFn? onStatus,
    StepFn? onStep,
    String? ipHint,
  }) {
    return autoReconnectNetwork(
      password: password,
      onStatus: onStatus,
      onStep: onStep,
      ipHint: ipHint,
    );
  }

  Future<SubmitResult> pushPendingFaces({
    required String password,
    StatusFn? onStatus,
  }) async {
    final cred = await store.readDeviceCredential();
    final deviceId = '${cred?['deviceId'] ?? ''}'.trim();
    if (deviceId.isEmpty) {
      return const SubmitResult(
        kind: 'error',
        message: 'Avval Ulash qiling (deviceId yo‘q)',
      );
    }
    final h = host.isNotEmpty ? host : '${cred?['host'] ?? ''}'.trim();
    final p = port > 0 ? port : int.tryParse('${cred?['port'] ?? 80}') ?? 80;
    final user = '${cred?['username'] ?? username}'.trim().isEmpty
        ? 'admin'
        : '${cred?['username'] ?? username}'.trim();
    final vaultPwd = '${cred?['password'] ?? ''}'.trim();
    final usePwd = password.trim().isNotEmpty ? password.trim() : vaultPwd;
    if (h.isEmpty) {
      return const SubmitResult(kind: 'error', message: 'IP kiriting');
    }
    if (usePwd.isEmpty) {
      return const SubmitResult(kind: 'error', message: 'Parol kerak');
    }
    return engine.pushPendingFaces(
      host: h,
      port: p,
      username: user,
      password: usePwd,
      deviceId: deviceId,
      pairingToken: pairingToken,
      linkKey: linkKey,
      onStatus: onStatus,
    );
  }

  /// Cloudflare quick tunnel → terminal + announce (Windows restore_tunnel parity).
  Future<SubmitResult> restoreTunnel({
    StatusFn? onStatus,
    String? ipHint,
  }) async {
    if (!hasCredentials) {
      return const SubmitResult(
        kind: 'no_key',
        message: 'Pairing token yoki link key kerak.',
      );
    }

    final cred = await store.readDeviceCredential();
    var h = (ipHint ?? '').trim();
    if (h.isEmpty) h = host.trim();
    if (h.isEmpty) h = '${cred?['host'] ?? ''}'.trim();
    final p = port > 0
        ? port
        : int.tryParse('${cred?['port'] ?? 80}') ?? 80;
    final deviceId = '${cred?['deviceId'] ?? ''}'.trim();

    if (h.isEmpty) {
      return const SubmitResult(
        kind: 'error',
        message:
            'Terminal IP yo‘q. Avval Ulash yoki «Tarmoqni qayta ulash», '
            'keyin Tunnelni oching.',
      );
    }

    final target = 'http://$h:$p';
    onStatus?.call('Туннель -> терминал $h:$p…');

    late final String url;
    try {
      url = await tunnel.start(targetUrl: target, onStatus: onStatus);
    } catch (e) {
      return SubmitResult(
        kind: 'tunnel_error',
        message: '$e'.replaceFirst(RegExp(r'^StateError:\s*'), ''),
      );
    }

    onStatus?.call('Announce на платформу…');
    final ann = await api.announce(
      tenant: config.tenantCode,
      tunnelUrl: url,
      deviceId: deviceId.isEmpty ? null : deviceId,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
    if (!api.isSuccess(ann.status)) {
      final err = ann.data is Map
          ? '${ann.data['message'] ?? ann.data['error'] ?? ann.data}'
          : '${ann.data}';
      return SubmitResult(
        kind: 'tunnel_error',
        message:
            'Tunnel ochildi ($url), lekin announce xato '
            '(${ann.status}): ${err.trim().isEmpty ? 'noma’lum' : err}',
        device: {'tunnelUrl': url, 'host': h, 'port': p},
      );
    }

    host = h;
    port = p;
    return SubmitResult(
      kind: 'tunnel_ok',
      message: 'Tunnel ochildi va platformaga yozildi',
      device: {
        'tunnelUrl': url,
        'host': h,
        'port': p,
        if (deviceId.isNotEmpty) 'deviceId': deviceId,
      },
    );
  }

  Future<Map<String, String>> tunnelStatus() => tunnel.status();

  Future<void> stopTunnel() => tunnel.stop();
}
