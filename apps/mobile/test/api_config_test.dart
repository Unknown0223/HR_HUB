import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/core/api/api_config.dart';

void main() {
  group('server field', () {
    test('server links become API base URLs', () {
      expect(ApiConfig.resolveServer('hr-akfa.up.railway.app'), 'https://hr-akfa.up.railway.app/api');
      expect(ApiConfig.resolveServer('http://10.0.2.2:3001/api'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.resolveServer('10.0.2.2:3001'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.resolveServer('hr.firma.uz'), 'https://hr.firma.uz/api');
      expect(ApiConfig.resolveServer('https://hr.firma.uz/api/'), 'https://hr.firma.uz/api');
    });

    test('empty falls back to the default, non-links are rejected', () {
      expect(ApiConfig.resolveServer(''), ApiConfig.defaultBaseUrl);
      expect(ApiConfig.resolveServer('akfa'), isNull);
      expect(ApiConfig.resolveServer('akfa group'), isNull);
      expect(ApiConfig.resolveServer('акфа'), isNull);
    });

    test('display and host hint', () {
      expect(ApiConfig.displayServer('https://hr-akfa.up.railway.app/api'), 'hr-akfa.up.railway.app');
      expect(ApiConfig.displayServer('http://10.0.2.2:3001/api'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.hostOf('https://hr-akfa.up.railway.app/api'), 'hr-akfa.up.railway.app');
      expect(ApiConfig.hostOf('http://10.0.2.2:3001/api'), '10.0.2.2:3001');
    });
  });
}
