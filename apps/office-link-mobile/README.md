# HR HUB Link (Android)

Ofis Face ID terminalini HR HUB platformasiga ulash — Windows [tools/office-link](../../tools/office-link) bilan **bir xil** pairing / Ulash / Web tasdiq oqimi.

## Cheklov

Telefon ichida **device-gw + Cloudflare tunnel yo‘q**. Yuz sinxroni va punchlar uchun ofisda PC **HR HUB Link** (GW+tunnel) ishlashi kerak.

PC ilovada **«Internet tunnel»** kartasi tunnel o‘chganda **avtomatik tiklaydi** (`Tunnelni tiklash` / auto-heal / `service_worker.py`). Android faqat LAN Ulash + Web tasdiq.

Web: **Устройства → Связь с офисом → Android — APK yuklash**.

## Talablar

- Flutter 3.8+
- Android telefon/planshet (bir Wi‑Fi da terminal bilan)

## Ishga tushirish

```bash
cd apps/office-link-mobile
flutter pub get
flutter run
```

## APK build

```bash
cd apps/office-link-mobile
flutter build apk --release
```

Natija: `build/app/outputs/flutter-apk/app-release.apk`

## Operator oqimi

1. Web → pairing token yaratish
2. Ilovada token → **Saqlash**
3. Lokatsiya tanlash
4. **Qidirish** — IP bo‘sh bo‘lsa Wi‑Fi `/24` avto-skan; bir nechta bo‘lsa ro‘yxatdan tanlang
5. (ixtiyoriy) **Hammada tekshir** — bir xil parolni barcha LAN terminallarda sinab ko‘radi
6. Joriy admin paroli → **Ulash**
7. Webda «Подтвердить привязку»
8. Ilova **TASDIQ → ULANDI** ni kuzatadi

**2. Tiklash → Tarmoqni qayta ulash** — Wi‑Fi/IP o‘zgaganda (avto skan + Web moslash, parol aylantirilmaydi).  
**Tunnel** — faqat ofis PC Windows Link.

## Config

`assets/config.json`:

```json
{
  "apiUrl": "https://hr-hubapi-production.up.railway.app",
  "webUrl": "https://hr-hubweb-production.up.railway.app",
  "tenantCode": "demo",
  "recoveryEmail": "botirovanvar96@gmail.com"
}
```

## Modul xaritasi

| Windows | Android |
|---------|---------|
| `api_client.py` | `lib/core/api/office_link_api.dart` |
| `session.py` | `lib/core/session/office_link_session.dart` |
| `provision.py` | `lib/core/provision/provision_engine.dart` |
| `discovery.py` | `lib/core/device/hikvision_client.dart` |
| `office_link_gui.py` | `lib/features/link/link_screen.dart` |

## Parol saqlash

Ulashdan keyin yangi admin parol **ikki joyda** saqlanadi:

1. Encrypted secure storage (ilova ichida)
2. Fayl: `…/files/HRHUB-Link/data/device-credential.json`

Telefon ichida tipik yo‘l:
`/data/data/com.hrhub.hrhub_office_link/app_flutter/HRHUB-Link/data/device-credential.json`

Ilova: **Admin → Saqlangan terminal parolini ko‘rsat** (fayl yo‘li ham chiqadi).

## Test

```bash
cd apps/office-link-mobile
flutter test
flutter analyze
```
