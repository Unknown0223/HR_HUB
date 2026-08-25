const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'schedule-plan-demo-rows.json'), 'utf8'));

function splitName(s) {
  const p = String(s || '')
    .trim()
    .split(/\s+/);
  return {
    lastName: p[0] || 'X',
    firstName: p[1] || 'X',
    middleName: p.slice(2).join(' ') || null,
  };
}

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

  const std = await prisma.workSchedule.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STD' } },
    update: {
      name: 'Standart 09:00–18:00 (6/1)',
      startTime: '09:00',
      endTime: '18:00',
      settings: { weekPattern: '6/1', dayNormHours: 8 },
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      code: 'STD',
      name: 'Standart 09:00–18:00 (6/1)',
      startTime: '09:00',
      endTime: '18:00',
      settings: { weekPattern: '6/1', dayNormHours: 8 },
    },
  });

  const fiveTwo = await prisma.workSchedule.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: '5-2' } },
    update: {
      name: 'Пятидневка 09:00–18:00 (5/2)',
      startTime: '09:00',
      endTime: '18:00',
      settings: { weekPattern: '5/2', dayNormHours: 8 },
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      code: '5-2',
      name: 'Пятидневка 09:00–18:00 (5/2)',
      startTime: '09:00',
      endTime: '18:00',
      settings: { weekPattern: '5/2', dayNormHours: 8 },
    },
  });

  const existingDivs = await prisma.division.findMany({ where: { tenantId: tenant.id } });
  const divByName = Object.fromEntries(existingDivs.map((d) => [d.name, d]));
  const existingPos = await prisma.position.findMany({ where: { tenantId: tenant.id } });
  const posByName = Object.fromEntries(existingPos.map((p) => [p.name, p]));

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

  const hr = divByName.HR;
  for (const name of [...new Set(ROWS.map((r) => r.division))]) {
    if (divByName[name]) continue;
    const created = await prisma.division.create({
      data: {
        tenantId: tenant.id,
        code: await uniqueDivCode(slug(name)),
        name,
        parentId: hr?.id || null,
        isActive: true,
      },
    });
    divByName[name] = created;
  }

  for (const name of [...new Set(ROWS.map((r) => r.position))]) {
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
  for (let i = 0; i < ROWS.length; i += 1) {
    const r = ROWS[i];
    const tab = `GP-${String(i + 1).padStart(4, '0')}`;
    const nm = splitName(r.name);
    const scheduleId = String(r.daysOff) === '10' ? fiveTwo.id : std.id;
    await prisma.employee.upsert({
      where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: tab } },
      update: {
        lastName: nm.lastName,
        firstName: nm.firstName,
        middleName: nm.middleName,
        status: 'active',
        scheduleId,
        divisionId: divByName[r.division]?.id || null,
        positionId: posByName[r.position]?.id || null,
      },
      create: {
        tenantId: tenant.id,
        tabNumber: tab,
        lastName: nm.lastName,
        firstName: nm.firstName,
        middleName: nm.middleName,
        status: 'active',
        employmentType: 'staff',
        hiredAt: new Date('2024-01-01'),
        scheduleId,
        divisionId: divByName[r.division]?.id || undefined,
        positionId: posByName[r.position]?.id || undefined,
      },
    });
    n += 1;
  }

  await prisma.employee.updateMany({
    where: { tenantId: tenant.id, status: 'active', scheduleId: null },
    data: { scheduleId: std.id },
  });

  console.log(`upserted ${n} schedule-plan demo employees`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
