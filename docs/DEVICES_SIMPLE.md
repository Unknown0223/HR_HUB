# Qurilmalar — Link = sozlash asbobi (uskuna)

## Model (uskuna kabi)
Terminalni serverga **bir marta** bog‘lab sozlaydi.  
Ish jarayoni sozlangach Link **ochiq turishi shart emas** — jarayon davom etadi.

| Vazifa | Qayerda |
|--------|---------|
| 1. Qurilmani 0→serverga ulash | Link: **Подключение / Ulash** |
| 2. Tunnel / tarmoq tiklash (IP o‘zgarishi) | Link: **Восстановление / Tiklash** |
| Yuz sync | Web «Синхронизировать» → server → ofis PC fon tunnel → terminal |
| Otmetkalar | Terminal → Web **to‘g‘ridan** (HttpHost / hikPush). Link Ulash/reconnect da HttpHost yozadi |

**Muhim:** «Восстановить сеть» dan keyin terminalga HttpHost qayta yoziladi — aks holda otmetkalar webga kelmaydi. Terminalda internet/HTTPS (Railway API) ochiq bo‘lishi shart.

## Windows + Android — bir xil 2 bo‘lim
1. **Ulash / Подключение** — pairing, lokatsiya, parol, multi-device tanlash, Ulash  
2. **Tiklash / Восстановление** — tarmoq qayta ulash (avto skan + Web moslash)  
   (+ Windows’da tunnel restore)

Android: LAN Ulash + tarmoq tiklash (multi-device / «Hammada tekshir» / qadamlar).  
Android tunnel ochmaydi (LAN GW yo‘q); tunnel tiklash — ofis PC Windows Link.

## Kundalik
- Link yopiq turishi mumkin  
- Ofis PC yoniq (fon tunnel / login task) — yuz sync uchun  
- Punches: hikPush, Link qatnashmaydi  

## Build (Windows EXE)
`tools/office-link/BUILD-EXE.bat` → `HRHUB-Qurilma.exe`  
`pack-release.bat` → `release/HRHUB-Link` (**gw/** + **runtime/cloudflared.exe** bilan)  
`pack-setup.bat` → o‘rnatiladigan Setup.exe  

Tunnel tiklash: terminal IP ma’lum bo‘lsa — to‘g‘ridan-to‘g‘ri cloudflared (lokal :8800 shart emas).  
GW yo‘li faqat host yo‘q fallback uchun; paketda `gw/` bo‘lishi shart.

Default UI: **Tkinter** (oddiy Windows ilova). WebView: `OFFICE_LINK_UI=webview`.
