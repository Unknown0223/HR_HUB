const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const POSITIONS = [
  'ANALITIK',
  'AUDIT OPERATOR',
  'AUDITOR',
  'BIZNES ANALITIK',
  'BIZNES TRENER',
  'BRAND MANAGER',
  'BUXGALTER',
  'CEO',
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const posRows = [];
  for (const name of POSITIONS) {
    const code = name.replace(/\s+/g, '_').slice(0, 32);
    let row = await prisma.position.findFirst({
      where: { tenantId: tenant.id, OR: [{ name }, { code }] },
    });
    if (!row) {
      row = await prisma.position.create({
        data: { tenantId: tenant.id, code, name, isActive: true },
      });
    } else {
      row = await prisma.position.update({
        where: { id: row.id },
        data: { name, isActive: true },
      });
    }
    posRows.push(row);
  }

  const byName = (n) =>
    prisma.division.findFirst({ where: { tenantId: tenant.id, name: n }, select: { id: true, name: true } });
  const admin = await byName('ADMIN');
  const admin1 = await byName('ADMIN-1');
  const hr = await byName('HR');
  const it = await byName('IT Department');
  const targets = [admin, admin1, hr, it].filter(Boolean);

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active' },
    select: { id: true },
    orderBy: { lastName: 'asc' },
    take: 16,
  });

  for (let i = 0; i < employees.length; i += 1) {
    const pos = posRows[i % posRows.length];
    const div = targets[i % targets.length];
    await prisma.employee.update({
      where: { id: employees[i].id },
      data: {
        positionId: pos.id,
        ...(div ? { divisionId: div.id } : {}),
      },
    });
  }

  await prisma.employeeAccessGrant.deleteMany({
    where: {
      tenantId: tenant.id,
      accessType: { in: ['org_full', 'org_custom', 'org_subordinate', 'kpe_full'] },
    },
  });

  const add = (employeeId, accessType, resource) =>
    prisma.employeeAccessGrant.create({
      data: { tenantId: tenant.id, employeeId, accessType, resource, isActive: true },
    });

  if (employees[0]) await add(employees[0].id, 'org_full', '*');
  if (employees[1]) {
    await add(employees[1].id, 'org_full', '*');
    await add(employees[1].id, 'kpe_full', '*');
  }
  if (employees[2] && admin) await add(employees[2].id, 'org_subordinate', admin.id);
  if (employees[2] && admin1) await add(employees[2].id, 'org_subordinate', admin1.id);
  if (employees[3] && hr) await add(employees[3].id, 'org_custom', hr.id);
  if (employees[4] && it) await add(employees[4].id, 'org_subordinate', it.id);
  if (admin && employees[5]) {
    await prisma.division.update({ where: { id: admin.id }, data: { managerId: employees[5].id } });
  }

  console.log(
    `positions=${posRows.length} employeesAssigned=${employees.length} grants=${await prisma.employeeAccessGrant.count({
      where: { tenantId: tenant.id, accessType: { in: ['org_full', 'org_custom', 'org_subordinate', 'kpe_full'] } },
    })}`,
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
