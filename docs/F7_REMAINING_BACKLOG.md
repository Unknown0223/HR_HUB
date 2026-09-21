# F7 — Qoldiqlarni yopish (final backlog)

> **Sana:** 2026-09-21 · Oldingi: F0–F6 ([IMPROVEMENT_MASTER_PLAN.md](./IMPROVEMENT_MASTER_PLAN.md))

## Maqsad
F1–F5 dagi ochiq qarzlarni yakunlash yoki aniq «done / deferred» qilib yopish.

| # | Vazifa | Done mezon | Holat |
|---|--------|------------|-------|
| 1 | Helmet CSP (Swagger-compatible) | Prod/lab CSP yoqilgan; `/docs` ochiladi | ✅ |
| 2 | passwordEnc vault-first | Vault OK → `passwordEnc = null` | ✅ |
| 3 | Clearance domain slice | `ClearanceCatalogService` + unit rules | ✅ |
| 4 | Positions filterBand | Filtr overlap yo‘q | ✅ |
| 5 | Verify | unit 63 + ports + smoke + CSP header | ✅ |

## Deferred (keyingi sprint — aniq chegara)
- Employees/positions **pixel-perfect** Arena (dizayn zip merge)
- `passwordEnc` DB column **DROP** (to‘liq migratsiya)
- Catalog to‘liq split (GPH, tariff, …)
- Live smoke CI (Postgres service)
