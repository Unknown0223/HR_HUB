const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'occupancy-report-data.json'), 'utf8'));

function slug(name) {
  const s = String(name)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36)
    .toUpperCase();
  return s || `N${Buffer.from(String(name)).toString('hex').slice(0, 10).toUpperCase()}`;
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));
  const hr = divByName.HR;

  async function uniqueDivCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.division.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }
  async function uniquePosCode(base) {
    let code = base;
    let n = 0;
    while (await prisma.position.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })) {
      n += 1;
      code = `${base.slice(0, 32)}-${n}`;
    }
    return code;
  }

  for (let i = 0; i < DATA.columns.length; i += 1) {
    const name = DATA.columns[i];
    if (divByName[name]) {
      await prisma.division.update({
        where: { id: divByName[name].id },
        data: { sortOrder: i + 1, isActive: true },
      });
      continue;
    }
    const created = await prisma.division.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueDivCode(slug(name)),
        name,
        parentId: hr?.id || null,
        sortOrder: i + 1,
        isActive: true,
      },
    });
    divByName[name] = created;
  }

  for (const name of [...new Set(DATA.cells.map((c) => c.position))]) {
    if (posByName[name]) continue;
    const created = await prisma.position.create({
      data: {
        tenantId: tenant.id,
        code: await uniquePosCode(slug(name)),
        name,
        isActive: true,
      },
    });
    posByName[name] = created;
  }

  let n = 0;
  for (let i = 0; i < DATA.cells.length; i += 1) {
    const cell = DATA.cells[i];
    const code = `OCC-${String(i + 1).padStart(4, '0')}`;
    const div = divByName[cell.division];
    const pos = posByName[cell.position];
    await prisma.staffPosition.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {
        title: `${cell.position} / ${cell.division}`,
        headcount: cell.count,
        status: 'occupied',
        isActive: true,
        closedAt: null,
        openedAt: new Date('2024-01-01'),
        divisionId: div?.id || null,
        positionId: pos?.id || null,
      },
      create: {
        tenantId: tenant.id,
        code,
        title: `${cell.position} / ${cell.division}`,
        headcount: cell.count,
        status: 'occupied',
        isActive: true,
        openedAt: new Date('2024-01-01'),
        divisionId: div?.id || undefined,
        positionId: pos?.id || undefined,
      },
    });
    n += 1;
  }

  console.log(`upserted ${n} occupancy staff positions, ${DATA.columns.length} division columns`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
