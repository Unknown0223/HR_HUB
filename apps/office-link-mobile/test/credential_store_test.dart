import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrhub_office_link/core/storage/credential_store.dart';

void main() {
  test('saveDeviceCredential writes JSON file with password', () async {
    final tmp = await Directory.systemTemp.createTemp('hrhub_cred_');
    addTearDown(() async {
      if (await tmp.exists()) await tmp.delete(recursive: true);
    });

    final store = CredentialStore(
      secure: MemorySecureKv(),
      dataDirOverride: tmp,
    );
    await store.saveDeviceCredential(
      host: '192.168.0.116',
      password: 'HrTestPass9x9',
      username: 'admin',
      port: 80,
      serial: '255',
      locationId: 'loc-1',
      phase: 'rotated_on_device',
      deviceId: 'dev-1',
    );

    final file = await store.credentialFile();
    expect(await file.exists(), isTrue);
    expect(
      file.path.replaceAll('\\', '/'),
      contains('HRHUB-Link/data/device-credential.json'),
    );

    final map = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    expect(map['password'], 'HrTestPass9x9');
    expect(map['host'], '192.168.0.116');
    expect(map['serialNumber'], '255');
    expect(map['phase'], 'rotated_on_device');

    final read = await store.readDeviceCredential();
    expect(read, isNotNull);
    expect(read!['password'], 'HrTestPass9x9');

    final display = await store.formatCredentialForDisplay(read);
    expect(display, contains('HrTestPass9x9'));
    expect(display, contains('device-credential.json'));
  });

  test('read falls back to file when secure empty', () async {
    final tmp = await Directory.systemTemp.createTemp('hrhub_cred2_');
    addTearDown(() async {
      if (await tmp.exists()) await tmp.delete(recursive: true);
    });
    final store = CredentialStore(
      secure: MemorySecureKv(),
      dataDirOverride: tmp,
    );
    final file = await store.credentialFile();
    await file.writeAsString(
      '${jsonEncode({
        'host': '10.0.0.5',
        'port': 80,
        'username': 'admin',
        'password': 'HrFileOnly9',
        'serialNumber': '99',
        'phase': 'file_only',
      })}\n',
    );
    final read = await store.readDeviceCredential();
    expect(read?['password'], 'HrFileOnly9');
    expect(read?['host'], '10.0.0.5');
  });
}
