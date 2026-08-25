# HR HUB — Mobil ilova rejasi

**Maqsad:** Xodim va rahbar/HR uchun mobil ilova — mavjud NestJS API (`:3001`) ustida.  
**Emas:** Ofis Face ID terminalining o‘rnini bosish (yuzni tanish asosan **qurilmada** qoladi).

**Tavsiya etilgan stack:** Flutter (Dart) — bitta kod → Android + iOS.  
**Muqobil:** React Native (TypeScript) — web jamoa faqat TS bilsa.

**Bog‘liq:** web HR HUB, `device-gw` (Hikvision/ZK), `docs/VERIFIX_BACKEND_1TO1_PLAN.md`

---

## 1. Nima uchun mobil?

| Web (kompyuter) | Mobil |
|-----------------|--------|
| To‘liq HR/payroll/katalog | Tezkor shaxsiy oqimlar |
| Admin sozlamalar, hisobotlar | Yo‘lda so‘rov, belgi, tasdiq |
| Qurilma boshqaruvi | Push bildirishnoma |

**Asosiy foydalanuvchilar:**

1. **Xodim (`employee`)** — o‘z belgisi, so‘rovlar, maosh qisqacha  
2. **Rahbar (`manager`)** — jamoa, so‘rovlarni tasdiqlash  
3. **HR / Tenant admin** — kengaytirilgan ko‘rish + tasdiq (to‘liq katalog emas)

---

## 2. Texnologiya va struktura

### 2.1 Stack

| Qatlam | Tanlov | Izoh |
|--------|--------|------|
| UI | Flutter 3.x | Material 3 / Cupertino |
| Holat | Riverpod yoki Bloc | Auth + cache |
| HTTP | Dio | JWT + `X-Tenant-Id` |
| Navigatsiya | go_router | Deep link |
| Lokal | Hive / shared_preferences | Token, offline navbat |
| Push | Firebase Cloud Messaging | So‘rov/tasdiq |
| GPS | geolocator + permission_handler | Geofence punch |
| Kamera | image_picker | Selfie-proof (ixtiyoriy) |
| Xarita | google_maps_flutter (ixtiyoriy) | Joylashuv |

### 2.2 Loyiha papkalari (Flutter)

```
apps/mobile/
  lib/
    main.dart
    app.dart
    core/           # api client, auth, theme, errors, router
    features/
      auth/
      home/
      attendance/   # marks, QR, GPS, day status
      requests/     # absence + HR requests create/list/review
      profile/      # me, schedule, documents summary
      team/         # manager: team attendance
      payroll/      # payslip / advance summary (read)
      notifications/
    shared/         # widgets, filters
  test/
  integration_test/
```

### 2.3 Backend bilan bog‘lanish

- **Base URL:** `https://api.../api` (dev: `http://<LAN-IP>:3001/api`)
- **Auth:** `POST /auth/login` → JWT; header `Authorization: Bearer …`
- **Tenant:** `X-Tenant-Id` (login javobidan)
- **Rollar:** `employee | manager | hr | tenant_admin` — menyu shunga qarab

Yangi backend **kerak emas** — mavjud endpointlar + kerak joyda `me/*` qisqa wrapper API qo‘shiladi (MVP dan keyin).

---

## 3. Ilova arxitekturasi (ekranlar)

### 3.1 Umumiy shell

```
[Splash] → [Login] → [Home TabBar]
                         ├─ Bosh sahifa
                         ├─ Davomat
                         ├─ So‘rovlar
                         ├─ Bildirishnomalar
                         └─ Profil
```

Manager/HR uchun qo‘shimcha tab yoki Home ichida: **Jamoa / Tasdiqlar**.

### 3.2 Ekranlar ro‘yxati (MVP → to‘liq)

| # | Ekran | Rol | Maqsad |
|---|--------|-----|--------|
| 1 | Splash / sessiyani tiklash | barcha | Token tekshiruv |
| 2 | Login | barcha | Email + parol |
| 3 | Bosh sahifa | barcha | Bugungi status, tezkor tugmalar |
| 4 | Mening belgilatim | xodim+ | Bugun/oy IN–OUT ro‘yxati |
| 5 | Kun holati | xodim+ | on_time / late / leave / absent |
| 6 | QR punch | xodim | Lokatsiya QR orqali belgi |
| 7 | GPS punch | xodim | Geofence ichida belgi (+ ixtiyoriy selfie) |
| 8 | Yo‘qlik so‘rovi yaratish | xodim | Tur, sana, izoh |
| 9 | Mening so‘rovlarim | xodim | Holat: pending/approved/rejected |
| 10 | Kadr so‘rovi | xodim | Grafik/joy o‘zgarishi (mavjud tip) |
| 11 | Tasdiq navbati | manager/HR | Inbox: approve/reject |
| 12 | Jamoa bugun | manager | Kim keldi / kech / yo‘q |
| 13 | Grafikim | xodim | Ish vaqti, grace |
| 14 | Maosh qisqacha | xodim | Oxirgi period / avans (read-only) |
| 15 | Bildirishnomalar | barcha | Ro‘yxat + o‘qildi |
| 16 | Profil / chiqish | barcha | Ism, rol, tenant |
| 17 | Sozlamalar | barcha | Til, biometriya login, push on/off |
| 18 | (Keyin) Face enroll status | xodim | Qurilmada yuz bor-yo‘qligi (faqat status) |

**Webdagi to‘liq katalog, ФОТ hisoblash, qurilma admin — mobil MVP ga kirmaydi.**

---

## 4. Ilova orqali qilinadigan barcha jarayonlar

### 4.1 Autentifikatsiya

| Jarayon | Qadamlar | API (mavjud / kerak) |
|---------|----------|----------------------|
| Kirish | Email + parol → token saqlash | `POST /auth/login` |
| Sessiyani yangilash | App ochilganda token tekshir | `GET /auth/me` yoki employees me |
| Chiqish | Token o‘chirish | lokal |
| (Ixtiyoriy) Biometriya | FaceID/TouchID bilan token ochish | lokal |

### 4.2 Davomat (asosiy)

| Jarayon | Kim | Qadamlar | Natija |
|---------|-----|----------|--------|
| Bugungi holatni ko‘rish | Xodim | Home ochiladi | Vaqtida/kech/yo‘q/ta’til |
| Belgilar tarixi | Xodim | Sana filtri | IN/OUT vaqtlar |
| QR bilan belgi | Xodim | QR skan → server | Punch + `recalcDay` |
| GPS bilan belgi | Xodim | Joy ruxsati → geofence tekshiruv → punch | Punch yoki problem mark |
| Selfie-proof (ixtiyoriy) | Xodim | Foto + GPS birga | Audit/frod kamaytirish (Face ID emas) |
| Jamoa holati | Rahbar | Bo‘lim tanlash | Ro‘yxat: keldi/kech/yo‘q |

**Muhim:** Ofis eshigidagi **Hikvision Face ID** ishlashda qoladi. Mobil GPS/QR — qo‘shimcha kanal (masofadan / maydon ishi).

### 4.3 Yo‘qlik va so‘rovlar

| Jarayon | Kim | Qadamlar | Natija |
|---------|-----|----------|--------|
| Ta’til/kasallik so‘rash | Xodim | Tur + sana oralig‘i + izoh → yuborish | `pending` absence/request |
| So‘rovni bekor qilish | Xodim | Faqat pending | `cancelled` |
| So‘rovlarimni kuzatish | Xodim | Ro‘yxat | Status badge |
| So‘rovni tasdiqlash | Rahbar/HR | Inbox → Approve | Kunlar `leave` (backend zanjir) |
| So‘rovni rad etish | Rahbar/HR | Reject + izoh | `rejected` |
| Grafik o‘zgartirish so‘rovi | Xodim | Tip + izoh | HrRequest → review |
| Menga kelgan so‘rovlar | Rahbar | Scope inbox | Filtrlash |

### 4.4 Bildirishnomalar

| Jarayon | Trigger | Mobil |
|---------|---------|--------|
| So‘rov yuborildi | Xodim create | Rahbarga push |
| Tasdiq/rad | Review | Xodimga push |
| Muammoli belgi | Problem mark | HR/manager (ixtiyoriy) |
| Ro‘yxatni o‘qish | Tap | O‘qildi flag |

### 4.5 Profil va ma’lumot (read)

| Jarayon | Kim | Mazmun |
|---------|-----|--------|
| Mening kartochkam | Xodim | FIO, bo‘lim, lavozim, tab № |
| Grafik | Xodim | start/end/grace |
| Hujjatlar qisqacha | Xodim | So‘nggi HR docs (read) |
| Maosh/avans ko‘rinishi | Xodim | Oxirgi yopilgan period qisqacha (maxfiy — faqat o‘zi) |

### 4.6 HR/Manager qo‘shimcha (Phase 2)

| Jarayon | Izoh |
|---------|------|
| Jamoa kechikishlari | Filtr: bugun/hafta |
| Tezkor “yo‘qlarni belgilash” | Faqat ruxsatli rol (webdagi mark-absents) |
| Xodim qidiruvi | Faqat o‘z bo‘limi / ruxsat |

### 4.7 Mobilga **kirmaydigan** jarayonlar (webda qoladi)

- To‘liq katalog CRUD (tarif, shtat, 100+ hisobot)  
- Period calculate / ФОТ / vedomost import  
- Qurilma enroll (yuzni terminalga yuklash) — admin web yoki device UI  
- Tenant/platform sozlamalari  
- 1C/bank to‘lov relslari  

---

## 5. Ruxsatlar matritsasi

| Funksiya | employee | manager | hr | tenant_admin |
|----------|:--------:|:-------:|:--:|:------------:|
| O‘z belgilari / QR / GPS | ✓ | ✓ | ✓ | ✓ |
| Yo‘qlik so‘rovi yaratish | ✓ | ✓ | ✓ | ✓ |
| So‘rovlarni tasdiqlash | — | ✓ (jamoa) | ✓ | ✓ |
| Jamoa dashboard | — | ✓ | ✓ | ✓ |
| Maosh qisqacha (o‘zi) | ✓ | ✓ | ✓ | ✓ |
| Boshqa xodim maoshi | — | — | ✓* | ✓* |
| Mark absents | — | lim. | ✓ | ✓ |

\* API role guard bilan.

---

## 6. Ma’lumot oqimi (sodda diagramma)

```
[Mobil] --HTTPS/JWT--> [Nest API]
                           |-- Attendance: punches QR/GPS, days, marks
                           |-- HR: absences, requests review
                           |-- Payroll: timesheet/advances (read)
                           |-- Notifications
                           |
                     [Postgres]
                           ^
[Hikvision terminal] --> [device-gw] --punch ingest--> [Nest API]
```

Mobil va terminal **parallel** kanallar; ikkalasi ham `AttendanceMark` + `recalcDay` ga tushadi.

---

## 7. Offline va xavfsizlik

| Mavzu | Qoida |
|-------|--------|
| Offline | So‘rov/punch navbatga qo‘yiladi; online bo‘lganda sync (Conflict: server vaqti ustun) |
| GPS spoof | Serverda geofence + accuracy tekshiruvi; past accuracy → rad yoki problem |
| Selfie | Majburiy emas; fraud riskli joylarda yoqiladi |
| Token | Secure storage; refresh (keyinroq) |
| HTTPS | Production majburiy |
| Minimal data | Maosh faqat o‘ziga; screenshot warning (ixtiyoriy) |

---

## 8. Bosqichlar (roadmap)

### Phase M0 — Tayyorgarlik (3–5 kun)
- [x] Flutter loyiha `apps/mobile`
- [x] API client + login + tenant header
- [x] Dizayn tokenlari (HR HUB ranglari: sidebar/accent)
- [x] `GET me` yoki employee-self endpoint aniqlash/qo‘shish

### Phase M1 — MVP (2–3 hafta) — **ishlatish mumkin**
- [x] Login, Home (bugungi status)
- [x] Belgilar ro‘yxati
- [x] GPS punch (geofence)
- [x] Yo‘qlik so‘rovi create + list
- [x] Manager: tasdiq inbox
- [ ] Push (FCM) asosiy eventlar — *API ro‘yxat/mark-read bor; FCM device token keyinroq*
- [x] Profil + chiqish

**Acceptance:** xodim so‘rov yuboradi → rahbar telefonida tasdiqlaydi → kun `leave`; GPS punch → belgi + dashboard yangilanadi.

### Phase M2 — Kengaytirish (2 hafta)
- [x] QR punch
- [x] Jamoa bugun
- [x] Bildirishnomalar mark-read
- [x] Grafikim + maosh qisqacha
- [x] Offline navbat — *stub (`OfflineQueue`), to‘liq sync keyin*
- [ ] Selfie-proof ixtiyoriy

### Phase M3 — Polish / store (1–2 hafta)
- [ ] Biometrik login
- [ ] Deep links
- [ ] Crashlytics / analytics
- [ ] Play Store / App Store build + privacy policy
- [ ] UAT checklist (Android + iOS)

### Phase M4 — Ixtiyoriy keyin
- [ ] Chat/support
- [ ] Oddiy shaxsiy hisobotlar (oylik kechikish)
- [ ] WebView orqali tanlangan web hisobotlar (faqat HR)

---

## 9. API — mavjud vs qo‘shimcha kerak

### Mavjud (mobil to‘g‘ridan ishlatadi)

- `POST /auth/login`
- Attendance punches QR/GPS, marks, days, locations
- `GET/POST` absences, `PATCH .../status`
- `GET/POST` requests, `PATCH .../review`
- Notifications list (agar endpoint ochiq)
- Payroll timesheet/advances (role bilan)

### Qo‘shish tavsiya (mobil uchun qulay)

| Endpoint | Sabab |
|----------|--------|
| `GET /me` | Profil + employeeId + schedule bitta javobda |
| `GET /me/attendance/today` | Home uchun yig‘ma |
| `GET /me/requests` | Faqat o‘z so‘rovlari |
| `GET /me/inbox` | Manager tasdiq navbati |
| `POST /me/punches/gps` | EmployeeId majburiy emas (tokendan) |
| Push device token register | FCM |

---

## 10. Test rejasi

| Test | Mazmun |
|------|--------|
| Unit | Auth, geofence distance, DTO mapping |
| Integration | Login → GPS punch → marks list |
| E2E | So‘rov create → approve → day leave |
| Qurilma | Haqiqiy telefon GPS + mock API |
| Regression | Web tabel/dashboard punchdan yangilanishi |

---

## 11. Muvaffaqiyat mezonlari (Definition of Done)

1. Android + iOS MVP store-internal test flight  
2. Xodim: GPS punch + yo‘qlik so‘rovi ishlaydi  
3. Rahbar: push + approve/reject ishlaydi  
4. Web dashboard/tabel shu belgilarni ko‘rsatadi  
5. Face ID terminal oqimi buzilmagan  

---

## 12. Xulosa (sodda)

- Mobil — **shaxsiy va rahbar oqimlari** uchun; to‘liq Verifix/web o‘rnini bosmaydi.  
- Yuzni tanish — **ofis qurilmasi**; telefonda asosan GPS/QR + ixtiyoriy selfie.  
- Stack — **Flutter**; backend — **hozirgi Nest API**.  
- Avval **M1 MVP** (login, belgi, so‘rov, tasdiq, push), keyin QR/jamoa/maosh.

**Keyingi qadam (kod):** `apps/mobile` Flutter skeleton + `GET /me` API — foydalanuvchi tasdiqlagach boshlanadi.
