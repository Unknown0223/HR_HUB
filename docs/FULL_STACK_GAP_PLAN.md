# HR HUB — Full-Stack Gap Plan

**Goal:** Every mega-nav link opens a dedicated working full-stack screen (or a clearly dedicated tab with its own API filters/data). No fake redirects to unrelated shared pages.

**Demo:** `admin@demo.local` / `Demo1234!` · API `:3001` · Web `:3000`  
**Builds:** `npm.cmd run build:api` / `npm.cmd run build:web`  
**Dashboard:** Keep current two attendance tables (no donut) unless explicitly changed below.

---

## 1. Inventory — Mega-nav vs unique pages/APIs

### Legend
| Status | Meaning |
|--------|---------|
| OK | Dedicated route + API + data |
| SHARED | Multiple menu labels hit the same tab/route without distinct filters |
| SHALLOW | Route exists but missing URL sync / filter / seed |
| MISSING | No unique filter or incomplete CRUD |

### Кадры
| Menu label | Current href | Status | Notes |
|------------|--------------|--------|-------|
| Сотрудники | `/employees` | OK | Needs `?tab=` URL sync |
| Уволенные / ГПХ | `/employees?tab=…` | SHALLOW | Page ignores `searchParams` |
| Физические лица | `/catalog/persons` | OK | Legacy persons API |
| Кадровые документы | `/catalog/hr-documents` | OK | |
| Договор ГПХ + GPH lists | catalog / employees | OK / SHALLOW | |
| Name/wage changes, clearance, incidents, grades, etc. | `/catalog/*` | OK | Need richer seed |
| Все отсутствия | `/attendance?tab=absences` | SHALLOW | No URL tab sync |
| Заявки на кадровые изменения | `/attendance?tab=requests` | SHARED | Same as all request menus |
| Оргструктура / divisions / positions | `/divisions` | SHALLOW | Tab URL sync |
| Dashboard links (диаграмма / посещения) | `/dashboard` | SHARED (intentional) | Same stats page — OK keep |
| Кадровые изменения / перемещения | `/reports?tab=hr` | SHARED | Need `groupBy` variants |

### Посещения — **highest SHARED concentration**
| Menu label | Current href | Status | Fix |
|------------|--------------|--------|-----|
| Запросы на отсутствие | `?tab=absences` | SHALLOW | URL sync |
| Мои / Доступные / Запросы мне / Мои запросы / Общие | `?tab=requests` | SHARED | `scope=` + API |
| Изменение графика | `?tab=requests` | SHARED | `type=schedule_change` |
| Изменение расписания | `?tab=requests` | SHARED | `type=roster_change` (new enum) |
| Локация / Сверхурочные / Кадровые | `?tab=requests` | SHARED | `type=` filters |
| Устройства / Новые устройства | `?tab=devices` | SHARED | `filter=new` |
| Графики / Расписания | `?tab=schedules` | SHARED | Split view modes `mode=schedules\|rosters` |
| Marks / days / GPS / problems / QR / locations | unique tabs | SHALLOW | URL sync |
| Catalog: location-types, shifts, overrides, trips, gps-tracks | `/catalog/*` | OK | Seed |

### Зарплата
| Menu label | Current href | Status | Fix |
|------------|--------------|--------|-----|
| Табель / политики / месяц / ведомость / аванс / ручные | `/payroll?tab=…` | SHALLOW | URL sync |
| Все / Разовые / Бонусные / Начисление / Удержание | `/catalog/payroll-lines` | SHARED | `?type=` + server filter |
| Поручения, взаиморасчёты, пары, ГПХ услуги, sales, займы | `/catalog/*` | OK | Seed |

### Отчетность
| Menu label | Current href | Status | Fix |
|------------|--------------|--------|-----|
| Catalog reports (`/catalog/reports/*`) | analytics APIs | OK | Columns + CSV already; seed denser |
| T-13 / marks / lateness / FOT | `/reports?tab=…` | SHALLOW | URL sync + Excel already for some |
| Движение (подразделения) vs (штаты) | `/reports?tab=hr` | SHARED | `groupBy=division\|staff` |
| Шаблоны | `/catalog/report-templates` | OK | Seed |

### Настройки
| Menu label | Current href | Status | Fix |
|------------|--------------|--------|-----|
| Главное / Организация | `?tab=org` | SHARED | Split `main` vs `org` |
| Справочники / Доп. справочники | `?tab=dictionaries` | SHARED | Split `extra` via `kind` |
| Users / integrations / audit / tenants | OK | SHALLOW | URL sync |

---

## 2. Prioritized backlog by section

### P0 — Shared-route elimination (must)
1. Attendance request scopes + types (dedicated query params + API)
2. Payroll-lines type filters (server + nav)
3. Settings main / org / dictionaries / extra
4. Reports HR movement `groupBy`
5. Devices `filter=new`; schedules `mode=`
6. URL `?tab=` sync on all multi-tab pages

### P1 — Seed + filters so every screen is non-empty
7. Seed HrRequest for every type + scope markers
8. Seed catalog transactional rows (incidents, loans, vacancies, …)
9. Seed extra dictionaries + payroll line types
10. Catalog list `type` query for payroll-lines

### P2 — Reports polish
11. Ensure each catalog report returns `{ title, rows[] }` with stable columns
12. CSV export (existing); Excel where cheap (reuse exceljs from reports module)

### P3 — Acceptance hardening
13. Wire mega-nav + catalog-nav hrefs to unique URLs
14. `build:api` + `build:web` green

---

## 3. Backlog items (FE / API / Prisma / acceptance)

### A. Attendance requests — dedicated filters
- [x] **FE:** `/attendance?tab=requests&type={absence\|schedule_change\|roster_change\|overtime\|location\|hr_change}&scope={all\|mine\|available\|to_me\|shared}`
- [x] **API:** `GET /hr/requests?type=&scope=&status=` (+ optional `createdByUserId`)
- [x] **Prisma:** extend `RequestType` with `roster_change`; add `HrRequest.createdByUserId`, `assigneeUserId`, `visibility` (`personal` \| `shared` \| `inbox`)
- [x] **Acceptance:** each mega-nav request link shows only matching rows; create form defaults type; seed ≥1 row per type/scope; approve/reject works

### B. Absences / marks / devices / schedules URL sync
- [x] **FE:** `useQueryTab` hook; attendance reads/writes `tab`, `type`, `scope`, `filter`, `mode`
- [x] **API:** `GET /attendance/devices?filter=new` (no `lastSeenAt` or status offline/new)
- [x] **API:** schedules list unchanged; FE `mode=rosters` shows assignment-focused columns
- [x] **Acceptance:** deep-link from mega-nav opens correct tab+filter with data

### C. Payroll lines subtypes
- [x] **FE:** `/catalog/payroll-lines?type=base\|bonus\|penalty\|deduction\|other\|one_time` (map «Разовые»→`other`/`one_time`, «Начисление»→`base`, «Удержание»→`deduction`, «Бонусные»→`bonus`)
- [x] **API:** catalog `list` accepts `type` when resource has `type` field
- [x] **Prisma:** optional — add `one_time` to `PayrollLineType` OR map one-time → `other` with description prefix (prefer add enum value)
- [x] **Acceptance:** five nav links show distinct filtered lists; CRUD respects default type

### D. Employees / divisions / payroll / reports / settings URL sync
- [x] **FE:** all multi-tab pages honor `searchParams` and update URL on tab change
- [x] **Acceptance:** `/employees?tab=dismissed` opens dismissed; same for payroll/settings/reports/divisions

### E. Settings split
- [x] **FE:** tabs `main` (summary + locale/currency), `org` (legal fields), `dictionaries`, `extra` (dictionaries with `kind=extra`)
- [x] **API:** dictionaries list/filter by `kind`; create accepts `kind`
- [x] **Prisma:** `Dictionary.kind` String default `core` (`core` \| `extra`)
- [x] **Acceptance:** Главное ≠ Организация UI; доп. справочники only `kind=extra`

### F. HR movement reports
- [x] **FE:** `/reports?tab=hr&groupBy=division` and `groupBy=staff`
- [x] **API:** `GET /reports/hr/movement?year=&groupBy=division|staff` returns matching aggregation
- [x] **Acceptance:** two nav links show different tables (by division vs by position/staff)

### G. Seed completeness
- [x] Seed rows for: hr requests (all types/scopes), incidents, clearance sheets, name/wage changes, grade history, internal trips, gps tracks, payment orders, settlements, sales accruals, loans+payments, travel expenses, candidates, vacancies, relatives, access grants, report templates, timesheet adjustments, schedule overrides, position schedules, gph services, payroll lines of each type, extra dictionaries, “new” device
- [x] **Acceptance:** opening any mega-nav item shows ≥1 row (or explicit empty state only for filtered zero-match edge cases)

### H. Reports columns
- [x] Catalog report page: prefer `rows` array; column headers from first row keys; CSV always
- [x] Where analytics already return nested objects, normalize to `rows` in service if needed
- [x] **Acceptance:** no raw JSON dump when rows exist

### I. Mega-nav + catalog-nav wiring
- [x] Update `mega-nav.ts` and `catalog-nav.ts` hrefs to unique query URLs from this plan
- [x] Keep visual mega-nav UX unchanged (dark sidebar, under-tab open, bordered items)

---

## 4. Explicit out-of-scope

| Item | Reason |
|------|--------|
| Hikvision live UAT / real device pairing | Hardware; mock/GW register stays |
| Kubernetes / production HA | Infra not requested |
| Mobile apps | Not in web scope |
| Live 1C / bank payment rails | Integration stubs only (config + sync button) |
| Pixel-perfect Verifix Excel UI | CSV + existing Excel for T-13/lateness/marks/hr/fot; no huge new deps |
| Donut dashboard redesign | Keep two attendance tables |
| Create/pagination Verifix noise screens | Already excluded from mega-nav |
| Git commit / config changes | User did not ask |

---

## 5. Implementation order (dependencies first)

1. **Prisma schema** — `RequestType.roster_change`, `PayrollLineType.one_time`, `HrRequest` visibility fields, `Dictionary.kind` → migrate/push  
2. **API** — hr requests filters; catalog `type`; devices `filter=new`; settings dictionaries `kind`; reports `groupBy`  
3. **Seed** — dense demo data for all filters  
4. **Web hook** — `useQueryTab` / URL sync utility  
5. **Pages** — attendance, payroll, employees, divisions, settings, reports, catalog payroll-lines  
6. **Nav** — mega-nav + catalog-nav unique hrefs  
7. **Build** — `build:api`, `build:web`  
8. **Plan checkboxes** — mark done in this file  

---

## 6. PARTIAL-gap fixes (live audit 2026-07-25)

- [x] **1. `/catalog/reports/division-stats`** — FE `extractRows` (`lib/csv.ts`) now recognises the `divisions[]` key → table renders rows (was empty despite API 200)
- [x] **2. `/attendance?tab=problems`** — seed creates 3 unresolved `ProblemMark` rows (`unknown_employee`, `gps_out_of_range`, `gps_no_geofence`)
- [x] **3. `/attendance?tab=devices&filter=new`** — API tightened: `filter=new` ⇒ `lastSeenAt IS NULL` **AND** `status IN (new, registered)`; seed sets MOCK-001 online/seen, HK-DEMO-001 offline/seen-3d-ago, NEW-UNSEEN-01 `new`/never-seen → filter returns 1 of 3
- [x] **4. `/attendance?tab=schedules&mode=…`** — `GET /attendance/schedules?mode=rosters` includes assigned employees; FE renders distinct views: `schedules` = Kod/Nom/Vaqt/Grace/Xodimlar, `rosters` = Xodim/Tab№/Grafik/Vaqt/Grace (flattened assignments)
- [x] **5. `/attendance?tab=gps`** — GPS tab now lists `GET /api/catalog/gps-tracks` (Xodim/Lat-Lon/Aniqlik/Vaqt/Manba) instead of duplicating locations; geofence + GPS punch forms kept; seed adds 4 track points
- [x] **6. `/catalog/reports/grade-changes`** — seed adds 3 `EmployeeGradeHistory` rows (incl. recent dates); report default window widened to last 24 months
- [x] **7. `/reports?tab=lateness`** — seed creates 4 late `AttendanceDay` rows (today + past days in the current month, `lateMinutes` 12–40) + matching late IN mark for emp2 → summary and details non-empty
- [x] **8. `/settings?tab=audit`** — seed creates 5 `AuditLog` entries (login, org update, user create, integration sync, mark-absents)
- [x] **9. `/tenants`** — platform-only **by design**: `AppShell` already hides `badge: 'platform'` mega-nav items for non-`platform_admin`; demo tenant admin cannot open it. To test the page, login as the seeded platform admin: `platform@hrhub.local` / `Demo1234!` (no tenant header needed)
- [x] **Hardening:** `GET /api/payroll/timesheet` without `year`/`month` no longer 500s — defaults to current month (invalid values also fall back)

**Verification:** `node scripts/smoke-gap-fixes.js` (login → 10 checks) — all green 2026-07-25; `build:api` + `build:web` green.

---

## 7. Progress log

| Date | Note |
|------|------|
| 2026-07-24 | Plan created; implementation started |
| 2026-07-24 | Phase 2 completed: unique mega-nav filters, Prisma/API/seed/FE, builds green |
| 2026-07-25 | PARTIAL-gap audit fixes (section 6): 9 gaps + timesheet hardening, smoke script added |
| 2026-07-25 | Section 8: A–F UI/API gaps (провести, export/import, FilterPanel, lifecycle, print) |

### Checkbox tracker (updated during Phase 2)
- [x] A Requests FE+API+Prisma
- [x] B Attendance URL + devices/schedules
- [x] C Payroll-lines types
- [x] D Multi-page URL sync
- [x] E Settings split
- [x] F HR movement groupBy
- [x] G Seed
- [x] H Reports rows polish
- [x] I Nav wiring
- [x] Builds green

---

## 8. Audit gap close — A–F (2026-07-25)

Live audit: import ~0%, export partial, filters partial, view OK, провести API without FE.

### A. O‘tkazish / Провести UI
- [x] FE Провести: name-changes, wage-changes, HR documents
- [x] FE Завершить: clearance-sheets
- [x] FE Выплатить: advances; period reopen in payroll
- [x] Status badges (draft/posted/paid/completed/…) on lists

### B. Export
- [x] CSV on employees, attendance tabs, divisions, payroll lists, settings lists
- [x] Excel (server `exceljs`): employees, catalog `:resource/export.xlsx`, payroll lines/advances, catalog analytics subset, reports tabs
- [x] Catalog `[resource]` Excel next to CSV

### C. Import
- [x] `POST /api/employees/import`, `/payroll/lines/import`, `/payroll/advances/import` — JSON `{ rows }` + summary
- [x] FE ImportPanel (CSV preview + hint) on employees, payroll lines, advances, catalog payroll-lines

### D. Filters
- [x] Reusable `FilterPanel` (collapsible, URL sync)
- [x] Wired: employees, attendance, payroll (light), reports, catalog lists (`status`/`isActive`/`from`/`to`)

### E. Lifecycle / notifications
- [x] Tariff approve/reject + staff-position tariff guard
- [x] Settlements / sales-accruals / payroll-lines draft→posted (+ FE)
- [x] Payment orders open→sent→paid (+ FE)
- [x] GPH activate/close (+ FE)
- [x] HR document unpost (+ FE)
- [x] Notifications on HR doc / absence approve / name+wage post
- [ ] Incident resolve/close helpers (deferred — catalog patch enough)

### F. View/preview
- [x] PrintButton + PrintArea for HR documents & clearance sheets

**Verification:** `node scripts/smoke-ui-actions.js` · `build:api` + `build:web` green
