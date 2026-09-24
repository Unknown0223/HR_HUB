# Telegram xodim so‘rovlari — tasdiq sahifasi + TTL tozalash

> **Sana:** 2026-09-22 · Status: **REJA** (implementatsiya oldidan)  
> Bog‘liq: `apps/api/src/telegram/*`, `TelegramJoinPanel`, `EmployeeJoinRequest`, Settings → Telegram / roleAccess

## 1. Muammo

Hozir Telegram orqali qo‘shilish so‘rovlari faqat **Ходмлар** sahifasidagi kichik panelda (`TelegramJoinPanel`): qisqa jadval, Tasdiq/Rad bor, lekin:

- alohida sahifa yo‘q — mega-nav / **доступ** (roleAccess) da aniq punkt yo‘q;
- to‘liq ma’lumot (foto, PINFL, passport, muddat) yomon ko‘rinadi;
- so‘rovlar muddatsiz qolishi mumkin → DB + storage “musor”.

## 2. Maqsad

1. **Yangi sahifa** — barcha Telegram join so‘rovlari (pending asosiy), to‘liq kartochka/jadval.
2. **Tasdiqlash** va **Bekor qilish (rad)** tugmalari — faqat ruxsatli rollarga.
3. **Sozlamalar**da maksimal so‘rov umri (TTL, soat/kun).
4. TTL dan oshgan so‘rovlar **avtomatik o‘chiriladi** (DB + foto storage), musor to‘planmasin.

## 3. Hozirgi holat (qayta ishlatiladi)

| Qism | Holat |
|------|--------|
| Model `EmployeeJoinRequest` | ✅ status: `invited` → (bot to‘ldiradi) → `pending` → `approved` / `rejected` |
| API `GET/POST …/telegram/join-requests` | ✅ list, approve (tab №), reject |
| Bot webhook oqimi | ✅ FIO → tel → PINFL → foto |
| Web panel | ⚠️ faqat `/employees` ichida embed |
| TTL / purge | ❌ yo‘q |
| roleAccess / nav | ❌ alohida grant yo‘q |

**Qoida:** yangi endpointlar o‘rniga mavjud Telegram API ni kengaytirish; UI ni to‘liq sahifaga ko‘chirish.

## 4. UX / navigatsiya

### 4.1 Yangi route

- **Path:** `/employees/join-requests` (yoki `/hr/employee-join-requests` — tavsiya: `/employees/join-requests`, HR bo‘limida).
- **Nav:** Mega-nav → Кадры / Сотрудники yonida: **«Заявки из Telegram»** / **«Telegram so‘rovlari»**.
- **roleAccess grant key:** `/employees/join-requests::*` (AppShell filter + Settings → Roles).
- Default: `admin` / HR rollarga grant; boshqalarga yashirin.

### 4.2 Sahifa tarkibi

**Filtrlar**

- Status: `pending` (default) | `approved` | `rejected` | `invited` (bo‘sh invite) | hammasi
- Qidiruv: FIO, telefon, @username, PINFL
- Saralash: `createdAt` desc

**Ro‘yxat (jadval yoki kartalar)**

| Ustun | Manba |
|-------|--------|
| F.I.Sh. | lastName + firstName + middleName |
| Telegram | @username + telegramUserId |
| Telefon | phone |
| PINFL | pinfl |
| Foto | photoUrl (thumbnail + lightbox) |
| Status | badge |
| Yuborilgan | createdAt |
| Qolgan muddat | `expiresAt − now` yoki TTL asosida hisob |
| Amallar | **Tasdiqlash** / **Bekor qilish** |

**Tasdiqlash dialogi**

- Majburiy: таб. № (`tabNumber`) — hozirgi API sharti saqlanadi.
- Ixtiyoriy: izoh / bo‘lim (agar keyinroq kerak bo‘lsa — Faza 2).
- Muvaffaqiyat: employee yaratiladi, so‘rov `approved`, Telegram userga xabar (mavjud `approveJoinRequest`).

**Bekor qilish**

- Confirm modal → `POST …/reject` → status `rejected` + bot xabari.
- Ixtiyoriy: reject dan keyin TTL ichida saqlash, keyin purge (yoki darhol soft-delete — quyida).

**Invite**

- Sahifa yuqorisida «Invite havola yaratish» (hozirgi panel funksiyasi).
- Eski `TelegramJoinPanel` — sahifaga deep-link yoki panelni olib tashlash (faqat link qoldirish).

## 5. Sozlamalar (TTL)

### 5.1 Qayerda

**Settings → Telegram Bot** (`/settings/telegram`) ga qo‘shimcha maydonlar:

| Maydon | Tip | Default | Izoh |
|--------|-----|---------|------|
| `joinRequestTtlHours` | number | `72` | Pending/invited so‘rov maksimal umri (soat) |
| `joinRequestPurgeApprovedDays` | number | `30` | Approved/rejected arxiv necha kundan keyin o‘chadi (0 = o‘chirma) |
| `joinRequestPurgeEnabled` | boolean | `true` | Scheduler yoqilgan |

Saqlash joyi: `ExternalIntegration.config` (sys=`telegram`) — token bilan birga; yoki `TenantSetting.extras.telegramJoin` — **tavsiya: Telegram integration config** (bitta joy).

### 5.2 Expiry hisobi

- `expiresAt = createdAt + joinRequestTtlHours` (pending / invited uchun).
- UI da «Qolgan: 14 soat» / qizil badge agar < 6 soat.
- Optional DB column `expiresAt` (denormalize) — indeksli purge uchun qulay; yoki faqat `createdAt` + sozlama (Faza 1).

**Tavsiya Faza 1:** column qo‘shmasdan `createdAt < now - ttl` bilan purge.  
**Faza 2:** `expiresAt` + invite yaratilganda yozish (TTL o‘zgarsa eski qatorlar eski muddatda qoladi — aniqroq UX).

## 6. Backend

### 6.1 API (mavjudni kengaytirish)

| Method | Path | O‘zgarish |
|--------|------|-----------|
| GET | `/api/telegram/join-requests` | Query: `status`, `q`, `page`, `limit`; response ga `photoUrl`, `pinfl`, `middleName`, `expiresAt` (computed), `ttlHours` |
| GET | `/api/telegram/join-requests/:id` | **Yangi** — bitta so‘rov + photo signed URL |
| POST | `…/approve` | O‘zgarishsiz (tabNumber); + role check |
| POST | `…/reject` | O‘zgarishsiz; + role check |
| GET | `/api/telegram/status` | TTL sozlamalarini ham qaytarish (UI uchun) |

### 6.2 Ruxsat (доступ)

- Guard: JWT + tenant + **permission** (masalan `telegram.join.review` yoki path-based roleAccess).
- Web: `roleAccess` da `/employees/join-requests::*`.
- FAQAT shu grant bo‘lganlar sahifani ko‘radi va tugmalarni bosadi (API ham 403).

### 6.3 Purge scheduler

Yangi: `apps/api/src/telegram/join-request-purge.scheduler.ts` (namuna: `document-expiry-notify.scheduler.ts` / `mark-photo-purge`).

**Cron:** har soat (`EVERY_HOUR`) yoki kuniga 2 marta.

**Qoidalar (har tenant):**

1. Agar `joinRequestPurgeEnabled === false` → skip.
2. **Pending / invited:** `createdAt < now - ttlHours` → delete row + `photoUrl` storage object (agar bor).
3. **Approved / rejected:** agar `joinRequestPurgeApprovedDays > 0` va `reviewedAt/updatedAt` eski → delete (foto optional — approved employee da nusxa bor).
4. Log: `purged=N tenant=…`.
5. Telegram draft memory (`drafts` Map) — process restart bilan yo‘qoladi; DB purge yetarli.

**Xavfsizlik:** faqat `EmployeeJoinRequest` + tegishli storage key; employee/profile o‘chirilmaydi.

### 6.4 Bot xabarlari (ixtiyoriy yaxshilash)

- TTL bilan o‘chirilganda userga: «So‘rov muddati o‘tdi, yangi invite so‘rang» (agar `telegramUserId` bor).
- Faza 1 da skip qilish mumkin (faqat DB tozalash).

## 7. Web o‘zgarishlar (fayllar)

| Fayl | Ish |
|------|-----|
| `apps/web/src/app/(app)/employees/join-requests/page.tsx` | Yangi sahifa |
| `…/join-requests/page.module.css` | Arena/table stillar |
| `apps/web/src/lib/mega-nav.ts` | Nav punkt |
| `apps/web/src/lib/role-access.ts` / RolesAdmin | Default grant + label |
| `apps/web/src/app/(app)/settings/telegram/page.tsx` | TTL form maydonlari |
| `TelegramJoinPanel.tsx` | Qisqa banner + «Barcha so‘rovlar →» link; yoki olib tashlash |
| `docs/SMOKE_INDEX.md` | Smoke qatori |

## 8. API o‘zgarishlar (fayllar)

| Fayl | Ish |
|------|-----|
| `telegram.service.ts` | list enrich, getOne, TTL read, `purgeExpired(tenantId)` |
| `telegram.controller.ts` | GET `:id`, query params |
| `join-request-purge.scheduler.ts` | **Yangi** |
| `telegram.module.ts` | scheduler register |
| Settings / integration save | TTL maydonlari validatsiya (1…720 soat) |
| Unit test | purge cutoff logic |
| Smoke | `scripts/smoke-telegram-join-requests.js` (ixtiyoriy) |

## 9. Bosqichlar (implementatsiya)

### Faza A — Sahifa + ACL (asosiy qiymat)

1. `/employees/join-requests` + jadval (to‘liq maydonlar + foto).
2. Tasdiq / Bekor (mavjud API).
3. mega-nav + roleAccess grant.
4. Employees sahifasidagi panel → link.

### Faza B — Sozlamalar TTL

1. Telegram settings UI: `joinRequestTtlHours`, purge flags.
2. List API da `expiresAt` / `ttlRemainingHours`.
3. UI badge «muddati o‘tmoqda».

### Faza C — Avto-tozalash

1. Scheduler + storage delete.
2. Unit/smoke.
3. Deploy + Railway da cron ishlashini tekshirish (`@nestjs/schedule` allaqachon bor).

## 10. Qabul mezonlari (DoD)

- [ ] Ruxsatsiz user navda sahifani ko‘rmaydi; API 403.
- [ ] Pending so‘rovda FIO, tel, PINFL, foto, TG ko‘rinadi.
- [ ] **Tasdiqlash** (tab №) → employee yaratiladi; **Bekor** → rejected.
- [ ] Settings da TTL (masalan 72 soat) saqlanadi.
- [ ] TTL dan oshgan pending/invited cron bilan o‘chadi; foto storage dan ham.
- [ ] Approved/rejected ixtiyoriy arxiv TTL bo‘yicha tozalanadi.
- [ ] Eski panel chalkashlik qilmaydi (link yoki olib tashlangan).

## 11. Xavflar / cheklovlar

| Xavf | Yechim |
|------|--------|
| TTL qisqa → haqiqiy so‘rov o‘chib ketadi | Default 72h; min 24h validatsiya; UI ogohlantirish |
| Foto storage yo‘li noto‘g‘ri | `StorageService` orqali key parse (mavjud telegram upload path) |
| In-memory drafts TTL bilan sync emas | Bot sessiyasi alohida; faqat DB qatorlari purge |
| Multi-tenant cron yuk | Tenant batch + limit (masalan 500) |

## 13. Hotfix (2026-09-22)

`GET /employees/join-requests` avval `[id]` route ga tushib, API ga `id=join-requests` ketgan (Prisma P2023 UUID xato).

**Tuzatish:**
- Static page: `apps/web/src/app/(app)/employees/join-requests/page.tsx`
- Mega-nav: «Заявки из Telegram»
- `EmployeesService.findOne` — UUID validatsiya → 400
- `[id]/page` — `join-requests` / noto‘g‘ri id redirect
