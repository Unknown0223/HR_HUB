import '../api/office_link_api.dart';
import '../config/app_config.dart';
import '../device/device_harden.dart';
import '../device/hikvision_client.dart';
import '../security/auth_lock.dart';
import '../security/passwords.dart';
import '../storage/credential_store.dart';
import '../session/submit_result.dart';

/// Ulash without local GW/tunnel (Android).
class ProvisionEngine {
  ProvisionEngine({
    required this.config,
    required this.api,
    required this.store,
    required this.device,
    required this.harden,
    required this.auth,
  });

  final AppConfig config;
  final OfficeLinkApi api;
  final CredentialStore store;
  final HikvisionClient device;
  final DeviceHarden harden;
  final AuthLock auth;

  Future<void> _progress({
    required String? sessionId,
    required String? pairingToken,
    required String? linkKey,
    String step = '',
    String message = '',
    int? percent,
    String? status,
    String? host,
    String? serial,
    String? deviceId,
  }) async {
    final sid = (sessionId ?? '').trim();
    final token = (pairingToken ?? '').trim();
    if (sid.isEmpty || token.isEmpty) return;
    try {
      await api.patchProgress(
        tenant: config.tenantCode,
        sessionId: sid,
        step: step,
        message: message,
        percent: percent,
        status: status,
        host: host,
        serial: serial,
        deviceId: deviceId,
        pairingToken: token,
        linkKey: linkKey,
      );
    } catch (_) {}
  }

  Future<SubmitResult> provisionConfigured({
    required String host,
    required int port,
    required String username,
    required String currentPassword,
    required String locationId,
    required String? sessionId,
    required String? pairingToken,
    required String? linkKey,
    DeviceState? detected,
    StatusFn? onStatus,
    bool rotatePassword = true,
  }) async {
    void emit(String m) => onStatus?.call(m);

    if (!auth.canAttempt) {
      return SubmitResult(
        kind: AuthLock.locked,
        message: 'Qulflangan ${auth.formatRemaining()}',
        remaining: auth.remainingSeconds,
      );
    }

    final loc = locationId.trim();
    if (loc.isEmpty) {
      return const SubmitResult(
        kind: 'location',
        message: 'Lokatsiya tanlanmagan',
      );
    }

    final user = username.trim().isEmpty ? 'admin' : username.trim();
    var password = currentPassword.trim();
    if (password.isEmpty) {
      return const SubmitResult(kind: 'error', message: 'Parol kiriting');
    }

    emit('1/4 Parol tekshirilmoqda…');
    await _progress(
      sessionId: sessionId,
      pairingToken: pairingToken,
      linkKey: linkKey,
      status: 'configuring',
      step: 'verify_password',
      percent: 20,
      message: 'Verify password',
      host: host,
    );

    final verify = await device.verifyPassword(
      host: host,
      port: port,
      username: user,
      password: password,
    );
    if (verify.kind == kUnauthorized) {
      final phase = auth.record401();
      if (phase == AuthLock.locked) {
        return SubmitResult(
          kind: AuthLock.locked,
          message: 'Qulflangan ${auth.formatRemaining()}',
          remaining: auth.remainingSeconds,
        );
      }
      return const SubmitResult(kind: AuthLock.confirm, message: 'Parol noto‘g‘ri');
    }
    if (verify.kind == kTimeout) {
      auth.recordTimeout();
      return SubmitResult(kind: kTimeout, message: verify.message);
    }
    if (verify.kind == kOffline) {
      auth.recordOffline();
      return SubmitResult(kind: kOffline, message: verify.message);
    }
    if (verify.kind != kOk) {
      return SubmitResult(kind: 'error', message: verify.message);
    }
    auth.recordSuccess();

    final serial = (detected?.serialNumber.isNotEmpty == true)
        ? detected!.serialNumber
        : verify.serialNumber;
    final name = (detected?.name.isNotEmpty == true) ? detected!.name : verify.name;
    final model =
        (detected?.model.isNotEmpty == true) ? detected!.model : verify.model;

    if (rotatePassword) {
      final newPwd = generateTerminalPassword(username: user);
      emit('1/4 Yangi platforma paroli o‘rnatilmoqda…');
      await _progress(
        sessionId: sessionId,
        pairingToken: pairingToken,
        linkKey: linkKey,
        status: 'configuring',
        step: 'change_password',
        percent: 30,
        message: 'Change password',
        host: host,
        serial: serial,
      );
      final changed = await device.changeAdminPassword(
        host: host,
        port: port,
        username: user,
        oldPassword: password,
        newPassword: newPwd,
      );
      if (changed['ok'] != true) {
        final reason = '${changed['reason'] ?? ''}';
        if (reason == kUnauthorized) {
          final phase = auth.record401();
          if (phase == AuthLock.locked) {
            return SubmitResult(
              kind: AuthLock.locked,
              message: 'Qulflangan ${auth.formatRemaining()}',
              remaining: auth.remainingSeconds,
            );
          }
          return const SubmitResult(kind: AuthLock.confirm, message: 'Parol noto‘g‘ri');
        }
        return SubmitResult(
          kind: 'error',
          message: '${changed['message'] ?? 'Parolni almashtirib bo‘lmadi'}',
        );
      }
      password = newPwd;
      await store.saveDeviceCredential(
        host: host,
        port: port,
        username: user,
        password: password,
        serial: serial,
        locationId: loc,
        phase: 'rotated_on_device',
      );
      emit('1/4 Tayyor: yangi admin paroli terminalda (lokal saqlandi)');
    }

    // Recovery email — best-effort
    try {
      emit('1b/4 Tiklanish pochtasi…');
      final emailRes = await harden.setRecoveryEmail(
        host: host,
        port: port,
        username: user,
        password: password,
        email: config.recoveryEmail,
      );
      if (emailRes['ok'] == true) {
        emit('Tiklanish pochtasi o‘rnatildi: ${emailRes['email']}');
      } else {
        emit('Tiklanish pochtasi: ${emailRes['message']} — davom');
      }
    } catch (e) {
      emit('Tiklanish pochtasi: $e — davom');
    }

    // Live detection — best-effort
    try {
      emit('1c/4 Yuz aldov himoyasi (professional)…');
      final live = await harden.ensureLiveDetection(
        host: host,
        port: port,
        username: user,
        password: password,
      );
      if (live['ok'] == true && live['ready'] == true) {
        emit('Yuz aldov himoyasi: professional ON');
      } else {
        emit('Yuz aldov himoyasi: ${live['error'] ?? live} — davom');
      }
    } catch (e) {
      emit('Yuz aldov himoyasi: $e — davom');
    }

    emit('2/4 Otmetkalar uchun web push sozlanmoqda…');
    emit('3/4 Qurilma platformaga yozilmoqda…');
    await _progress(
      sessionId: sessionId,
      pairingToken: pairingToken,
      linkKey: linkKey,
      status: 'configuring',
      step: 'register_device',
      percent: 70,
      message: 'Register device',
      host: host,
      serial: serial,
    );

    final reg = await api.registerDevice(
      tenant: config.tenantCode,
      device: {
        'host': host,
        'port': port,
        'serialNumber': serial,
        'name': name.isEmpty ? 'Access Controller' : name,
        'model': model,
      },
      username: user,
      password: password,
      locationId: loc,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );

    if (!api.isSuccess(reg.status) || reg.data is! Map) {
      final tip = reg.data is Map
          ? '${(reg.data as Map)['message'] ?? (reg.data as Map)['error'] ?? ''}'
          : '';
      return SubmitResult(
        kind: 'api',
        message:
            'Qurilma/parol platformaga yozilmadi (HTTP ${reg.status}). $tip'
                .trim(),
      );
    }

    final linked = Map<String, dynamic>.from(reg.data as Map);
    final needsConfirm = linked['needsAdminConfirm'] == true || linked['sealed'] != true;
    final sealed = !needsConfirm && linked['sealed'] == true;
    final hikPush = linked['hikPush'] is Map
        ? Map<String, dynamic>.from(linked['hikPush'] as Map)
        : <String, dynamic>{};

    if (hikPush.isNotEmpty) {
      emit('2b/4 HttpHost → ${hikPush['hostName'] ?? ''}…');
      try {
        final pushRes = await device.configureHttpHostNotification(
          host: host,
          port: port,
          username: user,
          password: password,
          apiHostName: '${hikPush['hostName'] ?? ''}',
          apiPort: int.tryParse('${hikPush['portNo'] ?? 443}') ?? 443,
          urlPath: '${hikPush['urlPath'] ?? ''}',
          protocolType: '${hikPush['protocolType'] ?? 'HTTPS'}',
        );
        if (pushRes['ok'] == true) {
          emit('Otmetkalar to‘g‘ridan webga (HttpHost OK)');
        } else {
          emit('HttpHost: ${pushRes['message'] ?? pushRes['status']} — davom');
        }
      } catch (e) {
        emit('HttpHost: $e — davom');
      }
    } else {
      emit('2b/4 HttpHost config yo‘q — Webda ensure-push keyinroq');
    }

    final dev = linked['device'] is Map
        ? Map<String, dynamic>.from(linked['device'] as Map)
        : <String, dynamic>{};
    final deviceId = '${dev['id'] ?? ''}';

    await store.saveDeviceCredential(
      host: host,
      port: port,
      username: user,
      password: password,
      serial: serial,
      locationId: loc,
      phase: needsConfirm
          ? 'registered_awaiting_admin_confirm'
          : 'registered',
      deviceId: deviceId,
    );

    await _progress(
      sessionId: sessionId,
      pairingToken: pairingToken,
      linkKey: linkKey,
      status: needsConfirm ? 'configuring' : 'linked',
      step: needsConfirm
          ? 'awaiting_admin_confirm'
          : (sealed ? 'sealed' : 'linked'),
      percent: needsConfirm ? 90 : 100,
      message: needsConfirm
          ? 'Web admindan tasdiq kutilmoqda'
          : 'Ulandi',
      host: host,
      serial: serial,
      deviceId: deviceId.isEmpty ? null : deviceId,
    );

    emit(needsConfirm
        ? '4/4 Parol terminalga o‘rnatildi — Webda tasdiqlang'
        : '4/4 Ulandi');
    emit(
      'Otmetkalar: terminal → web. Yuzlar: ofis Wi‑Fi da «Yuzlarni yuklash».',
    );

    return SubmitResult(
      kind: 'linked',
      message: needsConfirm
          ? 'Web tasdiq kutilmoqda. Otmetkalar webga ketadi; yuzlar uchun «Yuzlarni yuklash».'
          : 'Ulandi. Otmetkalar to‘g‘ridan webga; yuzlar — ofis Wi‑Fi da Link.',
      device: {
        'id': deviceId,
        'host': host,
        'name': name,
        'serialNumber': serial,
        'model': model,
        'needsAdminConfirm': needsConfirm,
        'sealed': sealed,
        'hikPush': hikPush,
      },
    );
  }

  Future<SubmitResult> reconnect({
    required String host,
    required int port,
    required String username,
    required String password,
    required String deviceId,
    String serial = '',
    required String? pairingToken,
    required String? linkKey,
    StatusFn? onStatus,
  }) async {
    void emit(String m) => onStatus?.call(m);
    emit('Parol tekshirilmoqda…');
    final verify = await device.verifyPassword(
      host: host,
      port: port,
      username: username,
      password: password,
    );
    if (verify.kind != kOk) {
      return SubmitResult(kind: verify.kind, message: verify.message);
    }
    emit('Host yangilanmoqda…');
    final res = await api.reconnectDevice(
      tenant: config.tenantCode,
      deviceId: deviceId,
      host: host,
      port: port,
      serialNumber: serial.isEmpty ? verify.serialNumber : serial,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
    if (!api.isSuccess(res.status)) {
      final tip = res.data is Map
          ? '${(res.data as Map)['message'] ?? (res.data as Map)['error'] ?? ''}'
          : '';
      return SubmitResult(
        kind: 'api',
        message: 'Reconnect xato (HTTP ${res.status}). $tip'.trim(),
      );
    }
    final linked = res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : <String, dynamic>{};
    var hikPush = linked['hikPush'] is Map
        ? Map<String, dynamic>.from(linked['hikPush'] as Map)
        : <String, dynamic>{};
    if (hikPush.isEmpty) {
      final ens = await api.ensurePush(
        tenant: config.tenantCode,
        deviceId: deviceId,
        pairingToken: pairingToken,
        linkKey: linkKey,
      );
      if (api.isSuccess(ens.status) && ens.data is Map) {
        final d = Map<String, dynamic>.from(ens.data as Map);
        if (d['hikPush'] is Map) {
          hikPush = Map<String, dynamic>.from(d['hikPush'] as Map);
        }
      }
    }
    if (hikPush.isNotEmpty) {
      emit('HttpHost qayta sozlanmoqda…');
      await device.configureHttpHostNotification(
        host: host,
        port: port,
        username: username,
        password: password,
        apiHostName: '${hikPush['hostName'] ?? ''}',
        apiPort: int.tryParse('${hikPush['portNo'] ?? 443}') ?? 443,
        urlPath: '${hikPush['urlPath'] ?? ''}',
        protocolType: '${hikPush['protocolType'] ?? 'HTTPS'}',
      );
    }
    await store.saveDeviceCredential(
      host: host,
      port: port,
      username: username,
      password: password,
      serial: serial.isEmpty ? verify.serialNumber : serial,
      phase: 'reconnect',
      deviceId: deviceId,
    );
    return SubmitResult(
      kind: 'linked',
      message: 'Tarmoq yangilandi (otmetkalar → web)',
      device: {
        'id': deviceId,
        'host': host,
        'needsAdminConfirm': false,
        'sealed': true,
        'hikPush': hikPush,
      },
    );
  }

  /// Pull pending faces from API and enroll on LAN terminal (on-demand).
  Future<SubmitResult> pushPendingFaces({
    required String host,
    required int port,
    required String username,
    required String password,
    required String deviceId,
    required String? pairingToken,
    required String? linkKey,
    StatusFn? onStatus,
  }) async {
    void emit(String m) => onStatus?.call(m);
    emit('Navbatdagi yuzlar olinmoqda…');
    final pending = await api.pendingFaces(
      tenant: config.tenantCode,
      deviceId: deviceId,
      pairingToken: pairingToken,
      linkKey: linkKey,
    );
    if (!api.isSuccess(pending.status) || pending.data is! Map) {
      return SubmitResult(
        kind: 'api',
        message: 'Pending faces xato (HTTP ${pending.status})',
      );
    }
    final data = Map<String, dynamic>.from(pending.data as Map);
    final items = (data['items'] is List)
        ? (data['items'] as List).whereType<Map>().toList()
        : <Map>[];
    if (items.isEmpty) {
      return const SubmitResult(
        kind: 'linked',
        message: 'Yuklash uchun yuz yo‘q (navbat bo‘sh)',
      );
    }
    var okCount = 0;
    var failCount = 0;
    for (var i = 0; i < items.length; i++) {
      final item = Map<String, dynamic>.from(items[i]);
      final faceSyncId = '${item['faceSyncId'] ?? ''}';
      final empNo = '${item['employeeNo'] ?? ''}';
      final empName = '${item['employeeName'] ?? ''}';
      final faceB64 = '${item['faceBase64'] ?? ''}';
      emit('Yuz ${i + 1}/${items.length}: $empName…');
      if (faceB64.isEmpty) {
        failCount += 1;
        if (faceSyncId.isNotEmpty) {
          await api.ackFaceSync(
            tenant: config.tenantCode,
            deviceId: deviceId,
            faceSyncId: faceSyncId,
            ok: false,
            error: 'No face photo',
            pairingToken: pairingToken,
            linkKey: linkKey,
          );
        }
        continue;
      }
      final enr = await device.enrollFace(
        host: host,
        port: port,
        username: username,
        password: password,
        employeeNo: empNo,
        employeeName: empName,
        faceBase64: faceB64,
      );
      final ok = enr['ok'] == true;
      if (ok) {
        okCount += 1;
      } else {
        failCount += 1;
      }
      if (faceSyncId.isNotEmpty) {
        await api.ackFaceSync(
          tenant: config.tenantCode,
          deviceId: deviceId,
          faceSyncId: faceSyncId,
          ok: ok,
          error: ok ? null : '${enr['message'] ?? 'enroll failed'}',
          pairingToken: pairingToken,
          linkKey: linkKey,
        );
      }
    }
    return SubmitResult(
      kind: 'linked',
      message: 'Yuzlar: $okCount ok, $failCount xato (jami ${items.length})',
      device: {'synced': okCount, 'failed': failCount},
    );
  }
}
