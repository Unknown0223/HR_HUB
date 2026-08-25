/**
 * Full-stack check for extra catalogs + external integrations that we shipped
 * in this Verifix clone pass: API persist round-trip (existing smokes) +
 * authenticated browser pages (Chrome/Edge CDP).
 *
 * Usage: node scripts/smoke-extra-fullstack.js
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

const API_SMOKES = [
  'smoke-employment-sources.js',
  'smoke-indicators.js',
  'smoke-avg-salaries.js',
  'smoke-coa.js',
  'smoke-cashboxes.js',
  'smoke-currencies.js',
  'smoke-nationality.js',
  'smoke-artix.js',
  'smoke-iiko.js',
  'smoke-iiko-sales.js',
  'smoke-billz.js',
  'smoke-billz1.js',
];

const PAGE_FILTER = [
  '/catalog/employment-sources',
  '/catalog/indicators',
  '/catalog/avg-salaries',
  '/catalog/coa',
  '/catalog/cashboxes',
  '/catalog/currencies',
  '/catalog/nationality',
  '/settings/artix',
  '/settings/iiko',
  '/settings/billz',
].join(',');

function run(label, args) {
  console.log(`\n—— ${label} ——`);
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status})`);
  }
}

async function main() {
  const failed = [];
  for (const file of API_SMOKES) {
    console.log(`\n—— API ${file} ——`);
    const r = spawnSync(process.execPath, [path.join('scripts', file)], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    if (r.status !== 0) failed.push(file);
  }
  if (failed.length) {
    throw new Error(`API smokes failed: ${failed.join(', ')}`);
  }

  run('browser extra pages', [
    path.join('scripts', 'smoke-full-pages.js'),
    '--skip-api',
    '--filter',
    PAGE_FILTER,
  ]);

  console.log('\n✓ extra fullstack: API persist + browser pages');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
