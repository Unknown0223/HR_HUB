# Google Form / Web App → HR HUB (yangi xodim)

**Gmail:** Google Form ga skript «Fayl yuklash» qo‘sha olmaydi.
Shu sabab **Web App** forma ishlatiladi — kandidat rasmni to‘g‘ridan-to‘g‘ri yuklaydi.

## Web App (tavsiya, Gmail)

1. [script.google.com](https://script.google.com) → yangi loyiha  
2. Fayllar: `Code.gs`, `SampleBlobs.gs`, `WebApp.html`  
3. `CONFIG` ni to‘ldiring (`FORM_KEY` = Railway `EMPLOYEE_FORM_INGEST_KEY`)  
4. `printWebAppDeployHelp` ni Run qiling  
5. **Deploy → New deployment → Web app**  
   - Execute as: **Me**  
   - Who has access: **Anyone**  
6. URL ni kandidatlarga yuboring  

## Google Form (ixtiyoriy)

`createHrHubEmployeeForm` / `updateHrHubEmployeeForm` — matn maydonlari.
Rasm uchun Web App yoki formada qo‘lda «Загрузка файла».

## Maydonlar

| Maydon | Majburiy |
|--------|----------|
| Familiya, Ism, Telefon | ha |
| Yuz rasmi, Pasport rasmi | ha |
| PINFL, pasport, bo‘lim, lavozim… | yo‘q |

## Allaqachon yig‘ilgan «Ответы» + **rasmlar**

Drive fayllari **ochiq** bo‘lmasa Node/skript ularni ocholmaydi (Google login HTML).  
**Egasi sifatida** Apps Script `DriveApp` ochadi — yoki papkalarni Download qilib lokal attach.

## Drive silka → rasm (zip yuklamasdan)

Google Sheets dagi `drive.google.com/open?id=…` **silka** — fayl emas.
Yopiq Drive ni Node ocholmaydi → **Apps Script `DriveApp`** (egasi huquqi).

### A) Lokal — tunnel + sync (tavsiya)

```bash
node scripts/start-drive-photo-tunnel.js
```

Chiqqan `https://….trycloudflare.com` ni Apps Script `CONFIG.API_URL` ga qo‘ying,
keyin **`syncPhotosFromDriveLinksOnly`** → Run (zip yo‘q).

### B) Photo-proxy (Node pull)

1. `tools/google-form-employee/Code.gs` ni Script editorga paste  
2. **Deploy → Web app** (Me / Anyone)  
3. `printPhotoProxyHelp` → URL ni oling  
4. `.env`:
```env
GOOGLE_DRIVE_PHOTO_PROXY=https://script.google.com/macros/s/XXXX/exec
EMPLOYEE_FORM_INGEST_KEY=<CONFIG.FORM_KEY>
```
5. API restart, keyin:
```bash
node scripts/attach-photos-from-drive-links.js
```
XLSX dagi yuz/pasport **silkalari** proxy orqali o‘qiladi va xodimga birikadi.

### C) Lokal xlsx import (matn + ochiq Drive)

```bash
node scripts/import-google-form-xlsx.js "path/to/Ответы.xlsx" demo
node scripts/backfill-google-form-org-photos.js "path/to/Ответы.xlsx"
```

`facePhotoUrl` / `passportPhotoUrl` yuboriladi — Drive **Anyone with link** bo‘lsa server yuklaydi.

### API

| Method | Path | Vazifa |
|--------|------|--------|
| POST | `/api/employee-form/ingest` | Yangi xodim (+ base64 yoki photo URL) |
| POST | `/api/employee-form/attach-photos` | Mavjud xodimga rasm (FIO/tel yoki employeeId) |

Header: `X-Employee-Form-Key: $EMPLOYEE_FORM_INGEST_KEY`
