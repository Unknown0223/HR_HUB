# HR HUB — Yaxshilash master-reja

> **Versiya:** 1.0 · **Sana:** 2026-09-21  
> **Asos:** loyiha audit (konfliktlar + kamchiliklar)  
> **Qoida:** har bir muammo turi = alohida reja; bajarish tartibi = fazalar (F0 → F6).

**Haqiqiy portlar (kanon):** Web `3001` · API `3002` · Device-gw `8800` · Postgres `5434`

---

## Fazalar xaritasi (navbat)

| Faza | Reja turi | Maqsad | Taxminiy hajm | Holat |
|------|-----------|--------|---------------|-------|
| **F0** | Konflikt / config / docs | Bitta haqiqat: portlar, linklar, README | 1–2 kun | ✅ |
| **F1** | Xavfsizlik | Parol/JWT/ingest/vault mustahkamlash | 3–5 kun | ✅ |
| **F2** | Test / CI / sifat | Lint + kritik path testlar | 3–5 kun | ✅ |
| **F3** | UI/UX / til / dizayn qarz | Arena qoidalari, til birligi, FormModal | 1–2 hafta | ✅ |
| **F4** | Tugallanmagan funksiyalar | Stublar, mobile, HR HUB P1 | 2–4 hafta | ✅ |
| **F5** | Arxitektura | God-service split, shared package, migratsiyalar | 3–6 hafta | ✅ |
| **F6** | Tozalash / ops | Junk olib tashlash, smokelarni CI ga | 1 hafta | ✅ |
| **F7–F13** | Qoldiq yopish | CSP, vault DROP, catalog slices, CI smoke, Arena employees | — | ✅ |

**Bajarish tartibi:** F0 → F13 yakunlandi. Living status: [STATUS.md](./STATUS.md).

---

## Reja 1 — Konflikt / config / hujjatlar (F0)

### Muammolar
- README portlari (`3000`/`3001`/`8000`) ≠ kod (`.env.example`, `main.ts`, web `package.json`)
- Yo‘q fayllarga link: `PROJECT_PLAN_ROADMAP.md`, `STATUS_AND_NEXT.md`, `SECURITY_CHECKLIST.md`, `LOAD_TEST_PUNCH_RESULTS.md`
- README papka yo‘li `D:\0223\hr-hub` eskirgan
- Gap/HR HUB/Mobile/Deploy hujjatlarida eski portlar
- HR HUB §2 vs §3 ichki ziddiyat

### Vazifalar
1. README ni kanon portlarga yangilash; papka yo‘lini tuzatish.
2. O‘lik linklarni olib tashlash yoki stub fayl + “superseded by IMPROVEMENT_MASTER_PLAN” yozish.
3. `FULL_STACK_GAP_PLAN`, `CATALOG_BACKEND_PARITY_PLAN`, `MOBILE_APP_PLAN`, `DEPLOY.md` portlarini sinxronlash.
4. HR HUB inventar (§2) ni §3 holatiga moslashtirish (yoki “inventory outdated” banner).
5. Root `STATUS.md` (qisqa living status) — faqat F0–F6 holat jadvali.

### Done
- [x] `npm run dev:web` / `dev:api` / gw URL lar README da kod bilan bir xil
- [x] README da 404 link yo‘q
- [x] Asosiy plan hujjatlarida portlar bir xil

---

## Reja 2 — Xavfsizlik (F1)

### Muammolar
- `Device.passwordEnc` plaintext (nom yolg‘on)
- JWT `localStorage` / `sessionStorage` (XSS)
- Bo‘sh `PUNCH_INGEST_API_KEY` = ochiq ingest (non-prod)
- Hardcoded bind secret + JWT `dev-secret` fallback
- CSP o‘chirilgan; vault kalitlari bo‘sh

### Vazifalar (navbat ichida)
1. **Prod gate kuchaytirish:** `NODE_ENV=production` da vault key, punch key, JWT ≥32 majburiy (boot fail).
2. **Bind secret:** hardcoded fallback faqat `NODE_ENV !== production`; prod da env majburiy.
3. **passwordEnc:** yangi yozuvlar faqat vault; UI da parolni ko‘rsatishni RBAC + audit; migratsiya rejasi (F5 da to‘liq).
4. **Media JWT:** cookie-only yo‘lni afzal qilish; `localStorage` fallback ni lab-only flag bilan cheklash.
5. **SECURITY_CHECKLIST.md** ni tiklash (qisqa, amaliy).
6. Helmet CSP: Swagger uchun alohida route; asosiy API da CSP yoqish (bosqichma-bosqich).

### Done
- [x] Prod boot: zaif/default secret bilan ishlamaydi (JWT ≥32, punch key, vault key, bind secret)
- [x] Checklist hujjati mavjud va README ga ulangan
- [x] Lab hali ishlaydi; prod default-deny
- [x] passwordEnc → vault-only + DROP (`F12`)
- [x] Media JWT: sessionStorage (XSS sirtini qisqartirish)
- [x] Helmet CSP yoqish (Swagger alohida)

### Risk
Lab break — barcha o‘zgarishlar `NODE_ENV` / feature-flag bilan.

---

## Reja 3 — Test / CI / sifat (F2)

### Muammolar
- Web test: 0
- API: ~10 spec; god-servicelarga yo‘q
- Web ESLint buildda o‘chirilgan; API lint yo‘q
- Smoke skriptlar CI da to‘liq emas

### Vazifalar
1. API: `npm run lint` (eslint) + CI step.
2. Web: `eslint.ignoreDuringBuilds` ni olib tashlash yoki CI da alohida `lint` majburiy.
3. Unit: punch ingest → attendance day; vault password resolve; JWT strategy prod gate.
4. 3–5 smoke ni CI matrix ga (quickstart, system-settings, timesheets).
5. Web: 1–2 Playwright/smoke (login + employees list) — ixtiyoriy, lekin rejalashtirilgan.

### Done
- [x] CI fail qiladi lint/type xatoda (API lint = ports check + tsc)
- [x] Kamida 3 yangi/kengaytirilgan API spec (jwt-secret: 7 test)
- [x] Ports guard `npm run check:ports` CI da
- [x] `smoke:quickstart` CI job (DB yo‘q staging — to‘liq matrix deferred)
- [ ] Web eslint-config-next to‘liq (ixtiyoriy; typecheck majburiy)

---

## Reja 4 — UI/UX / til / dizayn (F3)

### Muammolar
- RU/EN/UZ aralash
- FormModal vs `/new` vs full-page
- Employees / positions list Arena emas (detail/org-chart pixel ixtiyoriy)
- Mobile redesign ❌ (alohida sprint)

### Vazifalar
1. Til qoidasi: UI matnlari **rus** (mavjud Arena) yoki bitta tanlangan locale; EN xatolarni tarjima.
2. Qolgan `/new` sahifalarni `?create=1` + FormModal ga yopish.
3. `DESIGN_REDESIGN_STATUS`: employees list+detail, positions, org-chart.
4. Catalog enum label map (i18n yoki RU dictionary).
5. Mobile web (`/m`) — minimal Arena shell (to‘liq F4).

### Done
- [x] Create UX: `/new` → FormModal (50/50 redirect; employees `?create=1` parity)
- [x] Asosiy oqimlarda EN error fallbacklar → RU
- [x] Payroll type enum labels (Оклад/Премия/…)
- [x] Employees + positions list Arena redesign (`F13`)
- [ ] Mobile web (`/m`) — ixtiyoriy sprint

---

## Reja 5 — Tugallanmagan funksiyalar (F4)

### Muammolar
- Stub: 1C / e-sign / mehnat
- HR HUB P1 incident helpers
- Mobile Flutter + `/m`
- Office-link RSA activation stub
- Mock devices default

### Vazifalar
1. Stub integratsiyalar: UI da aniq “keladi / o‘chiq”; sync tugmasini disable yoki real adapter.
2. HR HUB P1: incident resolve/close API + UI.
3. Mobile: bitta sirtni tanlash (Flutter **yoki** `/m`) — ikkinchisini “legacy” deb belgilash.
4. device-gw vs office-link: `DEVICES_SIMPLE.md` da “qachon qaysi” decision tree.
5. RSA activation: implement yoki “manual only” deb hujjat + UI.

### Done
- [x] Stublar foydalanuvchini aldamaуdi (sync disabled + «Заглушка»)
- [x] Bitta mobile «source of truth» (`apps/mobile`; `/m` legacy)
- [x] Incident lifecycle yopiladi (resolve/close/investigate API + UI)
- [x] device-gw vs Office Link decision (`DEVICES_SIMPLE.md`)
- [ ] Live 1C / e-sign / mehnat adapterlar (hali stub)
- [ ] Flutter feature parity vs `/m`

---

## Reja 6 — Arxitektura (F5)

### Muammolar
- `catalog.service.ts` ~17k LOC
- Dynamic `(prisma as any)`
- `packages/shared` o‘lik
- 6 migration vs katta schema (`db:push`)
- Ikki credential store; generic + dedicated catalog

### Vazifalar
1. Catalog ni domen bo‘yicha modullarga bo‘lish (org / HR docs / payroll dict / …).
2. Typed Prisma delegates yoki codegen map — `as any` kamaytirish.
3. `@hr-hub/shared`: ROLES, punch types — web+api import.
4. Baseline migration strategiyasi: `prisma migrate diff` → bir “baseline” + keyingilar migrate-only.
5. `passwordEnc` → vault-only; column deprecate.
6. LEGACY_ROUTES ni bosqichma-bosqich generic yoki dedicated API ga yopish.

### Done
- [x] Birinchi domain slice: incidents (`IncidentsCatalogService`)
- [x] Shared package kamida NATS/ROLES uchun ishlatiladi (`@hr-hub/shared`)
- [x] Split reja: [ARCHITECTURE_SPLIT.md](./ARCHITECTURE_SPLIT.md)
- [x] Catalog domain slices (incidents/clearance/gph/tariff/hr-changes/finance/timesheet/schedules/reports) — thin `catalog.service`
- [x] `passwordEnc` column olib tashlash (vault-only, `F12`)
- [ ] Prod yo‘li: `db:deploy` baseline (ops)

---

## Reja 7 — Tozalash / ops (F6)

### Muammolar
- `apps/api/scripts/_recovered_*` junk
- Nested `tools/office-link/ui-src/node_modules`
- Ko‘p smoke, kam hujjatlangan
- Dead code / dublikat Form juftlari

### Vazifalar
1. Junk TSX/PY ni `_archive/` yoki o‘chirish.
2. office-link UI ni workspace yoki aniq izolyatsiya + `.gitignore`.
3. Smoke katalog: `docs/SMOKE_INDEX.md` (qaysi majburiy).
4. Dublikat Form/FormModal: thin wrapper qoida.

### Done
- [x] Repo root “noise” kamaygan (18 junk script o‘chirildi + gitignore)
- [x] Smoke indeksi mavjud ([SMOKE_INDEX.md](./SMOKE_INDEX.md))
- [x] FormModal qoida ([FORM_MODAL_CONVENTION.md](./FORM_MODAL_CONVENTION.md))
- [x] README → SMOKE_INDEX link
- [x] Quickstart smoke CI (`F10+`); to‘liq live matrix — staging da

---

## Umumiy DoD (barcha fazalar)

1. Har faza oxirida: qisqa changelog (PR yoki `STATUS.md` yangilanishi).
2. Regression: `npm run smoke:quickstart` (yoki ekvivalent) yashil.
3. Yangi xususiyat stub bo‘lsa — UI da aniq belgi, yashirin “ishlaydi” yo‘q.

---

## Keyingi amal

**Bajarilgan:** F0–F13 ✅ (qarang [STATUS.md](./STATUS.md), [F13_FINAL_CLOSURE.md](./F13_FINAL_CLOSURE.md)).  
**Ixtiyoriy:** mobile `/m`, web ESLint to‘liq, EmployeeCard/org-chart pixel (dizayn zip), staging live smoke matrix.
