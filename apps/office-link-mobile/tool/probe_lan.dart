import 'package:hrhub_office_link/core/device/hikvision_client.dart';

Future<void> main() async {
  final c = HikvisionClient();
  final open = await c.tcpOpen('192.168.0.116');
  print('tcpOpen=$open');
  final s = await c.detectState('192.168.0.116');
  print('state=${s.state} label=${s.label} detail=${s.detail} name=${s.name}');
}
