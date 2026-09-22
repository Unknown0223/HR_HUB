import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Cloudflare quick tunnel (trycloudflare) — Windows `runtime_setup.start_quick_tunnel` parity.
///
/// Runs a downloaded `cloudflared` binary and exposes `http://host:port` (device-direct).
class CloudflaredTunnel {
  CloudflaredTunnel({Dio? dio}) : _dio = dio ?? Dio();

  static const _prefsUrl = 'tunnel_url';
  static const _prefsTarget = 'tunnel_target';
  static final _urlRe = RegExp(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com');

  /// Pinned release — avoid surprise breaking changes from /latest.
  static const releaseTag = '2025.2.1';
  static const _baseDownload =
      'https://github.com/cloudflare/cloudflared/releases/download/$releaseTag';

  final Dio _dio;
  Process? _proc;
  IOSink? _logSink;
  String? _url;
  String? _target;
  String? _lastError;

  String? get tunnelUrl => _url;
  String? get target => _target;
  String? get lastError => _lastError;
  bool get isRunning => _proc != null && _proc!.pid > 0;

  Future<Directory> _runtimeDir() async {
    final support = await getApplicationSupportDirectory();
    final d = Directory('${support.path}/cloudflared');
    if (!await d.exists()) await d.create(recursive: true);
    return d;
  }

  Future<File> _logFile() async {
    final d = await _runtimeDir();
    return File('${d.path}/tunnel.log');
  }

  /// Map Android ABI → Cloudflare linux binary name.
  static Future<String> detectBinaryName() async {
    var abi = '';
    try {
      final r = await Process.run('getprop', ['ro.product.cpu.abi']);
      if (r.exitCode == 0) abi = '${r.stdout}'.trim();
    } catch (_) {}
    if (abi.isEmpty) {
      try {
        final r = await Process.run('uname', ['-m']);
        if (r.exitCode == 0) abi = '${r.stdout}'.trim();
      } catch (_) {}
    }
    final low = abi.toLowerCase();
    if (low.contains('x86_64') || low == 'amd64') {
      return 'cloudflared-linux-amd64';
    }
    if (low.contains('x86') || low == 'i686') {
      return 'cloudflared-linux-386';
    }
    if (low.contains('armeabi') ||
        low == 'armv7l' ||
        low == 'armv7' ||
        low == 'arm') {
      return 'cloudflared-linux-arm';
    }
    // arm64-v8a / aarch64 — default for modern phones
    return 'cloudflared-linux-arm64';
  }

  Future<File> ensureBinary({void Function(String msg)? onStatus}) async {
    final dir = await _runtimeDir();
    final name = await detectBinaryName();
    final out = File('${dir.path}/cloudflared');
    final marker = File('${dir.path}/.$name.version');
    final needDownload = !await out.exists() ||
        !await marker.exists() ||
        (await marker.readAsString()).trim() != releaseTag;

    if (needDownload) {
      onStatus?.call('Tunnel dasturi yuklanmoqda ($name)…');
      final url = '$_baseDownload/$name';
      final tmp = File('${dir.path}/cloudflared.download');
      if (await tmp.exists()) await tmp.delete();
      try {
        await _dio.download(
          url,
          tmp.path,
          options: Options(
            receiveTimeout: const Duration(minutes: 3),
            sendTimeout: const Duration(minutes: 1),
            followRedirects: true,
            validateStatus: (s) => s != null && s >= 200 && s < 400,
          ),
        );
      } catch (e) {
        throw StateError(
          'cloudflared yuklab bo‘lmadi ($name). Internetni tekshiring. $e',
        );
      }
      if (await out.exists()) {
        try {
          await out.delete();
        } catch (_) {}
      }
      await tmp.rename(out.path);
      await marker.writeAsString(releaseTag);
    }

    // Make executable (Android app-private files).
    try {
      final chmod = await Process.run('chmod', ['755', out.path]);
      if (chmod.exitCode != 0) {
        await Process.run('/system/bin/chmod', ['755', out.path]);
      }
    } catch (_) {}

    if (!await out.exists()) {
      throw StateError('cloudflared binary topilmadi');
    }
    return out;
  }

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    if ((_url ?? '').isNotEmpty) {
      await p.setString(_prefsUrl, _url!);
    } else {
      await p.remove(_prefsUrl);
    }
    if ((_target ?? '').isNotEmpty) {
      await p.setString(_prefsTarget, _target!);
    } else {
      await p.remove(_prefsTarget);
    }
  }

  Future<void> loadPersisted() async {
    final p = await SharedPreferences.getInstance();
    _url = p.getString(_prefsUrl);
    _target = p.getString(_prefsTarget);
  }

  Future<void> stop() async {
    final proc = _proc;
    _proc = null;
    try {
      await _logSink?.flush();
      await _logSink?.close();
    } catch (_) {}
    _logSink = null;
    if (proc != null) {
      try {
        proc.kill(ProcessSignal.sigterm);
      } catch (_) {
        try {
          proc.kill();
        } catch (_) {}
      }
    }
  }

  /// Start quick tunnel to [targetUrl] (e.g. `http://192.168.1.10:80`).
  /// Returns public `https://….trycloudflare.com` URL.
  Future<String> start({
    required String targetUrl,
    void Function(String msg)? onStatus,
    Duration timeout = const Duration(seconds: 70),
  }) async {
    final target = targetUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      throw ArgumentError('targetUrl must be http(s)://…');
    }

    await stop();
    _lastError = null;
    _url = null;
    _target = target;

    final exe = await ensureBinary(onStatus: onStatus);
    onStatus?.call('Internet tunnel ochilmoqda… ($target)');

    final log = await _logFile();
    final sink = log.openWrite(mode: FileMode.append);
    _logSink = sink;
    sink.writeln(
      '\n--- quick tunnel start ${DateTime.now().toIso8601String()} target=$target ---',
    );
    await sink.flush();

    try {
      _proc = await Process.start(
        exe.path,
        ['tunnel', '--url', target],
        workingDirectory: (await _runtimeDir()).path,
        environment: {
          ...Platform.environment,
          // Avoid interactive prompts
          'NO_COLOR': '1',
        },
        runInShell: false,
      );
    } catch (e) {
      _lastError = 'cloudflared ishga tushmadi: $e';
      throw StateError(
        'Tunnel ochilmadi — telefon bu binary ni ishga tushira olmayapti. '
        '($e)',
      );
    }

    final proc = _proc!;
    // Mirror stdout+stderr into log (cloudflared prints URL on stderr).
    void pipe(Stream<List<int>> stream) {
      stream.transform(utf8.decoder).listen(
        (chunk) {
          try {
            sink.write(chunk);
          } catch (_) {}
        },
        onError: (_) {},
        cancelOnError: false,
      );
    }

    pipe(proc.stdout);
    pipe(proc.stderr);

    final deadline = DateTime.now().add(timeout);
    var offset = (await log.exists()) ? await log.length() : 0;
    if (offset > 4096) offset = offset - 4096;

    var exitCode = -1;
    unawaited(proc.exitCode.then((c) => exitCode = c));

    while (DateTime.now().isBefore(deadline)) {
      if (exitCode != -1) {
        final detail = await _tail(log);
        _lastError = detail;
        final low = detail.toLowerCase();
        if (detail.contains('429') ||
            detail.contains('1015') ||
            low.contains('rate')) {
          throw StateError(
            'Cloudflare quick tunnel limithi (429). '
            'Bir necha daqiqa kutib qayta urining.',
          );
        }
        final tip = detail.isEmpty
            ? ''
            : ' ${detail.substring(0, detail.length > 180 ? 180 : detail.length)}';
        throw StateError('Tunnel ochilmadi.$tip');
      }

      try {
        final len = await log.length();
        if (len > offset) {
          final raf = await log.open();
          try {
            raf.setPosition(offset);
            final chunk = utf8.decode(await raf.read(len - offset));
            offset = len;
            final m = _urlRe.firstMatch(chunk);
            if (m != null) {
              _url = m.group(0);
              await _persist();
              onStatus?.call('Tunnel URL: $_url');
              return _url!;
            }
            if (chunk.contains('429') || chunk.contains('1015')) {
              throw StateError(
                'Cloudflare quick tunnel limithi (429). '
                'Bir necha daqiqa kutib qayta urining.',
              );
            }
          } finally {
            await raf.close();
          }
        }
      } catch (e) {
        if (e is StateError) rethrow;
      }
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }

    throw StateError('Tunnel URL topilmadi (timeout).');
  }

  Future<String> _tail(File log, {int max = 4000}) async {
    try {
      if (!await log.exists()) return '';
      final bytes = await log.readAsBytes();
      if (bytes.isEmpty) return '';
      final start = bytes.length > max ? bytes.length - max : 0;
      return utf8.decode(bytes.sublist(start), allowMalformed: true);
    } catch (_) {
      return '';
    }
  }

  /// Snapshot for UI.
  Future<Map<String, String>> status() async {
    await loadPersisted();
    final running = isRunning;
    final url = (_url ?? '').trim();
    String state;
    if (running && url.isNotEmpty) {
      state = 'Онлайн';
    } else if (running) {
      state = 'Ochilmoqda…';
    } else if (url.isNotEmpty) {
      state = 'URL saqlangan (jarayon to‘xtagan)';
    } else {
      state = 'O‘chirilgan';
    }
    return {
      'state': state,
      'url': url.isEmpty ? '—' : url,
      'target': (_target ?? '').isEmpty ? '—' : _target!,
      'running': running ? '1' : '0',
      if ((_lastError ?? '').isNotEmpty) 'error': _lastError!,
    };
  }
}
