# Qurilmalarni Railway platformaga ulash (sodda)

## Asosiy yo‘l (tavsiya): telefon Link — setup-only

1. Web → **Устройства → Привязка** → pairing token
2. Ofis Wi‑Fi da **HR HUB Link (Android)** → Ulash (`192.168.x.x`)
3. Webda **«Подтвердить привязку»**
4. Ilovani yopishingiz mumkin

| Funksiya | Qanday ishlaydi |
|----------|-----------------|
| Otmetkalar | Terminal **HttpHostNotification** → HTTPS → Railway API |
| Yangi yuzlar | Web «Синхронизировать» (navbat) → telefon **«Yuzlarni yuklash»** (qisqa, ofis Wi‑Fi) |
| Doimiy ochiq PC | **Kerak emas** |

Wi‑Fi / IP o‘zgasa: telefon → **Tarmoqni qayta ulash** (host yangilanadi + HttpHost qayta yoziladi).

## Fallback: ofis PC + tunnel

Agar HttpHost firmware da ishlamasa yoki masofaviy ISAPI kerak bo‘lsa:

```powershell
cd D:\hr-hub\tools\office-link
.\START-GW.bat
```

yoki `npm run devices:up` — lokal device-gw + Cloudflare tunnel.

Bu **ixtiyoriy** fallback; asosiy rejim — terminal → web push + telefon on-demand yuz.

## Demo

- Web: https://hr-hubweb-production.up.railway.app  
- `admin@demo.local` / `Demo1234!`
