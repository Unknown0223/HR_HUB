import '../api/office_link_api.dart';
import '../config/app_config.dart';
import '../device/device_harden.dart';
import '../device/hikvision_client.dart';
import '../device/lan_discovery.dart';
import '../provision/provision_engine.dart';
import '../security/auth_lock.dart';
import '../storage/credential_store.dart';
import 'submit_result.dart';

class OfficeLinkSession {
  OfficeLinkSession({
    required this.config,
    CredentialStore? store,
    HikvisionClient? device,
    OfficeLinkApi? api,
    AuthLock? auth,
    LanDiscovery? discovery,
  })  : store = store ?? CredentialStore(),
        device = device ?? HikvisionClient(),
        api = api ?? OfficeLinkApi(apiUrl: config.apiUrl),
        auth = auth ?? AuthLock() {
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

  Future<void> loadPersisted() async {
    pairingToken = await store.pairingToken();
    linkKey = await store.linkKey();
    sessionId = await store.sessionId();
    locationId = await store.locationId();
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
    return detected!;
  }

  /// Auto LAN scan (Windows «Qidirish» parity). Empty [ipHint] → Wi‑Fi /24 scan.
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
    if (list.isNotEmpty) {
      detected = list.first;
      host = detected!.host;
      this.port = detected!.port;
    }
    return list;
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

  Future<SubmitResult> reconnectNetwork({
    required String password,
    StatusFn? onStatus,
  }) async {
    onStatus?.call('1 · Web qurilmalar…');
    final listed = await fetchWebDevices();
    if (!listed.ok) {
      return SubmitResult(kind: 'api', message: listed.message);
    }
    onStatus?.call('2 · Skaner…');
    if (host.isEmpty) {
      return const SubmitResult(kind: 'error', message: 'IP kiriting');
    }
    final state = await scanHost(host, port: port);
    onStatus?.call('3 · Moslash…');
    final match = matchWebDevice(
      listed.devices,
      serial: state.serialNumber,
      host: host,
    );
    if (match == null) {
      return const SubmitResult(
        kind: 'error',
        message: 'Webdagi qurilma topilmadi (serial/host)',
      );
    }
    final vaultPwd = '${match['password'] ?? ''}'.trim();
    final usePwd = password.trim().isNotEmpty ? password.trim() : vaultPwd;
    if (usePwd.isEmpty) {
      return const SubmitResult(kind: 'error', message: 'Parol kerak');
    }
    onStatus?.call('4 · Parol…');
    onStatus?.call('5 · Ulash…');
    return engine.reconnect(
      host: host,
      port: port,
      username: '${match['username'] ?? username}',
      password: usePwd,
      deviceId: '${match['id']}',
      serial: state.serialNumber,
      pairingToken: pairingToken,
      linkKey: linkKey,
      onStatus: onStatus,
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
}
