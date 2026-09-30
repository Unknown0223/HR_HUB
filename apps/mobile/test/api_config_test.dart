import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/core/api/api_config.dart';

void main() {
  group('server field', () {
    test('a short company name fills the server template', () {
      expect(ApiConfig.resolveServer('akfa'), 'https://hr-akfa.up.railway.app/api');
      expect(ApiConfig.resolveServer('  Artel '), 'https://hr-artel.up.railway.app/api');
      expect(ApiConfig.resolveServer('uz-avto'), 'https://hr-uz-avto.up.railway.app/api');
    });

    test('hosts and full URLs are used as-is for self-hosted and dev servers', () {
      expect(ApiConfig.resolveServer('http://10.0.2.2:3001/api'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.resolveServer('10.0.2.2:3001'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.resolveServer('hr.firma.uz'), 'https://hr.firma.uz/api');
      expect(ApiConfig.resolveServer('https://hr.firma.uz/api/'), 'https://hr.firma.uz/api');
    });

    test('empty falls back to the default, junk is rejected', () {
      expect(ApiConfig.resolveServer(''), ApiConfig.defaultBaseUrl);
      expect(ApiConfig.resolveServer('akfa group'), isNull);
      expect(ApiConfig.resolveServer('акфа'), isNull);
    });

    test('a saved template URL is shown back as the short name', () {
      expect(ApiConfig.displayServer('https://hr-akfa.up.railway.app/api'), 'akfa');
      expect(ApiConfig.displayServer('http://10.0.2.2:3001/api'), 'http://10.0.2.2:3001/api');
      expect(ApiConfig.hostOf('https://hr-akfa.up.railway.app/api'), 'hr-akfa.up.railway.app');
      expect(ApiConfig.hostOf('http://10.0.2.2:3001/api'), '10.0.2.2:3001');
    });
  });
}
