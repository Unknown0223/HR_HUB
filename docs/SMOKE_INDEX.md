# Smoke test indeksi

> F6. Skriptlar: `scripts/smoke-*.js` · ishlatish: `npm run smoke:<name>`

## Majburiy (regression / Prisma o‘zgarishi / deploy oldidan)

| npm script | Nima tekshiradi |
|------------|-----------------|
| `npm run smoke` / `smoke-test.js` | Face ID E2E (upload → sync → punch → mark) |
| `npm run smoke:quickstart` | Auth + asosiy org/HR oqimlari |
| `npm run smoke:system-settings` | System settings CRUD |
| `npm run check:ports` | Docs/port drift (CI) |

## Tavsiya (modul bo‘yicha)

| Guruh | Skriptlar |
|-------|-----------|
| HR / org | `smoke:organizations`, `smoke:users-admin`, `smoke:countries`, `smoke:banks`, `smoke:employment-sources` |
| Davomat | `smoke:schedules` / individual / position / rosters / shift-assignments |
| Payroll | `smoke:timesheets`, `smoke:accruals`, `smoke:vedomost`, `smoke:settlements`, `*-fullstack` juftlari |
| Integratsiya | `smoke:artix`, `smoke:iiko`, `smoke:billz` |
| HR HUB | `smoke:catalog-reports`, `smoke-backend-1to1.js` |

## CI

- Unit: `npm test -w @hr-hub/api`
- Ports: `npm run check:ports`
- Live: `smoke-quickstart` job — CI Postgres → migrate → seed → API → `npm run smoke:quickstart` (F8)

## Qoida

Yangi modul CRUD qo‘shsangiz — kamida bitta `smoke-<modul>.js` yoki mavjud fullstack smoke ga qadam qo‘shing.
