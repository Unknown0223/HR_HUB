# HR HUB — Living status

> Master-reja: [IMPROVEMENT_MASTER_PLAN.md](./IMPROVEMENT_MASTER_PLAN.md) · Yakun: [F13_FINAL_CLOSURE.md](./F13_FINAL_CLOSURE.md)

**Kanon portlar:** Web `3001` · API `3002` · Device-gw `8800` · Postgres `5434`

| Faza | Holat |
|------|--------|
| F0–F6 | ✅ config / security / tests / UI debt / stubs / ops |
| F7–F12 | ✅ CSP, vault, catalog slices, CI smoke, passwordEnc DROP |
| **F13** | ✅ employees Arena parity + docs closure |

### Verify (2026-09-21)
- Unit **82/82** · web `tsc` · ports OK · smoke:quickstart 9/10 · API `/docs` 200

---

## IA qayta tuzish — sidebar / hisobotlar / ruxsatlar (2026-10-01)

Branch: `feature/sidebar-reports-access` · Audit: [HR_HUB_IA_AUDIT.md](./HR_HUB_IA_AUDIT.md) · Dizayn (ranglar, mavsumiy fon) alohida oqimda — [DESIGN_REDESIGN_STATUS.md](./DESIGN_REDESIGN_STATUS.md).

| Faza | Natija |
|------|--------|
| 1 | IA audit + route inventari |
| 2 | Yagona nav registri `apps/web/src/lib/nav-registry.ts` + `npm run check:nav` (legacy roleAccess kalitlari, dublikat, mavjud bo‘lmagan route) |
| 3 | Mega-menyu o‘rniga sidebar: desktop collapse, ≤1024px drawer + pastki bar, Escape/focus |
| 4 | `/reports` hub — `lib/reports-registry.ts` (kategoriya, qidiruv, oxirgi ochilganlar, roleAccess bo‘yicha filtr) |
| 5 | `/access` moduli: xodim ruxsatlari ro‘yxati, drawer, berish/bekor qilish, bulk, audit; API `apps/api/src/access` (migration kerak bo‘lmadi) |
| 6 | Техобслуживание / Коммуникации / Настройки guruhlari; `/catalog` — barcha bo‘limlar katalogi |
| 7 | Regressiya + hujjat (quyida) |

Eski URL’lar saqlangan: `/catalog/access-grants` → `/access/employees` (redirect + roleAccess `MOVED_GRANTS`), `/catalog/reports/*` o‘z joyida.

### Regressiya (2026-10-01, lokal: API :3002 dev, web :3001 dev, Postgres lokal)

| Buyruq | Natija |
|--------|--------|
| `npx tsc --noEmit -p apps/web/tsconfig.json` | ✅ 0 xato |
| `npm run build:web` | ✅ 253 sahifa |
| `npm run build:api` | ⚠️ `prisma generate` EPERM — ishlab turgan API `query_engine-windows.dll.node` ni qulflaydi. Qolgan qadamlar alohida: `build -w @hr-hub/shared` ✅, `tsc -p apps/api/tsconfig.build.json` ✅. To‘liq skript uchun API’ni to‘xtatib qayta ishga tushirish kerak |
| `npm test -w @hr-hub/api` | ✅ 118/118 (31 suite) |
| `npm run check:nav` | ✅ 9 bo‘lim, 148 item, 181 route, 155 legacy kalit |
| `npm run smoke:quickstart` | ✅ |
| `npm run smoke:role-access` | ✅ |
| `npm run smoke:users-admin` | ✅ |
| `npm run smoke:catalog-reports` | ✅ 43/43 — `WEB_URL=http://localhost:3001` bilan (skript default’i `:3000`) |
| `npm run smoke` | ❌ ishga tushirildi, lekin sharti yo‘q: device-gw (:8000/:8800) va MinIO lokalda ishlamaydi → face sync 400 «Нет активных устройств». Health/login qadamlari ✅. Bu oqim qayta tuzishda o‘zgarmagan |

Phase 7 tuzatishlari: `smoke-catalog-reports.js` hozirgi sessiya modeliga moslandi (token `sessionStorage.hrhub_media_at`da) va jadval sarlavhasini registrsiz tekshiradi (dizayn CSS `text-transform: uppercase`); rol muharriri eski `/catalog/access-grants::*` kalitlarini yangi `/access/employees::*` sifatida ko‘rsatadi va saqlaydi.

Lokal smoke’lar dev DB’ga yozuv qoldirdi: bekor qilingan (`isActive=false`) `kpe_full` test grantlari va ularning `AuditLog` yozuvlari; `npm run smoke` bitta xodimga test yuz rasmini yukladi (`syncStatus=pending`).

### Qolgan risklar
- Sidebar/drawer brauzerda 1440 / 768 / 360px da Phase 3’da tekshirilgan; keyingi o‘zgarishlardan keyin faqat build + HTTP/DOM smoke bilan tekshirildi — UAT kerak.
- roleAccess faqat client-side gating; server himoyasi `@Roles` va data-scope’ga tayanadi. Yangi `/access` API: ko‘rish — admin/hr/manager, o‘zgartirish — admin/hr, global turlar (`org_full`, `kpe_full`) — faqat admin.
- Mavsumiy fon (`lib/season.ts`, dizayn oqimi, commit qilinmagan) eski bo‘lim id `hr` ni kutadi; registrda `employees` → Кадры bo‘limida fon fokusi default’ga tushadi.
- `smoke-test.js` va `smoke-catalog-reports.js` default portlari (`3001`/`3000`) kanon portlardan farq qiladi — env bilan berish kerak.
- Railway `main`dan avtomatik deploy qiladi: branch merge qilinganda dizayn oqimining commit qilinmagan o‘zgarishlari bilan aralashmasligini tekshiring.

### Manual UAT checklist
- [ ] tenant_admin: sidebar’dagi barcha bo‘limlar ochiladi, collapse holati qayta yuklashdan keyin saqlanadi.
- [ ] HR / manager: faqat roleAccess’da berilgan sahifalar ko‘rinadi; ruxsatsiz URL to‘g‘ridan-to‘g‘ri ochilmaydi; `/reports` faqat ruxsatli hisobotlarni ko‘rsatadi.
- [ ] employee: staff-only katalog resurslari ko‘rinmaydi (API 403/404).
- [ ] platform_admin: platform-only bo‘limlar ko‘rinadi, tenant_admin’da yo‘q.
- [ ] Planshet (768px) va telefon (360–430px): drawer ochiladi/yopiladi, Escape va fon bosish yopadi, focus menyu tugmasiga qaytadi, pastki bar ishlaydi.
- [ ] Eski URL’lar: `/catalog/access-grants?employeeId=…` → xodim drawer’i; `/employees?tab=dismissed` sarlavhasi to‘g‘ri; `/catalog/reports/*` ochiladi.
- [ ] `/reports`: qidiruv, kategoriya, oxirgi ochilganlar; har kategoriyadan bitta hisobot — filtr, «Составить отчет», Excel/CSV/HTML.
- [ ] `/access/employees`: filtrlar (status, bo‘lim, lavozim, lokatsiya, tur, muddati) URL’da saqlanadi; ruxsat berish (muddat + sabab), takroriy berish 409, bekor qilish confirm bilan, audit tarixi drawer’da; bulk qisman xato ko‘rsatiladi.
- [ ] Rol muharriri: eski `/catalog/access-grants` ruxsatli rol «Доступ сотрудников» qatorida belgilangan ko‘rinadi; saqlashdan keyin xodim sahifani ochadi.
- [ ] Davomat (punch/marks/device), payroll (davr/tabel/vedomost) va sozlamalar oqimlari yangi menyudan topiladi.
- [ ] Global qidiruv, bildirishnomalar, parol almashtirish, logout/sessiya tiklash.

### Backlog (soxta ekran qilinmagan — real backend kerak)
- **Qurilma holati / sync log:** `Device.lastSeenAt` bor, lekin xato va sinxronlash jurnali (jadval + API + UI) yo‘q; Техобслуживание’da «ishlaydi» indikatori ko‘rsatilmaydi.
- **1С / Электронная подпись (E-IMZO) / Mehnat.gov.uz:** faqat `/settings?tab=integrations` sozlama kartochkalari; real almashuv yo‘q, menyuda «обмен не подключён» deb belgilangan.
- **roleAccess server tomonda:** kalitlar migratsiyasi faqat rol muharriri saqlaganda; DB’dagi eski kalitlarni bir martalik ko‘chirish skripti (ixtiyoriy).
- **Mavsumiy fon:** `sectionFocus` ni registr id’lariga (`employees`, `access`, `maintenance`, `communications`) moslash — dizayn oqimi.
- **Smoke portlari:** smoke skriptlar default’larini kanon portlarga keltirish.

### Ochiq emas (rejalashtirilgan)
Barcha F0–F13 yaxshilash fazalari yopildi.

### Ixtiyoriy (keyingi sprint)
- Mobile `/m`, web ESLint to‘liq, EmployeeCard/org-chart pixel (dizayn zip tiklanganda).
- **Telegram join so‘rovlari** — alohida sahifa + TTL purge: [TELEGRAM_JOIN_REQUESTS_PLAN.md](./TELEGRAM_JOIN_REQUESTS_PLAN.md)
