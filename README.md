# HR HUB

> Papka joylashuvi: `D:\0223\hr-hub`  
> Ma’lumot yig‘ish skriptlari **bu yerda emas** — ular: `D:\0223\malumot_yiguvchi\`

Multi-tenant **HR + davomat (Face ID) + ish haqi + hisobotlar** platformasi.

| Qatlam | Stack |
|--------|--------|
| Web | Next.js 15 + TypeScript (`apps/web`) |
| API | NestJS + Prisma + PostgreSQL (`apps/api`) |
| Device GW | FastAPI + Mock / Hikvision ISAPI / ZKTeco Push (`apps/device-gw`) |
| Infra | Postgres 16, Redis, NATS, MinIO |

**Holat:** Phase 0–6 navbar MVP ✅ · Phase 7 stabilizatsiya (~95–100%).  
Roadmap: [`../docs/PROJECT_PLAN_ROADMAP.md`](../docs/PROJECT_PLAN_ROADMAP.md) · Status: [`../docs/STATUS_AND_NEXT.md`](../docs/STATUS_AND_NEXT.md) · Security: [`../docs/SECURITY_CHECKLIST.md`](../docs/SECURITY_CHECKLIST.md)

---

## Tezkor start

### 1) Infra (Docker)

```bash
cd hr-hub
cp .env.example .env
# apps/api/.env, apps/web/.env, apps/device-gw/.env — kerak bo‘lsa .env.example dan

npm run infra:up
```

Postgres host port: **5434** (agar 5432 band bo‘lsa).

### 2) Dependencies

```bash
npm install

cd apps/device-gw
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cd ../..
```

### 3) DB + seed

```bash
npm run db:push
npm run db:seed
```

### 4) Servislar (3 terminal)

```bash
npm run dev:api          # :3001
npm run dev:web          # :3000
cd apps/device-gw && .venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

API bootda active qurilmalar device-gw ga avtomatik register qilinadi.

### 5) Smoke (Face ID E2E)

```bash
npm run smoke
# face upload → sync → mock punch (NATS) → attendance mark
```

| URL | |
|-----|--|
| Web | http://localhost:3000 |
| API Swagger | http://localhost:3001/docs |
| Device GW | http://localhost:8000/docs |

---

## Demo login

| Rol | Email | Parol |
|-----|-------|-------|
| Tenant admin | `admin@demo.local` | `Demo1234!` |
| Platform admin | `platform@hrhub.local` | `Demo1234!` |

Tenant: **demo**. So‘rovlarda `X-Tenant-Id` (web session avtomatik).

---

## Admin / ops qisqa qo‘llanma

### Muhit o‘zgaruvchilari (asosiy)

| Env | Qayerda | Izoh |
|-----|---------|------|
| `DATABASE_URL` | API | Postgres |
| `JWT_SECRET` | API | **Prod majburiy** — uzun random (≥32). `NODE_ENV=production` da zaif/default → boot fail |
| `CORS_ORIGIN` | API | Allow-list (vergul bilan). Prod da aniq origin |
| `NATS_URL` | API + GW | Punch queue |
| `DEVICE_GW_URL` | API | Face sync / register |
| `MINIO_*` | API | Face foto |
| `PUNCH_INGEST_API_KEY` | API | **Ixtiyoriy lab.** Bo‘sh = ochiq ingest. To‘ldirilsa `X-Punch-Key` majburiy. **Prod: qo‘ying** |
| `PUNCH_INGEST_RATE_LIMIT_PER_MIN` | API | **Ixtiyoriy.** Per-IP req/min. `0`/bo‘sh = o‘chirilgan (demo). Prod misol: `120` |
| `NEXT_PUBLIC_API_URL` | Web | Default `http://localhost:3001` |

### Punch ingest xavfsizligi

1. Lab: `PUNCH_INGEST_API_KEY` bo‘sh qoldiring (NATS yo‘li asosiy).
2. Staging/prod: API `.env` da kalit qo‘ying, integratsiya chaqiriqlariga:

```bash
curl -X POST http://localhost:3001/api/attendance/punches/ingest \
  -H "Content-Type: application/json" \
  -H "X-Punch-Key: YOUR_KEY" \
  -d '{"tenantId":"...","employeeExternalId":"face-0001","direction":"IN","occurredAt":"2026-07-24T09:00:00.000Z","serialNumber":"..."}'
```

3. Rate limit (ixtiyoriy): `PUNCH_INGEST_RATE_LIMIT_PER_MIN=120` — oshganda `429`. Demo uchun o‘chirib qo‘ying.

To‘liq checklist: [`../docs/SECURITY_CHECKLIST.md`](../docs/SECURITY_CHECKLIST.md) (JWT, CORS, TLS, face retention, prod default-deny).

NATS consumer (`hrhub.punch.raw`) HTTP kalitidan mustaqil — gateway ichki tarmoqda qolishi kerak.

### Load test (punch ingest)

```bash
npm run load:punch                    # light: 50 / conc 10
npm run load:punch:medium             # 200 / 40
npm run load:punch:heavy              # 500 / 80 + writes docs/LOAD_TEST_PUNCH_RESULTS.md
# yoki
node scripts/load-punch-test.js --n 500 --concurrency 80 --write-results
```

Muvaffaqiyat / latency (avg, p50, p95, p99) chiqadi. `PUNCH_INGEST_API_KEY` o‘rnatilgan bo‘lsa, skript `X-Punch-Key` yuboradi. Natijalar: [`../docs/LOAD_TEST_PUNCH_RESULTS.md`](../docs/LOAD_TEST_PUNCH_RESULTS.md).

### Face / biometrika eslatmalari

- Face photo MinIO da; template terminalda.
- RBAC: face upload/sync — HR / tenant_admin / platform_admin.
- Production: TLS, MinIO private, `PUNCH_INGEST_API_KEY`, JWT secret rotation, audit log (`/settings` → Audit).
- Retention: `FACE_PURGE_DAYS` (Nest cron 03:00) yoki `npm run face:purge` — soft-clear MinIO + FaceProfile; audit `face.retention_purge`. Batafsil: `SECURITY_CHECKLIST.md` §5, `docs/DEPLOY.md`.

### Deploy (prod)

- Compose prod overlay: `infra/docker-compose.prod.yml` + [`docs/DEPLOY.md`](./docs/DEPLOY.md).
- K8s — out of MVP (Compose yetarli).

### Hisobotlar

- Отчетность → **Export CSV** + **Export Excel** (`.xlsx`) barcha asosiy hisobotlar: T-13, kechikish, belgilar, HR harakat, ФОТ.
- T-13 qo‘shimcha: **PDF / Chop etish** (brauzer «Save as PDF», landscape).

### Navigatsiya (web)

| Marshrut | Modul |
|----------|--------|
| `/dashboard` | Statistika |
| `/employees` | Кадры |
| `/divisions` | Структура |
| `/attendance` | Посещения (marks, devices, QR, GPS, grafiklar) |
| `/payroll` | Зарплата |
| `/reports` | Отчетность |
| `/settings` | Настройки |
| `/tenants` | Platform admin |

---

## Face ID oqimi

1. Xodim kartasi → Face ID (`externalId` / employeeNo) saqlash  
2. Foto yuklash → MinIO (`FaceProfile`)  
3. Avtomatik / «Terminalga sync» → device-gw `sync-face` (Mock / Hikvision / ZKTeco)  
4. Terminal punch → NATS `hrhub.punch.raw` → `AttendanceMark` + kunlik status  

Davomat → Qurilmalar → **GW ga qayta bog‘lash** (GW restartdan keyin).

---

## Device Gateway

Adapters: `GET http://127.0.0.1:8000/adapters` → `mock`, `hikvision_isapi`, `zkteco_push`.

### Mock

```bash
curl -X POST "http://localhost:8000/devices/<NEST_DEVICE_UUID>/emit-mock-punch?employee_external_id=face-0001&direction=IN"
```

### Hikvision ISAPI

`apps/device-gw/adapters/hikvision_isapi.py` — UserInfo, FaceDataRecord, AcsEvent.

### ZKTeco Push

`apps/device-gw/adapters/zkteco_push.py` — Push protocol skeleton.

---

## Asosiy API (namuna)

| Method | Path |
|--------|------|
| POST | `/api/auth/login` |
| GET/POST/PATCH | `/api/employees` |
| POST | `/api/employees/:id/face` · `/face/sync` |
| GET/POST | `/api/attendance/devices` · `/locations` · `/schedules` |
| POST | `/api/attendance/punches/ingest` (ixtiyoriy `X-Punch-Key`) |
| GET | `/api/reports/attendance/t13` · `/payroll/fot` |
| GET/POST | `/api/payroll/periods` · `/vedomost` |

---

## Holat (qisqa)

**Done (navbar MVP):** Phase 0–7 — auth, HR (+ filters/bulk dismiss), Face ID + retention purge, QR/GPS, payroll, reports CSV+Excel, settings, ZKTeco, compose prod + DEPLOY.

**Mahsulot ~99–100%.**  
**Out of MVP:** formal third-party pentest engagement, K8s, real Hikvision hardware UAT, out-of-nav Verifix katalog.
