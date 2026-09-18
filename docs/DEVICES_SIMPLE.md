# Qurilmalar — Link = sozlash asbobi (uskuna)

## Model (uskuna kabi)
Terminalni serverga **bir marta** bog‘lab sozlaydi.  
Yuz sync uchun tunnel/service kerak.  
**Otmetkalar** — terminal → to‘g‘ridan server (HTTPS HttpHost); **Link ochiq bo‘lishi shart emas**.

| Vazifa | Qayerda |
|--------|---------|
| 1. Qurilmani 0→serverga ulash | Link: **Подключение / Ulash** |
| 2. Tunnel / tarmoq tiklash (IP o‘zgarishi) | Link: **Восстановление / Tiklash** |
| Yuz sync | Web «Синхронизировать» → server → ofis PC fon tunnel → terminal |
| Otmetkalar | Terminal → **Railway API** (HttpHost HTTPS). Link kerak emas |

Ulash/Tiklash HttpHost ni `hr-hubapi…/api/attendance/hikvision/events/<token>` ga yozadi.  
Agar terminalda internet yo‘q bo‘lsa — fallback: ofis PC punch proxy `:8787` (unda Link/service kerak).  
Env: `OFFICE_LINK_PUNCH_MODE=direct` (default) | `lan` | `auto`.

## Windows + Android — bir xil 2 bo‘lim
1. **Ulash / Подключение** — pairing, lokatsiya, parol, multi-device tanlash, Ulash  
2. **Tiklash / Восстановление** — tarmoq qayta ulash (avto skan + Web moslash)  
   (+ Windows’da tunnel restore)

Android: LAN Ulash + tarmoq tiklash.  
Android tunnel ochmaydi; tunnel tiklash — ofis PC Windows Link.

## Kundalik
- Otmetkalar: terminalda internet (DNS/HTTPS) bo‘lsa — **Link siz** ishlaydi  
- Yuz sync: ofis PC fon tunnel  
- Terminal Wi‑Fi ishlashi kerak  

## Build (Windows EXE)
`tools/office-link/BUILD-EXE.bat` → `HRHUB-Qurilma.exe`  
`pack-release.bat` → `release/HRHUB-Link`  
`pack-setup.bat` → Setup.exe  

Default UI: **Tkinter**. WebView: `OFFICE_LINK_UI=webview`.
