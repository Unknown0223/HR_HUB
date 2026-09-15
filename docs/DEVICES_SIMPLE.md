# Qurilmalarni Railway platformaga ulash (sodda)

## Asosiy model

1. Web → **Устройства → Привязка** → pairing token
2. Ofis Wi‑Fi da **HR HUB Link** (telefon yoki PC) → **Ulash** (`192.168.x.x`)
3. Webda **«Подтвердить привязку»**
4. Ofis PC da **GW+tunnel** ochiq tursin (`START-GW.bat` / service) — yuzlar uchun
5. Link ilovasini yopishingiz mumkin (faqat Ulash / reconnect kerak)

| Funksiya | Qanday ishlaydi |
|----------|-----------------|
| Otmetkalar | Terminal **HttpHostNotification** → HTTPS → Railway API |
| Yangi / yangilangan yuzlar | Web «Синхронизировать» → PC GW+tunnel → terminal (upload) |
| Keraksiz yuzlar | Shu sync: lokatsiyadan chiqqan / foto yo‘q / ignore qilinganlar terminaldan **o‘chiriladi** |
| Link ilovasi | Faqat **Ulash** / **Tarmoqni qayta ulash** |

Wi‑Fi / IP o‘zgasa: Link → **Tarmoqni qayta ulash**.

## Ofis PC + tunnel (yuzlar uchun majburiy)

Railway ofis LAN (`192.168.x.x`) ga kira olmaydi. Shuning uchun yuz yozish uchun ofisda:

```powershell
cd D:\hr-hub\tools\office-link
.\START-GW.bat
```

yoki `npm run devices:up` — lokal device-gw + Cloudflare tunnel (announce).

Otmetkalar uchun doimiy PC **shart emas**; yuz sync uchun GW+tunnel **kerak**.
