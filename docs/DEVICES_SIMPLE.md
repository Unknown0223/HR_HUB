# Qurilmalarni Railway platformaga ulash (sodda)

## Bitta buyruq

```powershell
cd D:\hr-hub
npm run devices:up
```

Bu avtomatik:

1. Lokal **device-gw** ni yoqadi (Hikvision bilan gaplashadi)
2. **Cloudflare tunnel** ochadi (internet orqali Railway topadi)
3. Railway dagi `DEVICE_GW_URL` ni yangilaydi

To‘xtatish: `Ctrl+C`

## Keyin brauzerda

1. https://hr-hubweb-production.up.railway.app  
2. `admin@demo.local` / `Demo1234!`  
3. **Каталог → Устройства** — har bir terminalni qo‘shing (IP + admin + parol)  
4. Register / Online → ishlatishingiz mumkin  

## Nima uchun shunday?

| Nima | Qayerda | Nima uchun |
|------|---------|------------|
| Web / API / DB | Railway (cloud) | Har joydan ochiladi |
| Device gateway | Sizning PC (LAN) | Terminal lokal IP da |
| Tunnel | Cloudflare | Cloud ↔ PC bog‘lanishi |

Bitta PC + bitta `npm run devices:up` = shu ofisdagi **barcha** Face ID terminallar Railway ga ulanadi.
