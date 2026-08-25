# HR HUB — Verifix Backend 1:1 Plan

**Goal:** Backend/DB/API/business-logic parity with Verifix catalog workflows (approve/post, attendance→payroll FOT chain).  
**Not the goal:** Frontend pixel-clone of Verifix Excel UI.

**Demo:** `admin@demo.local` / `Demo1234!` · API `:3001` · Web `:3000`  
**Builds:** `npm.cmd run build:api`  
**Related:** `docs/FULL_STACK_GAP_PLAN.md` (FE mega-nav / URL uniqueness — keep; this plan extends backend workflows)

> FE mega-nav uniqueness is tracked in `FULL_STACK_GAP_PLAN.md`. Backend lifecycle / post / FOT chains are tracked **here**.

**Sources:** `output/run_20260724_104411/modules_clean.txt`, `bolimlar_katalogi.json`, `captures.json`

---

## 1. Scope definition

### What “backend 1:1” means

| Area | In scope |
|------|----------|
| **Entities** | Same business objects Verifix lists (employees, absences, HR docs, name/wage changes, clearance, timesheet, periods, advances, accruals, FOT inputs) |
| **Statuses** | Explicit lifecycle enums (draft / pending / approved / rejected / posted / closed / …) matching Verifix document semantics |
| **Transitions** | Guarded API actions: approve/reject, провести (post), calculate, close, reopen, complete clearance |
| **Side effects** | Post/approve mutates employee, attendance days, salary, payroll lines — not “status-only” stubs |
| **Reports calc** | Timesheet → period calculate → vedomost / FOT totals from real lines |

### Out of scope

| Item | Reason |
|------|--------|
| UI pixel / Excel clone | Explicitly not requested |
| Hikvision live UAT / real device pairing | Hardware; mock/GW stays |
| Mobile apps | Not in web scope |
| Kubernetes / production HA | Infra |
| Live 1C / bank payment rails | Stubs only (config + sync button) |
| Create-noise Verifix screens excluded from mega-nav | Already filtered |
| Git commit unless asked | User rule |

---

## 2. Inventory — Verifix workflows → HR HUB gaps

### Legend

| Gap | Meaning |
|-----|---------|
| OK | Entity + transitions + side effects exist |
| PARTIAL | CRUD or calc exists; missing post/approve side effects or lifecycle |
| MISSING | No status machine / no post / no day-payroll impact |

### Кадры

| Verifix module | HR HUB today | Gap |
|----------------|--------------|-----|
| Сотрудники / Уволенные / ГПХ | Employees API + employment status | OK (CRUD) |
| Физические лица | Persons API | OK |
| Все кадровые документы | `HrDocument` create/list | **PARTIAL** — no draft→posted; post does not hire/transfer/dismiss |
| Договор ГПХ + услуги | Catalog GPH | PARTIAL — no post/activate semantics |
| Реестр изменения имени | Catalog `name-changes` applies on create | **PARTIAL** — immediate apply, no провести |
| Все изменения в оплате труда | Catalog `wage-changes` applies on create | **PARTIAL** — same |
| Обходные листы | Clearance sheets + item patch | **PARTIAL** — no complete/post when all items done |
| Все отсутствия | Absence create + status patch | **PARTIAL** — approve does **not** set `AttendanceDay` → leave |
| Типы отпуска | AbsenceType | OK |
| Корректировки табеля | Catalog apply on create | OK (immediate correction — acceptable) |
| Заявки на кадровые изменения | HrRequest review approve/reject | **PARTIAL** — no side effects on approve |
| Оргструктура / разряды / тарифы / позиции | Catalog + org APIs | OK / PARTIAL (tariff approval status exists, weak enforce) |
| Инциденты | Catalog | OK (status fields) |

### Посещения

| Verifix module | HR HUB today | Gap |
|----------------|--------------|-----|
| Отметки / punch ingest / QR / GPS | `recalcDay` → on_time/late | **OK** (core chain) |
| Mark absents | `POST days/mark-absents` | OK |
| Запросы на отсутствие + scopes | HrRequest filters | PARTIAL — approve ≠ day impact |
| Виды отсутствий | AbsenceType | OK |
| Графики / смены / overrides / devices / QR / GPS tracks / trips | Catalog + attendance | OK (CRUD); schedule_change request side effect MISSING |
| Проблемные отметки | ProblemMark | OK |

### Зарплата

| Verifix module | HR HUB today | Gap |
|----------------|--------------|-----|
| Табель | `GET /payroll/timesheet` | OK (read from AttendanceDay) |
| Политики штрафов | PayrollPolicy | OK |
| Месяц / период | open → calculate → closed | **PARTIAL** — no reopen; calculate ignores advances as lines |
| Ведомость | `GET periods/:id/vedomost` | OK |
| Аванс | create/list advances | **PARTIAL** — no draft/paid; not folded into calculate as deduction lines |
| Ручные / разовые / бонус / удержание | Manual lines + catalog types | OK |
| Поручения / взаиморасчёты / пары / ГПХ / sales / займы | Catalog | PARTIAL (status fields; weak lifecycle) |

### Отчетность

| Verifix module | HR HUB today | Gap |
|----------------|--------------|-----|
| T-13 / marks / lateness / HR movement | Reports module | OK |
| ФОТ | `GET /reports/payroll/fot` | **PARTIAL** — aggregates lines; needs calculated period + advance lines for honesty |
| Catalog analytics reports | Catalog analytics | OK (rows) |

### Настройки

| Verifix module | HR HUB today | Gap |
|----------------|--------------|-----|
| Org / dictionaries / users / integrations / audit | Settings APIs | OK for backend CRUD (FE gap plan covered) |

---

## 3. Priority backlog (acceptance criteria)

### P0 — Critical chains (implement first)

#### P0.1 Punch → AttendanceDay
- [x] **API:** punch ingest / QR / GPS call `recalcDay`
- [x] **Prisma:** `DayStatus` on_time \| late \| absent \| …
- [x] **Machine:** marks present → on_time/late; mark-absents → absent
- [x] **Seed:** late marks + days for lateness report
- **Acceptance:** IN after grace → `late` + `lateMinutes`; no mark + mark-absents → `absent`

#### P0.2 Absence / request approve → day impact
- [x] **API:** `PATCH /hr/absences/:id/status` when `approved` writes `AttendanceDay.status=leave` for each date in `[start,end]` (skip day_off if schedule known; overwrite absent/not_started/on_time/late)
- [x] **API:** reject/cancel does not leave days as leave (revert leave→not_started only if no marks that day)
- [x] **API:** `PATCH /hr/requests/:id/review` approved + `type=absence` applies payload dates or linked absence; approved `schedule_change` / `roster_change` creates override when payload has `scheduleId`+dates
- [x] **Seed:** pending absence + pending absence-request; smoke approve → days=leave
- **Acceptance:** after approve, timesheet shows leave for those dates; calculatePeriod treats leave as worked (paid) per existing policy

#### P0.3 Timesheet → payroll lines / FOT
- [x] **API:** `POST /payroll/periods/:id/calculate` builds base+penalty from AttendanceDay
- [x] **API:** calculate also materializes `PayrollLineType.advance` (negative) from period advances (idempotent replace)
- [x] **API:** `PATCH /payroll/periods/:id/reopen` closed→open (clears closedAt); only tenant_admin/hr
- [x] **API:** vedomost + FOT read lines
- [x] **Seed:** period with days + advance; after calculate FOT total = sum(lines) including advances
- **Acceptance:** timesheet counts match day statuses; FOT non-empty after calculate; advance reduces net in vedomost **and** appears as line type

#### P0.4 HR documents / name / wage / clearance «провести»
- [x] **Prisma:** `DocumentLifecycle` enum `draft \| posted \| cancelled`; fields on `HrDocument`, `EmployeeNameChange`, `WageChange` (`status`, `postedAt`, `postedBy?`); `HrDocument.payload` Json?
- [x] **API:** create name/wage/doc as **draft** (fill old* only; **do not** mutate employee until post)
- [x] **API:** `POST /api/catalog/name-changes/:id/post`, `wage-changes/:id/post` apply employee + stamp posted
- [x] **API:** `POST /api/hr/documents/:id/post` — hire/transfer/dismiss/name_change/wage_change side effects from type+payload
- [x] **API:** `POST /api/catalog/clearance-sheets/:id/complete` — all items done|skipped → `completed` + completedAt; else 400
- [x] **Seed:** draft name-change, draft wage-change, draft hr document dismiss; one clearance ready to complete
- **Acceptance:** create does not change employee; post does; double-post 400; clearance complete blocked if pending items

#### P0.5 Payroll advance lifecycle
- [x] **Prisma:** `AdvanceStatus` draft \| paid \| cancelled on `PayrollAdvance`
- [x] **API:** create default `paid` (compat) or `draft`; `POST /payroll/advances/:id/pay` → paid
- [x] **Calculate:** only `paid` advances become deduction lines
- **Acceptance:** draft advance ignored by calculate; after pay + calculate, line exists

### P1 — Hardening

- [x] Tariff approval: only `approved` tariff groups usable on staff positions (validate on create/update)
- [x] Payment order status transitions open→sent→paid
- [x] Settlement open→matched→closed helper endpoint
- [x] GphContract activate/close
- [ ] Incident resolve/close helpers (if not via catalog patch)
- [x] HrDocument unpost (posted→draft) with reverse side effects where safe
- [x] Notifications on approve/post (wire existing notifications service)

### P2 — Reports / polish

- [x] FOT response include `rows[]` per employee (net, base, penalty, advance)
- [x] Smoke script `scripts/smoke-backend-1to1.js` covering P0 chains
- [x] RecalcDay respects approved leave (do not overwrite leave with late from punch unless forced)

### P3 — Explicit defer

- [ ] Live device UAT, 1C/bank rails, K8s, mobile, pixel UI

---

## 4. Critical chains (detail)

```
Punch/Mark ──► AttendanceDay (on_time|late|absent)
                    │
Absence/Request approve ──► AttendanceDay (leave)
                    │
TimesheetAdjustment ──► AttendanceDay (any status)
                    │
                    ▼
            GET /payroll/timesheet
                    │
                    ▼
     POST /payroll/periods/:id/calculate
         ├── base / penalty lines from days
         └── advance lines from paid advances
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
  GET …/vedomost         GET /reports/payroll/fot
         │
         ▼
  PATCH …/close  (optional reopen)

NameChange/WageChange/HrDocument: draft ──post──► employee mutated + postedAt
ClearanceSheet: items done ──complete──► completed
```

---

## 5. Implementation order + dependency graph

```
1. Prisma enums/fields (DocumentLifecycle, AdvanceStatus, payload)
        │
        ├─► 2a. Attendance day helpers (applyLeaveRange / revertLeaveRange)
        │         └─► 2b. Absence approve + HrRequest review side effects
        │
        ├─► 3a. Catalog post endpoints (name/wage) + defer apply-on-create
        │         └─► 3b. HrDocument post + clearance complete
        │
        └─► 4. Payroll calculate advances + reopen + advance pay
                  └─► 5. FOT rows + seed scenarios + smoke + build:api
```

Parallelizable after step 1: (2a/2b) ∥ (3a/3b) ∥ (4).

---

## 6. Checkbox tracker (session progress)

### Phase A — Plan
- [x] This file created (`VERIFIX_BACKEND_1TO1_PLAN.md`)
- [x] Cross-link from gap plan mindset (FE plan kept separate)

### Phase B — Implement
- [x] Prisma: DocumentLifecycle + AdvanceStatus + fields
- [x] Absence approve → leave days (+ reject revert)
- [x] HrRequest approve side effects (absence / schedule)
- [x] Name/wage draft→post (catalog)
- [x] HrDocument draft→post
- [x] Clearance sheet complete
- [x] Payroll: advance lines on calculate + reopen + advance pay
- [x] FOT employee rows
- [x] Seed workflow scenarios
- [x] Smoke script + `build:api` green
- [x] RecalcDay respects leave (P2 if time)

### Still open (P1 / next session)
- [ ] Incident resolve/close helpers (if not via catalog patch)
- [ ] HrRequest approve smoke coverage in script (absence request path)

### FE + import/export (audit A–F, 2026-07-25)
- [x] FE провести/завершить/выплатить/reopen + status badges
- [x] Excel/CSV export (exceljs) + ImportPanel (employees, lines, advances)
- [x] FilterPanel URL-synced
- [x] Print for HR docs / clearance
- [x] Smoke `scripts/smoke-ui-actions.js` (import, export, tariff approve, PO chain, unpost, GPH)

---

## 7. Progress log

| Date | Note |
|------|------|
| 2026-07-25 | Plan authored from Verifix catalog + current Prisma/API audit; Phase B started |
| 2026-07-25 | P1 lifecycle: tariff approve/reject + staff-position guard, settlement/sales-accrual/payment-order/GPH transitions, HR doc unpost, payroll line post, notifications on post/approve; schema + seed updated; `build:api` green |
| 2026-07-25 | FE wired for A–F gaps; import/export APIs; FilterPanel; `smoke-ui-actions.js` 7/7; builds green |
