# Arena AI — PROMPT 1/2: Новостная лента

**Menyu:** Главная → Новостная лента  
**URL:** `/news`

## Qayerga almashtiriladi

```
apps/web/src/app/(app)/news/page.tsx
apps/web/src/app/(app)/news/page.module.css
```

---

## PROMPT — to‘liq nusxa qiling (Arena’ga)

```
You are doing a DESIGN-ONLY restyle of ONE HR HUB page: «Новостная лента».

═══════════════════════════════════════
PRODUCT & APPROVED VISUAL LANGUAGE
═══════════════════════════════════════
- HR admin SaaS: multi-tenant HR + attendance + Hikvision Face ID (Uzbekistan / Central Asia).
- UI language: Russian.
- Already approved elsewhere (MATCH THIS — do not invent a new brand):
  • Dark brand / header DNA ~#070e18
  • Page background ~#f8fafc, white cards/surfaces
  • Accent cyan/azure ~#0284c7 (biometric feel) — NOT purple, NOT Metronic leftover blue-only theme
  • Typography: Plus Jakarta Sans (or CSS variables mapped to it)
  • Radii ~10–14px, soft elevation, calm density
  • Max 2–3 intentional micro-motions
- Login and Dashboard (/dashboard: stats + birthdays) already use this language — Новостная лента must feel continuous with them.
- Real app chrome: TOP mega-nav AppShell (Главная | Кадры | Посещения | …). DO NOT invent a left sidebar.

═══════════════════════════════════════
SCOPE — ONLY THIS PAGE
═══════════════════════════════════════
Route: /news
Change ONLY:
  - apps/web/src/app/(app)/news/page.tsx   (classNames / light markup wrappers)
  - apps/web/src/app/(app)/news/page.module.css   (PRIMARY deliverable)
Optional: token aliases in globals.css / page-subnav.module.css if needed for continuity.
FORBIDDEN: mega-nav.ts, AppShell.tsx, Nest API, mobile /m/news, dashboard rewrite, login rewrite.

═══════════════════════════════════════
PAGE LAYOUT (FREEZE STRUCTURE)
═══════════════════════════════════════
Breadcrumb conceptually: Главная / Новостная лента

Layout = TWO COLUMNS (same idea as dashboard):
┌─────────────────────────────┬──────────────────┐
│ MAIN: «Сообщения»           │ ASIDE:           │
│  feed + «Добавить сообщение»│ «Дни рождения»   │
└─────────────────────────────┴──────────────────┘
+ Modal «Добавить сообщение»

MAIN CARD — «Сообщения»
- Title «Сообщения»
- Primary/outline CTA «Добавить сообщение» (top-right of card)
- Loading text: «Загрузка…»
- Empty: «Нет сообщений»
- Feed items: author name, published datetime, HTML/body content
- Per-item action «Удалить» (keep confirm + DELETE API)
- Sample content may look like «Добро пожаловать в HR HUB» — style posts, don’t hardcode demo text into logic

ASIDE CARD — «Дни рождения»
- Must visually match the birthdays panel already on Dashboard (avatar initials circle, name, position, date on the right)
- Empty copy: «Здесь Вы будете видеть дни рождения коллег»
- Rows link to /employees/{id}
- Data from GET /api/news/birthdays (separate from dashboard stats)

MODAL — «Добавить сообщение»
- Title «Добавить сообщение»
- Label «Сообщение *»
- Rich editor (contenteditable) + toolbar — KEEP these tool labels:
  Отменить, Повторить, Жирный, Курсив, Подчёркнутый, Цитата, Список, Нумерованный, Ссылка
- Checkbox «Отправить всем сотрудникам»
- Footer: «Сохранить», «Закрыть»
- Restyle only; do not remove toolbar commands or fields

═══════════════════════════════════════
DATA / LOGIC FREEZE
═══════════════════════════════════════
- GET  /api/news
- POST /api/news     body keeps message + sendToAll (existing shape)
- DELETE /api/news/:id
- GET  /api/news/birthdays
- PageSubnav may wrap the title — keep it; restyle via CSS if needed

═══════════════════════════════════════
STACK RULES
═══════════════════════════════════════
- Next.js App Router + CSS Modules only
- Scope new design tokens under a page root class (like login .container / dashboard .page) so AppShell Metronic tokens don’t break
- No Tailwind as the design system, no new npm deps
- No purple-on-white / cream-serif / newspaper clichés

═══════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════
1) Updated page.module.css (main)
2) Minimal page.tsx className/wrapper tweaks if needed
3) Short CSS comment listing tokens used

SUCCESS: Same Russian labels and APIs; looks like the same product as login + dashboard; feed + birthdays + modal fully restyled; no left nav.
```
