# Arena AI — HR HUB: Удалённое управление устройствами

**Главная** ichidagi 3/3-sahifa. Login + Dashboard bilan bir xil visual language.

---

## Qayerga qo‘yiladi (Arena natijasini almashtirish)

| Arena bergan fayl | Loyihadagi joy (shu yerga overwrite) |
|-------------------|--------------------------------------|
| `page.tsx` (device-control) | `apps/web/src/app/(app)/catalog/device-control/page.tsx` |
| `page.module.css` | `apps/web/src/app/(app)/catalog/device-control/page.module.css` |

**Tegmang:** action **id**lari (`heartbeat`, `sync`, …), `form-siblings.ts`, `mega-nav.ts`, remote API body.

Tekshiruv: http://localhost:3000/catalog/device-control  
Menyu: **Главная → Удалённое управление устройствами**

Eslatma: sibling linklar («Устройства», «Локации»…) PageSubnav orqali keladi — ularni o‘chirmang; faqat vizual polish.

---

## PROMPT (copy from here)

```
You are doing a DESIGN-ONLY restyle of HR HUB admin page «Удалённое управление устройствами».

CONTEXT
- Product: multi-tenant HR + attendance + Hikvision Face ID (Uzbekistan / Central Asia).
- UI language: Russian.
- Approved login visual language (match it):
  - Dark brand ~#070e18, page bg ~#f8fafc, white surfaces
  - Accent cyan/azure ~#0284c7 (not purple)
  - Plus Jakarta Sans OR map via CSS variables
  - Soft radii ~10–14px, calm ops console density (operators run remote actions)
  - 2–3 micro-motions max
- DO NOT redesign login, dashboard, news, or invent a left app sidebar.
- Real chrome: TOP mega-nav AppShell.

ROUTE & FILES (only these)
- Route: /catalog/device-control
- apps/web/src/app/(app)/catalog/device-control/page.tsx  (classNames / wrappers only)
- apps/web/src/app/(app)/catalog/device-control/page.module.css  (PRIMARY)
Optional: page-subnav.module.css / globals.css token aliases only.
Do NOT change mega-nav.ts, form-siblings, action string ids, or API contracts.

SHELL / SUBNAV (keep)
- Title: «Удалённое управление устройствами»
- Sibling links may appear: Устройства → /catalog/devices; Новые устройства → /catalog/devices?filter=new; Локации → /catalog/locations
- Breadcrumb: Главная / Удалённое управление устройствами

PAGE STRUCTURE (freeze)
1) Toolbar: search + refresh
2) Devices table with remote action buttons

TOOLBAR
- Search placeholder: «Поиск по устройству, IP, локации...»
- Button: «Обновить»
- Keep client-side filter behavior

TABLE
- Columns: Устройство | Локация | Статус | Последний сеанс | Управление
- Empty: «Нет устройств. Добавьте их в разделе «Устройства».»
- Device name links → /catalog/devices/{id}

STATUS CHIPS (restyle colors; keep labels/logic)
- В сети / Не в сети / Неактивный / Новое

REMOTE ACTIONS — FREEZE THESE IDS (labels may stay Russian as today)
- heartbeat → «Проверить связь»
- sync → «Синхронизировать»
- sync_clock → «Синхронизировать часы»
- pull_events → «Забрать события»
- open_door → «Открыть дверь» (danger confirm Да/Нет)
- reboot → «Перезагрузить» (danger confirm)
Restyle buttons/groups only; do not rename action ids or remove confirms.

DATA FREEZE
- GET /api/attendance/devices
- POST /api/attendance/devices/:id/remote   body: { action: "<id above>" }

STACK
- Next.js App Router + CSS Modules. No Tailwind as system. No new npm deps.
- Continuous with approved login cyan/slate DNA; dense admin table OK.

SUCCESS
- Same structure, search, statuses, remote actions
- Visually continuous with login/dashboard language
- No IA change; action ids and APIs untouched
```
