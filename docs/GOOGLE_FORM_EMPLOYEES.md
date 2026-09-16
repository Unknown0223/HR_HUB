# Google Form → HR HUB (yangi xodim)

Ariza Google Form orqali to‘ldiriladi; **Apps Script** har bir javobni
`POST /api/employee-form/ingest` ga yuboradi — xodim bazaga yoziladi.

## Maydonlar

| Form | API kalit | Majburiy |
|------|-----------|----------|
| Familiya | `lastName` | ha |
| Ism | `firstName` | ha |
| Otasi ismi | `middleName` | yo‘q |
| Telefon / Email / Telegram | `phone` `email` `telegramUsername` | yo‘q |
| PINFL, tug‘ilgan sana, jins | `pinfl` `birthDate` `gender` | yo‘q |
| Pasport maydonlari | `passport*` | yo‘q |
| Bo‘lim / lavozim (kod yoki nom) | `divisionCode` `positionCode` | yo‘q |
| Shtat / GPH | `employmentType` | yo‘q |
| Qabul sanasi | `hiredAt` | yo‘q |
| Tabel (bo‘sh = avto) | `tabNumber` | yo‘q |
| Face ID PIN | `externalId` | yo‘q |
| Manzil / izoh | `address` `note` | yo‘q |

To‘liq schema: `GET /api/employee-form/schema`

## Sozlash

1. Railway API env:
   ```
   EMPLOYEE_FORM_INGEST_KEY=<uzun-random-kalit>
   ```
2. [tools/google-form-employee/Code.gs](../tools/google-form-employee/Code.gs) ni
   Google Apps Script loyihasiga nusxalang.
3. `CONFIG.API_URL`, `FORM_KEY`, `TENANT_CODE` ni to‘ldiring.
4. `createHrHubEmployeeForm` ni Run qiling → form URL chiqadi.
5. Web: **Настройки → Google Form (xodimlar)** — yo‘riqnoma va schema.

## Sinov

```bash
curl -X POST "$API/api/employee-form/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Employee-Form-Key: $EMPLOYEE_FORM_INGEST_KEY" \
  -d '{"tenantCode":"demo","lastName":"Karimov","firstName":"Ali","phone":"+998901112233"}'
```
