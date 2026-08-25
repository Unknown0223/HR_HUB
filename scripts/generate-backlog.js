/**
 * Generate hr-hub/docs/backlog.csv from Verifix catalog JSON.
 * Filters MENU::, pagination noise, and noisy СОЗДАТЬ duplicates
 * (keeps one optional create ticket per parent when useful).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const INPUT = path.join(
  ROOT,
  'output',
  'run_20260724_104411',
  'bolimlar_katalogi.json',
);
const OUTPUT = path.join(__dirname, '../docs/backlog.csv');

function phaseHint(section, name) {
  const s = `${section} ${name}`.toLowerCase();
  if (s.includes('menu::')) return 'ignore';
  if (
    s.includes('посещ') ||
    s.includes('устройств') ||
    s.includes('отмет') ||
    s.includes('график') ||
    s.includes('локац') ||
    s.includes('qr')
  ) {
    return 'phase-1-attendance';
  }
  if (
    s.includes('зарплат') ||
    s.includes('табель') ||
    s.includes('начисл') ||
    s.includes('ведомост') ||
    s.includes('аванс') ||
    s.includes('удержан')
  ) {
    return 'phase-2-payroll';
  }
  if (s.includes('отчет') || s.includes('статистик') || s.includes('итог')) {
    return 'phase-3-reporting';
  }
  if (
    s.includes('настрой') ||
    s.includes('справочник') ||
    s.includes('админ') ||
    s.includes('внешн')
  ) {
    return 'phase-4-settings';
  }
  if (s.includes('кадр') || s.includes('сотрудник') || s.includes('должност') || s.includes('подраздел')) {
    return 'phase-1-hr';
  }
  return 'phase-1-hr';
}

function isPaginationNoise(name) {
  // e.g. "50 / 1275 12345"
  return /^\d+\s*\/\s*\d+/.test(name.trim()) || /^\d+\s*-\s*\d+$/.test(name.trim());
}

function isMenu(name) {
  return name.trim().toUpperCase().startsWith('MENU::');
}

function isCreateForm(name) {
  return /СОЗДАТЬ/i.test(name) || /\/\s*create/i.test(name);
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Catalog not found:', INPUT);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const seenCreateParents = new Set();
  const rows = [];

  for (const item of items) {
    const name = item.name || '';
    const section = item.first_section || '';

    if (isMenu(name)) continue;
    if (isPaginationNoise(name)) continue;

    if (isCreateForm(name)) {
      // Keep at most one create ticket per section+base name (optional backlog)
      const parent = name.split('/')[0].trim();
      const key = `${section}::${parent}`;
      if (seenCreateParents.has(key)) continue;
      seenCreateParents.add(key);
    }

    rows.push({
      uid: item.uid,
      section,
      name,
      first_url: item.first_url || '',
      phase_hint: phaseHint(section, name),
      status: isCreateForm(name) ? 'optional' : 'todo',
    });
  }

  const header = 'uid,section,name,first_url,phase_hint,status';
  const lines = [
    header,
    ...rows.map((r) =>
      [r.uid, r.section, r.name, r.first_url, r.phase_hint, r.status]
        .map(csvEscape)
        .join(','),
    ),
  ];

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${rows.length} backlog rows → ${OUTPUT}`);
}

main();
