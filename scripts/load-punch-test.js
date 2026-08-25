#!/usr/bin/env node
/**
 * Phase 7 — concurrent punch ingest load test.
 *
 * Usage:
 *   node scripts/load-punch-test.js
 *   node scripts/load-punch-test.js --n 100 --concurrency 20
 *   node scripts/load-punch-test.js --profile heavy
 *   node scripts/load-punch-test.js --profile heavy --write-results
 *
 * Profiles:
 *   light  → N=50  concurrency=10   (default)
 *   medium → N=200 concurrency=40
 *   heavy  → N=500 concurrency=80
 *
 * Env:
 *   API_URL                 default http://localhost:3001
 *   PUNCH_INGEST_API_KEY    sent as X-Punch-Key when set
 *   TENANT_ID               optional; otherwise login as admin@demo.local
 *   EXTERNAL_ID             default face-0001
 *   N / CONCURRENCY         override profile counts
 *
 * Requires API on :3001. Key optional (lab leaves PUNCH_INGEST_API_KEY unset).
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'http://localhost:3001';

const PROFILES = {
  light: { n: 50, concurrency: 10 },
  medium: { n: 200, concurrency: 40 },
  heavy: { n: 500, concurrency: 80 },
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const profileName = String(arg('profile', 'light')).toLowerCase();
const profile = PROFILES[profileName] || PROFILES.light;
if (!PROFILES[profileName]) {
  console.warn(`Unknown profile "${profileName}", using light`);
}

const N = Number(arg('n', process.env.N || String(profile.n)));
const CONCURRENCY = Number(
  arg('concurrency', process.env.CONCURRENCY || String(profile.concurrency)),
);
const EXTERNAL_ID = process.env.EXTERNAL_ID || 'face-0001';
const KEY = (process.env.PUNCH_INGEST_API_KEY || '').trim();
const WRITE_RESULTS = hasFlag('write-results');

async function req(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const ms = performance.now() - started;
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, ms };
}

async function resolveTenantId() {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const login = await req(`${API}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@demo.local',
      password: 'Demo1234!',
    }),
  });
  if (!login.ok || !login.body?.tenant?.id) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }
  return login.body.tenant.id;
}

async function onePunch(tenantId, i) {
  const headers = {};
  if (KEY) headers['X-Punch-Key'] = KEY;
  // Stagger occurredAt so dedupe (60s window) does not collapse all to one mark
  const occurredAt = new Date(Date.now() + i * 70_000).toISOString();
  return req(`${API}/api/attendance/punches/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tenantId,
      employeeExternalId: EXTERNAL_ID,
      direction: i % 2 === 0 ? 'IN' : 'OUT',
      occurredAt,
      source: 'load_test',
      serialNumber: 'load-test-device',
    }),
  });
}

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  console.log(`Punch load test → ${API}`);
  console.log(
    `  profile=${PROFILES[profileName] ? profileName : 'light'} N=${N} concurrency=${CONCURRENCY} externalId=${EXTERNAL_ID} key=${KEY ? 'yes' : 'no'}`,
  );

  const health = await req(`${API}/api/health`);
  if (!health.ok) throw new Error(`API health failed: ${health.status}`);

  const tenantId = await resolveTenantId();
  console.log(`  tenantId=${tenantId}`);

  const wallStart = performance.now();
  const results = await pool(Array.from({ length: N }, (_, i) => i), CONCURRENCY, (i) =>
    onePunch(tenantId, i),
  );
  const wallMs = performance.now() - wallStart;

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const latencies = ok.map((r) => r.ms).sort((a, b) => a - b);
  const avg = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const rps = N / (wallMs / 1000);
  const summary = {
    at: new Date().toISOString(),
    api: API,
    profile: PROFILES[profileName] ? profileName : 'light',
    n: N,
    concurrency: CONCURRENCY,
    success: ok.length,
    failed: fail.length,
    wallMs: Math.round(wallMs),
    rps: Number(rps.toFixed(1)),
    latencyMs: {
      avg: Number(avg.toFixed(1)),
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
    },
    keyEnabled: Boolean(KEY),
  };

  console.log('\nResults');
  console.log(`  success: ${ok.length}/${N}`);
  console.log(`  failed:  ${fail.length}`);
  if (fail.length) {
    const sample = fail.slice(0, 3).map((f) => `${f.status} ${JSON.stringify(f.body)}`);
    console.log(`  fail sample: ${sample.join(' | ')}`);
  }
  console.log(`  wall:    ${wallMs.toFixed(0)} ms (${rps.toFixed(1)} req/s)`);
  console.log(
    `  latency: avg=${avg.toFixed(1)} ms  p50=${summary.latencyMs.p50}  p95=${summary.latencyMs.p95}  p99=${summary.latencyMs.p99}`,
  );

  if (WRITE_RESULTS) {
    // Prefer workspace docs/ (sibling of hr-hub), fall back to hr-hub/docs
    const candidates = [
      path.join(__dirname, '..', '..', 'docs'),
      path.join(__dirname, '..', 'docs'),
    ];
    const outDir = candidates.find((d) => {
      try {
        return fs.existsSync(d);
      } catch {
        return false;
      }
    }) || candidates[0];
    const outFile = path.join(outDir, 'LOAD_TEST_PUNCH_RESULTS.md');
    const md = `# Punch load test results

> Auto-generated by \`scripts/load-punch-test.js --write-results\`  
> **When:** ${summary.at}

| Field | Value |
|-------|-------|
| API | ${summary.api} |
| Profile | ${summary.profile} |
| N | ${summary.n} |
| Concurrency | ${summary.concurrency} |
| Success | ${summary.success}/${summary.n} |
| Failed | ${summary.failed} |
| Wall | ${summary.wallMs} ms |
| Throughput | ${summary.rps} req/s |
| Latency avg | ${summary.latencyMs.avg} ms |
| p50 | ${summary.latencyMs.p50} ms |
| p95 | ${summary.latencyMs.p95} ms |
| p99 | ${summary.latencyMs.p99} ms |
| Ingest key | ${summary.keyEnabled ? 'yes' : 'no'} |

## How to re-run

\`\`\`bash
npm run load:punch
npm run load:punch -- --profile medium
npm run load:punch -- --profile heavy --write-results
node scripts/load-punch-test.js --n 500 --concurrency 80
\`\`\`

Requires API on :3001. Optional: \`PUNCH_INGEST_API_KEY\`, \`TENANT_ID\`, \`EXTERNAL_ID\`.
`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, md, 'utf8');
    console.log(`\nWrote ${outFile}`);
  }

  if (fail.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
