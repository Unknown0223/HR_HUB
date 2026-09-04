# HR HUB — Railway deploy + LAN device wiring

> **Scope:** API + Web + Postgres (+ Redis) on Railway; **device-gw stays on the LAN** next to the Hikvision terminal. Cloud cannot dial `192.168.x.x` directly.

## Architecture

```
[Hikvision LAN] ←ISAPI→ [device-gw on PC] ──HTTP punch ingest──→ [Railway API]
                              ↑                                      │
                    Cloudflare Tunnel (optional)                      │
                              └──── DEVICE_GW_URL ←──────────────────┘
[Browser] ──────────────────────────→ [Railway Web] ──→ [Railway API]
```

- **Punches** → `POST /api/attendance/punches/ingest` (works without NATS).
- **Device control** (register, sync clock, faces) → Railway API calls `DEVICE_GW_URL` → needs a public tunnel to local GW.

## 1. Deploy from GitHub (dashboard)

CLI on this Windows machine may be blocked by App Control — use the dashboard:

1. Open [https://railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** → `Unknown0223/HR_HUB`.
2. Create project **HR_HUB**.
3. Add plugins: **PostgreSQL**, **Redis** (optional but recommended).
4. Add two services from the same repo:

### Service `api`

| Setting | Value |
|---------|--------|
| Config file | `/railway.api.toml` |
| Root directory | `/` (repo root — shared monorepo) |

**Variables** (Variables tab):

| Name | Value |
|------|--------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (if Redis added) |
| `JWT_SECRET` | long random ≥32 chars |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://<your-web>.up.railway.app` |
| `PUNCH_INGEST_API_KEY` | strong random string |
| `PUNCH_INGEST_RATE_LIMIT_PER_MIN` | `120` |
| `PORT` | `3001` (or leave Railway default and rely on `PORT`) |

Generate a public domain for `api` (Settings → Networking → Generate Domain).

On each deploy the API container runs `prisma migrate deploy` (via `apps/api/scripts/prod-migrate.js`). It does **not** run `db push` and does not reset data. Databases previously created with `db push` are baselined on first boot (history recorded only).

After first deploy succeeds, seed once (Railway shell / one-off):

```bash
cd apps/api && npx prisma db seed
```

Demo login: `admin@demo.local` / `Demo1234!` — change before real use.

### Service `web`

| Setting | Value |
|---------|--------|
| Config file | `/railway.web.toml` |
| Root directory | `/` |

**Variables:**

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `https://<your-api>.up.railway.app` |

Set `NEXT_PUBLIC_API_URL` **before** the first successful web build (it is baked into the Next client bundle). Redeploy web after changing it.

Generate a public domain for `web`, then set API `CORS_ORIGIN` to that exact origin and redeploy API.

## 2. Local device-gw → Railway

On the PC that can reach the Hikvision (`192.168.0.107`):

```env
# apps/device-gw/.env
DEVICE_GW_PORT=8800
DEVICE_GW_API_URL=https://<your-api>.up.railway.app
DEVICE_GW_PUNCH_KEY=<same as PUNCH_INGEST_API_KEY>
DEVICE_GW_NATS_URL=nats://127.0.0.1:4222
```

NATS is optional when HTTP ingest is set. Start GW:

```bash
npm run dev:gw
```

Punches now POST to Railway even if local NATS is down.

## 3. Let Railway control the device (tunnel)

Without a tunnel, cloud UI cannot register/heartbeat/sync-clock against LAN GW.

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).
2. Quick tunnel (dev):

```bash
cloudflared tunnel --url http://127.0.0.1:8800
```

3. On Railway **api** service set:

| Name | Value |
|------|--------|
| `DEVICE_GW_URL` | `https://<cloudflare-try-url>` |

4. Redeploy API. In Web → Devices → register / heartbeat / **Синхронизировать часы**.

For production, use a named Cloudflare Tunnel with a fixed hostname instead of a trycloudflare URL.

## 4. Smoke checklist

1. Open web URL → login.
2. From PC: curl punch ingest with `X-Punch-Key` → 2xx.
3. Face punch on terminal → row appears in attendance (via HTTP ingest).
4. With tunnel: device online + clock sync from Railway UI.

## 5. What stays local

| Component | Where | Why |
|-----------|--------|-----|
| `device-gw` | LAN PC | ISAPI to private IP |
| Hikvision | LAN | Hardware |
| API / Web / DB | Railway | SaaS |
| NATS / MinIO | optional | HTTP ingest + data-URL photo fallback work without them |

## Related

- Compose / VM: `docs/DEPLOY.md`
- Security: `docs/SECURITY_CHECKLIST.md`
