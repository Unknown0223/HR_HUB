const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const GRADES = [
  { code: 'G1', name: '1-разряд', level: 1 },
  { code: 'G2', name: '2-разряд', level: 2 },
  { code: 'G3', name: '3-разряд', level: 3 },
];

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const gradeRows = [];
  for (const g of GRADES) {
    const row = await prisma.grade.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: g.code } },
      update: { name: g.name, level: g.level, isActive: true },
      create: { tenantId: tenant.id, code: g.code, name: g.name, level: g.level },
    });
    gradeRows.push(row);
  }
  const g1 = gradeRows[0];
  const g2 = gradeRows[1];
  const g3 = gradeRows[2];

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: { not: 'dismissed' } },
    select: { id: true, hiredAt: true, gradeId: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 80,
  });

  let updated = 0;
  let history = 0;
  for (let i = 0; i < employees.length; i += 1) {
    const e = employees[i];
    const current = i % 3 === 0 ? g3 : i % 2 === 0 ? g2 : g1;
    if (e.gradeId !== current.id) {
      await prisma.employee.update({ where: { id: e.id }, data: { gradeId: current.id } });
      updated += 1;
    }
    const existing = await prisma.employeeGradeHistory.count({ where: { tenantId: tenant.id, employeeId: e.id } });
    if (existing) continue;
    const hired = e.hiredAt ? new Date(e.hiredAt) : new Date(Date.UTC(2023, 6, 1));
    const prevAt = new Date(Date.UTC(hired.getUTCFullYear(), hired.getUTCMonth(), hired.getUTCDate()));
    const currAt = new Date(Date.UTC(2025, 5, 1));
    if (current.id !== g1.id) {
      await prisma.employeeGradeHistory.create({
        data: { tenantId: tenant.id, employeeId: e.id, gradeId: g1.id, effectiveAt: prevAt },
      });
      history += 1;
    }
    await prisma.employeeGradeHistory.create({
      data: {
        tenantId: tenant.id,
        employeeId: e.id,
        gradeId: current.id,
        effectiveAt: current.id === g1.id ? prevAt : currAt,
      },
    });
    history += 1;
  }

  console.log(`grades ready, employees updated: ${updated}, history rows: ${history}`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
