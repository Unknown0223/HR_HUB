# HR HUB — Кадры → Главное: barcha ro‘yxat sahifalarini to‘liq kenglikka moslash

## Kontekst
Loyiha: `D:\hr-hub` (Next.js web: `apps/web`).
Oldingi ish: `/news` (Новостная лента) sahifasida `max-width: 1400px` + `margin: 0 auto` olib tashlandi — sahifa endi to‘liq kenglikda (`max-width: none`, `width: 100%`).
Endi xuddi shu muammo / xuddi shu sifatdagi layout moslashni **Кадры → Главное** ostidagi BARCHA bo‘lim sahifalariga qo‘llash kerak.

Menyu manbasi: `apps/web/src/lib/mega-nav.ts` → section `id: 'hr'` → column `title: 'Главное'`.

## Scope (faqat shu 9 ta sahifa + ularning list CSS)

| # | Label (RU) | Route | Asosiy fayllar |
|---|---|---|---|
| 1 | Сотрудники | `/employees` | `apps/web/src/app/(app)/employees/page.tsx` (+ `page-shared.module.css`) |
| 2 | Все кадровые документы | `/catalog/hr-documents` | `catalog/hr-documents/page.tsx` + `page.module.css` |
| 3 | Кадровые переводы | `/catalog/transfers` | `catalog/transfers/page.tsx` (CSS: `hr-documents/page.module.css`) |
| 4 | Все отсутствия сотрудников | `/catalog/absences` | `catalog/absences/page.tsx` + `page.module.css` |
| 5 | Корректировки табеля | `/catalog/timesheet-adjustments` | `catalog/timesheet-adjustments/page.tsx` + `page.module.css` |
| 6 | Заявки на кадровые изменения | `/catalog/hr-requests` | `catalog/hr-requests/page.tsx` + `page.module.css` |
| 7 | Обходные листы | `/catalog/clearance-sheets` | `catalog/clearance-sheets/page.tsx` + `page.module.css` |
| 8 | Все изменения в оплате труда | `/catalog/wage-changes` | `catalog/wage-changes/page.tsx` + `page.module.css` |
| 9 | Инциденты | `/catalog/incidents` | `catalog/incidents/page.tsx` + `page.module.css` |

Umumiy shared: `apps/web/src/app/page-shared.module.css`, shell: `apps/web/src/components/shell.module.css` + `AppShell.tsx`.

## Talablar (layout / UI)

1. **To‘liq kenglik:** sahifa kontenti markazda «kichrayib» qolmasin. Agar `.page` / `.wrap` / container da `max-width` + `margin: 0 auto` bo‘lsa — olib tashla yoki `max-width: none; width: 100%` qil (namuna: `apps/web/src/app/(app)/news/page.module.css`).
2. **Jadvallar:** keng ekranda jadval / toolbar / filter panel butun `main` kengligidan foydalansin; keraksiz yon bo‘shliqlar qolmasin.
3. **Responsive:** ≤1100px / ≤720px da toolbar, filterlar, jadval scroll/stack bo‘lsin; mobil da padding qisqaroq.
4. **Bir xil pattern:** 9 ta list sahifa vizual jihatdan bir oilaga o‘xshasin (toolbar, PageSubnav, FilterPanel, table card). Shared CSS o‘zgarsa — barcha bog‘liq sahifalarni tekshir.
5. **Biznes mantiqni buzma:** API, filtrlash, CRUD, export, statuslar, URL query params o‘zgarmasin. Faqat layout/CSS (zarurat bo‘lsa minimal JSX wrapper class).
6. **Detail/new sahifalar:** `[id]` / `new` formalar scope ichida faqat agar ular ham markazda qisilib qolgan bo‘lsa; asosiy e’tibor LIST sahifalar.

## Qilma

- Кадры → Организация / Дашборд, Посещения, Зарплата, Отчетность, Настройки — tegma.
- Mega-nav strukturasini o‘zgartirma (label/href saqlansin).
- Yangi feature / redesign hero banner (news dagi kabi) majburiy emas — asosiy maqsad **kenglikka moslash** va list UX.
- SALEC (`D:\SALEC — копия`) ga tegma; ish faqat `D:\hr-hub`.

## Qabul mezonlari

- [ ] `/employees`, `/catalog/hr-documents`, `/catalog/transfers`, `/catalog/absences`, `/catalog/timesheet-adjustments`, `/catalog/hr-requests`, `/catalog/clearance-sheets`, `/catalog/wage-changes`, `/catalog/incidents` — keng monitor (≥1600px) da kontent to‘liq kenglikda, katta yon gutter yo‘q.
- [ ] Filtrlash, jadval, yaratish tugmalari ishlaydi.
- [ ] Mobil/tablet da sindirmaydi.
- [ ] `/news` oldingi fix saqlanadi.
- [ ] Diff faqat kerakli CSS/minimal JSX; keraksiz refactor yo‘q.

## Ish tartibi

1. Har bir route uchun `.page` / `.wrap` / shared container da `max-width` / `margin: 0 auto` qidir.
2. `/news` dagi yechimga qarab bir xil qoida qo‘llа.
3. Shared CSS o‘zgarsa — 9 ta sahifani birma-bir ko‘zdan kechir.
4. Qisqa yakun: qaysi fayllar o‘zgardi + nima tuzatildi.

Boshlash: `localhost:3000` da Кадры → Главное → «Все отсутствия сотрудников» (`/catalog/absences`) dan boshlab, keyin qolgan 8 tasini.
