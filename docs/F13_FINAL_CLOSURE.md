# F13 — Final closure (Arena + docs)

> **Sana:** 2026-09-21 · Oldingi: [F12_REMAINING_BACKLOG.md](./F12_REMAINING_BACKLOG.md)

## Maqsad
Qolgan ochiq qarzni yopish: employees Arena parity, docs sync.

| # | Vazifa | Holat |
|---|--------|-------|
| 1 | `/employees` Arena toolbar + filterBand + bulkBar | ✅ |
| 2 | Positions allaqachon Arena (filterBand/FormModal) — tasdiqlandi | ✅ |
| 3 | Docs / STATUS / design status sync | ✅ |
| 4 | Verify | ✅ |

## Verify (2026-09-21)
- Unit **82/82** (`npm test -w @hr-hub/api`)
- Web `tsc --noEmit` yashil
- `smoke:quickstart` 9/10 (auto org)
- `check:ports` OK · API `/docs` **200**

## Izoh
`_design` shablonlari lokalda buzilgan (null-filled) — pixel merge zip tiklanmaguncha in-repo Arena pattern ishlatildi.

Ixtiyoriy (reja tashqari): mobile `/m`, web ESLint to‘liq, EmployeeCard/org-chart pixel fine-tune.
