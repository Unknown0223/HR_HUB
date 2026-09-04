# HR HUB — UI redesign holati

> **Versiya:** 2.0 · **Sana:** 2026-09-04  
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

Batafsil: [DESIGN_TEMPLATE_PLAN.md](./DESIGN_TEMPLATE_PLAN.md)

---

## Progress (qisqa)

| Bo‘lim | Holat |
|--------|-------|
| Foundation (shell, tokens, login) | ✅ |
| Главная (dashboard, news, device-control) | ✅ |
| Qurilmalar list + detail | ✅ / ✅ |
| Кадры → Главное (9 list + siblings) | ✅ FormModal; **keyingi:** EmployeeCard, Дашборд |
| Кадры → Организация | ✅ … grades, staff-positions, **tariff-groups + tariff-approvals**; **keyingi:** grade-history / career-paths |
| Посещения / Зарплата / Отчетность | ❌ |
| Mobile | ❌ |

---

## Qilingan (muhim)

- Global: Plus Jakarta, `globals.css` tokenlar, qora header mega-menu  
- `/dashboard`, `/news`, `/catalog/device-control`  
- `/catalog/devices`, `/locations` (+ detail)  
- Media token (rasmlar 401)  
- Кадры Главное: page header + menyu ikonlar  
- Org-chart connector chiziqlari yuqoriroq  
- `/divisions` — OrgEntityTable dizayn: multi-select, bulk, toolbar, status badges  
- `/positions` — xuddi shu pattern (list + groups)  
- `/catalog/grades` — xuddi shu pattern  
- `/catalog/staff-positions` — xuddi shu pattern (+ bulk close date)  
- `/catalog/staff-positions/structure` — list/focus, search, hide-empty (katta daraxtlar)  
- `/catalog/tariff-groups` — OrgEntityTable pattern  
- `/catalog/tariff-approvals` — sibling paket bilan to‘liq redesign + FormModal (create/edit/view)  
- **Кадры → Главное** — 9 menyu + PageSubnav siblings: employees (FormModal create/attach/import), persons, hr-documents, transfers, absences, wage-changes, name-changes, gph-contracts/services, timesheet-adjustments, hr-requests, clearance-sheets/templates, incidents/incident-types, absence-types/requests  
- **Doimiy:** Создать/Изменить → markaziy `FormModal`; PageSubnav siblinglari bir paketda  

## Qilinmagan / keyingi

1. `/employees/[id]` — EmployeeCard  
2. Кадры → Дашборд (dismissal-analytics, …)  
3. Организация: **`/catalog/grade-history`** + **career-paths**

---

## Ish tartibi

1. Shablon faylini o‘qish (`_design/...`)  
2. Loyiha sahifasiga UI-only merge  
3. Tekshiruv → keyingi sahifa  

Batafsil checklist: [DESIGN_TEMPLATE_PLAN.md](./DESIGN_TEMPLATE_PLAN.md)
