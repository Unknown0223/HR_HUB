# HR HUB — Shablon asosida redesign reja

> **Yagona manba shablon:** `_design/redesign-hr-hub-sections`  
> **Zip:** `redesign-hr-hub-sections (1).zip` (2026-09-04)  
> **Eski ARENA promptlar / boshqa shablonlar:** o‘chirilgan  
> **Qoida:** faqat UI; API/backend/DB o‘zgarmaydi. Har safar **bitta paket** to‘liq moslashtiriladi (asosiy sahifa + ichki sibling tablar).

---

## Qanday ishlaymiz

1. Siz **sahifa nomi** yoki **skrinshot** tashlaysiz.
2. Men shablondan mos faylni ochaman (`_design/redesign-hr-hub-sections/src/...`).
3. Loyihadagi `page.tsx` + `page.module.css` ni shu dizaynga **to‘liq** moslashtiraman.
4. **PageSubnav / sibling**lar (`form-siblings.ts`) — bir xil paketda hammasi redesign qilinadi (masalan: «Утверждения…» + «Тарифные группы»).
5. Siz `localhost` da tekshirasiz → keyingi paketga o‘tamiz.

---

## Doimiy majburiy qoidalar (har bir list sahifa)

> **Siz aytmasangiz ham** har bir jadval/list redesignida quyidagilar **avtomatik** qo‘llanadi.

### 1) Checkbox + guruh (bulk) obrabotka

| Talab | Izoh |
|-------|------|
| Har qatorda checkbox | Aniq ko‘rinadi (`accent-color`, 16px) |
| Header «hammasini belgilash» | Filtered ro‘yxat bo‘yicha select-all |
| Guruh amallar paneli | 1+ belgilanganda toolbar ostida / jadval ustida chiqadi |
| Amallar | Sahifadagi mavjud qator amallaridan (провести, удалить, экспорт, …) — **real API** |
| Holat | Belgilash filter/page o‘zgaganda tozalanadi yoki sync qilinadi |

### 2) Создать / Изменить — markaziy modal (majburiy)

| Talab | Izoh |
|-------|------|
| **Создать** | Alohida `/new` sahifaga o‘tmaydi — `@/components/FormModal` (ekran markazi, backdrop) |
| **Изменить** | Qator amallaridan ham shu modal (yoki mavjud FormModal wrapper) |
| Sahifa orqada | Navigatsiya / layout siljinmaydi; Escape + backdrop yopadi |
| Muvaffaqiyat | Modal yopiladi + list `load()` |
| `/new` va `/[id]/edit` | Deep-link uchun saqlanishi mumkin, lekin list UI dan asosiy oqim — **modal** |

### 3) Ichki sibling sahifalar (majburiy paket)

| Talab | Izoh |
|-------|------|
| Scope | Skrinshotdagi sahifa **va** undagi `PageSubnav` siblinglari birga |
| Manba | `apps/web/src/lib/form-siblings.ts` + UI dagi tablar |
| Misol | tariff-approvals ↔ tariff-groups; divisions list ↔ groups; staff-positions ↔ structure |
| Yuqori menyu | Кадры / Посещения / Зарплата… — alohida modul; faqat skrinshotdagi paket emas, lekin siblinglar **hamisha** |

### 4) Boshqa doimiy

- Dizayn shablonga mos; **yetishmagan ustun/amallar** — real ishlayotgan loyiha asos
- API / marshrut / biznes mantiq **buzilmaydi**
- Pastga ochiladigan qator amallar (expand) saqlansa — animatsiya saqlanadi; checkbox **alohida** multi-select

---

## Shablon → HR HUB marshrutlari

### A. Главная (asosan tayyor)

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `Dashboard.tsx` | `/dashboard` | ✅ |
| `News.tsx` | `/news` | ✅ |
| `RemoteDevices.tsx` | `/catalog/device-control` | ✅ |

### B. Кадры → Главное

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `EmployeesList.tsx` (active) | `/employees` (+ tabs dismissed/gph) | ✅ FormModal create/attach/import + bulk |
| `EmployeesList.tsx` (fiz) | `/catalog/persons` | ✅ FormModal + Arena + siblings |
| `EmployeeCard.tsx` | `/employees/[id]` | ❌ keyingi paket |
| `KadryModule.tsx` | hr-documents ✅, transfers ✅, absences ✅, timesheet-adjustments ✅, hr-requests ✅, clearance-sheets ✅, wage-changes ✅, incidents ✅ (+ siblings: name-changes, gph-*, absence-types/requests, clearance-templates, incident-types) | ✅ list + FormModal |
| `KadryDashboard.tsx` | dismissal-analytics, personnel-changes, division-stats, year-summary | ❌ alohida paket |

### C. Кадры → Организация  ← tariff-approvals keyingi

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `OrgDivisions.tsx` + `DivisionOrgChart.tsx` | `/divisions` (list + org chart) | ✅ list + groups (checkbox/bulk); ⏳ chart shablon keyin |
| `OrgPositions.tsx` | `/positions` | ✅ list + groups |
| `OrgEntityPage.tsx` | grades ✅, staff-positions ✅, tariff-groups ✅, tariff-approvals ✅ (sibling paket), grade-history, career-paths | ⏳ **keyingi:** grade-history / career-paths |
| `OrgStaffStructure.tsx` | `/catalog/staff-positions/structure` | ✅ list+focus, search, hide-empty |

### D. Посещения

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `AttendanceListPage.tsx` | locations, devices, marks, absence-requests, … | ⏳ devices/locations list qisman |
| `SchedulePage.tsx` | work-schedules, rosters, overrides, … | ❌ |
| `Attendance.tsx` / `AttendanceReport.tsx` | attendance reports | ❌ |

### E. Зарплата

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `PayrollListPage.tsx` | fine-policies, timesheets, accruals, … | ❌ |

### F. Отчетность

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `ReportsKadry.tsx` | kadrlar hisobotlari | ❌ |
| `ReportsPosesheniya.tsx` | visits hisobotlari | ❌ |
| `ReportsZarplata.tsx` | maosh hisobotlari | ❌ |

### G. Boshqa

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `Login.tsx` | `/` login | ✅ |
| `SettingsFiz.tsx` | sozlamalar / fiz | ❌ |

---

## Tavsiya etilgan ketma-ketlik (siz buyruq bermaguncha)

1. ~~Организация — `/divisions`~~ ✅  
2. ~~`/positions` — `OrgPositions`~~ ✅  
3. ~~grades / staff-positions / tariff-groups / tariff-approvals~~ ✅ — **keyingi Org:** grade-history / career-paths  
4. ~~Кадры Главное listlar — `KadryModule` / `EmployeesList`~~ ✅  
5. `/employees/[id]` — `EmployeeCard`  
6. Кадры → Дашборд  
7. Посещения → Зарплата → Отчетность  

---

## Shablon ichidagi muhim komponentlar

```
_design/redesign-hr-hub-sections/src/
  index.css              ← tokenlar (#f3f6fb, #0a85e2, #070e18, …)
  components/
    AppShell.tsx
    PageHead.tsx
    TableSection.tsx
    FormModal.tsx
    DivisionOrgChart.tsx
    OrgEntityTable.tsx
    …
  pages/                 ← har bir bo‘lim sahifasi
  data/                  ← mock + config (faqat UI namuna)
```

---

## Texnik qoidalar

- Tailwind shablonda → loyihada **CSS Modules** ga o‘giriladi  
- `@/lib/api`, marshrutlar, action idlar — **muzlatilgan**  
- Faqat dizayn / layout / className  
- **List sahifalar:** checkbox + select-all + guruh obrabotka **majburiy** (yuqoridagi doimiy qoida)

---

## Hozir nima qilish kerak

**Keyingi sahifani yozing yoki skrinshot tashlang** — masalan:

- `Утверждения тарифных групп` / `/catalog/tariff-approvals`
- grade-history / career-paths
- yoki istalgan boshqa nom

Shundan keyin shu sahifani shablon bo‘yicha **bittalab to‘liq** moslashtiramiz (checkbox + bulk bilan).

