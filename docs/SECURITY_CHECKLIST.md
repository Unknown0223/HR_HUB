# HR HUB — Security checklist

> Lab vs prod. Batafsil yaxshilash: [IMPROVEMENT_MASTER_PLAN.md](./IMPROVEMENT_MASTER_PLAN.md) **Faza 1**.

## Prod majburiy (boot / deploy oldidan)

- [ ] `JWT_SECRET` — random, ≥32 belgi (default/`dev-secret` yo‘q)
- [ ] `PUNCH_INGEST_API_KEY` — o‘rnatilgan; bo‘sh = **lab only**
- [ ] `DEVICE_CREDENTIAL_VAULT_KEY` — o‘rnatilgan (device parollari vault da)
- [ ] `DEVICE_LINK_KEY` / office-link bind secret — prod da env, hardcoded fallback yo‘q
- [ ] `CORS_ORIGIN` — aniq web origin(lar), wildcard yo‘q
- [ ] `NODE_ENV=production`
- [ ] TLS (HTTPS) reverse proxy orqali
- [ ] Postgres / Redis / NATS / MinIO — public internetga ochilmagan
- [ ] Demo parollar (`Demo1234!`) o‘zgartirilgan yoki demo user o‘chirilgan

## Punch ingest

1. Lab: kalit bo‘sh bo‘lishi mumkin (NATS asosiy).
2. Staging/prod: `PUNCH_INGEST_API_KEY` + `X-Punch-Key` header.
3. Ixtiyoriy: `PUNCH_INGEST_RATE_LIMIT_PER_MIN=120`.
4. NATS consumer (`hrhub.punch.raw`) HTTP kalitidan mustaqil — GW ichki tarmoqda.

## Face / biometrika

- [ ] MinIO private; face upload RBAC (HR / tenant_admin / platform_admin)
- [ ] `FACE_PURGE_DAYS` (prod retention) yoqilgan
- [ ] Audit: face sync / purge kuzatiladi

## Web / JWT

- [x] Media JWT: **sessionStorage only** (localStorage o‘qish olib tashlangan, F8)
- [x] CSP (Helmet) yoqilgan; Swagger uchun inline/CDN ruxsat (F7)
- [x] Device parol: **vault-only**; `password_enc` column DROP (F12 backfill + migration)

## Deploy tekshiruv

- [ ] `docs/DEPLOY.md` / Railway env lar to‘ldirilgan
- [ ] `npm run smoke:quickstart` (yoki ekvivalent) staging da yashil
