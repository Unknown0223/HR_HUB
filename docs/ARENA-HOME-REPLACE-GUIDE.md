# Arena — Главная (3 ta sahifa): qayerdan almashtiriladi

Login dizayni allaqachon loyihaga qo‘yilgan. **Главная** ostida 3 ta sahifa bor — har biri uchun **alohida** Arena prompt.

## Menyudan ochilishi

Yuqori menyu **Главная** →:

| # | Menyudagi nom | URL | Arena prompt fayli |
|---|---------------|-----|--------------------|
| 1 | Статистика посещений сотрудников | `/dashboard` | [ARENA-DESIGN-PROMPT-DASHBOARD.md](./ARENA-DESIGN-PROMPT-DASHBOARD.md) |
| 2 | Новостная лента | `/news` | [ARENA-DESIGN-PROMPT-NEWS.md](./ARENA-DESIGN-PROMPT-NEWS.md) |
| 3 | Удалённое управление устройствами | `/catalog/device-control` | [ARENA-DESIGN-PROMPT-DEVICE-CONTROL.md](./ARENA-DESIGN-PROMPT-DEVICE-CONTROL.md) |

Kodda menyu: `apps/web/src/lib/mega-nav.ts` → section `home`.

## Arena zip / fayllarni qayerga qo‘yish

Arena odatda `page.tsx` + `page.module.css` qaytaradi. **Faqat shu juftlikni** mos papkaga overwrite qiling (auth/API o‘zgartirmang).

### 1) Dashboard
```
apps/web/src/app/(app)/dashboard/page.tsx
apps/web/src/app/(app)/dashboard/page.module.css
```

### 2) Новостная лента
```
apps/web/src/app/(app)/news/page.tsx
apps/web/src/app/(app)/news/page.module.css
```

### 3) Удалённое управление
```
apps/web/src/app/(app)/catalog/device-control/page.tsx
apps/web/src/app/(app)/catalog/device-control/page.module.css
```

## Qoida (muhim)

1. Har safar **bitta** prompt → **bitta** sahifa.
2. Arena chap sidebar / soxta dashboard yasasa — **qabul qilmang** (bizda yuqori mega-menyu).
3. Login ranglari: `#070e18` + accent `#0284c7` — 3 sahifa shu tilda.
4. `@/lib/api`, marshrutlar, action idlar, localStorage kalitlari — **muzlatilgan**.
5. Zipda `globals.css` / Tailwind / `src/lib/auth` kelsa — **to‘liq copy qilmang**; faqat dizayn CSS + className.

## Tartib (tavsiya)

1. Arena’ga Dashboard prompt → natijani `dashboard/` ga qo‘ying → tekshiring  
2. News prompt → `news/`  
3. Device-control prompt → `catalog/device-control/`  

Cursor’da merge kerak bo‘lsa: zipni yuboring, faqat tegishli papkani qo‘llaymiz.
