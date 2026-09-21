# F8 — Keyingi qoldiq (deferred dan)

> **Sana:** 2026-09-21 · Oldingi: [F7_REMAINING_BACKLOG.md](./F7_REMAINING_BACKLOG.md)

## Oddiy maqsad
F7 dan keyin qolgan texnik qarzni yopish — xavfsizlik qattiqlashishi, catalog bo‘lish, CI da jonli smoke.

| # | Vazifa | Done mezon | Holat |
|---|--------|------------|-------|
| 1 | Media JWT faqat sessionStorage | `localStorage` o‘qish yo‘q | ✅ |
| 2 | passwordEnc yozish vault-only | DB ga plaintext faqat vault fail | ✅ |
| 3 | GPH + tariff catalog slice | Domain service + thin delegate | ✅ |
| 4 | CI live `smoke:quickstart` | Postgres → migrate → seed → API → smoke | ✅ |
| 5 | Verify | unit **70/70** + tsc + smoke + ports | ✅ |

## Hali deferred (dizayn / migratsiya)
- Employees/positions **pixel-perfect** Arena
- `passwordEnc` column **DROP** (backfill + migration)
- Catalog qolgan slice lar (settlements, reports, …)
