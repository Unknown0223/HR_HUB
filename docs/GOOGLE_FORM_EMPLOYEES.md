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

Rasm: JPG/PNG, yuz markazda; pasport aniq.
