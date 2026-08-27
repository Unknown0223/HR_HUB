# Arena AI — HR HUB design prompt: Главная / Dashboard

**Главная** ichidagi 1/3-sahifa. Login visual language bilan.

## Qayerga qo‘yiladi (Arena natijasini almashtirish)

| Arena fayl | Loyihada overwrite |
|------------|-------------------|
| `page.tsx` | `apps/web/src/app/(app)/dashboard/page.tsx` |
| `page.module.css` | `apps/web/src/app/(app)/dashboard/page.module.css` |

Tekshiruv: `/dashboard` · **Главная → Статистика посещений сотрудников**  
Barcha 3 sahifa: [ARENA-HOME-REPLACE-GUIDE.md](./ARENA-HOME-REPLACE-GUIDE.md)

**Use this after login.** User approved the login visual language only (dark atmosphere + cyan biometric accent). Do **not** invent a new IA.

Copy the block below into Arena.

---

## PROMPT (copy from here)

```
You are doing a DESIGN-ONLY restyle of HR HUB admin “Главная” (dashboard).

CONTEXT
- Product: multi-tenant HR + attendance + Hikvision Face ID for Uzbekistan / Central Asia.
- Desktop UI language: Russian.
- Login redesign (approved visual language — match it):
  - Dark brand panel ~#070e18, page bg ~#f8fafc, white surfaces
  - Accent cyan/azure ~#0284c7 (biometric / Face ID feel), not purple
  - Typography: Plus Jakarta Sans (or map onto --font-body / --font-display)
  - Clean elevation, soft radii ~10–14px, subtle motion only
- DO NOT redesign login in this task.
- DO NOT invent a left app sidebar. Real app uses TOP mega-nav (AppShell), not Arena’s stub dashboard.

REAL APP STRUCTURE (must keep — structure / UX / logic frozen)
Route: /dashboard
Files you may change:
  - apps/web/src/app/(app)/dashboard/page.tsx   (markup/classNames/styling only)
  - apps/web/src/app/(app)/dashboard/page.module.css  (primary deliverable)
Optional light polish ONLY if needed for visual continuity (prefer not unless required):
  - apps/web/src/components/shell.module.css
  - apps/web/src/app/globals.css (extend tokens; do not break other pages)
Do NOT change: AppShell.tsx mega-nav data, mega-nav.ts hrefs/ids, API calls, localStorage keys, filter apply logic, viewMode ids, status ids.

SHELL AROUND THE PAGE (already exists — restyle visually if touching shell CSS, do not restructure)
- Top bar: brand “HR HUB”, sections Главная | Кадры | Посещения | Зарплата | Отчетность | Настройки
- Under Главная mega: “Статистика посещений сотрудников” → /dashboard
- Breadcrumb: Главная / Статистика посещений сотрудников
- Right tools: search, quick actions, notifications, profile
- NO persistent left sidebar on desktop

PAGE LAYOUT (keep this composition)
1) Main column (left/center)
2) Optional collapsible RIGHT column: Фильтр + Дни рождения
Do not convert to a KPI marketing dashboard or card-grid landing.

MAIN COLUMN — widgets to restyle (all of them)
- H1: «Статистика посещений сотрудников»
- View switcher: «Круговая диаграмма» | «Список» (ids: chart | list)

CHART MODE
- Donut chart (SVG) with center headcount + «сотрудник(ов)»
- Legend filters (clickable): Вовремя, Опоздали, Не пришли, Рабочий день не начался (+ %)
- Keep status colors coherent with tokens:
  --dash-ontime, --dash-late, --dash-absent, --dash-dayoff, --dash-center
  (or map approved cyan system + green/amber/rose equivalents — do not invent rainbow)

LIST MODE
- Badges: Все + counts for Вовремя / Опоздал / Не пришел / Рабочий день не начался
- Same employee table without «Состояние» column

TABLE (both modes)
- Toolbar: search «Поиск...», Фильтр, Закрепить, page size 50, pagination, Обновить, Меню
- Columns chart mode: ФИО, Приход, Уход, Состояние
- Columns list mode: ФИО, Приход, Уход
- Empty: «Нет данных за {date}»
- Status chips may include: Вовремя, Опоздал, Раньше ушел, Не пришел, Рабочий день не начался, Выходной, Отсутствие по причине
- Employee name links stay /employees/{id}; photos/lightbox keep working

RIGHT SIDEBAR — «Фильтр» (must remain)
- Template control «Шаблон» (Новый / Сохранить / Отменить / Нет сохранённых)
- Sync «Обновить»
- Fields: Период (calendar: Очистить, Сегодня; weekdays Пн–Вс)
- Multiselects: Подразделения, Должности, Рабочие графики, Разряды, Локации
  (Поиск..., Выбрано: N, Нет вариантов)
- Primary button «Обновить» — filters apply ONLY on this click (do not change behavior)

RIGHT SIDEBAR — «Дни рождения»
- Empty copy: «Здесь Вы будете видеть дни рождения коллег»
- Rows: name, position, «сегодня» or date; links /employees/{id}
- Collapse controls: Скрыть фильтр / Показать фильтр

MODAL «Фильтр» (portal grid filter — restyle, keep fields)
- Title Фильтр; Шаблон / Новый шаблон / По умолчанию / Добавить параметры +
- Rows ФИО, Состояние (+ status checkboxes)
- Footer: Применить, Показать все
- Keep all existing status checkbox ids and extra param ids (login, telegram, fingerprints, code, distance, accessLevel, workStatus, arrivalLocation, tabNumber, email, firstName)

DATA / LOGIC FREEZE (do not rewrite)
APIs:
  GET /api/dashboard/stats?date&divisionIds&positionIds&scheduleIds&gradeIds&locationIds
  /api/organization/divisions, /api/organization/positions
  /api/attendance/schedules, /api/attendance/locations
  /api/catalog/grades
localStorage:
  hrhub.dashboard.filter_templates.v1
  hrhub.dashboard.grid-filter-templates
Ids frozen:
  viewMode: chart | list
  pie/list filters: all | on_time | late | absent | not_started
  table status ids already in code — keep

STACK RULES
- Next.js App Router + CSS Modules (this repo). Do NOT switch the app to Tailwind as the system.
- You may add CSS variables to globals.css to mirror the approved login palette, but keep existing --* names working for the rest of the app (or alias new tokens to old ones).
- No new npm dependencies.
- Avoid purple-on-white, cream-serif, newspaper layouts, dark-mode-first for the whole admin chrome.
- Prefer design tokens over random hex; reduce Metronic leftover blues toward the approved cyan system carefully.

DESIGN GOALS
- Feel like the same product as the approved login: trusted HR + biometric attendance ops console.
- Hierarchy: title → chart/list → table; filters secondary on the right.
- Dense but calm admin UI (operators scan attendance all day) — not a marketing landing.
- 2–3 micro-motions max (view switch, panel collapse, hover).
- Accessibility: focus rings, contrast, readable table text.

OUT OF SCOPE
- Do not redesign Кадры / Посещения / other modules.
- Do not invent fake KPIs (dismissed, devices, workflow) that are not currently rendered.
- Do not replace AppShell with a left-nav layout.

DELIVERABLES
1) Updated page.module.css (main)
2) Minimal page.tsx className / wrapper tweaks if needed for styling hooks
3) Optional globals.css token aliases documenting the login→dashboard palette bridge
4) Short comment at top of page.module.css listing tokens used

SUCCESS
- Same screens, same Russian labels, same filters/chart/list behavior
- Visually continuous with approved login (cyan + slate + dark header DNA)
- No left sidebar, no broken APIs, no renamed view/status ids
```

---

## Notes for you (not for Arena)

| | |
|--|--|
| Zipdan | Faqat **login** yoqdi — Arena’dagi dashboard stub (chap sidebar) **noto‘g‘ri**, ignore |
| Keyingi | Shu prompt bilan Arena → faqat `dashboard/page.*` qabul qiling |
| Keyin | Кадры / Посещения uchun alohida promptlar |

Login zip joyi: `C:\Users\botir\Downloads\hr-hub-frontend-redesign.zip`  
Preview extract (lokal): `D:\hr-hub\_arena-redesign-preview` — gitga qo‘shilmasin.
