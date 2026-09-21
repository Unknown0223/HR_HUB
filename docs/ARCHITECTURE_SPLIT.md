# F5 — Catalog / god-service split

> Pattern: extract domain service → CatalogService thin-delegates → controller uses domain service for lifecycle routes.

## Done
| Slice | Service | Status |
|-------|---------|--------|
| Incidents + types | `incidents-catalog.service.ts` | ✅ F5 |
| Clearance complete/cancel + templates | `clearance-catalog.service.ts` | ✅ F7/F9 |
| GPH activate/close/post/unpost | `gph-catalog.service.ts` | ✅ F8 |
| Tariff approvals | `tariff-catalog.service.ts` | ✅ F8 |
| Name / wage changes | `hr-changes-catalog.service.ts` | ✅ F9 |
| Settlements / sales / payment | `finance-catalog.service.ts` | ✅ F9 |
| Timesheet corrections | `timesheet-catalog.service.ts` | ✅ F10 |
| Schedules / rosters / shifts | `schedules-catalog.service.ts` | ✅ F10 |
| Hours helpers | `catalog-hours.util.ts` | ✅ F10 |
| Reports / dashboards | `reports-catalog.service.ts` | ✅ F11 |
| Shared constants | `@hr-hub/shared` (ROLES, NATS, PunchEvent) | ✅ wired in API punch consumer |

## Next slices (priority)
1. Generic CRUD remains in CatalogService (stable)
2. Optional: mobile / web ESLint / EmployeeCard pixel (dizayn zip)

## Rules
- New lifecycle endpoints → domain service, not more LOC in `catalog.service.ts`
- Prefer typed Prisma enums over `as any`
- `passwordEnc` column: **DROPPED** (F12) — vault-only via `DeviceCredentialVault`
- Prod DB: prefer `db:deploy` over `db:push` once baseline migration exists

## Shared package
```bash
npm run build -w @hr-hub/shared
```
API depends on `@hr-hub/shared`. CI builds shared before API tsc.
