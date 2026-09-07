# HR HUB — Shablon asosida redesign reja

> **Yagona manba shablon:** `_design/redesign-hr-hub-sections`  
> **Zip:** `redesign-hr-hub-sections (1).zip` (2026-09-04)  
> **Holat yangilangan:** 2026-09-07 — [DESIGN_REDESIGN_STATUS.md](./DESIGN_REDESIGN_STATUS.md)  
> **Eski ARENA promptlar / boshqa shablonlar:** o‘chirilgan  
> **Qoida:** faqat UI; API/backend/DB o‘zgarmaydi. Har safar **bitta sahifa** to‘liq moslashtiriladi (yoki batch — siz buyrug‘ingiz bilan).

---

## Qanday ishlaymiz

1. Siz **sahifa nomi** yoki **skrinshot** tashlaysiz.
2. Men shablondan mos faylni ochaman (`_design/redesign-hr-hub-sections/src/...`).
3. Loyihadagi `page.tsx` + `page.module.css` ni shu dizaynga **to‘liq** moslashtiraman.
4. Siz `localhost` da tekshirasiz → keyingi sahifaga o‘tamiz.

---

## Doimiy majburiy qoidalar (har bir list / forma sahifa)

> **Siz aytmasangiz ham** har redesignda quyidagilar **avtomatik** qo‘llanadi.

### 1) Checkbox + guruh (bulk) obrabotka

| Talab | Izoh |
|-------|------|
| Har qatorda checkbox | Aniq ko‘rinadi (`accent-color`, 16px) |
| Header «hammasini belgilash» | Filtered ro‘yxat bo‘yicha select-all (indeterminate) |
| Guruh amallar paneli | 1+ belgilanganda toolbar ostida / jadval ustida |
| Amallar | Mavjud qator amallaridan — **real API** |
| Holat | Filter/page o‘zgaganda tozalanadi yoki sync |

### 2) Создать = markaziy FormModal

> «Создать» **markazda** `FormModal` ochadi (inline panel yoki `/new` to‘liq sahifa emas).  
> Komponent: `@/components/FormModal` + `form-modal.module.css`.  
> `/new` deep-link → `?create=1` (yoki `?edit=`) — modal ochiladi.  
> Murakkab tahrir (ko‘p tabli hujjat, kalendar kun paneli) — create modalda asosiy maydonlar; chuqur edit alohida sahifada qolishi mumkin.

### 3) Section / report tablar — tepada

> `PageSubnav` va hisobot **Фильтр / Просмотр / Настройки** — kontent title **ustida**.  
> Stil: kulrang track + ko‘k pill (`page-subnav.module.css` / `arena.tabsTrack`).  
> Settings ichki tablar (Главное, Кадровый учет, …) — PageSubnav dan keyin, pageHeader dan oldin.

### 4) Filter pick / dropdown

> Ochiladigan tanlovlar (подразделения, должности, сотрудники, шаблоны) — ixcham:  
> `max-height: min(180px, 28vh)`, scroll; filtr kartochka **ustma-ust** (siqilgan `1fr + 220px` juftlik yo‘q).

### 5) Boshqa doimiy

- Dizayn shablonga mos; yetishmagan ustun/amallar — real ishlayotgan loyiha asos  
- API / marshrut / biznes mantiq **buzilmaydi**  
- Qator expand amallar saqlansa — checkbox **alohida** multi-select  

---

## Shablon → HR HUB marshrutlari

### A. Главная (tayyor)

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `Dashboard.tsx` | `/dashboard` | ✅ |
| `News.tsx` | `/news` | ✅ |
| `RemoteDevices.tsx` | `/catalog/device-control` | ✅ |

### B. Кадры → Главное

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `EmployeesList.tsx` (active) | `/employees` | ⏳ header bor — to‘liq shablon |
| `EmployeesList.tsx` (fiz/fired/gpkh) | persons / dismissed / gph | ⏳ persons FormModal ✅ |
| `EmployeeCard.tsx` | `/employees/[id]` | ❌ |
| `KadryModule.tsx` | hr-documents, transfers, absences, … | ⏳ qisman Arena |
| `KadryDashboard.tsx` | dismissal-analytics, personnel-changes, division-stats, year-summary, dismissal-reasons | ✅ |

### C. Кадры → Организация

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `OrgDivisions.tsx` + chart | `/divisions` | ✅ list/groups; org-chart ⏳ |
| `OrgPositions.tsx` | `/positions` | ❌ **keyingi navbat** |
| `OrgEntityPage.tsx` | grades, staff-positions, tariff-*, **grade-history**, **career-paths** | ✅ |
| `OrgStaffStructure.tsx` | `/catalog/staff-positions/structure` | ❌ |

### D. Посещения

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| Lists / requests / schedules | locations, devices, marks, absence/location/overtime requests, work-schedules, rosters, … | ✅ |
| Mega-nav | 2 ustun | ✅ |

### E. Зарплата

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `PayrollListPage.tsx` | fine/allowance-policies, timesheets (+ settings modal), accruals, settlements, vedomost, manual, gph-services, sales-*, one-time, loans, payment-orders, travel, bonus | ✅ Arena + FormModal + bulk |
| Sales % settings | `/catalog/sales-policies` | ✅ |

### F. Отчетность

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `ReportsKadry.tsx` | kadrlar hisobotlari | ✅ Arena + `report-arena` |
| `ReportsPosesheniya.tsx` | visits hisobotlari | ✅ |
| `ReportsZarplata.tsx` | maosh hisobotlari | ✅ (account/trial-balance ixtiyoriy) |
| Shell / tabs / picks | `report-arena.module.css`, tabsTrack tepada, compact dropPanel | ✅ |
| Mega flyout | 2 ustun (`flyItems > 6`) | ✅ |

### G. Настройки / справочники

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| Settings Главное / org / payroll-calc | `/settings`, `/settings/payroll-calc` | ✅ + PageSubnav tepada |
| Dictionaries / lists | absence/time-types, templates, facts, dynamic-*, news | ✅ |
| Create FormModal batch | валюты, кассы, COA, document-types, nationality, institutions, education-types, employment-sources, hire-doc-exceptions, indicators, avg-salaries, specialties, banks, countries, orgs, users, roles, account-pairs, production-calendars (create) | ✅ |

### H. Boshqa

| Shablon | Loyiha URL | Holat |
|---------|------------|-------|
| `Login.tsx` | `/` | ✅ |
| Mobile | — | ❌ |

---

## Tavsiya etilgan ketma-ketlik (siz buyruq bermaguncha)

1. **`/positions`** — `OrgPositions`  
2. Org-chart — `DivisionOrgChart` to‘liq  
3. Кадры Главное listlar — `EmployeesList` / `KadryModule` to‘liq  
4. `/employees/[id]` — `EmployeeCard`  
5. Qolgan edge cases (account-balance, production-calendar edit, …)  
6. Mobile  

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

### Loyihadagi mos fayllar

| Vazifa | Fayl |
|--------|------|
| FormModal | `apps/web/src/components/FormModal.tsx`, `form-modal.module.css` |
| PageSubnav | `apps/web/src/components/PageSubnav.tsx`, `page-subnav.module.css` |
| Sibling guruhlar | `apps/web/src/lib/form-siblings.ts` |
| Report Arena | `apps/web/src/app/(app)/catalog/reports/report-arena.module.css` |
| Shared header/tabs | `apps/web/src/app/page-shared.module.css` |
| Mega-nav | `apps/web/src/lib/mega-nav.ts`, `AppShell.tsx` |

---

## Texnik qoidalar

- Tailwind shablonda → loyihada **CSS Modules**  
- `@/lib/api`, marshrutlar, action idlar — **muzlatilgan**  
- Faqat dizayn / layout / className (+ FormModal wiring)  
- List: checkbox + bulk **majburiy**  
- Create: FormModal **majburiy** (chuqur edit istisnosi hujjatda)

---

## Hozir nima qilish kerak

**Keyingi sahifani yozing yoki skrinshot tashlang** — masalan:

- `Должности` / `/positions`  
- org-chart / `/divisions`  
- `Сотрудники` to‘liq shablon  
- yoki istalgan boshqa nom  

Joriy holat xulosasi: [DESIGN_REDESIGN_STATUS.md](./DESIGN_REDESIGN_STATUS.md)
