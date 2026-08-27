# Arena AI — HR HUB: Новостная лента (`/news`)

**Главная** ichidagi 2/3-sahifa. Login + Dashboard bilan bir xil visual language.

---

## Qayerga qo‘yiladi (Arena natijasini almashtirish)

| Arena bergan fayl | Loyihadagi joy (shu yerga overwrite) |
|-------------------|--------------------------------------|
| `page.tsx` (news) | `apps/web/src/app/(app)/news/page.tsx` |
| `page.module.css` | `apps/web/src/app/(app)/news/page.module.css` |

**Tegmang:** `mega-nav.ts`, `AppShell.tsx`, API, `apps/web/src/app/m/news/*` (mobil alohida).

Tekshiruv: http://localhost:3000/news → **Главная → Новостная лента**

---

## PROMPT (copy from here)

```
You are doing a DESIGN-ONLY restyle of HR HUB admin page «Новостная лента».

CONTEXT
- Product: multi-tenant HR + attendance + Hikvision Face ID (Uzbekistan / Central Asia).
- UI language: Russian.
- Approved login visual language (match it):
  - Dark brand ~#070e18, page bg ~#f8fafc, white surfaces
  - Accent cyan/azure ~#0284c7 (not purple)
  - Plus Jakarta Sans OR map to existing fonts via CSS variables
  - Soft radii ~10–14px, calm elevation, 2–3 micro-motions max
- DO NOT redesign login, dashboard, or invent a left sidebar.
- Real chrome: TOP mega-nav AppShell (Главная | Кадры | …).

ROUTE & FILES (only these)
- Route: /news
- apps/web/src/app/(app)/news/page.tsx  (classNames / light markup wrappers only)
- apps/web/src/app/(app)/news/page.module.css  (PRIMARY deliverable)
Optional token aliases only: apps/web/src/app/globals.css, apps/web/src/components/page-subnav.module.css
Do NOT change mega-nav.ts, AppShell structure, API handlers, or business logic.

PAGE STRUCTURE (freeze layout roles)
1) PageSubnav title: «Новостная лента»
2) Two-column body:
   - MAIN: card «Сообщения» (news feed)
   - ASIDE: card «Дни рождения»
3) Modal «Добавить сообщение» (compose)

MAIN — «Сообщения»
- CTA button: «Добавить сообщение»
- Loading: «Загрузка…»
- Empty: «Нет сообщений»
- Post list: author/time/body; action «Удалить» per post
- Keep delete confirmation / API behavior as-is

ASIDE — «Дни рождения»
- Empty: «Здесь Вы будете видеть дни рождения коллег»
- Rows: name, date/when; links to /employees/{id}

MODAL — «Добавить сообщение»
- Field label «Сообщение *»
- Placeholder «Введите сообщение…»
- Checkbox/option «Отправить всем сотрудникам»
- Rich-text toolbar titles (keep): Отменить, Повторить, Жирный, Курсив, Подчёркнутый, Цитата, Список, Нумерованный, Ссылка
- Footer: «Сохранить», «Закрыть»
- Do not remove toolbar features; only restyle

DATA FREEZE
- GET /api/news
- POST /api/news  (body includes message, sendToAll — keep shape)
- DELETE /api/news/:id
- GET /api/news/birthdays
- Breadcrumb conceptually: Главная / Новостная лента

STACK
- Next.js App Router + CSS Modules. No Tailwind system migration. No new npm deps.
- Prefer scoped CSS variables for login palette continuity; do not break other admin pages’ tokens.

SUCCESS
- Same IA and Russian labels; looks continuous with approved login
- Feed + birthdays + compose modal all restyled
- No left nav invention; APIs and delete/create flow unchanged
```
