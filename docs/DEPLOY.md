# HR HUB — production deploy (Compose)

> **Scope:** single-node / small VM deploy with Docker Compose.  
> **K8s:** intentionally out of MVP — use Compose prod profile below. Sketch later if multi-node is required.

## Prerequisites

- Docker Engine + Compose v2
- Node.js 20+ on the host (or your own process manager) for `api`, `web`, `device-gw`
- TLS terminator (Caddy / nginx / cloud LB) in front of web + API

## 1. Secrets / env

```bash
cp .env.example .env.prod
# Edit .env.prod — never commit it
```

**Required in production**

| Variable | Notes |
|----------|--------|
| `POSTGRES_PASSWORD` | Strong unique password |
| `MINIO_ROOT_PASSWORD` | Strong; not `minioadmin` |
| `JWT_SECRET` | ≥32 random chars; API **refuses** weak defaults when `NODE_ENV=production` |
| `PUNCH_INGEST_API_KEY` | **Required for prod** — leave unset only in lab. Callers send `X-Punch-Key` |
| `CORS_ORIGIN` | Exact web origin(s), comma-separated — no `*` |
| `DATABASE_URL` | Points at Compose Postgres (host `127.0.0.1` + mapped port, or Docker network) |

**Strongly recommended**

| Variable | Notes |
|----------|--------|
| `PUNCH_INGEST_RATE_LIMIT_PER_MIN` | e.g. `120` |
| `FACE_PURGE_DAYS` | e.g. `90` — Nest cron daily 03:00; or host cron + `npm run face:purge` |
| `NODE_ENV` | `production` for API |

Copy the same secrets into `apps/api/.env`, `apps/web/.env`, `apps/device-gw/.env` as needed.

## 2. Start data plane

```bash
cd hr-hub
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
```

Prod overlay:

- Loopback-only port binds (`127.0.0.1`)
- `restart: always`
- Redis AOF
- Fails fast if `POSTGRES_PASSWORD` / MinIO root unset

## 3. Migrate + seed (first boot)

```bash
export $(grep -v '^#' .env.prod | xargs)   # or source carefully on Windows
npm run db:generate
npm run db:push        # or prisma migrate deploy when you adopt migrate history
npm run db:seed        # demo tenant — disable / replace in real prod
```

Demo login (seed only): `admin@demo.local` / `Demo1234!` — **change or remove before go-live**.

## 4. Run apps

```bash
# API
cd apps/api && NODE_ENV=production npm run start:prod

# Web
cd apps/web && npm run build && npm run start

# Device gateway
cd apps/device-gw && uvicorn main:app --host 127.0.0.1 --port 8000
```

Put nginx/Caddy on `:443` → web `:3000`, API `:3001` (or path `/api`). Keep NATS / MinIO / Postgres off the public internet.

## 5. Punch ingest (prod note)

When `PUNCH_INGEST_API_KEY` is set, HTTP ingest **requires**:

```http
X-Punch-Key: <same as env>
```

Unset key → open ingest (lab only). API logs a warning if key is missing under `NODE_ENV=production`. Prefer NATS from device-gw on a private network; treat HTTP ingest as a controlled integration path.

## 6. Face retention

| Mode | How |
|------|-----|
| Nest cron (default if API always on) | `FACE_PURGE_DAYS=90` in API env → daily 03:00 soft-purge |
| Host cron | `0 3 * * * cd /opt/hr-hub && FACE_PURGE_DAYS=90 npm run face:purge` |

Soft-purge: delete MinIO object, clear `FaceProfile` photo fields, write `audit_logs` (`face.retention_purge`).

## 7. Smoke after deploy

1. Login via TLS origin  
2. Punch without key → 401; with `X-Punch-Key` → 2xx  
3. Settings → Audit shows admin actions  
4. `docs/SECURITY_CHECKLIST.md` §8  

## 8. Out of scope here

- Formal third-party pentest engagement (use checklist + hire separately)  
- Kubernetes / Helm  
- Dedicated Postgres per tenant  
- Real Hikvision hardware UAT on customer site  
