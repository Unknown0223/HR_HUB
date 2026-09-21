#!/usr/bin/env node
/**
 * F2 — guard against port drift in docs / README.
 * Canonical: Web 3001 · API 3002 · Device-gw 8800
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'README.md',
  'docs/STATUS.md',
  'docs/IMPROVEMENT_MASTER_PLAN.md',
  'docs/FULL_STACK_GAP_PLAN.md',
  'docs/CATALOG_BACKEND_PARITY_PLAN.md',
  'docs/MOBILE_APP_PLAN.md',
  'docs/DEPLOY.md',
  '.env.example',
];

/** Patterns that mean "wrong legacy lab ports" when describing local stack. */
const forbidden = [
  {
    re: /npm run dev:web[^\n]*:3000|dev:web\s+#\s*:3000|Web\s+\|\s+http:\/\/localhost:3000\b/i,
    msg: 'Web port must be 3001 (found legacy :3000)',
  },
  {
    re: /npm run dev:api[^\n]*:3001\b|API Swagger\s+\|\s+http:\/\/localhost:3001\b/i,
    msg: 'API port must be 3002 (found legacy :3001 as API)',
  },
  {
    re: /uvicorn[^\n]*--port 8000|Device GW\s+\|\s+http:\/\/localhost:8000\b|127\.0\.0\.1:8000\/adapters/i,
    msg: 'Device-gw port must be 8800 (found legacy :8000)',
  },
  {
    re: /API `:3001`\s*·\s*Web `:3000`/,
    msg: 'Demo line must be API :3002 · Web :3001',
  },
];

let failed = 0;
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    failed += 1;
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const { re, msg } of forbidden) {
    if (re.test(text)) {
      console.error(`FAIL ${rel}: ${msg}`);
      failed += 1;
    }
  }
}

// Required living docs from F0
for (const rel of [
  'docs/IMPROVEMENT_MASTER_PLAN.md',
  'docs/STATUS.md',
  'docs/SECURITY_CHECKLIST.md',
]) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`MISSING required doc: ${rel}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\ncheck-canonical-ports: ${failed} issue(s)`);
  process.exit(1);
}
console.log('check-canonical-ports: OK (Web 3001 / API 3002 / GW 8800)');
