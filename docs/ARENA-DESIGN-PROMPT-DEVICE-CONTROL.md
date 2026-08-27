# Arena AI — PROMPT 2/2: Удалённое управление устройствами

**Menyu:** Главная → Удалённое управление устройствами  
**URL:** `/catalog/device-control`

## Qayerga almashtiriladi

```
apps/web/src/app/(app)/catalog/device-control/page.tsx
apps/web/src/app/(app)/catalog/device-control/page.module.css
```

---

## PROMPT — to‘liq nusxa qiling (Arena’ga)

```
You are doing a DESIGN-ONLY restyle of ONE HR HUB page: «Удалённое управление устройствами».

═══════════════════════════════════════
PRODUCT & APPROVED VISUAL LANGUAGE
═══════════════════════════════════════
- HR admin SaaS: multi-tenant HR + attendance + Hikvision Face ID (Uzbekistan / Central Asia).
- UI language: Russian.
- Already approved (MATCH — continuous with login + dashboard + news):
  • Dark brand ~#070e18
  • Page bg ~#f8fafc, white surfaces/cards
  • Accent cyan/azure ~#0284c7 — NOT purple
  • Plus Jakarta Sans (or CSS variable mapping)
  • Radii ~10–14px, soft shadows, ops-console density (operators run remote actions all day)
  • Max 2–3 micro-motions
- Real chrome: TOP mega-nav AppShell. DO NOT invent a left sidebar.

═══════════════════════════════════════
SCOPE — ONLY THIS PAGE
═══════════════════════════════════════
Route: /catalog/device-control
Change ONLY:
  - apps/web/src/app/(app)/catalog/device-control/page.tsx
  - apps/web/src/app/(app)/catalog/device-control/page.module.css   (PRIMARY)
Optional: page-subnav.module.css / globals.css token aliases.
FORBIDDEN: mega-nav.ts, form-siblings.ts action lists, Nest API, inventing new remote actions, rewriting /catalog/devices catalog pages.

═══════════════════════════════════════
SHELL / SUBNAV (KEEP)
═══════════════════════════════════════
- Page title: «Удалённое управление устройствами»
- Breadcrumb: Главная / Удалённое управление устройствами
- Sibling links may show (keep working):
  • Устройства → /catalog/devices
  • Новые устройства → /catalog/devices?filter=new
  • Локации → /catalog/locations
Restyle sibling chips/links; do not remove them.

═══════════════════════════════════════
PAGE LAYOUT (FREEZE)
═══════════════════════════════════════
1) Toolbar row
2) Devices data table with remote action buttons in last column

TOOLBAR
- Search input placeholder: «Поиск по устройству, IP, локации...»
- Button «Обновить» (reload devices list)
- Keep client-side search filtering

TABLE COLUMNS (keep order)
Устройство | Локация | Статус | Последний сеанс | Управление

- Device name is a link → /catalog/devices/{id}
- Empty state: «Нет устройств. Добавьте их в разделе «Устройства».»
- Loading / error states: restyle, keep behavior

STATUS CHIPS (restyle colors; keep labels + logic)
- В сети
- Не в сети
- Неактивный
- Новое

REMOTE ACTIONS — FREEZE STRING IDS (critical)
Buttons in «Управление» column. Restyle only; NEVER rename ids:

| id          | Label (RU)              | Notes                |
|-------------|-------------------------|----------------------|
| heartbeat   | Проверить связь         |                      |
| sync        | Синхронизировать        |                      |
| sync_clock  | Синхронизировать часы   |                      |
| pull_events | Забрать события         |                      |
| open_door   | Открыть дверь           | danger confirm Да/Нет|
| reboot      | Перезагрузить           | danger confirm       |

Busy/loading per device+action may show — keep UX.

═══════════════════════════════════════
DATA / LOGIC FREEZE
═══════════════════════════════════════
- GET  /api/attendance/devices
- POST /api/attendance/devices/:id/remote
  body: { "action": "<one of the ids above>" }
- confirm() dialogs for danger actions stay

═══════════════════════════════════════
STACK RULES
═══════════════════════════════════════
- Next.js App Router + CSS Modules
- Scope tokens under a page root class (like dashboard .page) so shell tokens stay intact
- No Tailwind system, no new npm deps
- Dense readable table; cyan accent for primary actions; rose/danger for open_door/reboot

═══════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════
1) page.module.css (main)
2) Minimal page.tsx className tweaks
3) CSS header comment with tokens

SUCCESS: Same IA, Russian labels, action ids, APIs; visually continuous with login/dashboard/news; table + remote controls polished; no left nav.
```
