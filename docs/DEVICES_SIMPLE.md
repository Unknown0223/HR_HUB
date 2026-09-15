# Qurilmalarni Railway platformaga ulash (sodda)

## Model (serverdan yuz sync)

1. Web → **Устройства → Привязка** → pairing token  
2. Ofis Wi‑Fi da **HR HUB Link** → **Ulash**  
3. Webda **«Подтвердить привязку»**  
4. Web **«Синхронизировать»** — yuzlar **serverda navbatga** tushadi  
5. Ofisdagi **agent** navbatni olib terminalga yozadi / keraksizlarni o‘chiradi  

| Funksiya | Qanday |
|----------|--------|
| Otmetkalar | Terminal → Web (HttpHost), agent kerak emas |
| Yuz yuklash / tozalash | Web sync → **server navbati** → ofis agent → terminal |
| Agent (PC) | Ulashdan keyin fon `face_worker` / `service_worker` (tunnel **majburiy emas**) |
| Agent (telefon) | Link ochiq + ofis Wi‑Fi — har ~45s avtomatik |

**Muhim:** Railway `192.168…` ga kira olmaydi. Shuning uchun yozishni ofis tarmog‘idagi agent qiladi — lekin buyruq va navbat **serverdan** (Web sync). Qo‘lda `START-GW.bat` / tunnel endi yuzlar uchun shart emas.

Wi‑Fi o‘zgasa: Link → **Tarmoqni qayta ulash**.
