# Arena AI — HR HUB frontend design prompt

Copy the block below into Arena AI. Start with **desktop login**, then mobile login, then shell.

---

## PROMPT (copy from here)

```
You are redesigning the frontend of HR HUB — a multi-tenant HR + attendance + Face ID platform for companies in Uzbekistan / Central Asia.

PRODUCT PURPOSE
- HR admin web app: employees, divisions, locations, devices (Hikvision Face ID terminals), attendance marks, timesheets, payroll.
- Multi-tenant SaaS: each company (tenant) has its own data; admins log in with email/password.
- Core loop: face punch on terminal → attendance → reports / payroll.
- Language of UI today: Russian for desktop admin, Uzbek mixed on mobile. Keep Russian for desktop login first; Uzbek OK for mobile later.
- Audience: office HR managers and admins on desktop; employees on mobile (/m).

STACK CONSTRAINTS (do not break)
- Next.js App Router, React client components, CSS Modules (not Tailwind unless already present).
- Desktop login: apps/web/src/app/page.tsx + apps/web/src/app/login.module.css
- Mobile login: apps/web/src/app/m/login/page.tsx + apps/web/src/app/m/mobile.module.css
- Keep apiFetch('/api/auth/login'), setSession, router.replace('/dashboard') (desktop) and '/m' (mobile) behavior exactly.
- Prefer existing CSS variables from globals.css (--bg, --surface, --ink, --accent, --header, --radius, --shadow, fonts). Extend tokens if needed; do not invent a second design system.
- No new npm deps unless necessary. No purple-on-white / cream-serif / newspaper clichés. No dark-mode-first.

DESIGN DIRECTION
- Brand name "HR HUB" must be the hero-level signal on the first viewport (not a tiny logo in a corner).
- One composition for login: left atmosphere / product story + right focused sign-in (or a refined single-column on mobile).
- Atmosphere should feel: modern workplace + biometric access (face terminal, office entrance, trust) — real visual anchor, not abstract purple blobs.
- Typography: expressive but professional (keep or refine current font variables; avoid Inter/Roboto/Arial defaults if replacing).
- Motion: 2–3 intentional micro-motions (fade/slide on load, button press, error shake) — not noise.
- Cards only where interaction needs a container (the login form panel is OK).
- First viewport: brand, one headline, one short supporting line, one CTA (Войти), dominant visual — no stat strips, chip spam, or feature grids on login.
- Chips like "Hikvision / Multi-tenant" are optional secondary — if kept, make them quieter or remove.
- Accessibility: visible focus, contrast, labels, error states clear.
- Responsive: desktop split → stacked on tablet/phone without breaking the form.

SCOPE ORDER (do in this order, one step at a time)
1) Desktop login redesign (page.tsx + login.module.css only).
2) Mobile login (/m/login) aligned to the same brand language.
3) Then propose (do not implement yet unless asked): post-login shell — topbar, sidebar, dashboard first screen — same tokens.

DELIVERABLES FOR STEP 1
- Updated page.tsx and login.module.css only.
- Keep demo hint optional/subtle (admin@demo.local) — do not make credentials the visual focus.
- Link to mobile version stays, quieter.
- Short comment in CSS listing the new token usages if you add any.

SUCCESS CRITERIA
- Removing the nav/brand would make the page feel empty — brand is unmistakable.
- Looks like a serious HR / access-control product, not a generic SaaS template.
- Form still works: email, password, loading, error, submit → dashboard.
```

---

## After Arena

1. Review the diff in Cursor (login only first).
2. `npm run build:web` locally.
3. Commit + push when happy; Railway redeploys web from `main`.
