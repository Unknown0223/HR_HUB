# HR HUB — Кадры → Организация: barcha ro‘yxat sahifalarini to‘liq kenglikka moslash

## Kontekst
Loyiha: `D:\hr-hub` (Next.js web: `apps/web`).
Oldingi ish: `/news` (Новостная лента) sahifasida `max-width: 1400px` + `margin: 0 auto` olib tashlandi — sahifa endi to‘liq kenglikda (`max-width: none`, `width: 100%`). Xuddi shu sifatdagi layout moslash **Кадры → Главное** listlariga ham qo‘llanilgan / qo‘llaniladi.
Endi xuddi shu muammo / xuddi shu sifatdagi layout moslashni **Кадры → Организация** ostidagi BARCHA bo‘lim sahifalariga qo‘llash kerak.

Menyu manbasi: `apps/web/src/lib/mega-nav.ts` → section `id: 'hr'` → column `title: 'Организация'`.

## Scope (faqat shu 9 ta sahifa + ularning list CSS)

| # | Label (RU) | Route | Asosiy fayllar |
|---|---|---|---|
| 1 | Подразделения | `/divisions?tab=divisions` | `apps/web/src/app/(app)/divisions/page.tsx` + `list.module.css` (+ `org-chart.module.css` tab/view uchun) |
| 2 | Должности | `/positions?tab=positions` | `apps/web/src/app/(app)/positions/page.tsx` + `list.module.css` |
| 3 | Разряды | `/catalog/grades` | `catalog/grades/page.tsx` + `page.module.css` |
| 4 | Позиции | `/catalog/staff-positions` | `catalog/staff-positions/page.tsx` + `page.module.css` |
| 5 | Оргструктура по позициям | `/catalog/staff-positions/structure` | `catalog/staff-positions/structure/page.tsx` + `structure.module.css` |
| 6 | Тарифные группы | `/catalog/tariff-groups` | `catalog/tariff-groups/page.tsx` + `page.module.css` |
| 7 | Утверждения тарифных групп | `/catalog/tariff-approvals` | `catalog/tariff-approvals/page.tsx` + `page.module.css` |
| 8 | Повышение разрядов | `/catalog/grade-history` | `catalog/grade-history/page.tsx` + `page.module.css` |
| 9 | Карьерный путь | `/catalog/career-paths` | `catalog/career-paths/page.tsx` + `page.module.css` |

Umumiy shared (agar ishlatilsa): `apps/web/src/app/page-shared.module.css`, shell: `apps/web/src/components/shell.module.css` + `AppShell.tsx`.

Eslatma: `/divisions` va `/positions` query `tab=` bilan ochiladi — tab/URL mantiqini saqlang; faqat layout kengligini tuzating.

## Talablar (layout / UI)

1. **To‘liq kenglik:** sahifa kontenti markazda «kichrayib» qolmasin. Agar `.page` / `.wrap` / `.list` / container da `max-width` + `margin: 0 auto` bo‘lsa — olib tashla yoki `max-width: none; width: 100%` qil (namuna: `apps/web/src/app/(app)/news/page.module.css`).
2. **Jadvallar / struktura:** keng ekranda jadval, toolbar, filter panel, org-chart / structure view butun `main` kengligidan foydalansin; keraksiz yon bo‘shliqlar qolmasin.
3. **Responsive:** ≤1100px / ≤720px da toolbar, filterlar, jadval scroll/stack bo‘lsin; mobil da padding qisqaroq. Structure/org-chart view ham sindirmasin.
4. **Bir xil pattern:** 9 ta list/struktura sahifa vizual jihatdan bir oilaga o‘xshasin (toolbar, PageSubnav, FilterPanel, table card — qayerda bor bo‘lsa). Shared CSS o‘zgarsa — barcha bog‘liq sahifalarni tekshir.
5. **Biznes mantiqni buzma:** API, filtrlash, CRUD, export, statuslar, URL query params (`tab=`, filterlar) o‘zgarmasin. Faqat layout/CSS (zarurat bo‘lsa minimal JSX wrapper class).
6. **Detail/new sahifalar:** `[id]` / `new` / `edit` formalar scope ichida faqat agar ular ham markazda qisilib qolgan bo‘lsa; asosiy e’tibor LIST / structure sahifalar.

## Qilma

- Кадры → Главное / Дашборд, Посещения, Зарплата, Отчетность, Настройки — tegma.
- Настройки ichidagi boshqa «Организация» ustunlari (payroll/accounting) — tegma; faqat **Кадры → Организация**.
- Mega-nav strukturasini o‘zgartirma (label/href saqlansin).
- Yangi feature / redesign hero banner (news dagi kabi) majburiy emas — asosiy maqsad **kenglikka moslash** va list UX.
- SALEC (`D:\SALEC — копия`) ga tegma; ish faqat `D:\hr-hub`.

## Qabul mezonlari

- [ ] `/divisions?tab=divisions`, `/positions?tab=positions`, `/catalog/grades`, `/catalog/staff-positions`, `/catalog/staff-positions/structure`, `/catalog/tariff-groups`, `/catalog/tariff-approvals`, `/catalog/grade-history`, `/catalog/career-paths` — keng monitor (≥1600px) da kontent to‘liq kenglikda, katta yon gutter yo‘q.
- [ ] Filtrlash, jadval, yaratish tugmalari / tablar ishlaydi.
- [ ] Mobil/tablet da sindirmaydi (structure view ham).
- [ ] `/news` va Кадры → Главное oldingi fixlar saqlanadi.
- [ ] Diff faqat kerakli CSS/minimal JSX; keraksiz refactor yo‘q.

## Ish tartibi

1. Har bir route uchun `.page` / `.wrap` / `.list` / shared container da `max-width` / `margin: 0 auto` qidir.
2. `/news` dagi yechimga qarab bir xil qoida qo‘llа.
3. Shared CSS o‘zgarsa — 9 ta sahifani birma-bir ko‘zdan kechir.
4. Qisqa yakun: qaysi fayllar o‘zgardi + nima tuzatildi.

Boshlash: `localhost:3000` da Кадры → Организация → «Подразделения» (`/divisions?tab=divisions`) dan boshlab, keyin qolgan 8 tasini.
