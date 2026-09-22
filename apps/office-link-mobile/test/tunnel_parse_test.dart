import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/core/tunnel/cloudflared_tunnel.dart';

void main() {
  test('url regex matches trycloudflare host', () {
    const sample =
        'INF | https://abc-def-123.trycloudflare.com |';
    final m = RegExp(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        .firstMatch(sample);
    expect(m, isNotNull);
    expect(m!.group(0), 'https://abc-def-123.trycloudflare.com');
  });

  test('release tag pinned', () {
    expect(CloudflaredTunnel.releaseTag, isNotEmpty);
  });
}
