/**
 * Eski otmetkalarni qurilma vaqtiga qaytaradi (server "now" bilan yozilganlar).
 *
 * Usage (API ishlayotganda, admin JWT + tenant):
 *   node scripts/repair-mark-device-times.js
 *
 * Env:
 *   API_URL=http://localhost:3002
 *   TENANT_CODE=demo
 *   ADMIN_TOKEN=<Bearer JWT>   yoki  HRHUB_ADMIN_EMAIL + HRHUB_ADMIN_PASSWORD
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(__dirname, '../.env'));
loadEnvFile(path.join(__dirname, '../apps/api/.env'));

const API = (process.env.API_URL || 'http://localhost:3002').replace(/\/$/, '');
const TENANT = process.env.TENANT_CODE || 'demo';
const LIMIT = Number(process.env.REPAIR_LIMIT || 20000);

async function login() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN.trim();
  const email = process.env.HRHUB_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.HRHUB_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_TOKEN yoki HRHUB_ADMIN_EMAIL + HRHUB_ADMIN_PASSWORD kerak',
    );
  }
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`login non-JSON ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`login ${res.status}: ${JSON.stringify(data)}`);
  const token = data.accessToken || data.token || data.access_token;
  if (!token) throw new Error('login: token yo‘q');
  return token;
}

async function main() {
  console.log(`API=${API} tenant=${TENANT} limit=${LIMIT}`);
  const token = await login();
  const res = await fetch(`${API}/api/attendance/marks/repair-device-times`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tenant-Code': TENANT,
    },
    body: JSON.stringify({ limit: LIMIT, recalcDays: Number(process.env.RECALC_DAYS || 14) }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  console.log(res.status, data);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
