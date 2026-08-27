# Prompt generator — marked mega-nav screenshot → full-width list prompt

When the user pastes a **screenshot with arrows** marking a mega-nav section (like Кадры → Главное), generate a prompt in the **exact quality/structure** of `ARENA-FULLWIDTH-HR-GLAVNOE.md`.

## How the user marks
- Arrow 1 → top mega section (e.g. Кадры, Посещения)
- Arrow 2 → column title inside mega (e.g. Главное, Организация)
- Arrow 3 → list of leaf items (routes under that column)

## What you must resolve from code
1. Open `apps/web/src/lib/mega-nav.ts`
2. Find section by Russian label + column `title`
3. Build the table: `# | Label (RU) | Route | page.tsx | page.module.css | shared imports`
4. Note shared CSS: `apps/web/src/app/page-shared.module.css`, shell `shell.module.css` / `AppShell.tsx`
5. Reference layout sample: `apps/web/src/app/(app)/news/page.module.css` (`.page { max-width: none; width: 100%; }`)

## Prompt skeleton (fill in)

```markdown
# HR HUB — {SECTION} → {COLUMN}: barcha ro‘yxat sahifalarini to‘liq kenglikka moslash

## Kontekst
Loyiha: `D:\hr-hub` (Next.js web: `apps/web`).
Namuna: `/news` — `max-width: none`, `width: 100%` (markazda qisilib qolmasin).
Endi xuddi shu layout ni **{SECTION} → {COLUMN}** ostidagi BARCHA list sahifalariga qo‘llash.

Menyu: `apps/web/src/lib/mega-nav.ts` → section `id: '{id}'` → column `title: '{COLUMN}'`.

## Scope (faqat shu N ta sahifa + list CSS)

| # | Label (RU) | Route | Asosiy fayllar |
|---|---|---|---|
| … | … | … | … |

Umumiy shared: `apps/web/src/app/page-shared.module.css`, shell: `apps/web/src/components/shell.module.css` + `AppShell.tsx`.

## Talablar (layout / UI)
1. **To‘liq kenglik:** `.page` / `.wrap` / container da `max-width` + `margin: 0 auto` bo‘lsa — olib tashla yoki `max-width: none; width: 100%` (namuna: news).
2. **Jadvallar:** keng ekranda jadval / toolbar / FilterPanel butun `main` kengligidan foydalansin.
3. **Responsive:** ≤1100px / ≤720px toolbar/filter/table stack yoki horizontal scroll; mobil padding qisqaroq.
4. **Bir xil pattern:** list oilasi (PageSubnav, FilterPanel, table card). Shared CSS o‘zgarsa — bog‘liq sahifalarni tekshir.
5. **Biznes mantiqni buzma:** API, filter, CRUD, export, URL query — faqat layout/CSS (+ minimal className).
6. **Detail/new:** faqat agar ular ham markazda qisilgan bo‘lsa; asosiy e’tibor LIST.

## Qilma
- Boshqa mega section / column — tegma.
- Mega-nav label/href o‘zgartirma.
- Yangi hero/feature majburiy emas — asosiy maqsad **kenglik**.
- `D:\SALEC*` ga tegma.

## Qabul mezonlari
- [ ] Har bir route ≥1600px da to‘liq kenglik, katta yon gutter yo‘q
- [ ] Filter/jadval/create ishlaydi
- [ ] Mobil/tablet sindirmaydi
- [ ] `/news` fix saqlanadi
- [ ] Diff faqat kerakli CSS/minimal JSX

## Ish tartibi
1. Har route da `max-width` / `margin: 0 auto` qidir.
2. `/news` qoidasini qo‘lla.
3. Shared o‘zgarsa — N ta sahifani birma-bir ko‘zdan kechir.
4. Qisqa yakun: fayllar + nima tuzatildi.

Boshlash: localhost da birinchi list route dan, keyin qolganlari.
```

## Agent reply style when user sends marked screenshot
1. Confirm detected `{SECTION} → {COLUMN}` and N routes from mega-nav.
2. Write the filled prompt into `docs/ARENA-FULLWIDTH-{SLUG}.md`.
3. Ask whether to **execute** the prompt now or only save for Arena/agent later.
