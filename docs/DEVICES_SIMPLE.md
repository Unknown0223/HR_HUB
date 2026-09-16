# Qurilmalar — Link = sozlash asbobi (uskuna)

## Model (uskuna kabi)
Terminalni serverga **bir marta** bog‘lab sozlaydi.  
Ish jarayoni sozlangach Link **ochiq turishi shart emas** — jarayon davom etadi.

| Vazifa | Qayerda |
|--------|---------|
| 1. Qurilmani 0→serverga ulash | Link: **Подключение / Ulash** |
| 2. Tunnel / tarmoq tiklash (IP o‘zgarishi) | Link: **Восстановление / Tiklash** |
| Yuz sync | Web «Синхронизировать» → server → ofis PC fon tunnel → terminal |
| Otmetkalar | Terminal → Web (to‘g‘ridan-to‘g‘ri) |

## Windows + Android — bir xil 2 bo‘lim
1. **Ulash / Подключение** — pairing, lokatsiya, parol, Ulash  
2. **Tiklash / Восстановление** — tarmoq qayta ulash (+ Windows’da tunnel restore)

Android tunnel ochmaydi (LAN GW yo‘q); tunnel tiklash — ofis PC Windows Link.

## Kundalik
- Link yopiq turishi mumkin  
- Ofis PC yoniq (fon tunnel / login task) — yuz sync uchun  
- Punches: hikPush, Link qatnashmaydi  

## Build (Windows EXE)
`tools/office-link/BUILD-EXE.bat` → `HRHUB-Qurilma.exe`  
`pack-setup.bat` → o‘rnatiladigan Setup.exe  

Default UI: **Tkinter** (oddiy Windows ilova). WebView: `OFFICE_LINK_UI=webview`.
