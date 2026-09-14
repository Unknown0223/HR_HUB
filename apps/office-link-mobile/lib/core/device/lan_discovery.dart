import 'package:network_info_plus/network_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

import 'hikvision_client.dart';

/// LAN discovery — Windows discovery.py parity (TCP + ISAPI).
class LanDiscovery {
  LanDiscovery({HikvisionClient? client, NetworkInfo? networkInfo})
      : _client = client ?? HikvisionClient(),
        _net = networkInfo ?? NetworkInfo();

  final HikvisionClient _client;
  final NetworkInfo _net;

  Future<void> ensureWifiPermission() async {
    final nearby = await Permission.nearbyWifiDevices.status;
    if (!nearby.isGranted) {
      await Permission.nearbyWifiDevices.request();
    }
    final loc = await Permission.locationWhenInUse.status;
    if (!loc.isGranted) {
      await Permission.locationWhenInUse.request();
    }
  }

  Future<String?> wifiIp() async {
    await ensureWifiPermission();
    try {
      return await _net.getWifiIP();
    } catch (_) {
      return null;
    }
  }

  Future<List<String>> localPrefixes() async {
    final out = <String>[];
    final wifi = await wifiIp();
    final p = ipv4Prefix(wifi);
    if (p != null) out.add(p);
    return out.toSet().toList();
  }

  Future<bool> _portLooksOpen(String host, {int port = 80}) {
    return _client.tcpOpen(
      host,
      port: port,
      timeout: const Duration(milliseconds: 700),
    );
  }

  /// Scan /24. Manual [ipHint] always probed first with longer timeout.
  Future<List<DeviceState>> scan({
    String? ipHint,
    int port = 80,
    void Function(String message)? onProgress,
  }) async {
    final hint = (ipHint ?? '').trim();
    final found = <DeviceState>[];
    final phoneIp = await wifiIp();
    if (phoneIp != null && phoneIp.isNotEmpty) {
      onProgress?.call('Telefon Wi‑Fi: $phoneIp');
    } else {
      onProgress?.call('Telefon Wi‑Fi IP o‘qilmadi — ruxsat / Wi‑Fi tekshiring');
    }

    if (hint.isNotEmpty && validIp(hint)) {
      if (phoneIp != null && !sameSubnet(phoneIp, hint)) {
        onProgress?.call(
          'DIQQAT: telefon ${ipv4Prefix(phoneIp)}.x, qurilma ${ipv4Prefix(hint)}.x — boshqa tarmoq',
        );
      }
      onProgress?.call('Tekshirilmoqda: $hint');
      final state = await _client.detectState(hint, port: port);
      if (state.state != 'unknown') {
        found.add(state);
        return found;
      }
      onProgress?.call('IP $hint javob bermadi (${state.detail})');
      // If user typed IP explicitly, do not hide failure behind a long scan
      // when phone is clearly on another subnet.
      if (phoneIp != null && !sameSubnet(phoneIp, hint)) {
        return found;
      }
    }

    final prefixes = await localPrefixes();
    if (prefixes.isEmpty) {
      onProgress?.call('Wi‑Fi IP topilmadi — ofis Wi‑Fi ga ulang');
      return found;
    }

    for (final prefix in prefixes) {
      onProgress?.call('Tarmoq skaneri: $prefix.0/24');
      final hosts = <String>[for (var i = 1; i <= 254; i++) '$prefix.$i'];
      const batch = 40;
      final open = <String>[];
      for (var i = 0; i < hosts.length; i += batch) {
        final end = i + batch > hosts.length ? hosts.length : i + batch;
        final slice = hosts.sublist(i, end);
        onProgress?.call('Skan: $prefix.${i + 1}…');
        final checks = await Future.wait(
          slice.map((h) async => (h, await _portLooksOpen(h, port: port))),
        );
        for (final c in checks) {
          if (c.$2) open.add(c.$1);
        }
      }

      for (final host in open) {
        onProgress?.call('Aniqlanmoqda: $host');
        final state = await _client.detectState(host, port: port);
        if (state.state != 'unknown') {
          found.add(state);
        }
      }
    }

    found.sort((a, b) {
      int rank(DeviceState s) =>
          s.state == 'configured' ? 0 : (s.state == 'new' ? 1 : 2);
      final c = rank(a).compareTo(rank(b));
      if (c != 0) return c;
      return a.host.compareTo(b.host);
    });
    return found;
  }
}
