# HR HUB mobil ilova — to‘liq tekshiruv natijasi

**Sana:** 2026-10-02
**Muhit:** lokal API (`npm run dev`, :3002) + web proksi (:3001), Android emulyator Pixel 9a, server manzili `http://10.0.2.2:3001/api`
**Akkaunt:** `sinov` (Мелибаев Бахтиёржон, rol `employee`, Demo Company LLC)

## Topilgan va tuzatilgan muammolar

| # | Muammo | Sabab | Tuzatish |
|---|--------|-------|----------|
| 1 | API umuman ishga tushmagan — ilova hech qanday ma’lumot ololmasdi | `me.controller.ts` `getDetails` va oy bo‘yicha `payrollSummary(user, year, month)` ni chaqiradi, lekin `me.service.ts`dagi bu metodlar yo‘qolgan (fayl HEAD holatiga qaytib qolgan) → 2 ta TypeScript xatosi | `me.service.ts`ga `getDetails`, oy bo‘yicha `payrollSummary`, soatlik yo‘qlik (`startTime`/`endTime`) qayta yozildi; `StorageService` ulandi |
| 2 | Profil va bosh sahifada xodim rasmi o‘rniga «МБ» harflari | `GET /me` javobida `employee.photoUrl` yo‘q edi | `/me` endi yuz profili yoki shaxs rasmini qaytaradi (`StorageService.mediaUrl`, proksi `/api/storage/file`) |
| 3 | Rasm `data:` URL ko‘rinishida saqlangan xodimlarda avatar chiqmasdi | Mobil ilova rasmni faqat HTTP orqali yuklardi | `TeamRepository.photoBytes` `data:` URL’ni lokal dekodlaydi (jamoa ro‘yxati uchun ham) |
| 4 | Login muvaffaqiyatsiz bo‘lsa ekran xabarsiz qayta yuklanardi | `login()` `loading` holatini o‘rnatardi → router splash’ga o‘tib login ekranini yopardi | `49cd7d4` (avvalroq) |
| 5 | Maosh testi test ro‘yxatida yo‘q edi | — | `src/me/payroll-summary.spec.ts` `npm test`ga qo‘shildi |

## API tekshiruvi (`sinov` tokeni bilan)

| Manzil | Natija | Izoh |
|--------|--------|------|
| `POST /auth/login` (login `sinov`) | 200 | qisqa login → `sinov@demo.local` |
| `GET /me` | 200 | `photoUrl`, `mustChangePassword:false`, `teamSize:0` |
| `GET /me/details` | 200 | shaxsiy, kontakt, ish, identifikatorlar, 1 hujjat (Паспорт) |
| `GET /me/attendance/today` | 200 | `not_started` |
| `GET /me/marks` | 200 | 0 ta belgi |
| `GET /me/requests` | 200 | 1 ta HR murojaati (kutilmoqda) |
| `GET /me/absence-types` | 200 | 9 ta tur |
| `GET /me/inbox` | 403 | to‘g‘ri: oddiy xodim tasdiqlovchi emas, ilova bu tugmani yashiradi |
| `GET /me/notifications` | 200 | 1 ta |
| `GET /me/payroll/summary?year&month` | 200 | 2026-08: hisoblangan, 5 000 000 so‘m; 2026-07: hisoblangan, 0; qolgan oylar — davr yo‘q |
| `GET /mobile/v1/attendance/tabel` | 200 | kunlar yo‘q |
| `GET /mobile/v1/attendance/calendar` | 200 | kunlar yo‘q |
| `GET /news` / `GET /news/birthdays` | 200 | 0 yangilik / 1 tug‘ilgan kun |
| `GET /team` | 200 | 0 ta (bo‘limga rahbar biriktirilmagan) |
| `GET /tracking/me` | 200 | `tracking`, bugun 5+ nuqta |
| Rasm web proksi orqali (`:3001/api/storage/file`) | 200 | `image/jpeg`, 82 KB |
| `POST /me/punches/gps/check` | 201 | `configured:false` (xodimga hudud biriktirilmagan) |
| `POST /me/absences` (vaqt `25:00`) | 400 | validatsiya ishlaydi |
| `POST /me/absences` (yo‘q tur) | 404 | «Absence type not found» |
| `POST /auth/change-password` (noto‘g‘ri joriy parol) | 400 | ilova «Bir martalik parol noto‘g‘ri» deb ko‘rsatadi |

## Ilova ekranlari (emulyatorda qo‘lda)

| Ekran | Holat | Izoh |
|-------|-------|------|
| Login | ✅ | fasl rasmi to‘liq, xato xabari ko‘rinadi |
| Parolni almashtirish (bir martalik parol) | ✅ | jonli talablar, kuchlilik shkalasi, saqlangach bosh sahifaga o‘tadi |
| PIN o‘rnatish / PIN bilan ochish | ✅ | oddiy kod (1111) rad etiladi |
| Bosh sahifa | ✅ | rasm, bugungi holat, oy xulosasi, Tabel / So‘rovlar / To‘lov |
| Taqvim | ✅ | oy, kun tafsiloti, qaydnoma, so‘rovlar |
| Yangiliklar | ✅ | tug‘ilgan kunlar, yangilik yo‘qligi holati |
| Profil | ✅ | rasm, kompaniya, bo‘lim, tabel raqami |
| Shaxsiy ma’lumotlar | ✅ | rasm, kontaktlar (qo‘ng‘iroq/nusxa), ish ma’lumotlari, yashirin PINFL/hujjat |
| GPS kuzatuv | ✅ | fon xizmati ishlayapti, oxirgi nuqta, batareya |
| Sozlamalar / Bildirishnomalar sozlamasi | ✅ | |
| Xavfsizlik / Yordam | ✅ | |
| Tabel | ✅ | oy almashtirish, xulosa |
| So‘rovlar ro‘yxati | ✅ | mavjud HR murojaati ko‘rinadi |
| Yo‘qlik so‘rovi yaratish | ✅ | turlar bazadan, kunlik/soatlik |
| Ish haqi | ✅ | 2026-08: Hisoblandi 5 000 000, To‘lanishi kerak 5 000 000; bo‘sh oyda «hali hisoblanmagan» |
| Bildirishnomalar ro‘yxati | ✅ | |
| Telefon orqali kirish (belgi) | ✅ ekran | GPS ±5 m, tizim GPS himoyalangan; haqiqiy belgi yuborilmadi (davomatga yozuv tushmasin) |

## Avtomatik tekshiruvlar

- API: `tsc --noEmit` — xatosiz; `npm test` — **135/135** o‘tdi.
- Mobil: `flutter analyze` — xato va ogohlantirish yo‘q (37 ta faqat uslubiy `info`).

## Ataylab bajarilmagan amallar

Haqiqiy HR ma’lumotlarini o‘zgartirmaslik uchun quyidagilar API validatsiyasigacha tekshirildi, oxirigacha yuborilmadi:
telefon orqali kirish/chiqish belgisi, yo‘qlik so‘rovini yuborish, HR’ga murojaat yuborish.

## Ma’lumotlardagi bo‘shliqlar (kod emas — HR to‘ldirishi kerak)

`sinov` xodimida:
- ish grafigi biriktirilmagan → tabel/taqvimda ish kunlari hisoblanmaydi, GPS oynasi standart 09:00–18:00;
- «Servis» bo‘limiga rahbar biriktirilmagan → «Rahbar: Ko‘rsatilmagan», jamoa bo‘limi chiqmaydi;
- GPS hududi (geofence) biriktirilmagan → belgi hududsiz qabul qilinadi;
- e-mail, mintaqa, manzillar, INN, INPS bo‘sh;
- yo‘qlik turlari nomlari rus tilida (lug‘atdagi qiymatlar).

## Muhim eslatma: server

Bir martalik parollar va `sinov` akkaunti faqat **lokal** bazada. Ilova sukut bo‘yicha production serverga (`hr-akfa.up.railway.app`) ulanadi — u yerdagi ma’lumotlar boshqacha (masalan, boshqa tug‘ilgan kun va mintaqa). Lokal ma’lumotlar bilan ishlash uchun ilovadagi «Server» maydoniga kompyuter manzilini kiriting (`<kompyuter IP>:3001`, emulyatorda `10.0.2.2:3001`). Production’da ishlashi uchun API deploy qilinishi kerak.
