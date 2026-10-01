#!/usr/bin/env node
/**
 * Validates apps/web/src/lib/nav-registry.ts against the real route tree:
 * every href resolves, each href is listed once, legacy roleAccess keys survive,
 * and every canonical page has an owning section.
 *
 *   node scripts/check-nav-registry.js
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const webLib = path.join(root, 'apps/web/src/lib');
const appDir = path.join(root, 'apps/web/src/app');

function loadTs(file) {
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  const req = (spec) => {
    if (spec.startsWith('./')) return loadTs(path.join(path.dirname(file), `${spec}.ts`));
    return require(spec);
  };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, req);
  return mod.exports;
}

const registry = loadTs(path.join(webLib, 'nav-registry.ts'));
const reportHrefs = loadTs(path.join(webLib, 'reports-nav.ts')).REPORTS_NAV_FLAT.map((r) => r.href);
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'nav-legacy-access-keys.json'), 'utf8')).hrefs;
const catalogResources = new Set(
  [...fs.readFileSync(path.join(root, 'apps/api/src/catalog/catalog.resources.ts'), 'utf8').matchAll(/key:\s*'([^']+)'/g)].map(
    (m) => m[1],
  ),
);

function collectRoutes(dir, segs = [], out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      collectRoutes(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name], out);
    } else if (e.name === 'page.tsx') {
      out.push(`/${segs.join('/')}`);
    }
  }
  return out;
}
const routes = collectRoutes(appDir);

function resolves(href) {
  const p = href.split('?')[0];
  if (routes.includes(p)) return true;
  const segs = p.split('/');
  return routes.some((r) => {
    const rs = r.split('/');
    if (rs.length !== segs.length) return false;
    const ok = rs.every((s, i) => s.startsWith('[') || s === segs[i]);
    if (!ok) return false;
    return r === '/catalog/[resource]' ? catalogResources.has(segs[2]) : true;
  });
}

const errors = [];
const info = [];
const { NAV_SECTIONS, NAV_ITEMS, findNavSection } = registry;

const sectionIds = NAV_SECTIONS.map((s) => s.id);
if (new Set(sectionIds).size !== sectionIds.length) errors.push('duplicate section id');

const itemIds = new Map();
const hrefOwner = new Map();
for (const item of NAV_ITEMS) {
  const key = `${item.section}/${item.id}`;
  if (itemIds.has(key)) errors.push(`duplicate item id ${key}`);
  itemIds.set(key, item);
  if (hrefOwner.has(item.href)) {
    errors.push(`href listed twice: ${item.href} (${hrefOwner.get(item.href)} and ${key})`);
  }
  hrefOwner.set(item.href, key);
}
for (const item of NAV_ITEMS) {
  for (const href of [item.href, ...(item.aliases || [])]) {
    if (!resolves(href)) errors.push(`broken href ${href} (${item.section}/${item.id})`);
  }
  for (const alias of item.aliases || []) {
    if (hrefOwner.has(alias)) errors.push(`alias ${alias} of ${item.id} is also a primary href (${hrefOwner.get(alias)})`);
  }
}

const byPath = new Map();
for (const item of NAV_ITEMS) {
  const p = item.href.split('?')[0];
  byPath.set(p, [...(byPath.get(p) || []), item.href]);
}
for (const [p, hrefs] of byPath) {
  if (hrefs.length > 1) info.push(`query variants of ${p}: ${hrefs.join(', ')}`);
}

const grantable = new Set([...NAV_ITEMS.map((i) => i.href), ...reportHrefs]);
for (const href of legacy) {
  if (!grantable.has(href)) errors.push(`legacy roleAccess key lost: ${href}`);
}

const tenants = NAV_ITEMS.find((i) => i.href === '/tenants');
if (!tenants || !tenants.platformOnly) errors.push('/tenants must be platformOnly');

const canonical = routes.filter(
  (r) => !r.includes('[') && !/\/(new|import|copy)$/.test(r) && r !== '/' && r !== '/m' && !r.startsWith('/m/'),
);
const unowned = canonical.filter((r) => !findNavSection(r, ''));
for (const r of unowned) errors.push(`route without owner section: ${r}`);

console.log(
  `nav registry: ${NAV_SECTIONS.length} sections, ${NAV_ITEMS.length} items, ${canonical.length} canonical routes, ${legacy.length} legacy keys`,
);
for (const line of info) console.log(`  info: ${line}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
console.log('  OK');
