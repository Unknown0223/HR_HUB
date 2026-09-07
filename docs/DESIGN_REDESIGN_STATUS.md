# HR HUB — UI redesign holati

> **Versiya:** 2.1 · **Sana:** 2026-09-07  
> **Yagona shablon:** `_design/redesign-hr-hub-sections` (`redesign-hr-hub-sections (1).zip`)  
> **Batafsil reja:** [DESIGN_TEMPLATE_PLAN.md](./DESIGN_TEMPLATE_PLAN.md)  
> **Qoida:** faqat frontend UI; API/DB o‘zgarmaydi.

Eski ARENA prompt hujjatlari va boshqa shablonlar **o‘chirilgan**. Faqat yuqoridagi zip qabul qilingan.

---

## Tokenlar (shablon `index.css`)

| Token | Qiymat |
|-------|--------|
| Canvas | `#f3f6fb` |
| Surface | `#ffffff` |
| Accent | `#0a85e2` |
| Header | `#070e18` |
| Ink | `#0a1322` / `#64788f` |
| Font | Plus Jakarta Sans |
| Online / Danger / Warn | `#0e9f6e` / `#e11d48` / `#d97706` |

---

## Doimiy qoida (har list sahifa)

Har bir jadval redesignida **avtomatik**:

1. Qator checkboxlari  
2. Header select-all  
3. Guruh (bulk) obrabotka paneli — belgilanganlar uchun  
4. **Создать → markaziy FormModal** (inline panel / `/new` emas)  
5. `/new` deep-link → `?create=1` (modal ochiladi)  
6. Section tablar (**PageSubnav** / Фильтр·Просмотр) — **tepada**, kulrang track + ko‘k pill  

Batafsil: [DESIGN_TEMPLATE_PLAN.md](./DESIGN_TEMPLATE_PLAN.md)

---

## Progress (qisqa)

| Bo‘lim | Holat |
|--------|-------|
| Foundation (shell, tokens, login) | ✅ |
| Главная (dashboard, news, device-control) | ✅ |
| Qurilmalar list + detail | ✅ / ✅ |
| Кадры → Главное / analitika | ⏳ listlar qisman; dismissal/* ✅ |
| Кадры → Организация | ✅ divisions/groups, grades, staff-positions, tariff-*, **grade-history**, **career-paths**; org-chart / positions ⏳ |
| Настройки | ✅ settings/org/payroll-calc, dictionaries, news; **Create → FormModal** (валюты, кассы, COA, банки, страны, org/users/roles, …) |
| Посещения lists | ✅ |
| Зарплата (14 list) | ✅ Arena + FormModal + bulk + mega-nav icons |
| Отчетность (Кадры / Посещения / Зарплата) | ✅ Arena shell + ПРОСМОТР; tablar tepada; filter picklar ixcham |
| Mega-nav UX | ✅ Посещения 2-col; Отчетность flyout 2-col; hover close |
| Global FormModal / PageSubnav / dropdown / **header topRight** | ✅ standartlashtirilgan |
| Mobile | ❌ |

---

## Qilingan (2026-09 — muhim batch)

### Зарплата
- 14 list: fine/allowance-policies, timesheets (+ **TimesheetSettingsModal**), accruals, settlements, vedomost, manual, gph-services, sales-accruals, one-time, loans, payment-orders, travel-expenses, bonus-accruals  
- Mega-nav ikonlar + gradientlar  
- `/catalog/sales-policies` — Arena sozlamalar kartochkalari  

### Организация (qo‘shimcha)
- `/catalog/grade-history` — Arena + `GradePromotionFormModal` + bulk  
- `/catalog/career-paths` — Arena + `CareerPathFormModal` + bulk  

### Отчетность
- Umumiy shell: `catalog/reports/report-arena.module.css`  
- Кадры / Посещения / Зарплата hisobotlari Arena + yaxshilangan ПРОСМОТР (viewCard, meta pills, empty state)  
- Tablar (**Фильтр / Просмотр / Настройки**) — title **ustida**, `tabsTrack` pill stil  
- Filter dropdown / tree pick — `max-height ~180px`, scroll; filtr kartochka column stack  
- Месяц + Шаблоны siqilishi bartaraf (yonma-yon `1fr+220px` olib tashlandi)  

### Navigatsiya / shell
- Mega: Посещения 2 ustun; Отчетность flyout 2 ustun (`flyItems > 6`)  
- Mega hover leave — `scheduleMegaClose` (~160ms) + backdrop  

### Создать → FormModal (eski to‘liq sahifa → markaziy modal)
- **Валюты** (rasmdagi misol) + кассы, COA, document-types, nationality, institutions, education-types, employment-sources, hire-document-exceptions, indicators, avg-salaries, specialties, persons  
- Settings: banks, countries, organizations, users, roles  
- account-pairs, production-calendars (create); accrual/deduction-types allaqachon modal  

### Global UI standart
- `PageSubnav` — kulrang track + ko‘k active pill; settings-main title yashirin  
- Settings secondary tablar (Главное / Кадровый учет / …) — PageSubnav **ostida, title ustida**  
- System settings ichki subTabs — tepada  
- `page-shared` / report-arena tab stillari bir xil  
- **Header topRight** (vaqt · qidiruv · tezkor · bildirishnoma · profil) — `topTools` guruh, siqilmasdan; header 60px  

---

## Qilinmagan / keyingi

| Navbat | Izoh |
|--------|------|
| `/positions` | OrgPositions shablon |
| Org-chart | DivisionOrgChart to‘liq |
| `/employees` to‘liq shablon | header bor — EmployeesList |
| `/employees/[id]` | EmployeeCard |
| Кадры Главное qolgan listlar | KadryModule qisman |
| account-balance / trial-balance | hisobot Arena (ixtiyoriy) |
| Production calendar **edit** | katta kun paneli — alohida sahifa qolishi mumkin |
| Mobile | ❌ |

Siz skrinshot yoki sahifa nomi tashlaguncha — yuqoridagi navbatdan davom.

---

## Ish tartibi

1. Shablon faylini o‘qish (`_design/...`)  
2. Loyiha sahifasiga UI-only merge (+ FormModal / bulk / tepadagi tablar)  
3. Tekshiruv → keyingi sahifa  

Batafsil checklist: [DESIGN_TEMPLATE_PLAN.md](./DESIGN_TEMPLATE_PLAN.md)
