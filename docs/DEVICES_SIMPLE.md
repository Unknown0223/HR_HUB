# Qurilmalar — Link = sozlash asbobi (uskuna)

## Model (uskuna kabi)
Terminalni serverga **bir marta** bog‘lab sozlaydi.  
Yuz sync uchun tunnel/service kerak; **otmetkalar** uchun ofis PC da Link/service (punch proxy) ochiq bo‘lishi kerak.

| Vazifa | Qayerda |
|--------|---------|
| 1. Qurilmani 0→serverga ulash | Link: **Подключение / Ulash** |
| 2. Tunnel / tarmoq tiklash (IP o‘zgarishi) | Link: **Восстановление / Tiklash** |
| Yuz sync | Web «Синхронизировать» → server → ofis PC fon tunnel → terminal |
| Otmetkalar | Terminal → ofis PC (**punch proxy :8787**) → Web. Terminalda internet shart emas; Link/service ochiq bo‘lishi kerak |

**Muhim:** «Восстановить сеть» / Ulash HttpHost ni PC LAN IP ga yozadi. Otmetkalar uchun Link (yoki service_worker) ishlashi kerak — terminal to‘g‘ridan Railway ga chiqmasa ham PC orqali o‘tadi.

## Windows + Android — bir xil 2 bo‘lim
1. **Ulash / Подключение** — pairing, lokatsiya, parol, multi-device tanlash, Ulash  
2. **Tiklash / Восстановление** — tarmoq qayta ulash (avto skan + Web moslash)  
   (+ Windows’da tunnel restore)

Android: LAN Ulash + tarmoq tiklash (multi-device / «Hammada tekshir» / qadamlar).  
Android tunnel ochmaydi (LAN GW yo‘q); tunnel tiklash — ofis PC Windows Link.

## Kundalik
- Ofis PC yoniq; Link/service (punch proxy :8787) — **otmetkalar** uchun  
- Yuz sync: fon tunnel (Cloudflare limithi bo‘lsa keyinroq)  
- Terminal Wi‑Fi LAN da PC bilan bir tarmoqda bo‘lishi kerak  

## Build (Windows EXE)
`tools/office-link/BUILD-EXE.bat` → `HRHUB-Qurilma.exe`  
`pack-release.bat` → `release/HRHUB-Link` (**gw/** + **runtime/cloudflared.exe** bilan)  
`pack-setup.bat` → o‘rnatiladigan Setup.exe  

Tunnel tiklash: terminal IP ma’lum bo‘lsa — to‘g‘ridan-to‘g‘ri cloudflared (lokal :8800 shart emas).  
GW yo‘li faqat host yo‘q fallback uchun; paketda `gw/` bo‘lishi shart.

Default UI: **Tkinter** (oddiy Windows ilova). WebView: `OFFICE_LINK_UI=webview`.
