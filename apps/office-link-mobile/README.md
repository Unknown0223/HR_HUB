# HR HUB Link (Android)

Ofis Face ID terminalini HR HUB platformasiga ulash — Windows [tools/office-link](../../tools/office-link) bilan **bir xil** pairing / Ulash / Web tasdiq / **Cloudflare tunnel** oqimi.

## Tunnel (APK)

Ilova Cloudflare `cloudflared` binary sini yuklab, terminalga **device-direct** quick tunnel ochadi (`http://IP:80` → `*.trycloudflare.com`) va `/office-link/announce` ga yozadi.

- **2. Tiklash → B) Tunnel → Tunnelni ochish / tiklash**
- Birinchi marta ~50–80 MB `cloudflared` yuklanadi (arm64/arm)
- Tunnel ishlashi uchun ilovani ochiq qoldiring (fon service hali yo‘q)
- Lokal `:8800` device-gw Androidda yo‘q — kerak emas (device-direct)

Web: **Устройства → Связь с офисом → Android — APK yuklash**.

## Talablar

- Flutter 3.8+
- Android telefon/planshet (bir Wi‑Fi da terminal bilan)
- Tunnel uchun telefonda internet (Cloudflare + Railway)

## Ishga tushirish

```bash
cd apps/office-link-mobile
flutter pub get
flutter run
```

## APK build

```bash
cd apps/office-link-mobile
flutter build apk --release --no-tree-shake-icons
```

Natija: `build/app/outputs/flutter-apk/app-release.apk`  
Deploy: `apps/api/assets/office-link/HRHUB-Link-Android.apk`

## Operator oqimi

1. Web → pairing token yaratish
2. Ilovada token → **Saqlash**
3. Lokatsiya tanlash
4. **Qidirish** — IP bo‘sh bo‘lsa Wi‑Fi `/24` avto-skan
5. Joriy admin paroli → **Ulash**
6. Webda «Подтвердить привязку»
7. **2. Tiklash → Tunnelni ochish**
8. Web «Синхронизировать» (yuzlar)

**Tarmoqni qayta ulash** — Wi‑Fi/IP o‘zgaganda.  
**Tunnelni tiklash** — Cloudflare URL yangilash / qayta announce.

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
| `tunnel_watch.py` / `runtime_setup.py` | `lib/core/tunnel/cloudflared_tunnel.dart` |
| `provision.py` | `lib/core/provision/provision_engine.dart` |
| `office_link_gui.py` | `lib/features/link/link_screen.dart` |

## Test

```bash
cd apps/office-link-mobile
flutter test
flutter analyze
```
