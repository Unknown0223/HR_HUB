# F12 — passwordEnc DROP + employees filterBand

> **Sana:** 2026-09-21 · Oldingi: [F11_REMAINING_BACKLOG.md](./F11_REMAINING_BACKLOG.md)

## Oddiy maqsad
Qurilma parolini to‘liq vaultga ko‘chirish (ustunni olib tashlash) va employees filtr overlapini tuzatish.

| # | Vazifa | Done mezon | Holat |
|---|--------|------------|-------|
| 1 | Backfill passwordEnc → vault | `vault:backfill` + prod-migrate | ✅ |
| 2 | Vault-only kod | Column o‘qish/yozish yo‘q | ✅ |
| 3 | Prisma DROP `password_enc` | `20260921143000_drop_device_password_enc` | ✅ |
| 4 | Employees filterBand | `pageHeaderFilters` wrap | ✅ |
| 5 | Verify | unit **82/82** + tsc + smoke | ✅ |

## Eslatma
Lab/prod da `DEVICE_CREDENTIAL_VAULT_KEY` (yoki `DEVICE_LINK_KEY` / `PUNCH_INGEST_API_KEY`) bo‘lishi shart — aks holda backfill plaintext qolgan qurilmalar uchun migrate to‘xtaydi.
